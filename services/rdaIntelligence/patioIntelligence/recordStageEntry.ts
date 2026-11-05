import type { SupabaseClient } from "@supabase/supabase-js";

export type RecordStageEntryInput = {
  supabase: SupabaseClient;
  workshopId: string;
  serviceOrderId: string;
  fromStatus: string | null;
  toStatus: string;
  actorUserId?: string | null;
  source?: string;
  enteredAt?: string;
};

/**
 * Registra entrada na etapa atual após mudança de status.
 * Idempotente com o trigger da migration (evita evento duplicado próximo).
 * Se a coluna/tabela ainda não existir, falha de forma silenciosa (best-effort).
 */
export async function recordServiceOrderStageEntry(
  input: RecordStageEntryInput
): Promise<{ ok: boolean; via: string; error?: string }> {
  const enteredAt = input.enteredAt || new Date().toISOString();
  const source = input.source || "api";

  try {
    const { error: updErr } = await input.supabase
      .from("service_orders")
      .update({ status_entered_at: enteredAt })
      .eq("id", input.serviceOrderId)
      .eq("workshop_id", input.workshopId);

    if (updErr) {
      if (/status_entered_at|column|does not exist|schema cache/i.test(updErr.message)) {
        return { ok: false, via: "schema_missing", error: updErr.message };
      }
      // Continua tentativa de evento mesmo se update falhou por outro motivo
      console.warn("[patio-intel] status_entered_at update:", updErr.message);
    }

    const since = new Date(Date.parse(enteredAt) - 5000).toISOString();
    const { data: recent } = await input.supabase
      .from("service_order_stage_events")
      .select("id")
      .eq("service_order_id", input.serviceOrderId)
      .eq("to_status", input.toStatus)
      .gte("entered_at", since)
      .limit(1);

    if (recent && recent.length > 0) {
      return { ok: true, via: "trigger_or_recent" };
    }

    const { error: insErr } = await input.supabase.from("service_order_stage_events").insert({
      workshop_id: input.workshopId,
      service_order_id: input.serviceOrderId,
      from_status: input.fromStatus,
      to_status: input.toStatus,
      entered_at: enteredAt,
      actor_user_id: input.actorUserId || null,
      source,
      meta: {},
    });

    if (insErr) {
      if (/service_order_stage_events|does not exist|schema cache/i.test(insErr.message)) {
        return { ok: false, via: "schema_missing", error: insErr.message };
      }
      return { ok: false, via: "insert_error", error: insErr.message };
    }

    return { ok: true, via: source };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, via: "exception", error: msg };
  }
}
