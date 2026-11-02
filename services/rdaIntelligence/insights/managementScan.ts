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

/**
 * Varredura de gestão: atrasos, filas, avaliações pendentes, sessões longas.
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

  const stalled = await executeRdaTool(
    "rda_list_stalled_vehicles",
    { minHours: 48, limit: 10 },
    ctx
  );
  if (stalled.ok) {
    const items = ((stalled.data as { items?: unknown[] }).items || []) as Array<{
      id?: string;
      plate?: string;
      stalledHours?: number;
    }>;
    if (items.length >= 3) {
      const key = `stalled_batch_${new Date().toISOString().slice(0, 10)}`;
      const ok = await upsertAlert(input.supabase, input.workshopId, {
        alertKey: key,
        severity: "warning",
        title: `${items.length} veículos parados há 48h+`,
        body: items
          .slice(0, 5)
          .map((i) => `${i.plate || i.id} (~${Math.round(i.stalledHours || 0)}h)`)
          .join("; "),
        payload: { serviceOrderIds: items.map((i) => i.id).filter(Boolean) },
      });
      if (ok) created.push({ alertKey: key, title: "Veículos parados", severity: "warning" });
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
      const key = `evals_pending_${new Date().toISOString().slice(0, 10)}`;
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

  const snapshot = await executeRdaTool("rda_patio_stage_snapshot", {}, ctx);
  if (snapshot.ok) {
    const waiting = Number(
      (snapshot.data as { waitingApprovalCount?: number }).waitingApprovalCount || 0
    );
    if (waiting >= 5) {
      const key = `waiting_approval_${new Date().toISOString().slice(0, 10)}`;
      const ok = await upsertAlert(input.supabase, input.workshopId, {
        alertKey: key,
        severity: "warning",
        title: `${waiting} OS em fila de aprovação/orçamento`,
        body: "Há concentração de veículos aguardando aprovação.",
        payload: { waitingApprovalCount: waiting },
      });
      if (ok) created.push({ alertKey: key, title: "Fila de aprovação", severity: "warning" });
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
    const key = `long_sessions_${new Date().toISOString().slice(0, 10)}`;
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
