import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  attributePauseIntervalsToPeriod,
  computePauseIntervals,
} from "./pauseIntervals.js";
import { toSessionFact, type RawWorkSessionRow } from "./sessionFacts.js";
import {
  OPS_QUERY_MAX_ROWS,
  OPS_SESSION_SELECT_PRODUCTION,
  type OpsLoadCompleteness,
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

export type LoadSessionFactsResult = {
  facts: OpsSessionFact[];
  completeness: OpsLoadCompleteness;
};

/**
 * Carrega fatos do período:
 * - Finished/cancelled: pelo `ended_at` no período (inclui iniciadas antes).
 * - Abertas (running/paused): separadas; started_at <= fim do período.
 * Select SEM budget_service_line_id.
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
): Promise<LoadSessionFactsResult> {
  const admin = client || getAdmin();
  const finishedLimit = Math.min(
    Math.max(1, opts?.limit ?? OPS_QUERY_MAX_ROWS),
    OPS_QUERY_MAX_ROWS
  );
  const openLimit = Math.min(500, OPS_QUERY_MAX_ROWS);
  const offset = Math.max(0, opts?.offset ?? 0);

  // Encerradas no período (ended_at) — finished + cancelled
  let finishedQ = admin
    .from("rda_work_sessions")
    .select(OPS_SESSION_SELECT_PRODUCTION)
    .eq("workshop_id", workshopId)
    .in("status", ["finished", "cancelled"])
    .gte("ended_at", period.from)
    .lte("ended_at", period.to)
    .order("ended_at", { ascending: false })
    .range(offset, offset + finishedLimit - 1);

  if (opts?.technicianUserId) {
    finishedQ = finishedQ.eq("technician_user_id", opts.technicianUserId);
  }
  if (opts?.serviceOrderId) {
    finishedQ = finishedQ.eq("service_order_id", opts.serviceOrderId);
  }

  const { data: finishedRows, error: finishedErr } = await finishedQ;
  if (finishedErr) throw new Error(finishedErr.message);

  // Abertas relevantes: ainda running/paused e iniciadas até o fim do período
  let openQ = admin
    .from("rda_work_sessions")
    .select(OPS_SESSION_SELECT_PRODUCTION)
    .eq("workshop_id", workshopId)
    .in("status", ["running", "paused"])
    .lte("started_at", period.to)
    .order("started_at", { ascending: false })
    .limit(openLimit);

  if (opts?.technicianUserId) {
    openQ = openQ.eq("technician_user_id", opts.technicianUserId);
  }
  if (opts?.serviceOrderId) {
    openQ = openQ.eq("service_order_id", opts.serviceOrderId);
  }

  const { data: openRows, error: openErr } = await openQ;
  if (openErr) throw new Error(openErr.message);

  const finishedFacts = mapRows(finishedRows as unknown[]);
  const openFacts = mapRows(openRows as unknown[]);

  const byId = new Map<string, OpsSessionFact>();
  for (const f of finishedFacts) byId.set(f.sessionId, f);
  for (const f of openFacts) {
    if (!byId.has(f.sessionId)) byId.set(f.sessionId, f);
  }

  const finishedFetched = finishedFacts.length;
  const openFetched = openFacts.length;
  const truncated =
    finishedFetched >= finishedLimit || openFetched >= openLimit;
  const completeness: OpsLoadCompleteness = {
    complete: !truncated,
    truncated,
    finishedFetched,
    finishedLimit,
    openFetched,
    openLimit,
    note: truncated
      ? `Resultados incompletos: limite atingido (finished ${finishedFetched}/${finishedLimit}, open ${openFetched}/${openLimit}). Refine o período ou pagine com offset.`
      : null,
  };

  return { facts: [...byId.values()], completeness };
}

export type PauseEventLoaded = {
  reasonId: string;
  label: string;
  /** Duração CONFIRMADA no período (só fechadas, clipada). */
  pausedMs: number | null;
  /** Estimativa no período se ainda aberta — não definitiva. */
  estimatedPausedMs: number | null;
  durationConfirmed: boolean;
  fullDurationMs: number | null;
  crossesPeriodBoundary: boolean;
  spansEntirePeriod: boolean;
  attribution: "full" | "clipped" | "estimated_open" | "unknown";
  at: string;
  sessionId: string;
  endedAt: string | null;
};

export type LoadPauseEventsResult = {
  events: PauseEventLoaded[];
  completeness: OpsLoadCompleteness;
};

/**
 * Pausas com duração via timeline.
 * Inclui: iniciadas/fechadas no período; atravessando o período inteiro
 * (pause antes + resume depois, ou ainda abertas) mesmo sem evento interno.
 * Abertas → só estimativa; confirmadas → duração clipada.
 */
export async function loadPauseEvents(
  workshopId: string,
  period: OpsPeriod,
  client?: SupabaseClient
): Promise<LoadPauseEventsResult> {
  const admin = client || getAdmin();
  const eventLimit = OPS_QUERY_MAX_ROWS;

  const { data: reasons } = await admin.from("rda_work_pause_reasons").select("id, label");
  const labelById = new Map<string, string>();
  for (const r of reasons || []) {
    labelById.set(String((r as { id: string }).id), String((r as { label: string }).label || ""));
  }

  // Pausas iniciadas no período
  const { data: pauseStarts, error: pauseErr } = await admin
    .from("rda_work_session_events")
    .select("session_id")
    .eq("workshop_id", workshopId)
    .eq("event_type", "pause")
    .gte("occurred_at", period.from)
    .lte("occurred_at", period.to)
    .limit(eventLimit);
  if (pauseErr) throw new Error(pauseErr.message);

  // Fechamentos no período (podem fechar pausa iniciada antes)
  const { data: closers, error: closeErr } = await admin
    .from("rda_work_session_events")
    .select("session_id")
    .eq("workshop_id", workshopId)
    .in("event_type", ["resume", "finish", "cancel"])
    .gte("occurred_at", period.from)
    .lte("occurred_at", period.to)
    .limit(eventLimit);
  if (closeErr) throw new Error(closeErr.message);

  // Pausas iniciadas ANTES do período (candidatas a atravessar o recorte inteiro)
  const { data: earlyPauses, error: earlyErr } = await admin
    .from("rda_work_session_events")
    .select("session_id")
    .eq("workshop_id", workshopId)
    .eq("event_type", "pause")
    .lt("occurred_at", period.from)
    .order("occurred_at", { ascending: false })
    .limit(eventLimit);
  if (earlyErr) throw new Error(earlyErr.message);

  const earlySessionIds = [
    ...new Set(
      (earlyPauses || []).map((e) => String((e as { session_id: string }).session_id))
    ),
  ].slice(0, 500);

  // Fechamentos DEPOIS do período nas mesmas sessões → span completo fechado
  let lateCloserIds: string[] = [];
  if (earlySessionIds.length) {
    const { data: lateClosers, error: lateErr } = await admin
      .from("rda_work_session_events")
      .select("session_id")
      .eq("workshop_id", workshopId)
      .in("event_type", ["resume", "finish", "cancel"])
      .gt("occurred_at", period.to)
      .in("session_id", earlySessionIds)
      .limit(eventLimit);
    if (lateErr) throw new Error(lateErr.message);
    lateCloserIds = (lateClosers || []).map((e) =>
      String((e as { session_id: string }).session_id)
    );
  }

  // Sessões ainda pausadas cujo pause começou até o fim do período (abertas / span)
  const { data: pausedSessions, error: pausedErr } = await admin
    .from("rda_work_sessions")
    .select("id")
    .eq("workshop_id", workshopId)
    .eq("status", "paused")
    .lte("current_pause_started_at", period.to)
    .limit(500);
  if (pausedErr) throw new Error(pausedErr.message);

  const pauseStartsFetched = (pauseStarts || []).length;
  const closersFetched = (closers || []).length;
  const earlyFetched = (earlyPauses || []).length;
  const discoveryTruncated =
    pauseStartsFetched >= eventLimit ||
    closersFetched >= eventLimit ||
    earlyFetched >= eventLimit;

  const sessionIds = [
    ...new Set([
      ...(pauseStarts || []).map((e) => String((e as { session_id: string }).session_id)),
      ...(closers || []).map((e) => String((e as { session_id: string }).session_id)),
      ...lateCloserIds,
      ...earlySessionIds.filter((id) =>
        (pausedSessions || []).some((s) => String((s as { id: string }).id) === id)
      ),
      ...(pausedSessions || []).map((s) => String((s as { id: string }).id)),
    ]),
  ].slice(0, 1000);

  const emptyCompleteness = (extra?: Partial<OpsLoadCompleteness>): OpsLoadCompleteness => ({
    complete: !discoveryTruncated,
    truncated: discoveryTruncated,
    finishedFetched: 0,
    finishedLimit: 0,
    openFetched: 0,
    openLimit: 0,
    pauseEventsFetched: pauseStartsFetched + closersFetched + earlyFetched,
    pauseEventsLimit: eventLimit * 3,
    note: discoveryTruncated
      ? "Descoberta de eventos de pausa truncada pelo limite — resultados podem estar incompletos."
      : null,
    ...extra,
  });

  if (!sessionIds.length) {
    return { events: [], completeness: emptyCompleteness() };
  }

  const { data: timeline, error: tlErr } = await admin
    .from("rda_work_session_events")
    .select("session_id, event_type, pause_reason_id, occurred_at")
    .eq("workshop_id", workshopId)
    .in("session_id", sessionIds)
    .in("event_type", ["pause", "resume", "finish", "cancel"])
    .order("occurred_at", { ascending: true })
    .limit(eventLimit);
  if (tlErr) throw new Error(tlErr.message);

  const timelineFetched = (timeline || []).length;
  const timelineTruncated = timelineFetched >= eventLimit;

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

  const attributed = attributePauseIntervalsToPeriod(intervals, period);
  const truncated = discoveryTruncated || timelineTruncated;

  return {
    events: attributed.map((iv) => ({
      reasonId: iv.reasonId,
      label: labelById.get(iv.reasonId) || iv.reasonId,
      pausedMs: iv.durationMsInPeriod,
      estimatedPausedMs: iv.estimatedDurationMsInPeriod,
      durationConfirmed: iv.durationConfirmed,
      fullDurationMs: iv.durationMs,
      crossesPeriodBoundary: iv.crossesPeriodBoundary,
      spansEntirePeriod: iv.spansEntirePeriod,
      attribution: iv.attribution,
      at: iv.startedAt,
      sessionId: iv.sessionId,
      endedAt: iv.endedAt,
    })),
    completeness: {
      complete: !truncated,
      truncated,
      finishedFetched: 0,
      finishedLimit: 0,
      openFetched: 0,
      openLimit: 0,
      pauseEventsFetched: timelineFetched,
      pauseEventsLimit: eventLimit,
      note: truncated
        ? "Timeline/eventos de pausa truncados pelo limite — refine o período; durações clipadas ao recorte."
        : null,
    },
  };
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
