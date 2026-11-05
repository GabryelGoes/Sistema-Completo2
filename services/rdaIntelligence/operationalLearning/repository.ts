import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  computePauseIntervals,
  intervalsOverlappingPeriod,
} from "./pauseIntervals.js";
import { toSessionFact, type RawWorkSessionRow } from "./sessionFacts.js";
import {
  OPS_QUERY_MAX_ROWS,
  OPS_SESSION_SELECT_PRODUCTION,
  type OpsPeriod,
  type OpsSessionFact,
} from "./types.js";

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

function mapRows(data: unknown[] | null): OpsSessionFact[] {
  const facts: OpsSessionFact[] = [];
  for (const row of (data || []) as RawWorkSessionRow[]) {
    const fact = toSessionFact(row);
    if (fact) facts.push(fact);
  }
  return facts;
}

/**
 * Carrega fatos do período.
 * - Sessões com started_at no período (qualquer status).
 * - Sessões abertas (running/paused) que começaram antes do período (atravessam o recorte).
 * Select SEM budget_service_line_id (compatível com produção atual).
 */
export async function loadSessionFacts(
  workshopId: string,
  period: OpsPeriod,
  opts?: {
    technicianUserId?: string | null;
    serviceOrderId?: string | null;
    limit?: number;
    offset?: number;
  },
  client?: SupabaseClient
): Promise<OpsSessionFact[]> {
  const admin = client || getAdmin();
  const limit = Math.min(
    Math.max(1, opts?.limit ?? OPS_QUERY_MAX_ROWS),
    OPS_QUERY_MAX_ROWS
  );
  const offset = Math.max(0, opts?.offset ?? 0);

  let inPeriod = admin
    .from("rda_work_sessions")
    .select(OPS_SESSION_SELECT_PRODUCTION)
    .eq("workshop_id", workshopId)
    .gte("started_at", period.from)
    .lte("started_at", period.to)
    .order("started_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (opts?.technicianUserId) {
    inPeriod = inPeriod.eq("technician_user_id", opts.technicianUserId);
  }
  if (opts?.serviceOrderId) {
    inPeriod = inPeriod.eq("service_order_id", opts.serviceOrderId);
  }

  const { data: periodRows, error: periodErr } = await inPeriod;
  if (periodErr) throw new Error(periodErr.message);

  // Abertas que começaram antes do período (atravessam o recorte).
  let openCross = admin
    .from("rda_work_sessions")
    .select(OPS_SESSION_SELECT_PRODUCTION)
    .eq("workshop_id", workshopId)
    .in("status", ["running", "paused"])
    .lt("started_at", period.from)
    .order("started_at", { ascending: false })
    .limit(500);

  if (opts?.technicianUserId) {
    openCross = openCross.eq("technician_user_id", opts.technicianUserId);
  }
  if (opts?.serviceOrderId) {
    openCross = openCross.eq("service_order_id", opts.serviceOrderId);
  }

  const { data: openRows, error: openErr } = await openCross;
  if (openErr) throw new Error(openErr.message);

  const byId = new Map<string, OpsSessionFact>();
  for (const f of mapRows(periodRows as unknown[])) byId.set(f.sessionId, f);
  for (const f of mapRows(openRows as unknown[])) {
    if (!byId.has(f.sessionId)) byId.set(f.sessionId, f);
  }
  return [...byId.values()];
}

export type PauseEventLoaded = {
  reasonId: string;
  label: string;
  /** Duração real por timestamps; null se desconhecida. */
  pausedMs: number | null;
  at: string;
  sessionId: string;
  endedAt: string | null;
};

/**
 * Pausas com duração via timeline pause→resume/finish/cancel.
 * Não divide paused_ms da sessão entre eventos.
 */
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

  // Eventos de pause no período → descobrir sessões afetadas
  const { data: pauseStarts, error: pauseErr } = await admin
    .from("rda_work_session_events")
    .select("session_id, occurred_at")
    .eq("workshop_id", workshopId)
    .eq("event_type", "pause")
    .gte("occurred_at", period.from)
    .lte("occurred_at", period.to)
    .order("occurred_at", { ascending: false })
    .limit(OPS_QUERY_MAX_ROWS);

  if (pauseErr) throw new Error(pauseErr.message);

  const sessionIds = [
    ...new Set(
      (pauseStarts || []).map((e) => String((e as { session_id: string }).session_id))
    ),
  ].slice(0, 1000);

  if (!sessionIds.length) return [];

  // Timeline completa dessas sessões para fechar intervalos
  const { data: timeline, error: tlErr } = await admin
    .from("rda_work_session_events")
    .select("session_id, event_type, pause_reason_id, occurred_at")
    .eq("workshop_id", workshopId)
    .in("session_id", sessionIds)
    .in("event_type", ["pause", "resume", "finish", "cancel"])
    .order("occurred_at", { ascending: true })
    .limit(OPS_QUERY_MAX_ROWS);

  if (tlErr) throw new Error(tlErr.message);

  const intervals = computePauseIntervals(
    (timeline || []).map((e) => {
      const row = e as {
        session_id: string;
        event_type: string;
        pause_reason_id: string | null;
        occurred_at: string;
      };
      return {
        sessionId: row.session_id,
        eventType: row.event_type,
        occurredAt: row.occurred_at,
        pauseReasonId: row.pause_reason_id,
      };
    })
  );

  const inPeriod = intervalsOverlappingPeriod(intervals, period);
  return inPeriod.map((iv) => ({
    reasonId: iv.reasonId,
    label: labelById.get(iv.reasonId) || iv.reasonId,
    pausedMs: iv.durationMs,
    at: iv.startedAt,
    sessionId: iv.sessionId,
    endedAt: iv.endedAt,
  }));
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
    map.set(row.id, String(row.display_name || row.username || row.id).trim() || row.id);
  }
  return map;
}
