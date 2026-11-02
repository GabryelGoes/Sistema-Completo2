import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureEvalRequestForFinishedSession } from "../evaluations/registerRdaEvaluationRoutes.js";
import {
  canAccessWorkSessionApis,
  canViewSessionRow,
  canViewWorkPerformanceSummary,
  resolveWorkSessionListScope,
} from "./access.js";
import { computeLiveTotals, asNonNegInt } from "./timing.js";
import type {
  RdaWorkPauseReason,
  RdaWorkPerformanceTechnicianRow,
  RdaWorkSessionDto,
  RdaWorkSessionEventDto,
  RdaWorkSessionStatus,
} from "./types.js";

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
};

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
  return {
    id: row.id,
    serviceOrderId: row.service_order_id,
    technicianUserId: row.technician_user_id,
    budgetId: row.budget_id,
    budgetServiceDescription: row.budget_service_description,
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
      | "rda_work_session_finish",
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

      let query = supabaseAdmin
        .from("rda_work_sessions")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("started_at", { ascending: false })
        .limit(1000);
      if (from) query = query.gte("started_at", from);
      if (to) query = query.lte("started_at", to);

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

      const rows = (data ?? []) as SessionRow[];
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
      const pauseMsBySessionReason = new Map<string, number>();
      if (sessionIds.length) {
        const { data: pauseEvents } = await supabaseAdmin
          .from("rda_work_session_events")
          .select("session_id, event_type, occurred_at, pause_reason_id")
          .eq("workshop_id", WORKSHOP_ID)
          .in("session_id", sessionIds)
          .in("event_type", ["pause", "resume", "finish"])
          .order("occurred_at", { ascending: true });

        const openPause = new Map<string, { at: number; reasonId: string }>();
        for (const ev of pauseEvents ?? []) {
          const sid = String((ev as { session_id: string }).session_id);
          const type = String((ev as { event_type: string }).event_type);
          const at = Date.parse(String((ev as { occurred_at: string }).occurred_at));
          if (type === "pause") {
            const reasonId = String((ev as { pause_reason_id?: string }).pause_reason_id || "other");
            openPause.set(sid, { at, reasonId });
          } else if (type === "resume" || type === "finish") {
            const open = openPause.get(sid);
            if (open && Number.isFinite(at) && at > open.at) {
              const key = `${sid}::${open.reasonId}`;
              pauseMsBySessionReason.set(
                key,
                (pauseMsBySessionReason.get(key) || 0) + (at - open.at)
              );
              openPause.delete(sid);
            }
          }
        }
        // Pausas ainda abertas: conta até agora
        const now = Date.now();
        for (const [sid, open] of openPause) {
          const key = `${sid}::${open.reasonId}`;
          pauseMsBySessionReason.set(
            key,
            (pauseMsBySessionReason.get(key) || 0) + Math.max(0, now - open.at)
          );
        }
      }

      const byTech = new Map<string, RdaWorkPerformanceTechnicianRow>();
      const serverNow = Date.now();
      for (const row of rows) {
        const live = computeLiveTotals({
          status: row.status,
          productiveMs: asNonNegInt(row.productive_ms),
          pausedMs: asNonNegInt(row.paused_ms),
          segmentStartedAt: row.segment_started_at,
          currentPauseStartedAt: row.current_pause_started_at,
          serverNowMs: serverNow,
        });
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
          };
          byTech.set(row.technician_user_id, agg);
        }
        agg.sessionCount += 1;
        if (row.status === "finished") agg.finishedCount += 1;
        agg.liveProductiveMs += live.liveProductiveMs;
        agg.livePausedMs += live.livePausedMs;

        const desc = (row.budget_service_description || "").trim() || "Serviço geral";
        const existing = agg.serviceDurations.find((s) => s.description === desc);
        if (existing) {
          existing.productiveMs += live.liveProductiveMs;
          existing.sessions += 1;
        } else {
          agg.serviceDurations.push({
            description: desc,
            productiveMs: live.liveProductiveMs,
            sessions: 1,
          });
        }
      }

      // Agrega pausas por motivo por técnico
      for (const row of rows) {
        const agg = byTech.get(row.technician_user_id);
        if (!agg) continue;
        for (const [key, ms] of pauseMsBySessionReason) {
          if (!key.startsWith(`${row.id}::`)) continue;
          const reasonId = key.slice(row.id.length + 2);
          const label = reasonLabel.get(reasonId) || reasonId;
          const slot = agg.pauseByReason.find((p) => p.reasonId === reasonId);
          if (slot) slot.pausedMs += ms;
          else agg.pauseByReason.push({ reasonId, label, pausedMs: ms });
        }
      }

      const technicians = [...byTech.values()].sort(
        (a, b) => b.liveProductiveMs - a.liveProductiveMs
      );
      return res.json({
        from: from || null,
        to: to || null,
        serverNow: new Date(serverNow).toISOString(),
        technicians,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET performance-summary:", err);
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
      const clientMutationId = mutationIdFromBody(body);

      const { data: so, error: soErr } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (soErr || !so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
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

      const rpc = await callSessionRpc("rda_work_session_start", {
        p_workshop_id: WORKSHOP_ID,
        p_service_order_id: serviceOrderId,
        p_technician_user_id: tech.userId,
        p_budget_id: budgetId,
        p_budget_service_description: budgetServiceDescription,
        p_client_mutation_id: clientMutationId,
      });

      if (rpc.missingFn) {
        return res.status(503).json({
          error:
            "Funções atômicas de sessão RDA não instaladas. Aplique 20261101230000_rda_work_sessions_integrity.sql (e 20261101240000) na homologação.",
          code: "RDA_WORK_MIGRATION_REQUIRED",
        });
      }
      if (!rpc.data) {
        return res.status(500).json({ error: rpc.error || "Falha ao iniciar sessão." });
      }
      if (rpc.data.ok === false) {
        if (rpc.data.code === "RDA_ACTIVE_SESSION_EXISTS") {
          const activeRow = sessionFromRpcJson(rpc.data.activeSession);
          return res.status(409).json({
            error:
              typeof rpc.data.error === "string"
                ? rpc.data.error
                : "Já existe uma sessão ativa em outra OS.",
            code: "RDA_ACTIVE_SESSION_EXISTS",
            activeSession: activeRow ? mapSession(activeRow) : undefined,
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
