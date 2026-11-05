import type { SupabaseClient } from "@supabase/supabase-js";
import { formatAlertBody } from "./recommendations.js";
import type {
  ProactiveAlertDraft,
  ProactiveAlertRow,
  ProactiveAlertStatus,
  ProactiveAlertView,
} from "./types.js";

function mapRow(row: ProactiveAlertRow): ProactiveAlertView {
  return {
    id: row.id,
    alertKey: row.alert_key,
    category: row.category,
    severity: row.severity,
    status: row.status,
    title: row.title,
    body: row.body,
    recommendation: row.recommendation || "",
    evidence: row.evidence || "",
    refType: row.ref_type,
    refId: row.ref_id,
    payload: row.payload || {},
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    dismissedAt: row.dismissed_at,
  };
}

async function insertEvent(
  supabase: SupabaseClient,
  workshopId: string,
  alertId: string,
  fromStatus: string | null,
  toStatus: string,
  actorUserId?: string | null,
  note?: string
): Promise<void> {
  const { error } = await supabase.from("rda_management_alert_events").insert({
    workshop_id: workshopId,
    alert_id: alertId,
    from_status: fromStatus,
    to_status: toStatus,
    actor_user_id: actorUserId || null,
    note: note || null,
    meta: {},
  });
  if (error && !/does not exist|schema cache/i.test(error.message)) {
    console.warn("[proactive] alert event:", error.message);
  }
}

async function maybeNotify(
  supabase: SupabaseClient,
  workshopId: string,
  draft: ProactiveAlertDraft,
  enabled: boolean
): Promise<string | null> {
  if (!enabled) return null;
  const { data, error } = await supabase
    .from("notifications")
    .insert({
      workshop_id: workshopId,
      type: "rda_management_alert",
      payload: {
        title: draft.title,
        body: formatAlertBody(draft),
        alertKey: draft.alertKey,
        severity: draft.severity,
        category: draft.category,
        recommendation: draft.recommendation,
        evidence: draft.evidence,
        refType: draft.refType || null,
        refId: draft.refId || null,
        ...(draft.payload || {}),
      },
      target_type: "admin",
      target_slug: null,
    })
    .select("id")
    .maybeSingle();
  if (error) {
    console.warn("[proactive] notification:", error.message);
    return null;
  }
  return (data as { id?: string } | null)?.id || null;
}

async function attachNotificationId(
  supabase: SupabaseClient,
  alertId: string,
  workshopId: string,
  notificationId: string | null
): Promise<void> {
  if (!notificationId) return;
  const { error } = await supabase
    .from("rda_management_alerts")
    .update({ notification_id: notificationId, updated_at: new Date().toISOString() })
    .eq("id", alertId)
    .eq("workshop_id", workshopId);
  if (error) {
    console.warn("[proactive] attach notification_id:", error.message);
  }
}

export type UpsertAlertsResult = {
  created: number;
  updated: number;
  reopened: number;
  alerts: Array<{ alertKey: string; title: string; severity: string; category: string }>;
};

/**
 * Persistência idempotente:
 * - ativo/reconhecido → atualiza last_seen (sem nova notificação)
 * - resolvido/descartado → reabre só após cooldown
 * - novo → INSERT confirmado → notificação opcional → contabiliza
 */
export async function upsertProactiveAlerts(input: {
  workshopId: string;
  supabase: SupabaseClient;
  drafts: ProactiveAlertDraft[];
  reopenAfterHours: number;
  notifyOnCreate: boolean;
}): Promise<UpsertAlertsResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const result: UpsertAlertsResult = { created: 0, updated: 0, reopened: 0, alerts: [] };

  for (const draft of input.drafts) {
    const { data: existing, error: selErr } = await input.supabase
      .from("rda_management_alerts")
      .select("*")
      .eq("workshop_id", input.workshopId)
      .eq("alert_key", draft.alertKey)
      .maybeSingle();

    if (selErr) {
      console.warn("[proactive] select alert:", selErr.message);
      continue;
    }

    if (!existing) {
      const row = {
        workshop_id: input.workshopId,
        alert_key: draft.alertKey,
        category: draft.category,
        severity: draft.severity,
        status: "active",
        title: draft.title,
        body: draft.body,
        recommendation: draft.recommendation,
        evidence: draft.evidence,
        ref_type: draft.refType || null,
        ref_id: draft.refId || null,
        payload: draft.payload || {},
        notification_id: null as string | null,
        dismissed_at: null,
        last_seen_at: nowIso,
        updated_at: nowIso,
        created_at: nowIso,
      };
      const { data: inserted, error: insErr } = await input.supabase
        .from("rda_management_alerts")
        .insert(row)
        .select("id")
        .maybeSingle();

      if (insErr) {
        // Fallback se migration ainda não aplicada (colunas novas ausentes)
        if (/column|schema cache|does not exist/i.test(insErr.message)) {
          const { data: legacy, error: legErr } = await input.supabase
            .from("rda_management_alerts")
            .upsert(
              {
                workshop_id: input.workshopId,
                alert_key: draft.alertKey,
                severity: draft.severity,
                title: draft.title,
                body: formatAlertBody(draft),
                payload: {
                  ...(draft.payload || {}),
                  category: draft.category,
                  recommendation: draft.recommendation,
                  evidence: draft.evidence,
                },
                notification_id: null,
                dismissed_at: null,
                created_at: nowIso,
              },
              { onConflict: "workshop_id,alert_key" }
            )
            .select("id")
            .maybeSingle();
          if (legErr || !legacy?.id) {
            console.warn(
              "[proactive] legacy upsert alert:",
              legErr?.message || "sem id retornado"
            );
            continue;
          }
          const notifId = await maybeNotify(
            input.supabase,
            input.workshopId,
            draft,
            input.notifyOnCreate
          );
          await attachNotificationId(
            input.supabase,
            String(legacy.id),
            input.workshopId,
            notifId
          );
          result.created += 1;
          result.alerts.push({
            alertKey: draft.alertKey,
            title: draft.title,
            severity: draft.severity,
            category: draft.category,
          });
          continue;
        }
        console.warn("[proactive] insert alert:", insErr.message);
        continue;
      }

      if (!inserted?.id) {
        console.warn("[proactive] insert alert: sem id retornado");
        continue;
      }

      await insertEvent(
        input.supabase,
        input.workshopId,
        String(inserted.id),
        null,
        "active",
        null,
        "created"
      );
      const notifId = await maybeNotify(
        input.supabase,
        input.workshopId,
        draft,
        input.notifyOnCreate
      );
      await attachNotificationId(input.supabase, String(inserted.id), input.workshopId, notifId);

      result.created += 1;
      result.alerts.push({
        alertKey: draft.alertKey,
        title: draft.title,
        severity: draft.severity,
        category: draft.category,
      });
      continue;
    }

    const row = existing as ProactiveAlertRow;
    const status = (row.status || (row.dismissed_at ? "dismissed" : "active")) as ProactiveAlertStatus;

    if (status === "active" || status === "acknowledged") {
      const { error: updErr } = await input.supabase
        .from("rda_management_alerts")
        .update({
          severity: draft.severity,
          title: draft.title,
          body: draft.body,
          recommendation: draft.recommendation,
          evidence: draft.evidence,
          category: draft.category,
          ref_type: draft.refType || null,
          ref_id: draft.refId || null,
          payload: draft.payload || {},
          last_seen_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .eq("workshop_id", input.workshopId);
      if (updErr) {
        console.warn("[proactive] update alert:", updErr.message);
        continue;
      }
      result.updated += 1;
      continue;
    }

    // resolved / dismissed → reopen only after cooldown
    const closedAt = Date.parse(row.resolved_at || row.dismissed_at || row.updated_at || row.created_at);
    const hoursClosed = Number.isFinite(closedAt)
      ? (now.getTime() - closedAt) / 3_600_000
      : input.reopenAfterHours + 1;
    if (hoursClosed < input.reopenAfterHours) {
      continue;
    }

    const { data: reopenedRow, error: reopenErr } = await input.supabase
      .from("rda_management_alerts")
      .update({
        status: "active",
        severity: draft.severity,
        title: draft.title,
        body: draft.body,
        recommendation: draft.recommendation,
        evidence: draft.evidence,
        category: draft.category,
        ref_type: draft.refType || null,
        ref_id: draft.refId || null,
        payload: draft.payload || {},
        dismissed_at: null,
        resolved_at: null,
        acknowledged_at: null,
        last_seen_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", row.id)
      .eq("workshop_id", input.workshopId)
      .select("id")
      .maybeSingle();

    if (reopenErr || !reopenedRow?.id) {
      console.warn(
        "[proactive] reopen alert:",
        reopenErr?.message || "sem id retornado"
      );
      continue;
    }

    await insertEvent(
      input.supabase,
      input.workshopId,
      row.id,
      status,
      "active",
      null,
      "reopened_by_monitor"
    );
    const notifId = await maybeNotify(
      input.supabase,
      input.workshopId,
      draft,
      input.notifyOnCreate
    );
    await attachNotificationId(
      input.supabase,
      row.id,
      input.workshopId,
      notifId || null
    );

    result.reopened += 1;
    result.alerts.push({
      alertKey: draft.alertKey,
      title: draft.title,
      severity: draft.severity,
      category: draft.category,
    });
  }

  return result;
}

export async function getProactiveAlertById(input: {
  workshopId: string;
  supabase: SupabaseClient;
  alertId: string;
}): Promise<ProactiveAlertView | null> {
  const { data, error } = await input.supabase
    .from("rda_management_alerts")
    .select("*")
    .eq("workshop_id", input.workshopId)
    .eq("id", input.alertId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as ProactiveAlertRow;
  return mapRow({
    ...r,
    category:
      r.category ||
      ((r.payload as { category?: string } | undefined)?.category as ProactiveAlertRow["category"]) ||
      "patio",
    status: r.status || (r.dismissed_at ? "dismissed" : "active"),
    recommendation:
      r.recommendation ||
      String((r.payload as { recommendation?: string } | undefined)?.recommendation || ""),
    evidence:
      r.evidence || String((r.payload as { evidence?: string } | undefined)?.evidence || ""),
  });
}

export async function listProactiveAlerts(input: {
  workshopId: string;
  supabase: SupabaseClient;
  statuses?: ProactiveAlertStatus[];
  category?: string | null;
  severity?: string | null;
  limit?: number;
}): Promise<ProactiveAlertView[]> {
  let q = input.supabase
    .from("rda_management_alerts")
    .select("*")
    .eq("workshop_id", input.workshopId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit || 80, 1), 200));

  const statuses = input.statuses?.length
    ? input.statuses
    : (["active", "acknowledged"] as ProactiveAlertStatus[]);

  q = q.in("status", statuses);
  if (input.category) q = q.eq("category", input.category);
  if (input.severity) q = q.eq("severity", input.severity);

  const { data, error } = await q;
  if (error) {
    if (/status|category|schema cache|does not exist/i.test(error.message)) {
      const legacy = await input.supabase
        .from("rda_management_alerts")
        .select("*")
        .eq("workshop_id", input.workshopId)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(Math.min(Math.max(input.limit || 80, 1), 200));
      if (legacy.error) throw new Error(legacy.error.message);
      return (legacy.data || []).map((r) =>
        mapRow({
          ...(r as ProactiveAlertRow),
          category: ((r as { payload?: { category?: string } }).payload?.category ||
            "patio") as ProactiveAlertRow["category"],
          status: "active",
          recommendation:
            String((r as { payload?: { recommendation?: string } }).payload?.recommendation || "") ||
            "",
          evidence:
            String((r as { payload?: { evidence?: string } }).payload?.evidence || "") || "",
          ref_type: null,
          ref_id: null,
          last_seen_at: String((r as { created_at?: string }).created_at || new Date().toISOString()),
          updated_at: String((r as { created_at?: string }).created_at || new Date().toISOString()),
          acknowledged_at: null,
          resolved_at: null,
        })
      );
    }
    throw new Error(error.message);
  }
  return (data || []).map((r) => mapRow(r as ProactiveAlertRow));
}

export async function transitionProactiveAlert(input: {
  workshopId: string;
  supabase: SupabaseClient;
  alertId: string;
  toStatus: ProactiveAlertStatus;
  actorUserId?: string | null;
  note?: string;
}): Promise<ProactiveAlertView | null> {
  const { data: existing, error } = await input.supabase
    .from("rda_management_alerts")
    .select("*")
    .eq("workshop_id", input.workshopId)
    .eq("id", input.alertId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!existing) return null;

  const row = existing as ProactiveAlertRow;
  const fromStatus = (row.status || "active") as ProactiveAlertStatus;
  const nowIso = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status: input.toStatus,
    updated_at: nowIso,
  };
  if (input.toStatus === "acknowledged") {
    patch.acknowledged_at = nowIso;
    patch.acknowledged_by = input.actorUserId || null;
  }
  if (input.toStatus === "resolved") {
    patch.resolved_at = nowIso;
    patch.resolved_by = input.actorUserId || null;
    patch.dismissed_at = null;
  }
  if (input.toStatus === "dismissed") {
    patch.dismissed_at = nowIso;
  }
  if (input.toStatus === "active") {
    patch.dismissed_at = null;
    patch.resolved_at = null;
  }

  const { data: updated, error: updErr } = await input.supabase
    .from("rda_management_alerts")
    .update(patch)
    .eq("id", input.alertId)
    .eq("workshop_id", input.workshopId)
    .select("*")
    .maybeSingle();
  if (updErr) throw new Error(updErr.message);
  if (!updated) return null;

  await insertEvent(
    input.supabase,
    input.workshopId,
    input.alertId,
    fromStatus,
    input.toStatus,
    input.actorUserId,
    input.note
  );

  return mapRow(updated as ProactiveAlertRow);
}

export async function listAlertEvents(input: {
  workshopId: string;
  supabase: SupabaseClient;
  alertId?: string;
  limit?: number;
}) {
  let q = input.supabase
    .from("rda_management_alert_events")
    .select("*")
    .eq("workshop_id", input.workshopId)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(input.limit || 50, 1), 200));
  if (input.alertId) q = q.eq("alert_id", input.alertId);
  const { data, error } = await q;
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return [];
    throw new Error(error.message);
  }
  return data || [];
}
