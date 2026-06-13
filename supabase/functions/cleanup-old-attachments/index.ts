// Edge Function: cleanup-old-attachments
//
// Apaga do Storage as FOTOS/anexos de ordens de serviço que já estão
// arquivadas/concluídas há mais de 1 ano. Não toca em OS ainda em andamento.
//
// Convenção de armazenamento (ver apiApp.ts):
//   bucket "vehicle-photos", pasta "{workshop_id}/{service_order_id}/arquivo"
// Os anexos NÃO ficam em coluna do banco — são listados direto da pasta.
// Por isso a limpeza é uma operação somente de Storage.
//
// Segurança: exige o header "x-cleanup-secret" igual ao secret CLEANUP_SECRET.
// (a anon key é pública; sem esse segredo qualquer um poderia disparar a limpeza)
//
// Parâmetros (body JSON, opcionais):
//   { "dryRun": true }  -> apenas lista o que seria apagado, sem excluir.
//
// Variáveis de ambiente (secrets da função):
//   SUPABASE_URL                (injetada automaticamente)
//   SUPABASE_SERVICE_ROLE_KEY   (injetada automaticamente)
//   CLEANUP_SECRET              (obrigatória — segredo compartilhado com o cron)
//   VEHICLE_PHOTOS_BUCKET       (opcional — padrão "vehicle-photos")
//   CLEANUP_MAX_AGE_DAYS        (opcional — padrão 365)
//   CLEANUP_DRY_RUN             (opcional — "true" força modo simulação)

import { createClient } from "jsr:@supabase/supabase-js@2";

/** Status terminais: OS arquivada (CANCELLED) ou concluída (pátio/laboratório). */
const TERMINAL_STATUSES = ["CANCELLED", "FINALIZADO", "PRONTO_PRA_RETIRADA"];

/** Assinatura do termo de diagnóstico — documento legal, NÃO apagar. */
const SIGNATURE_PATTERN = /AUTORIZACAO_DIAGNOSTICO/i;

const LIST_PAGE = 100;
const REMOVE_BATCH = 100;
const OS_PAGE = 500;

type Json = Record<string, unknown>;

function jsonResponse(body: Json, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("CLEANUP_SECRET") ?? "";
  const providedSecret = req.headers.get("x-cleanup-secret") ?? "";
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Função não configurada (URL/Service Role)." }, 500);
  }

  const bucket = Deno.env.get("VEHICLE_PHOTOS_BUCKET") ?? "vehicle-photos";
  const maxAgeDays = Number(Deno.env.get("CLEANUP_MAX_AGE_DAYS") ?? "365") || 365;

  let dryRun = (Deno.env.get("CLEANUP_DRY_RUN") ?? "false").toLowerCase() === "true";
  try {
    const body = (await req.json()) as { dryRun?: unknown };
    if (typeof body?.dryRun === "boolean") dryRun = body.dryRun;
  } catch {
    // corpo vazio/inválido — mantém o padrão
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const cutoffIso = new Date(Date.now() - maxAgeDays * 86_400_000).toISOString();

  const summary = {
    dryRun,
    cutoff: cutoffIso,
    maxAgeDays,
    ordersScanned: 0,
    ordersAffected: 0,
    filesDeleted: 0,
    signaturesKept: 0,
    bytesFreed: 0,
    errors: [] as string[],
  };

  try {
    let from = 0;
    // Paginação das OS terminais mais antigas que o corte.
    for (;;) {
      const { data: orders, error: ordersErr } = await supabase
        .from("service_orders")
        .select("id, workshop_id, status, updated_at")
        .in("status", TERMINAL_STATUSES)
        .lt("updated_at", cutoffIso)
        .range(from, from + OS_PAGE - 1);

      if (ordersErr) {
        summary.errors.push(`Falha ao consultar service_orders: ${ordersErr.message}`);
        break;
      }
      if (!orders || orders.length === 0) break;

      for (const order of orders) {
        summary.ordersScanned++;
        const workshopId = (order as { workshop_id?: string }).workshop_id;
        const orderId = (order as { id?: string }).id;
        if (!workshopId || !orderId) continue;

        const folder = `${workshopId}/${orderId}`;
        const toRemove: string[] = [];
        let bytesInFolder = 0;

        // Paginação da listagem de arquivos da pasta da OS.
        let offset = 0;
        for (;;) {
          const { data: files, error: listErr } = await supabase.storage
            .from(bucket)
            .list(folder, { limit: LIST_PAGE, offset });

          if (listErr) {
            summary.errors.push(`Falha ao listar ${folder}: ${listErr.message}`);
            break;
          }
          if (!files || files.length === 0) break;

          for (const f of files) {
            if (!f.name || f.name.endsWith("/")) continue;
            if (SIGNATURE_PATTERN.test(f.name)) {
              summary.signaturesKept++;
              continue;
            }
            toRemove.push(`${folder}/${f.name}`);
            const size = (f as { metadata?: { size?: number } }).metadata?.size;
            if (typeof size === "number") bytesInFolder += size;
          }

          if (files.length < LIST_PAGE) break;
          offset += LIST_PAGE;
        }

        if (toRemove.length === 0) continue;

        summary.ordersAffected++;
        summary.bytesFreed += bytesInFolder;

        if (dryRun) {
          summary.filesDeleted += toRemove.length;
          continue;
        }

        for (let i = 0; i < toRemove.length; i += REMOVE_BATCH) {
          const batch = toRemove.slice(i, i + REMOVE_BATCH);
          const { error: rmErr } = await supabase.storage.from(bucket).remove(batch);
          if (rmErr) {
            summary.errors.push(`Falha ao remover lote em ${folder}: ${rmErr.message}`);
          } else {
            summary.filesDeleted += batch.length;
          }
        }
      }

      if (orders.length < OS_PAGE) break;
      from += OS_PAGE;
    }
  } catch (err) {
    summary.errors.push(err instanceof Error ? err.message : String(err));
  }

  console.log("[cleanup-old-attachments]", JSON.stringify(summary));
  return jsonResponse(summary, summary.errors.length > 0 ? 207 : 200);
});
