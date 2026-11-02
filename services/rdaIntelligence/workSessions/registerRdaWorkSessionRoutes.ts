import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
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
    if (!flags) return false;
    if (flags.isTechnician) return true;
    if (flags.permissions.full_access) return true;
    if (flags.permissions.access_radar_qualidade) return true;
    if (flags.permissions.access_patio) return true;
    if (flags.permissions.access_laboratorio) return true;
    return false;
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
      // Técnico sem radar/full_access: só vê as próprias sessões.
      if (auth?.r === "user" && auth.u) {
        const flags = await loadTechFlags(auth.u);
        const elevated =
          !!flags?.permissions.full_access ||
          !!flags?.permissions.access_radar_qualidade;
        if (!elevated && flags?.isTechnician) {
          if (technicianUserId && technicianUserId !== auth.u) {
            return res.status(403).json({ error: "Não é permitido consultar outro técnico." });
          }
          query = query.eq("technician_user_id", auth.u);
        }
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
      let allowed = auth.r === "admin";
      if (!allowed && auth.r === "user" && auth.u) {
        const flags = await loadTechFlags(auth.u);
        allowed =
          !!flags?.permissions.full_access ||
          !!flags?.permissions.access_radar_qualidade;
      }
      if (!allowed) {
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
      if (auth?.r === "user" && auth.u) {
        const flags = await loadTechFlags(auth.u);
        const elevated =
          !!flags?.permissions.full_access ||
          !!flags?.permissions.access_radar_qualidade;
        if (!elevated && session.technician_user_id !== auth.u) {
          return res.status(403).json({ error: "Sessão de outro técnico." });
        }
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

      if (clientMutationId) {
        const existing = await findSessionByMutation(clientMutationId);
        if (existing) {
          return res.json({ session: mapSession(existing), idempotent: true });
        }
      }

      const { data: so, error: soErr } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (soErr || !so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const { data: active } = await supabaseAdmin
        .from("rda_work_sessions")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("technician_user_id", tech.userId)
        .in("status", ["running", "paused"])
        .maybeSingle();

      if (active) {
        const activeRow = active as SessionRow;
        if (activeRow.service_order_id === serviceOrderId) {
          return res.json({ session: mapSession(activeRow), alreadyActive: true });
        }
        return res.status(409).json({
          error:
            "Já existe uma sessão ativa em outra OS. Finalize ou pause/finalize antes de iniciar outra.",
          code: "RDA_ACTIVE_SESSION_EXISTS",
          activeSession: mapSession(activeRow),
        });
      }

      const nowIso = new Date().toISOString();
      const insertPayload = {
        workshop_id: WORKSHOP_ID,
        service_order_id: serviceOrderId,
        technician_user_id: tech.userId,
        budget_id: budgetId,
        budget_service_description: budgetServiceDescription,
        status: "running",
        started_at: nowIso,
        segment_started_at: nowIso,
        productive_ms: 0,
        paused_ms: 0,
        client_mutation_id: clientMutationId,
        updated_at: nowIso,
      };

      const { data: created, error } = await supabaseAdmin
        .from("rda_work_sessions")
        .insert(insertPayload)
        .select("*")
        .single();

      if (error) {
        if (/uq_rda_work_sessions_one_active_per_tech|duplicate key/i.test(error.message)) {
          const { data: again } = await supabaseAdmin
            .from("rda_work_sessions")
            .select("*")
            .eq("workshop_id", WORKSHOP_ID)
            .eq("technician_user_id", tech.userId)
            .in("status", ["running", "paused"])
            .maybeSingle();
          if (again) {
            return res.status(409).json({
              error: "Sessão ativa conflitante.",
              code: "RDA_ACTIVE_SESSION_EXISTS",
              activeSession: mapSession(again as SessionRow),
            });
          }
        }
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error: "Migration de sessões RDA pendente.",
            code: "RDA_WORK_MIGRATION_REQUIRED",
          });
        }
        return res.status(500).json({ error: error.message });
      }

      const session = created as SessionRow;
      try {
        await insertEvent({
          sessionId: session.id,
          eventType: "start",
          actorUserId: tech.userId,
          clientMutationId: clientMutationId
            ? `${clientMutationId}:event`
            : null,
          occurredAt: nowIso,
        });
      } catch (evErr) {
        console.warn("[API] evento start:", evErr);
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

      if (clientMutationId) {
        const ev = await findEventByMutation(clientMutationId);
        if (ev) {
          const session = await loadSession(ev.session_id);
          if (session) return res.json({ session: mapSession(session), idempotent: true });
        }
      }

      const session = await loadSession(id);
      if (!session) return res.status(404).json({ error: "Sessão não encontrada." });
      if (session.technician_user_id !== tech.userId) {
        return res.status(403).json({ error: "Sessão de outro técnico." });
      }
      if (session.status === "paused") {
        return res.json({ session: mapSession(session), alreadyPaused: true });
      }
      if (session.status !== "running") {
        return res.status(409).json({ error: "Só é possível pausar sessão em execução." });
      }
      if (!reasonId) {
        return res.status(400).json({ error: "Informe o motivo da pausa (reasonId)." });
      }

      const { data: reason } = await supabaseAdmin!
        .from("rda_work_pause_reasons")
        .select("id, requires_note, active")
        .eq("id", reasonId)
        .maybeSingle();
      if (!reason || reason.active === false) {
        return res.status(400).json({ error: "Motivo de pausa inválido." });
      }
      if (reason.requires_note === true && !note) {
        return res.status(400).json({ error: "Este motivo exige observação." });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const nowMs = now.getTime();
      let productive = asNonNegInt(session.productive_ms);
      if (session.segment_started_at) {
        const seg = Date.parse(session.segment_started_at);
        if (Number.isFinite(seg) && nowMs > seg) productive += nowMs - seg;
      }

      const { data: updated, error } = await supabaseAdmin!
        .from("rda_work_sessions")
        .update({
          status: "paused",
          productive_ms: productive,
          segment_started_at: null,
          current_pause_reason_id: reasonId,
          current_pause_note: note || null,
          current_pause_started_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .eq("status", "running")
        .eq("technician_user_id", tech.userId)
        .select("*")
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });
      if (!updated) {
        const again = await loadSession(id);
        if (again?.status === "paused") {
          return res.json({ session: mapSession(again), alreadyPaused: true });
        }
        return res.status(409).json({ error: "Não foi possível pausar (estado alterado)." });
      }

      try {
        await insertEvent({
          sessionId: id,
          eventType: "pause",
          actorUserId: tech.userId,
          pauseReasonId: reasonId,
          pauseNote: note || null,
          clientMutationId,
          occurredAt: nowIso,
        });
      } catch (evErr: unknown) {
        const msg = evErr instanceof Error ? evErr.message : "";
        if (!/duplicate key/i.test(msg)) console.warn("[API] evento pause:", evErr);
      }

      return res.json({ session: mapSession(updated as SessionRow) });
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
          if (session) return res.json({ session: mapSession(session), idempotent: true });
        }
      }

      const session = await loadSession(id);
      if (!session) return res.status(404).json({ error: "Sessão não encontrada." });
      if (session.technician_user_id !== tech.userId) {
        return res.status(403).json({ error: "Sessão de outro técnico." });
      }
      if (session.status === "running") {
        return res.json({ session: mapSession(session), alreadyRunning: true });
      }
      if (session.status !== "paused") {
        return res.status(409).json({ error: "Só é possível retomar sessão pausada." });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const nowMs = now.getTime();
      let paused = asNonNegInt(session.paused_ms);
      if (session.current_pause_started_at) {
        const p = Date.parse(session.current_pause_started_at);
        if (Number.isFinite(p) && nowMs > p) paused += nowMs - p;
      }

      const { data: updated, error } = await supabaseAdmin!
        .from("rda_work_sessions")
        .update({
          status: "running",
          paused_ms: paused,
          segment_started_at: nowIso,
          current_pause_reason_id: null,
          current_pause_note: null,
          current_pause_started_at: null,
          updated_at: nowIso,
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .eq("status", "paused")
        .eq("technician_user_id", tech.userId)
        .select("*")
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });
      if (!updated) {
        const again = await loadSession(id);
        if (again?.status === "running") {
          return res.json({ session: mapSession(again), alreadyRunning: true });
        }
        return res.status(409).json({ error: "Não foi possível retomar (estado alterado)." });
      }

      try {
        await insertEvent({
          sessionId: id,
          eventType: "resume",
          actorUserId: tech.userId,
          clientMutationId,
          occurredAt: nowIso,
        });
      } catch (evErr: unknown) {
        const msg = evErr instanceof Error ? evErr.message : "";
        if (!/duplicate key/i.test(msg)) console.warn("[API] evento resume:", evErr);
      }

      return res.json({ session: mapSession(updated as SessionRow) });
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
          if (session) return res.json({ session: mapSession(session), idempotent: true });
        }
      }

      const session = await loadSession(id);
      if (!session) return res.status(404).json({ error: "Sessão não encontrada." });
      if (session.technician_user_id !== tech.userId) {
        return res.status(403).json({ error: "Sessão de outro técnico." });
      }
      if (session.status === "finished") {
        return res.json({ session: mapSession(session), alreadyFinished: true });
      }
      if (session.status !== "running" && session.status !== "paused") {
        return res.status(409).json({ error: "Sessão não pode ser finalizada." });
      }

      const now = new Date();
      const nowIso = now.toISOString();
      const nowMs = now.getTime();
      let productive = asNonNegInt(session.productive_ms);
      let paused = asNonNegInt(session.paused_ms);
      if (session.status === "running" && session.segment_started_at) {
        const seg = Date.parse(session.segment_started_at);
        if (Number.isFinite(seg) && nowMs > seg) productive += nowMs - seg;
      }
      if (session.status === "paused" && session.current_pause_started_at) {
        const p = Date.parse(session.current_pause_started_at);
        if (Number.isFinite(p) && nowMs > p) paused += nowMs - p;
      }

      const { data: updated, error } = await supabaseAdmin!
        .from("rda_work_sessions")
        .update({
          status: "finished",
          productive_ms: productive,
          paused_ms: paused,
          ended_at: nowIso,
          segment_started_at: null,
          current_pause_reason_id: null,
          current_pause_note: null,
          current_pause_started_at: null,
          updated_at: nowIso,
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .eq("technician_user_id", tech.userId)
        .in("status", ["running", "paused"])
        .select("*")
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });
      if (!updated) {
        const again = await loadSession(id);
        if (again?.status === "finished") {
          return res.json({ session: mapSession(again), alreadyFinished: true });
        }
        return res.status(409).json({ error: "Não foi possível finalizar (estado alterado)." });
      }

      try {
        await insertEvent({
          sessionId: id,
          eventType: "finish",
          actorUserId: tech.userId,
          clientMutationId,
          occurredAt: nowIso,
        });
      } catch (evErr: unknown) {
        const msg = evErr instanceof Error ? evErr.message : "";
        if (!/duplicate key/i.test(msg)) console.warn("[API] evento finish:", evErr);
      }

      return res.json({ session: mapSession(updated as SessionRow) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST finish:", err);
      return res.status(500).json({ error: message });
    }
  });
}
