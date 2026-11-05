import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureEvalRequestForFinishedSession } from "../evaluations/registerRdaEvaluationRoutes.js";
import {
  canAccessWorkSessionApis,
  canViewSessionRow,
  canViewWorkPerformanceSummary,
  resolveWorkSessionListScope,
} from "./access.js";
import {
  computeLiveTotals,
  asNonNegInt,
  clipInterval,
  mergeDayMaps,
  pausedIntervalsFromEvents,
  productiveIntervalsFromEvents,
  splitIntervalByCalendarDay,
  sumIntervalsMs,
  WORKSHOP_TIME_ZONE,
} from "./timing.js";
import type {
  RdaWorkPauseReason,
  RdaWorkPerformanceTechnicianRow,
  RdaWorkSessionDto,
  RdaWorkSessionEventDto,
  RdaWorkSessionStatus,
} from "./types.js";
import {
  ensureBudgetServiceLineIds,
  OS_GENERAL_SERVICE_LINE_ID,
  readBudgetServiceLineId,
} from "../../../utils/budgetServiceLineId.js";
import {
  canStartOrResumeTimeKind,
  isRdaWorkTimeKind,
  timeKindAllowedForOsStatus,
  timeKindLabel,
  type RdaWorkTimeKind,
} from "./stageRules.js";

type SessionPayload = {
  r: "admin" | "user";
  u?: string;
  n?: string;
};

type RouteDeps = {
  WORKSHOP_ID: string | undefined;
  supabaseAdmin: SupabaseClient | null;
  loadUserPermissions?: (
    userId: string
  ) => Promise<Record<string, boolean> | null>;
};

type SessionRow = {
  id: string;
  workshop_id: string;
  service_order_id: string;
  technician_user_id: string;
  budget_id: string | null;
  budget_service_description: string | null;
  budget_service_line_id?: string | null;
  time_kind?: string | null;
  status: RdaWorkSessionStatus;
  started_at: string;
  ended_at: string | null;
  segment_started_at: string | null;
  productive_ms: number;
  paused_ms: number;
  current_pause_reason_id: string | null;
  current_pause_note: string | null;
  current_pause_started_at: string | null;
  client_mutation_id: string | null;
  order_type?: string | null;
};

function resolveTimeKind(raw: unknown): RdaWorkTimeKind {
  return isRdaWorkTimeKind(raw) ? raw : "execution";
}

function authFromReq(req: Request): SessionPayload | null {
  return (req as unknown as { auth?: SessionPayload }).auth ?? null;
}

function mapPauseReason(row: Record<string, unknown>): RdaWorkPauseReason {
  return {
    id: String(row.id),
    label: String(row.label ?? ""),
    requiresNote: row.requires_note === true,
    sortOrder: Number(row.sort_order ?? 0),
  };
}

function mapSession(row: SessionRow, serverNow = new Date()): RdaWorkSessionDto {
  const serverNowMs = serverNow.getTime();
  const live = computeLiveTotals({
    status: row.status,
    productiveMs: asNonNegInt(row.productive_ms),
    pausedMs: asNonNegInt(row.paused_ms),
    segmentStartedAt: row.segment_started_at,
    currentPauseStartedAt: row.current_pause_started_at,
    serverNowMs,
  });
  const orderTypeRaw = String(row.order_type || "").toLowerCase();
  const orderType =
    orderTypeRaw === "module" ? ("module" as const) : orderTypeRaw === "vehicle" ? ("vehicle" as const) : null;
  return {
    id: row.id,
    serviceOrderId: row.service_order_id,
    technicianUserId: row.technician_user_id,
    budgetId: row.budget_id,
    budgetServiceDescription: row.budget_service_description,
    budgetServiceLineId: row.budget_service_line_id ? String(row.budget_service_line_id) : null,
    timeKind: resolveTimeKind(row.time_kind),
    orderType,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    segmentStartedAt: row.segment_started_at,
    productiveMs: asNonNegInt(row.productive_ms),
    pausedMs: asNonNegInt(row.paused_ms),
    liveProductiveMs: live.liveProductiveMs,
    livePausedMs: live.livePausedMs,
    currentPauseReasonId: row.current_pause_reason_id,
    currentPauseNote: row.current_pause_note,
    currentPauseStartedAt: row.current_pause_started_at,
    serverNow: serverNow.toISOString(),
  };
}

function mapEvent(row: Record<string, unknown>): RdaWorkSessionEventDto {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    eventType: row.event_type as RdaWorkSessionEventDto["eventType"],
    occurredAt: String(row.occurred_at),
    pauseReasonId: row.pause_reason_id ? String(row.pause_reason_id) : null,
    pauseNote: row.pause_note ? String(row.pause_note) : null,
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
  };
}

function mutationIdFromBody(body: unknown): string | null {
  const raw = (body as { clientMutationId?: unknown } | null)?.clientMutationId;
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 128);
  return t || null;
}

export function registerRdaWorkSessionRoutes(app: Express, deps: RouteDeps): void {
  const { WORKSHOP_ID, supabaseAdmin } = deps;

  async function loadTechFlags(userId: string): Promise<{
    isTechnician: boolean;
    permissions: Record<string, boolean>;
    displayName: string;
  } | null> {
    if (!supabaseAdmin || !WORKSHOP_ID || !userId) return null;
    const { data } = await supabaseAdmin
      .from("workshop_system_users")
      .select("is_technician, permissions, display_name, username")
      .eq("id", userId)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    if (!data) return null;
    const perms = (data.permissions as Record<string, boolean> | null) || {};
    const displayName =
      String(data.display_name || "").trim() ||
      String(data.username || "").trim() ||
      "Técnico";
    return {
      isTechnician: data.is_technician === true,
      permissions: perms,
      displayName,
    };
  }

  async function requireTechnicianActor(
    req: Request,
    res: Response
  ): Promise<{ userId: string; displayName: string } | null> {
    const auth = authFromReq(req);
    if (!auth) {
      res.status(401).json({ error: "Não autenticado." });
      return null;
    }
    if (auth.r !== "user" || !auth.u) {
      res.status(403).json({
        error: "Apenas o login do mecânico pode controlar o cronômetro.",
      });
      return null;
    }
    const flags = await loadTechFlags(auth.u);
    if (!flags?.isTechnician) {
      res.status(403).json({
        error: "Usuário não está marcado como técnico (is_technician).",
      });
      return null;
    }
    return { userId: auth.u, displayName: flags.displayName };
  }

  async function canViewWorkSessions(req: Request): Promise<boolean> {
    const auth = authFromReq(req);
    if (!auth) return false;
    if (auth.r === "admin") return true;
    if (auth.r !== "user" || !auth.u) return false;
    const flags = await loadTechFlags(auth.u);
    return canAccessWorkSessionApis({
      role: auth.r,
      userId: auth.u,
      flags,
    });
  }

  function sessionFromRpcJson(raw: unknown): SessionRow | null {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    if (typeof row.id !== "string") return null;
    return row as unknown as SessionRow;
  }

  /** Guarda pós-RPC: sessão retornada deve pertencer ao técnico autenticado. */
  function assertRpcSessionOwner(
    session: SessionRow | null,
    technicianUserId: string
  ): session is SessionRow {
    return !!session && session.technician_user_id === technicianUserId;
  }

  function rpcDeniedPayload(data: Record<string, unknown>, fallback: string) {
    const status =
      typeof data.httpStatus === "number" ? data.httpStatus : 400;
    return {
      status,
      body: {
        error: typeof data.error === "string" ? data.error : fallback,
        code: typeof data.code === "string" ? data.code : undefined,
      },
    };
  }

  async function callSessionRpc(
    fn:
      | "rda_work_session_start"
      | "rda_work_session_pause"
      | "rda_work_session_resume"
      | "rda_work_session_finish"
      | "rda_work_session_correct",
    args: Record<string, unknown>
  ): Promise<{ ok: boolean; data: Record<string, unknown> | null; missingFn: boolean; error?: string }> {
    if (!supabaseAdmin) {
      return { ok: false, data: null, missingFn: false, error: "Servidor não configurado." };
    }
    const { data, error } = await supabaseAdmin.rpc(fn, args);
    if (error) {
      const msg = error.message || "";
      if (/Could not find the function|schema cache|does not exist/i.test(msg)) {
        return { ok: false, data: null, missingFn: true, error: msg };
      }
      return { ok: false, data: null, missingFn: false, error: msg };
    }
    const payload =
      data && typeof data === "object" ? (data as Record<string, unknown>) : null;
    return { ok: payload?.ok === true, data: payload, missingFn: false };
  }

  async function ensureStartEvent(session: SessionRow, actorUserId: string): Promise<void> {
    if (!supabaseAdmin || !WORKSHOP_ID) return;
    const { data: existing } = await supabaseAdmin
      .from("rda_work_session_events")
      .select("id")
      .eq("session_id", session.id)
      .eq("event_type", "start")
      .limit(1)
      .maybeSingle();
    if (existing) return;
    try {
      await insertEvent({
        sessionId: session.id,
        eventType: "start",
        actorUserId,
        clientMutationId: session.client_mutation_id
          ? `${session.client_mutation_id}:event`
          : null,
        occurredAt: session.started_at,
        meta: { repaired: true },
      });
    } catch (evErr: unknown) {
      const msg = evErr instanceof Error ? evErr.message : "";
      if (!/duplicate key/i.test(msg)) console.warn("[API] repair start event:", evErr);
    }
  }

  async function findSessionByMutation(
    mutationId: string
  ): Promise<SessionRow | null> {
    if (!supabaseAdmin || !WORKSHOP_ID || !mutationId) return null;
    const { data } = await supabaseAdmin
      .from("rda_work_sessions")
      .select("*")
      .eq("workshop_id", WORKSHOP_ID)
      .eq("client_mutation_id", mutationId)
      .maybeSingle();
    return (data as SessionRow | null) ?? null;
  }

  async function findEventByMutation(
    mutationId: string
  ): Promise<{ session_id: string } | null> {
    if (!supabaseAdmin || !WORKSHOP_ID || !mutationId) return null;
    const { data } = await supabaseAdmin
      .from("rda_work_session_events")
      .select("session_id")
      .eq("workshop_id", WORKSHOP_ID)
      .eq("client_mutation_id", mutationId)
      .maybeSingle();
    return data as { session_id: string } | null;
  }

  async function loadSession(id: string): Promise<SessionRow | null> {
    if (!supabaseAdmin || !WORKSHOP_ID) return null;
    const { data } = await supabaseAdmin
      .from("rda_work_sessions")
      .select("*")
      .eq("id", id)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    return (data as SessionRow | null) ?? null;
  }

  async function insertEvent(params: {
    sessionId: string;
    eventType: string;
    actorUserId: string;
    pauseReasonId?: string | null;
    pauseNote?: string | null;
    clientMutationId?: string | null;
    meta?: Record<string, unknown>;
    occurredAt?: string;
  }): Promise<void> {
    if (!supabaseAdmin || !WORKSHOP_ID) return;
    const { error } = await supabaseAdmin.from("rda_work_session_events").insert({
      workshop_id: WORKSHOP_ID,
      session_id: params.sessionId,
      event_type: params.eventType,
      occurred_at: params.occurredAt || new Date().toISOString(),
      pause_reason_id: params.pauseReasonId ?? null,
      pause_note: params.pauseNote ?? null,
      actor_user_id: params.actorUserId,
      client_mutation_id: params.clientMutationId ?? null,
      meta: params.meta ?? {},
    });
    if (error) throw error;
  }

  async function validateBudgetForOs(
    serviceOrderId: string,
    budgetId: string | null
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!budgetId) return { ok: true };
    if (!supabaseAdmin || !WORKSHOP_ID) {
      return { ok: false, error: "Servidor não configurado." };
    }
    const { data, error } = await supabaseAdmin
      .from("budgets")
      .select("id, workshop_id, service_order_id")
      .eq("id", budgetId)
      .eq("workshop_id", WORKSHOP_ID)
      .eq("service_order_id", serviceOrderId)
      .maybeSingle();
    if (error || !data) {
      return {
        ok: false,
        error: "Orçamento inválido para esta OS/oficina.",
      };
    }
    return { ok: true };
  }

  app.get("/api/rda/work-sessions/pause-reasons", async (req, res) => {
    try {
      if (!(await canViewWorkSessions(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data, error } = await supabaseAdmin
        .from("rda_work_pause_reasons")
        .select("id, label, requires_note, sort_order")
        .eq("active", true)
        .order("sort_order", { ascending: true });
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error:
              "Tabelas de tempo RDA ainda não aplicadas. Rode a migration 20261101220000_rda_work_sessions.sql no ambiente de teste.",
            code: "RDA_WORK_MIGRATION_REQUIRED",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json((data ?? []).map((r) => mapPauseReason(r as Record<string, unknown>)));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET pause-reasons:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/work-sessions/mine/active", async (req, res) => {
    try {
      const tech = await requireTechnicianActor(req, res);
      if (!tech) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data, error } = await supabaseAdmin
        .from("rda_work_sessions")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("technician_user_id", tech.userId)
        .in("status", ["running", "paused"])
        .maybeSingle();
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error: "Migration de sessões RDA pendente.",
            code: "RDA_WORK_MIGRATION_REQUIRED",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.json({ session: null });
      return res.json({ session: mapSession(data as SessionRow) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET mine/active:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/work-sessions", async (req, res) => {
    try {
      if (!(await canViewWorkSessions(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const serviceOrderId =
        typeof req.query.serviceOrderId === "string" ? req.query.serviceOrderId.trim() : "";
      const technicianUserId =
        typeof req.query.technicianUserId === "string"
          ? req.query.technicianUserId.trim()
          : "";
      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
      const includeEvents = String(req.query.includeEvents || "") === "1";

      let query = supabaseAdmin
        .from("rda_work_sessions")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("started_at", { ascending: false })
        .limit(200);

      if (serviceOrderId) query = query.eq("service_order_id", serviceOrderId);
      if (technicianUserId) query = query.eq("technician_user_id", technicianUserId);
      if (from) query = query.gte("started_at", from);
      if (to) query = query.lte("started_at", to);

      const auth = authFromReq(req);
      const flags =
        auth?.r === "user" && auth.u ? await loadTechFlags(auth.u) : null;
      const listScope = resolveWorkSessionListScope({
        role: auth?.r,
        userId: auth?.u,
        flags,
      });
      if (!listScope.allowed) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (listScope.scope === "self") {
        if (technicianUserId && technicianUserId !== listScope.selfUserId) {
          return res.status(403).json({ error: "Não é permitido consultar outro técnico." });
        }
        query = query.eq("technician_user_id", listScope.selfUserId);
      }

      const { data, error } = await query;
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error: "Migration de sessões RDA pendente.",
            code: "RDA_WORK_MIGRATION_REQUIRED",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      const sessions = ((data ?? []) as SessionRow[]).map((row) => mapSession(row));
      if (!includeEvents || sessions.length === 0) {
        return res.json({ sessions, events: [] as RdaWorkSessionEventDto[] });
      }
      const ids = sessions.map((s) => s.id);
      const { data: evs } = await supabaseAdmin
        .from("rda_work_session_events")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .in("session_id", ids)
        .order("occurred_at", { ascending: true });
      return res.json({
        sessions,
        events: (evs ?? []).map((e) => mapEvent(e as Record<string, unknown>)),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET work-sessions:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/work-sessions/performance-summary", async (req, res) => {
    try {
      const auth = authFromReq(req);
      if (!auth) return res.status(401).json({ error: "Não autenticado." });
      const flags =
        auth.r === "user" && auth.u ? await loadTechFlags(auth.u) : null;
      if (
        !canViewWorkPerformanceSummary({
          role: auth.r,
          userId: auth.u,
          flags,
        })
      ) {
        return res.status(403).json({ error: "Acesso negado ao resumo de desempenho." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }

      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
      const orderTypeRaw =
        typeof req.query.orderType === "string" ? req.query.orderType.trim().toLowerCase() : "all";
      const orderTypeFilter =
        orderTypeRaw === "vehicle" || orderTypeRaw === "module" ? orderTypeRaw : "all";
      const fromMs = from ? Date.parse(from) : null;
      const toMs = to ? Date.parse(to) : null;
      const serverNow = Date.now();

      // Overlap: started_at < to AND (ended_at IS NULL OR ended_at > from)
      let query = supabaseAdmin
        .from("rda_work_sessions")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("started_at", { ascending: false })
        .limit(2000);
      if (to && Number.isFinite(toMs)) query = query.lt("started_at", to);
      // ended_at filter via post-filter (Supabase or() é verboso); buscamos folga no started_at
      if (from && Number.isFinite(fromMs)) {
        // inclui sessões que começaram antes do período mas podem se estender nele
        const lookback = new Date((fromMs as number) - 7 * 86400000).toISOString();
        query = query.gte("started_at", lookback);
      }

      const { data, error } = await query;
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error: "Migration de sessões RDA pendente.",
            code: "RDA_WORK_MIGRATION_REQUIRED",
            technicians: [],
          });
        }
        return res.status(500).json({ error: error.message });
      }

      let rows = (data ?? []) as SessionRow[];
      // Descarta sessões que terminaram antes do período
      if (from && Number.isFinite(fromMs)) {
        rows = rows.filter((r) => {
          if (!r.ended_at) return true;
          const ended = Date.parse(r.ended_at);
          return !Number.isFinite(ended) || ended > (fromMs as number);
        });
      }

      // Join order_type
      const osIds = [...new Set(rows.map((r) => r.service_order_id))];
      const orderTypeByOs = new Map<string, string>();
      if (osIds.length) {
        const { data: sos } = await supabaseAdmin
          .from("service_orders")
          .select("id, order_type")
          .eq("workshop_id", WORKSHOP_ID)
          .in("id", osIds);
        for (const so of sos ?? []) {
          orderTypeByOs.set(
            String((so as { id: string }).id),
            String((so as { order_type?: string }).order_type || "vehicle").toLowerCase()
          );
        }
      }
      rows = rows.map((r) => ({
        ...r,
        order_type: orderTypeByOs.get(r.service_order_id) || "vehicle",
      }));
      if (orderTypeFilter !== "all") {
        rows = rows.filter((r) => String(r.order_type) === orderTypeFilter);
      }

      const techIds = [...new Set(rows.map((r) => r.technician_user_id))];
      const nameById = new Map<string, string>();
      if (techIds.length) {
        const { data: users } = await supabaseAdmin
          .from("workshop_system_users")
          .select("id, display_name, username")
          .eq("workshop_id", WORKSHOP_ID)
          .in("id", techIds);
        for (const u of users ?? []) {
          const name =
            String((u as { display_name?: string }).display_name || "").trim() ||
            String((u as { username?: string }).username || "").trim() ||
            String((u as { id: string }).id);
          nameById.set(String((u as { id: string }).id), name);
        }
      }

      const { data: reasons } = await supabaseAdmin
        .from("rda_work_pause_reasons")
        .select("id, label");
      const reasonLabel = new Map<string, string>();
      for (const r of reasons ?? []) {
        reasonLabel.set(String((r as { id: string }).id), String((r as { label: string }).label));
      }

      const sessionIds = rows.map((r) => r.id);
      const eventsBySession = new Map<
        string,
        Array<{ eventType: string; occurredAt: string; pauseReasonId?: string | null }>
      >();
      if (sessionIds.length) {
        // Pagina em chunks de 200 ids
        for (let i = 0; i < sessionIds.length; i += 200) {
          const chunk = sessionIds.slice(i, i + 200);
          const { data: evs } = await supabaseAdmin
            .from("rda_work_session_events")
            .select("session_id, event_type, occurred_at, pause_reason_id")
            .eq("workshop_id", WORKSHOP_ID)
            .in("session_id", chunk)
            .in("event_type", ["start", "pause", "resume", "finish", "cancel"])
            .order("occurred_at", { ascending: true });
          for (const ev of evs ?? []) {
            const sid = String((ev as { session_id: string }).session_id);
            const list = eventsBySession.get(sid) || [];
            list.push({
              eventType: String((ev as { event_type: string }).event_type),
              occurredAt: String((ev as { occurred_at: string }).occurred_at),
              pauseReasonId: (ev as { pause_reason_id?: string | null }).pause_reason_id ?? null,
            });
            eventsBySession.set(sid, list);
          }
        }
      }

      const byTech = new Map<string, RdaWorkPerformanceTechnicianRow>();
      const dayMaps = new Map<string, Map<string, number>>();

      for (const row of rows) {
        const events = eventsBySession.get(row.id) || [];
        const prodIntervals = productiveIntervalsFromEvents(events, {
          status: row.status,
          openUntilMs: serverNow,
        })
          .map((iv) => clipInterval(iv, fromMs, toMs))
          .filter((x): x is NonNullable<typeof x> => Boolean(x));
        const pauseIntervals = pausedIntervalsFromEvents(events, {
          status: row.status,
          openUntilMs: serverNow,
        })
          .map((iv) => {
            const clipped = clipInterval(iv, fromMs, toMs);
            return clipped ? { ...clipped, reasonId: iv.reasonId } : null;
          })
          .filter((x): x is NonNullable<typeof x> => Boolean(x));

        const productiveMs = sumIntervalsMs(prodIntervals);
        const pausedMs = sumIntervalsMs(pauseIntervals);
        // Sessão sem overlap efetivo no período → ignora totais (mas conta se começou no lookback sem trabalho)
        if (productiveMs === 0 && pausedMs === 0 && row.status === "finished") {
          // ainda pode ter começado no período sem eventos (legado): fallback nos totais da linha clipados
          const live = computeLiveTotals({
            status: row.status,
            productiveMs: asNonNegInt(row.productive_ms),
            pausedMs: asNonNegInt(row.paused_ms),
            segmentStartedAt: row.segment_started_at,
            currentPauseStartedAt: row.current_pause_started_at,
            serverNowMs: serverNow,
          });
          // Se started fora e ended fora sem eventos, skip
          const started = Date.parse(row.started_at);
          const ended = row.ended_at ? Date.parse(row.ended_at) : serverNow;
          const overlaps =
            (!fromMs || ended > fromMs) && (!toMs || started < toMs);
          if (!overlaps) continue;
          // Sem timeline: atribui tudo ao started_at (limitação legada)
          void live;
        }

        let agg = byTech.get(row.technician_user_id);
        if (!agg) {
          agg = {
            technicianUserId: row.technician_user_id,
            displayName: nameById.get(row.technician_user_id) || "Técnico",
            sessionCount: 0,
            finishedCount: 0,
            liveProductiveMs: 0,
            livePausedMs: 0,
            pauseByReason: [],
            serviceDurations: [],
            productiveByDay: [],
          };
          byTech.set(row.technician_user_id, agg);
          dayMaps.set(row.technician_user_id, new Map());
        }
        agg.sessionCount += 1;
        if (row.status === "finished") agg.finishedCount += 1;
        agg.liveProductiveMs += productiveMs;
        agg.livePausedMs += pausedMs;

        const desc = (row.budget_service_description || "").trim() || "Apontamento geral da OS";
        const lineId = row.budget_service_line_id ? String(row.budget_service_line_id) : null;
        const existing = agg.serviceDurations.find(
          (s) => (lineId && s.lineId === lineId) || (!lineId && s.description === desc && !s.lineId)
        );
        if (existing) {
          existing.productiveMs += productiveMs;
          existing.sessions += 1;
        } else {
          agg.serviceDurations.push({
            description: desc,
            lineId,
            productiveMs,
            sessions: 1,
          });
        }

        for (const iv of pauseIntervals) {
          const label = reasonLabel.get(iv.reasonId) || iv.reasonId;
          const slot = agg.pauseByReason.find((p) => p.reasonId === iv.reasonId);
          const ms = iv.endMs - iv.startMs;
          if (slot) slot.pausedMs += ms;
          else agg.pauseByReason.push({ reasonId: iv.reasonId, label, pausedMs: ms });
        }

        const dayMap = dayMaps.get(row.technician_user_id)!;
        for (const iv of prodIntervals) {
          mergeDayMaps(dayMap, splitIntervalByCalendarDay(iv, WORKSHOP_TIME_ZONE));
        }
      }

      for (const [techId, dayMap] of dayMaps) {
        const agg = byTech.get(techId);
        if (!agg) continue;
        agg.productiveByDay = [...dayMap.entries()]
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, productiveMs]) => ({ day, productiveMs }));
      }

      const technicians = [...byTech.values()].sort(
        (a, b) => b.liveProductiveMs - a.liveProductiveMs
      );
      return res.json({
        from: from || null,
        to: to || null,
        orderType: orderTypeFilter,
        timeZone: WORKSHOP_TIME_ZONE,
        aggregation: "effective_intervals",
        serverNow: new Date(serverNow).toISOString(),
        technicians,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET performance-summary:", err);
      return res.status(500).json({ error: message });
    }
  });

  /** Serviços do orçamento da OS (com line_id estável) para o seletor do cronômetro. */
  app.get("/api/rda/work-sessions/os-services", async (req, res) => {
    try {
      if (!(await canViewWorkSessions(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const serviceOrderId =
        typeof req.query.serviceOrderId === "string" ? req.query.serviceOrderId.trim() : "";
      if (!serviceOrderId) {
        return res.status(400).json({ error: "serviceOrderId é obrigatório." });
      }

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id, order_type, os_number")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("id", serviceOrderId)
        .maybeSingle();
      if (!so) return res.status(404).json({ error: "OS não encontrada." });

      const { data: budgets, error } = await supabaseAdmin
        .from("budgets")
        .select("id, services, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("service_order_id", serviceOrderId)
        .order("created_at", { ascending: true });
      if (error) return res.status(500).json({ error: error.message });

      const services: Array<{
        lineId: string;
        budgetId: string;
        description: string;
        laborHours: number | null;
        approved: boolean | null;
      }> = [];

      for (const b of budgets ?? []) {
        const budgetId = String((b as { id: string }).id);
        const { lines, changed } = ensureBudgetServiceLineIds((b as { services?: unknown }).services);
        if (changed) {
          await supabaseAdmin
            .from("budgets")
            .update({ services: lines })
            .eq("id", budgetId)
            .eq("workshop_id", WORKSHOP_ID);
        }
        for (const line of lines) {
          const desc = String(line.description || "").trim();
          if (!desc) continue;
          const lineId = readBudgetServiceLineId(line);
          if (!lineId) continue;
          const labor =
            typeof line.labor_hours === "number"
              ? line.labor_hours
              : line.labor_hours != null
                ? Number(line.labor_hours)
                : null;
          services.push({
            lineId,
            budgetId,
            description: desc,
            laborHours: Number.isFinite(labor as number) ? (labor as number) : null,
            approved: typeof line.approved === "boolean" ? line.approved : null,
          });
        }
      }

      return res.json({
        serviceOrderId,
        orderType: String((so as { order_type?: string }).order_type || "vehicle"),
        osNumber: (so as { os_number?: number | null }).os_number ?? null,
        generalOption: {
          lineId: OS_GENERAL_SERVICE_LINE_ID,
          budgetId: null,
          description: "Apontamento geral da OS (sem serviço específico)",
        },
        services,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET os-services:", err);
      return res.status(500).json({ error: message });
    }
  });

  /** Correção gerencial auditada (somente sessões finalizadas). */
  app.post("/api/rda/work-sessions/:id/correct", async (req, res) => {
    try {
      const auth = authFromReq(req);
      if (!auth) return res.status(401).json({ error: "Não autenticado." });
      const flags =
        auth.r === "user" && auth.u ? await loadTechFlags(auth.u) : null;
      if (
        !canViewWorkPerformanceSummary({
          role: auth.r,
          userId: auth.u,
          flags,
        })
      ) {
        return res.status(403).json({ error: "Apenas gestão pode corrigir apontamentos." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const sessionId = String(req.params.id || "").trim();
      const body = (req.body || {}) as Record<string, unknown>;
      const reason = typeof body.reason === "string" ? body.reason.trim() : "";
      const newProductiveMs = Number(body.productiveMs);
      const newPausedMs = Number(body.pausedMs);
      const clientMutationId = mutationIdFromBody(body);
      const actorUserId = auth.r === "admin" ? auth.u || null : auth.u || null;

      if (!actorUserId && auth.r !== "admin") {
        return res.status(400).json({ error: "Ator da correção não identificado." });
      }

      const rpc = await callSessionRpc("rda_work_session_correct", {
        p_workshop_id: WORKSHOP_ID,
        p_session_id: sessionId,
        p_actor_user_id: actorUserId,
        p_new_productive_ms: Math.floor(newProductiveMs),
        p_new_paused_ms: Math.floor(newPausedMs),
        p_reason: reason,
        p_client_mutation_id: clientMutationId,
      });
      if (rpc.missingFn) {
        return res.status(503).json({
          error: "Migration de correção RDA pendente (20261104120000).",
          code: "RDA_WORK_MIGRATION_REQUIRED",
        });
      }
      if (!rpc.data || rpc.data.ok === false) {
        const denied = rpcDeniedPayload(rpc.data || {}, rpc.error || "Falha na correção.");
        return res.status(denied.status).json(denied.body);
      }
      const session = sessionFromRpcJson(rpc.data.session);
      return res.json({
        session: session ? mapSession(session) : null,
        idempotent: rpc.data.idempotent === true,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST correct:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/work-sessions/:id", async (req, res) => {
    try {
      if (!(await canViewWorkSessions(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      const id = String(req.params.id || "").trim();
      const session = await loadSession(id);
      if (!session) return res.status(404).json({ error: "Sessão não encontrada." });
      const auth = authFromReq(req);
      const flags =
        auth?.r === "user" && auth.u ? await loadTechFlags(auth.u) : null;
      if (
        !canViewSessionRow({
          role: auth?.r,
          userId: auth?.u,
          flags,
          sessionTechnicianUserId: session.technician_user_id,
        })
      ) {
        return res.status(403).json({ error: "Sessão de outro técnico." });
      }
      const { data: events } = await supabaseAdmin!
        .from("rda_work_session_events")
        .select("*")
        .eq("session_id", id)
        .order("occurred_at", { ascending: true });
      return res.json({
        session: mapSession(session),
        events: (events ?? []).map((e) => mapEvent(e as Record<string, unknown>)),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET work-session:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/rda/work-sessions/start", async (req, res) => {
    try {
      const tech = await requireTechnicianActor(req, res);
      if (!tech) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }

      // Ignora qualquer technicianUserId enviado pelo cliente
      const body = (req.body || {}) as Record<string, unknown>;
      if (body.technicianUserId != null || body.technician_user_id != null) {
        return res.status(400).json({
          error: "Não é permitido informar a identidade do técnico no corpo da requisição.",
        });
      }

      const serviceOrderId =
        typeof body.serviceOrderId === "string" ? body.serviceOrderId.trim() : "";
      if (!serviceOrderId) {
        return res.status(400).json({ error: "serviceOrderId é obrigatório." });
      }
      const budgetId =
        typeof body.budgetId === "string" && body.budgetId.trim()
          ? body.budgetId.trim()
          : null;
      const budgetServiceDescription =
        typeof body.budgetServiceDescription === "string"
          ? body.budgetServiceDescription.trim().slice(0, 500) || null
          : null;
      const rawLineId =
        typeof body.budgetServiceLineId === "string"
          ? body.budgetServiceLineId.trim().slice(0, 128)
          : "";
      const budgetServiceLineId =
        !rawLineId || rawLineId === OS_GENERAL_SERVICE_LINE_ID ? null : rawLineId;
      const clientMutationId = mutationIdFromBody(body);

      const { data: so, error: soErr } = await supabaseAdmin
        .from("service_orders")
        .select("id, status")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (soErr || !so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const osStatus = String((so as { status?: string }).status || "");
      const timeKind = timeKindAllowedForOsStatus(osStatus);
      if (!timeKind) {
        return res.status(409).json({
          error:
            "Apontamento produtivo só é permitido em Avaliação técnica (diagnóstico) ou Em serviço (execução).",
          code: "RDA_STAGE_NOT_ALLOWED",
          osStatus,
        });
      }

      const budgetCheck = await validateBudgetForOs(serviceOrderId, budgetId);
      if (budgetCheck.ok === false) {
        return res.status(400).json({ error: budgetCheck.error });
      }

      if (clientMutationId) {
        const existing = await findSessionByMutation(clientMutationId);
        if (existing) {
          if (existing.technician_user_id !== tech.userId) {
            return res.status(403).json({ error: "Mutação pertence a outro técnico." });
          }
          await ensureStartEvent(existing, tech.userId);
          return res.json({ session: mapSession(existing), idempotent: true });
        }
      }

      let rpc = await callSessionRpc("rda_work_session_start", {
        p_workshop_id: WORKSHOP_ID,
        p_service_order_id: serviceOrderId,
        p_technician_user_id: tech.userId,
        p_budget_id: budgetId,
        p_budget_service_description: budgetServiceDescription,
        p_client_mutation_id: clientMutationId,
        p_budget_service_line_id: budgetServiceLineId,
        p_time_kind: timeKind,
      });
      // Pré-migration stage rules: tenta assinatura antiga (API já bloqueou etapa).
      if (rpc.missingFn) {
        rpc = await callSessionRpc("rda_work_session_start", {
          p_workshop_id: WORKSHOP_ID,
          p_service_order_id: serviceOrderId,
          p_technician_user_id: tech.userId,
          p_budget_id: budgetId,
          p_budget_service_description: budgetServiceDescription,
          p_client_mutation_id: clientMutationId,
          p_budget_service_line_id: budgetServiceLineId,
        });
      }

      if (rpc.missingFn) {
        return res.status(503).json({
          error:
            "Funções atômicas de sessão RDA não instaladas. Aplique 20261101230000_rda_work_sessions_integrity.sql (e 20261104120000 / 20261105010000) na homologação.",
          code: "RDA_WORK_MIGRATION_REQUIRED",
        });
      }
      if (!rpc.data) {
        return res.status(500).json({ error: rpc.error || "Falha ao iniciar sessão." });
      }
      if (rpc.data.ok === false) {
        if (
          rpc.data.code === "RDA_ACTIVE_SESSION_EXISTS" ||
          rpc.data.code === "RDA_ACTIVE_OTHER_SERVICE"
        ) {
          const activeRow = sessionFromRpcJson(rpc.data.activeSession);
          return res.status(409).json({
            error:
              typeof rpc.data.error === "string"
                ? rpc.data.error
                : "Já existe uma sessão ativa.",
            code: String(rpc.data.code),
            activeSession: activeRow ? mapSession(activeRow) : undefined,
          });
        }
        if (rpc.data.code === "RDA_STAGE_NOT_ALLOWED") {
          return res.status(409).json({
            error:
              typeof rpc.data.error === "string"
                ? rpc.data.error
                : "Etapa da OS não permite este apontamento.",
            code: "RDA_STAGE_NOT_ALLOWED",
            osStatus: rpc.data.osStatus,
            timeKind: rpc.data.timeKind ?? timeKind,
          });
        }
        const denied = rpcDeniedPayload(rpc.data, "Falha ao iniciar sessão.");
        return res.status(denied.status).json(denied.body);
      }
      const session = sessionFromRpcJson(rpc.data.session);
      if (!assertRpcSessionOwner(session, tech.userId)) {
        return res.status(403).json({
          error: "Sessão retornada não pertence ao técnico autenticado.",
          code: "RDA_MUTATION_OWNER_MISMATCH",
        });
      }
      if (rpc.data.idempotent === true || rpc.data.alreadyActive === true) {
        return res.json({
          session: mapSession(session),
          idempotent: rpc.data.idempotent === true,
          alreadyActive: rpc.data.alreadyActive === true,
        });
      }
      return res.status(201).json({ session: mapSession(session) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST start:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/rda/work-sessions/:id/pause", async (req, res) => {
    try {
      const tech = await requireTechnicianActor(req, res);
      if (!tech) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const body = (req.body || {}) as Record<string, unknown>;
      if (body.technicianUserId != null) {
        return res.status(400).json({ error: "Identidade do técnico não pode ser informada." });
      }
      const reasonId =
        typeof body.reasonId === "string" ? body.reasonId.trim() : "";
      const note =
        typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
      const clientMutationId = mutationIdFromBody(body);

      if (!reasonId) {
        return res.status(400).json({ error: "Informe o motivo da pausa (reasonId)." });
      }

      if (clientMutationId) {
        const ev = await findEventByMutation(clientMutationId);
        if (ev) {
          const session = await loadSession(ev.session_id);
          if (session) {
            if (session.technician_user_id !== tech.userId) {
              return res.status(403).json({ error: "Sessão de outro técnico." });
            }
            return res.json({ session: mapSession(session), idempotent: true });
          }
        }
      }

      const rpc = await callSessionRpc("rda_work_session_pause", {
        p_workshop_id: WORKSHOP_ID,
        p_session_id: id,
        p_technician_user_id: tech.userId,
        p_reason_id: reasonId,
        p_note: note || null,
        p_client_mutation_id: clientMutationId,
      });

      if (rpc.missingFn) {
        return res.status(503).json({
          error:
            "Funções atômicas de sessão RDA não instaladas. Aplique as migrations de integridade na homologação.",
          code: "RDA_WORK_MIGRATION_REQUIRED",
        });
      }
      if (!rpc.data) {
        return res.status(500).json({ error: rpc.error || "Falha ao pausar." });
      }
      if (rpc.data.ok !== true) {
        const denied = rpcDeniedPayload(rpc.data, "Falha ao pausar.");
        return res.status(denied.status).json(denied.body);
      }
      const session = sessionFromRpcJson(rpc.data.session);
      if (!assertRpcSessionOwner(session, tech.userId)) {
        return res.status(403).json({
          error: "Sessão retornada não pertence ao técnico autenticado.",
          code: "RDA_MUTATION_OWNER_MISMATCH",
        });
      }
      return res.json({
        session: mapSession(session),
        idempotent: rpc.data.idempotent === true,
        alreadyPaused: rpc.data.alreadyPaused === true,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST pause:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/rda/work-sessions/:id/resume", async (req, res) => {
    try {
      const tech = await requireTechnicianActor(req, res);
      if (!tech) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const body = (req.body || {}) as Record<string, unknown>;
      if (body.technicianUserId != null) {
        return res.status(400).json({ error: "Identidade do técnico não pode ser informada." });
      }
      const clientMutationId = mutationIdFromBody(body);

      if (clientMutationId) {
        const ev = await findEventByMutation(clientMutationId);
        if (ev) {
          const session = await loadSession(ev.session_id);
          if (session) {
            if (session.technician_user_id !== tech.userId) {
              return res.status(403).json({ error: "Sessão de outro técnico." });
            }
            return res.json({ session: mapSession(session), idempotent: true });
          }
        }
      }

      const existingSession = await loadSession(id);
      if (!existingSession) {
        return res.status(404).json({ error: "Sessão não encontrada." });
      }
      if (existingSession.technician_user_id !== tech.userId) {
        return res.status(403).json({ error: "Sessão de outro técnico." });
      }
      const kind = resolveTimeKind(existingSession.time_kind);
      const { data: soRow } = await supabaseAdmin
        .from("service_orders")
        .select("status")
        .eq("id", existingSession.service_order_id)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      const osStatus = String((soRow as { status?: string } | null)?.status || "");
      if (!canStartOrResumeTimeKind(kind, osStatus)) {
        return res.status(409).json({
          error: `Retome o tempo de ${timeKindLabel(kind).toLowerCase()} apenas na etapa correta da OS.`,
          code: "RDA_STAGE_NOT_ALLOWED",
          osStatus,
          timeKind: kind,
        });
      }

      const rpc = await callSessionRpc("rda_work_session_resume", {
        p_workshop_id: WORKSHOP_ID,
        p_session_id: id,
        p_technician_user_id: tech.userId,
        p_client_mutation_id: clientMutationId,
      });

      if (rpc.missingFn) {
        return res.status(503).json({
          error:
            "Funções atômicas de sessão RDA não instaladas. Aplique as migrations de integridade na homologação.",
          code: "RDA_WORK_MIGRATION_REQUIRED",
        });
      }
      if (!rpc.data) {
        return res.status(500).json({ error: rpc.error || "Falha ao retomar." });
      }
      if (rpc.data.ok !== true) {
        if (rpc.data.code === "RDA_STAGE_NOT_ALLOWED") {
          return res.status(409).json({
            error:
              typeof rpc.data.error === "string"
                ? rpc.data.error
                : "Etapa da OS não permite retomar.",
            code: "RDA_STAGE_NOT_ALLOWED",
            osStatus: rpc.data.osStatus,
            timeKind: rpc.data.timeKind ?? kind,
          });
        }
        const denied = rpcDeniedPayload(rpc.data, "Falha ao retomar.");
        return res.status(denied.status).json(denied.body);
      }
      const session = sessionFromRpcJson(rpc.data.session);
      if (!assertRpcSessionOwner(session, tech.userId)) {
        return res.status(403).json({
          error: "Sessão retornada não pertence ao técnico autenticado.",
          code: "RDA_MUTATION_OWNER_MISMATCH",
        });
      }
      return res.json({
        session: mapSession(session),
        idempotent: rpc.data.idempotent === true,
        alreadyRunning: rpc.data.alreadyRunning === true,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST resume:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/rda/work-sessions/:id/finish", async (req, res) => {
    try {
      const tech = await requireTechnicianActor(req, res);
      if (!tech) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const body = (req.body || {}) as Record<string, unknown>;
      if (body.technicianUserId != null) {
        return res.status(400).json({ error: "Identidade do técnico não pode ser informada." });
      }
      const clientMutationId = mutationIdFromBody(body);

      if (clientMutationId) {
        const ev = await findEventByMutation(clientMutationId);
        if (ev) {
          const session = await loadSession(ev.session_id);
          if (session) {
            if (session.technician_user_id !== tech.userId) {
              return res.status(403).json({ error: "Sessão de outro técnico." });
            }
            return res.json({ session: mapSession(session), idempotent: true });
          }
        }
      }

      const rpc = await callSessionRpc("rda_work_session_finish", {
        p_workshop_id: WORKSHOP_ID,
        p_session_id: id,
        p_technician_user_id: tech.userId,
        p_client_mutation_id: clientMutationId,
      });

      if (rpc.missingFn) {
        return res.status(503).json({
          error:
            "Funções atômicas de sessão RDA não instaladas. Aplique as migrations de integridade na homologação.",
          code: "RDA_WORK_MIGRATION_REQUIRED",
        });
      }
      if (!rpc.data) {
        return res.status(500).json({ error: rpc.error || "Falha ao finalizar." });
      }
      if (rpc.data.ok !== true) {
        const denied = rpcDeniedPayload(rpc.data, "Falha ao finalizar.");
        return res.status(denied.status).json(denied.body);
      }
      const session = sessionFromRpcJson(rpc.data.session);
      if (!assertRpcSessionOwner(session, tech.userId)) {
        return res.status(403).json({
          error: "Sessão retornada não pertence ao técnico autenticado.",
          code: "RDA_MUTATION_OWNER_MISMATCH",
        });
      }
      // Repair/garantia da solicitação de avaliação (idempotente; RPC finish já tenta criar).
      await ensureEvalRequestForFinishedSession({
        supabaseAdmin,
        workshopId: WORKSHOP_ID,
        sessionId: session.id,
        clientMutationId,
      });
      return res.json({
        session: mapSession(session),
        idempotent: rpc.data.idempotent === true,
        alreadyFinished: rpc.data.alreadyFinished === true,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST finish:", err);
      return res.status(500).json({ error: message });
    }
  });
}
