import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toSessionFact, type RawWorkSessionRow } from "./sessionFacts.js";
import type { OpsPeriod, OpsSessionFact } from "./types.js";

function getAdmin(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) throw new Error("Supabase admin não configurado");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function parsePeriod(input?: { from?: string; to?: string; days?: number }): OpsPeriod {
  const now = new Date();
  let to = input?.to ? new Date(input.to) : now;
  let from: Date;
  if (input?.from) {
    from = new Date(input.from);
  } else {
    const days = Math.min(365, Math.max(1, Number(input?.days) || 30));
    from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  }
  if (Number.isNaN(from.getTime())) from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (Number.isNaN(to.getTime())) to = now;
  if (from > to) {
    const tmp = from;
    from = to;
    to = tmp;
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function loadSessionFacts(
  workshopId: string,
  period: OpsPeriod,
  opts?: { technicianUserId?: string | null; serviceOrderId?: string | null },
  client?: SupabaseClient
): Promise<OpsSessionFact[]> {
  const admin = client || getAdmin();
  let q = admin
    .from("rda_work_sessions")
    .select(
      "id, workshop_id, service_order_id, technician_user_id, time_kind, status, started_at, ended_at, productive_ms, paused_ms, budget_service_line_id, budget_service_description, current_pause_reason_id"
    )
    .eq("workshop_id", workshopId)
    .gte("started_at", period.from)
    .lte("started_at", period.to)
    .order("started_at", { ascending: false })
    .limit(5000);

  if (opts?.technicianUserId) q = q.eq("technician_user_id", opts.technicianUserId);
  if (opts?.serviceOrderId) q = q.eq("service_order_id", opts.serviceOrderId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  const facts: OpsSessionFact[] = [];
  for (const row of (data || []) as RawWorkSessionRow[]) {
    const fact = toSessionFact(row);
    if (fact) facts.push(fact);
  }
  return facts;
}

export type PauseEventLoaded = {
  reasonId: string;
  label: string;
  pausedMs: number | null;
  at: string;
};

export async function loadPauseEvents(
  workshopId: string,
  period: OpsPeriod,
  client?: SupabaseClient
): Promise<PauseEventLoaded[]> {
  const admin = client || getAdmin();

  const { data: reasons } = await admin.from("rda_work_pause_reasons").select("id, label");
  const labelById = new Map<string, string>();
  for (const r of reasons || []) {
    labelById.set(String((r as { id: string }).id), String((r as { label: string }).label || ""));
  }

  const { data: events, error } = await admin
    .from("rda_work_session_events")
    .select("id, session_id, event_type, pause_reason_id, occurred_at, meta")
    .eq("workshop_id", workshopId)
    .eq("event_type", "pause")
    .gte("occurred_at", period.from)
    .lte("occurred_at", period.to)
    .order("occurred_at", { ascending: false })
    .limit(5000);

  if (error) throw new Error(error.message);

  const sessionIds = [...new Set((events || []).map((e) => String((e as { session_id: string }).session_id)))];
  const pausedBySession = new Map<string, number>();
  if (sessionIds.length) {
    const { data: sessions } = await admin
      .from("rda_work_sessions")
      .select("id, paused_ms")
      .eq("workshop_id", workshopId)
      .in("id", sessionIds.slice(0, 1000));
    for (const s of sessions || []) {
      pausedBySession.set(
        String((s as { id: string }).id),
        Math.max(0, Number((s as { paused_ms: number }).paused_ms) || 0)
      );
    }
  }

  const pauseCountBySession = new Map<string, number>();
  for (const e of events || []) {
    const sid = String((e as { session_id: string }).session_id);
    pauseCountBySession.set(sid, (pauseCountBySession.get(sid) || 0) + 1);
  }

  const out: PauseEventLoaded[] = [];
  for (const e of events || []) {
    const row = e as {
      session_id: string;
      pause_reason_id: string | null;
      occurred_at: string;
      meta?: { reason_id?: string } | null;
    };
    const reasonId =
      row.pause_reason_id ||
      (row.meta && typeof row.meta.reason_id === "string" ? row.meta.reason_id : "") ||
      "unknown";
    const sid = row.session_id;
    const totalPaused = pausedBySession.get(sid) ?? null;
    const count = pauseCountBySession.get(sid) || 1;
    const pausedMs =
      totalPaused != null && count > 0 ? Math.round(totalPaused / count) : null;
    out.push({
      reasonId,
      label: labelById.get(reasonId) || reasonId,
      pausedMs,
      at: row.occurred_at,
    });
  }
  return out;
}

export async function loadTechnicianNames(
  workshopId: string,
  userIds: string[],
  client?: SupabaseClient
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (!userIds.length) return map;
  const admin = client || getAdmin();
  const unique = [...new Set(userIds)].slice(0, 200);
  const { data } = await admin
    .from("workshop_system_users")
    .select("id, display_name, username")
    .eq("workshop_id", workshopId)
    .in("id", unique);
  for (const u of data || []) {
    const row = u as {
      id: string;
      display_name?: string | null;
      username?: string | null;
    };
    map.set(
      row.id,
      String(row.display_name || row.username || row.id).trim() || row.id
    );
  }
  return map;
}
