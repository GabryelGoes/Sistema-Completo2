import type { SupabaseClient } from "@supabase/supabase-js";
import { executeRdaTool } from "../tools/executors.js";
import { resolveRdaIntelligenceEnabled } from "../featureFlag.js";

export type ManagementScanResult = {
  alertsCreated: number;
  alerts: Array<{ alertKey: string; title: string; severity: string }>;
};

async function upsertAlert(
  supabase: SupabaseClient,
  workshopId: string,
  alert: {
    alertKey: string;
    severity: "info" | "warning" | "critical";
    title: string;
    body: string;
    payload?: Record<string, unknown>;
  }
): Promise<boolean> {
  const { data: existing } = await supabase
    .from("rda_management_alerts")
    .select("id, dismissed_at")
    .eq("workshop_id", workshopId)
    .eq("alert_key", alert.alertKey)
    .maybeSingle();
  if (existing && !(existing as { dismissed_at?: string | null }).dismissed_at) {
    return false;
  }

  const { data: notif, error: nErr } = await supabase
    .from("notifications")
    .insert({
      workshop_id: workshopId,
      type: "rda_management_alert",
      payload: {
        title: alert.title,
        body: alert.body,
        alertKey: alert.alertKey,
        severity: alert.severity,
        ...(alert.payload || {}),
      },
      target_type: "admin",
      target_slug: null,
    })
    .select("id")
    .maybeSingle();
  if (nErr) {
    console.warn("[RDA] notification insert:", nErr.message);
  }

  await supabase.from("rda_management_alerts").upsert(
    {
      workshop_id: workshopId,
      alert_key: alert.alertKey,
      severity: alert.severity,
      title: alert.title,
      body: alert.body,
      payload: alert.payload || {},
      notification_id: (notif as { id?: string } | null)?.id || null,
      dismissed_at: null,
      created_at: new Date().toISOString(),
    },
    { onConflict: "workshop_id,alert_key" }
  );
  return true;
}

type StalledItem = {
  id?: string;
  plate?: string;
  module_identification?: string;
  stalledHours?: number;
};

/**
 * Varredura de gestão: atrasos, filas, avaliações pendentes, sessões longas.
 * Pátio e Laboratório são avaliados em separado (order_type).
 */
export async function runManagementScan(input: {
  workshopId: string;
  supabase: SupabaseClient;
  settingValue?: string | null;
}): Promise<ManagementScanResult> {
  if (
    !resolveRdaIntelligenceEnabled({
      settingValue: input.settingValue,
    })
  ) {
    return { alertsCreated: 0, alerts: [] };
  }

  const created: ManagementScanResult["alerts"] = [];
  const ctx = { workshopId: input.workshopId, supabase: input.supabase };
  const day = new Date().toISOString().slice(0, 10);

  const stalledPatio = await executeRdaTool(
    "rda_list_stalled_vehicles",
    { minHours: 48, limit: 10 },
    ctx
  );
  if (stalledPatio.ok) {
    const items = ((stalledPatio.data as { items?: unknown[] }).items ||
      []) as StalledItem[];
    if (items.length >= 3) {
      const key = `patio_stalled_batch_${day}`;
      const ok = await upsertAlert(input.supabase, input.workshopId, {
        alertKey: key,
        severity: "warning",
        title: `Pátio: ${items.length} veículos parados há 48h+`,
        body: items
          .slice(0, 5)
          .map((i) => `${i.plate || i.id} (~${Math.round(i.stalledHours || 0)}h)`)
          .join("; "),
        payload: {
          sector: "patio",
          orderType: "vehicle",
          serviceOrderIds: items.map((i) => i.id).filter(Boolean),
        },
      });
      if (ok) {
        created.push({
          alertKey: key,
          title: "Pátio: veículos parados",
          severity: "warning",
        });
      }
    }
  }

  const stalledLab = await executeRdaTool(
    "rda_list_stalled_modules",
    { minHours: 48, limit: 10 },
    ctx
  );
  if (stalledLab.ok) {
    const items = ((stalledLab.data as { items?: unknown[] }).items ||
      []) as StalledItem[];
    if (items.length >= 3) {
      const key = `lab_stalled_batch_${day}`;
      const ok = await upsertAlert(input.supabase, input.workshopId, {
        alertKey: key,
        severity: "warning",
        title: `Laboratório: ${items.length} módulos parados há 48h+`,
        body: items
          .slice(0, 5)
          .map(
            (i) =>
              `${i.module_identification || i.plate || i.id} (~${Math.round(i.stalledHours || 0)}h)`
          )
          .join("; "),
        payload: {
          sector: "laboratorio",
          orderType: "module",
          serviceOrderIds: items.map((i) => i.id).filter(Boolean),
        },
      });
      if (ok) {
        created.push({
          alertKey: key,
          title: "Laboratório: módulos parados",
          severity: "warning",
        });
      }
    }
  }

  const pending = await executeRdaTool(
    "rda_pending_evaluations",
    { status: "pending", limit: 50 },
    ctx
  );
  if (pending.ok) {
    const n = ((pending.data as { items?: unknown[] }).items || []).length;
    if (n > 0) {
      const key = `evals_pending_${day}`;
      const ok = await upsertAlert(input.supabase, input.workshopId, {
        alertKey: key,
        severity: n >= 5 ? "critical" : "info",
        title: `${n} avaliação(ões) gerencial(is) pendente(s)`,
        body: "Abra o Radar de Qualidade → Avaliações para revisar.",
        payload: { pendingCount: n },
      });
      if (ok) created.push({ alertKey: key, title: "Avaliações pendentes", severity: "info" });
    }
  }

  const patioSnap = await executeRdaTool("rda_patio_stage_snapshot", {}, ctx);
  if (patioSnap.ok) {
    const waiting = Number(
      (patioSnap.data as { waitingApprovalCount?: number }).waitingApprovalCount || 0
    );
    if (waiting >= 5) {
      const key = `patio_waiting_approval_${day}`;
      const ok = await upsertAlert(input.supabase, input.workshopId, {
        alertKey: key,
        severity: "warning",
        title: `Pátio: ${waiting} OS em fila de aprovação/orçamento`,
        body: "Concentração de veículos do Pátio aguardando aprovação.",
        payload: { sector: "patio", orderType: "vehicle", waitingApprovalCount: waiting },
      });
      if (ok) {
        created.push({
          alertKey: key,
          title: "Pátio: fila de aprovação",
          severity: "warning",
        });
      }
    }
  }

  const labSnap = await executeRdaTool("rda_lab_stage_snapshot", {}, ctx);
  if (labSnap.ok) {
    const waiting = Number(
      (labSnap.data as { waitingApprovalCount?: number }).waitingApprovalCount || 0
    );
    const waitingParts = Number(
      (labSnap.data as { waitingPartsCount?: number }).waitingPartsCount || 0
    );
    if (waiting >= 5) {
      const key = `lab_waiting_approval_${day}`;
      const ok = await upsertAlert(input.supabase, input.workshopId, {
        alertKey: key,
        severity: "warning",
        title: `Laboratório: ${waiting} OS em fila de aprovação/orçamento`,
        body: "Concentração de módulos do Laboratório aguardando aprovação.",
        payload: {
          sector: "laboratorio",
          orderType: "module",
          waitingApprovalCount: waiting,
        },
      });
      if (ok) {
        created.push({
          alertKey: key,
          title: "Laboratório: fila de aprovação",
          severity: "warning",
        });
      }
    }
    if (waitingParts >= 8) {
      const key = `lab_waiting_parts_${day}`;
      const ok = await upsertAlert(input.supabase, input.workshopId, {
        alertKey: key,
        severity: "info",
        title: `Laboratório: ${waitingParts} OS em aguardo/peças`,
        body: "Fila do Laboratório (módulos) — não confundir com estoque de peças.",
        payload: {
          sector: "laboratorio",
          orderType: "module",
          waitingPartsCount: waitingParts,
        },
      });
      if (ok) {
        created.push({
          alertKey: key,
          title: "Laboratório: aguardo/peças",
          severity: "info",
        });
      }
    }
  }

  const { data: longSessions } = await input.supabase
    .from("rda_work_sessions")
    .select("id, technician_user_id, service_order_id, started_at, status")
    .eq("workshop_id", input.workshopId)
    .in("status", ["running", "paused"])
    .lt("started_at", new Date(Date.now() - 6 * 3600000).toISOString())
    .limit(20);
  if ((longSessions || []).length > 0) {
    const key = `long_sessions_${day}`;
    const ok = await upsertAlert(input.supabase, input.workshopId, {
      alertKey: key,
      severity: "info",
      title: `${longSessions!.length} cronômetro(s) ativo(s) há mais de 6h`,
      body: "Verifique pausas esquecidas ou serviços longos no Radar/Desempenho.",
      payload: {
        sessionIds: longSessions!.map((s) => (s as { id: string }).id),
      },
    });
    if (ok) created.push({ alertKey: key, title: "Cronômetros longos", severity: "info" });
  }

  return { alertsCreated: created.length, alerts: created };
}
