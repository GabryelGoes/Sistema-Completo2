import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  averageScores,
  canManageEmployeeEvaluations,
  clampScore,
} from "./access.js";
import type {
  RdaEvalRequestDto,
  RdaEvalRequestStatus,
  RdaEvalSummaryDto,
  RdaEvaluationDto,
} from "./types.js";

type SessionPayload = {
  r: "admin" | "user";
  u?: string;
  n?: string;
};

type RouteDeps = {
  WORKSHOP_ID: string | undefined;
  supabaseAdmin: SupabaseClient | null;
};

type RequestRow = {
  id: string;
  workshop_id: string;
  work_session_id: string;
  service_order_id: string;
  technician_user_id: string;
  budget_id: string | null;
  service_description: string | null;
  productive_ms: number;
  paused_ms: number;
  session_started_at: string;
  session_ended_at: string;
  status: RdaEvalRequestStatus;
  deferred_until: string | null;
  deferred_note: string | null;
  deferred_at: string | null;
  dismissed_reason: string | null;
  dismissed_at: string | null;
  evaluated_at: string | null;
  created_at: string;
};

type EvaluationRow = {
  id: string;
  request_id: string;
  work_session_id: string;
  technician_user_id: string;
  evaluator_user_id: string | null;
  evaluator_is_admin: boolean;
  evaluator_display_name: string;
  score_technical_quality: number;
  score_organization: number;
  score_procedures: number;
  score_autonomy: number;
  score_communication: number;
  positives: string;
  improvements: string;
  general_notes: string;
  created_at: string;
  updated_at: string;
};

function authFromReq(req: Request): SessionPayload | null {
  return (req as unknown as { auth?: SessionPayload }).auth ?? null;
}

function mutationIdFromBody(body: unknown): string | null {
  const raw = (body as { clientMutationId?: unknown } | null)?.clientMutationId;
  if (typeof raw !== "string") return null;
  const t = raw.trim().slice(0, 128);
  return t || null;
}

function mapEvaluation(row: EvaluationRow): RdaEvaluationDto {
  return {
    id: row.id,
    requestId: row.request_id,
    workSessionId: row.work_session_id,
    technicianUserId: row.technician_user_id,
    evaluatorUserId: row.evaluator_user_id,
    evaluatorIsAdmin: row.evaluator_is_admin === true,
    evaluatorDisplayName: row.evaluator_display_name || "",
    scores: {
      technicalQuality: row.score_technical_quality,
      organization: row.score_organization,
      procedures: row.score_procedures,
      autonomy: row.score_autonomy,
      communication: row.score_communication,
    },
    positives: row.positives || "",
    improvements: row.improvements || "",
    generalNotes: row.general_notes || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRequest(
  row: RequestRow,
  evaluation: EvaluationRow | null,
  techName?: string
): RdaEvalRequestDto {
  return {
    id: row.id,
    workSessionId: row.work_session_id,
    serviceOrderId: row.service_order_id,
    technicianUserId: row.technician_user_id,
    technicianDisplayName: techName,
    budgetId: row.budget_id,
    serviceDescription: row.service_description,
    productiveMs: Number(row.productive_ms) || 0,
    pausedMs: Number(row.paused_ms) || 0,
    sessionStartedAt: row.session_started_at,
    sessionEndedAt: row.session_ended_at,
    status: row.status,
    deferredUntil: row.deferred_until,
    deferredNote: row.deferred_note,
    deferredAt: row.deferred_at,
    dismissedReason: row.dismissed_reason,
    dismissedAt: row.dismissed_at,
    evaluatedAt: row.evaluated_at,
    createdAt: row.created_at,
    evaluation: evaluation ? mapEvaluation(evaluation) : null,
  };
}

function migrationRequired(res: Response) {
  return res.status(503).json({
    error:
      "Tabelas de avaliações RDA ainda não aplicadas. Rode as migrations 20261101250000_rda_managerial_evaluations.sql no ambiente de homologação.",
    code: "RDA_EVAL_MIGRATION_REQUIRED",
  });
}

function isMissingRelation(msg: string): boolean {
  return /does not exist|relation|Could not find the table/i.test(msg);
}

export function registerRdaEvaluationRoutes(app: Express, deps: RouteDeps): void {
  const { WORKSHOP_ID, supabaseAdmin } = deps;

  async function requireManager(req: Request, res: Response): Promise<{
    role: "admin" | "user";
    userId: string | null;
    displayName: string;
    isAdmin: boolean;
  } | null> {
    const auth = authFromReq(req);
    if (!auth) {
      res.status(401).json({ error: "Não autenticado." });
      return null;
    }
    if (auth.r === "admin") {
      return {
        role: "admin",
        userId: null,
        displayName: auth.n?.trim() || "Administrador",
        isAdmin: true,
      };
    }
    if (auth.r !== "user" || !auth.u || !supabaseAdmin || !WORKSHOP_ID) {
      res.status(403).json({ error: "Acesso negado às avaliações gerenciais." });
      return null;
    }
    const { data } = await supabaseAdmin
      .from("workshop_system_users")
      .select("permissions, display_name, username")
      .eq("id", auth.u)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    if (!data) {
      res.status(403).json({ error: "Usuário não encontrado nesta oficina." });
      return null;
    }
    const permissions = (data.permissions as Record<string, boolean> | null) || {};
    if (
      !canManageEmployeeEvaluations({
        role: "user",
        userId: auth.u,
        flags: { permissions },
      })
    ) {
      res.status(403).json({ error: "Acesso negado às avaliações gerenciais." });
      return null;
    }
    const displayName =
      String(data.display_name || "").trim() ||
      String(data.username || "").trim() ||
      auth.n?.trim() ||
      "Gerente";
    return {
      role: "user",
      userId: auth.u,
      displayName,
      isAdmin: false,
    };
  }

  async function loadTechNames(ids: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (!supabaseAdmin || !WORKSHOP_ID || ids.length === 0) return map;
    const { data } = await supabaseAdmin
      .from("workshop_system_users")
      .select("id, display_name, username")
      .eq("workshop_id", WORKSHOP_ID)
      .in("id", ids);
    for (const u of data ?? []) {
      const name =
        String((u as { display_name?: string }).display_name || "").trim() ||
        String((u as { username?: string }).username || "").trim() ||
        String((u as { id: string }).id);
      map.set(String((u as { id: string }).id), name);
    }
    return map;
  }

  async function loadEvaluationsByRequest(
    requestIds: string[]
  ): Promise<Map<string, EvaluationRow>> {
    const map = new Map<string, EvaluationRow>();
    if (!supabaseAdmin || !WORKSHOP_ID || requestIds.length === 0) return map;
    const { data } = await supabaseAdmin
      .from("rda_evaluations")
      .select("*")
      .eq("workshop_id", WORKSHOP_ID)
      .in("request_id", requestIds);
    for (const row of (data ?? []) as EvaluationRow[]) {
      map.set(row.request_id, row);
    }
    return map;
  }

  async function insertAudit(params: {
    requestId: string | null;
    evaluationId?: string | null;
    eventType: string;
    actorUserId: string | null;
    actorIsAdmin: boolean;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    if (!supabaseAdmin || !WORKSHOP_ID) return;
    await supabaseAdmin.from("rda_eval_audit_events").insert({
      workshop_id: WORKSHOP_ID,
      request_id: params.requestId,
      evaluation_id: params.evaluationId ?? null,
      event_type: params.eventType,
      actor_user_id: params.actorUserId,
      actor_is_admin: params.actorIsAdmin,
      payload: params.payload ?? {},
    });
  }

  app.get("/api/rda/evaluations/summary", async (req, res) => {
    try {
      const mgr = await requireManager(req, res);
      if (!mgr) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";

      let q = supabaseAdmin
        .from("rda_eval_requests")
        .select("status")
        .eq("workshop_id", WORKSHOP_ID);
      if (from) q = q.gte("session_ended_at", from);
      if (to) q = q.lte("session_ended_at", to);

      const { data, error } = await q.limit(5000);
      if (error) {
        if (isMissingRelation(error.message)) return migrationRequired(res);
        return res.status(500).json({ error: error.message });
      }

      const counts = { pending: 0, deferred: 0, evaluated: 0, dismissed: 0 };
      for (const row of data ?? []) {
        const s = String((row as { status: string }).status);
        if (s in counts) counts[s as keyof typeof counts] += 1;
      }

      let evalQ = supabaseAdmin
        .from("rda_evaluations")
        .select(
          "score_technical_quality, score_organization, score_procedures, score_autonomy, score_communication"
        )
        .eq("workshop_id", WORKSHOP_ID);
      if (from) evalQ = evalQ.gte("created_at", from);
      if (to) evalQ = evalQ.lte("created_at", to);
      const { data: evals } = await evalQ.limit(5000);

      const summary: RdaEvalSummaryDto = {
        ...counts,
        averageScores: averageScores(
          (evals ?? []) as {
            score_technical_quality: number;
            score_organization: number;
            score_procedures: number;
            score_autonomy: number;
            score_communication: number;
          }[]
        ),
        evaluatedCount: (evals ?? []).length,
      };
      return res.json(summary);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET evaluations/summary:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/evaluations/requests", async (req, res) => {
    try {
      const mgr = await requireManager(req, res);
      if (!mgr) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }

      const status =
        typeof req.query.status === "string" ? req.query.status.trim() : "";
      const technicianUserId =
        typeof req.query.technicianUserId === "string"
          ? req.query.technicianUserId.trim()
          : "";
      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";

      let q = supabaseAdmin
        .from("rda_eval_requests")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("session_ended_at", { ascending: false })
        .limit(300);

      if (status) q = q.eq("status", status);
      if (technicianUserId) q = q.eq("technician_user_id", technicianUserId);
      if (from) q = q.gte("session_ended_at", from);
      if (to) q = q.lte("session_ended_at", to);

      const { data, error } = await q;
      if (error) {
        if (isMissingRelation(error.message)) return migrationRequired(res);
        return res.status(500).json({ error: error.message });
      }

      const rows = (data ?? []) as RequestRow[];
      const techNames = await loadTechNames([
        ...new Set(rows.map((r) => r.technician_user_id)),
      ]);
      const evals = await loadEvaluationsByRequest(rows.map((r) => r.id));
      return res.json({
        requests: rows.map((r) =>
          mapRequest(r, evals.get(r.id) ?? null, techNames.get(r.technician_user_id))
        ),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET evaluations/requests:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/evaluations/requests/:id", async (req, res) => {
    try {
      const mgr = await requireManager(req, res);
      if (!mgr) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const { data, error } = await supabaseAdmin
        .from("rda_eval_requests")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (isMissingRelation(error.message)) return migrationRequired(res);
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.status(404).json({ error: "Solicitação não encontrada." });
      const row = data as RequestRow;
      const techNames = await loadTechNames([row.technician_user_id]);
      const evals = await loadEvaluationsByRequest([row.id]);
      const { data: audit } = await supabaseAdmin
        .from("rda_eval_audit_events")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("request_id", row.id)
        .order("created_at", { ascending: true });
      return res.json({
        request: mapRequest(
          row,
          evals.get(row.id) ?? null,
          techNames.get(row.technician_user_id)
        ),
        audit: (audit ?? []).map((a) => ({
          id: String((a as { id: string }).id),
          requestId: (a as { request_id?: string }).request_id ?? null,
          evaluationId: (a as { evaluation_id?: string }).evaluation_id ?? null,
          eventType: String((a as { event_type: string }).event_type),
          actorUserId: (a as { actor_user_id?: string }).actor_user_id ?? null,
          actorIsAdmin: (a as { actor_is_admin?: boolean }).actor_is_admin === true,
          payload: ((a as { payload?: Record<string, unknown> }).payload || {}) as Record<
            string,
            unknown
          >,
          createdAt: String((a as { created_at: string }).created_at),
        })),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET evaluations/requests/:id:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/evaluations/technician/:userId", async (req, res) => {
    try {
      const mgr = await requireManager(req, res);
      if (!mgr) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const userId = String(req.params.userId || "").trim();
      if (!userId) return res.status(400).json({ error: "userId obrigatório." });

      const { data, error } = await supabaseAdmin
        .from("rda_eval_requests")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("technician_user_id", userId)
        .order("session_ended_at", { ascending: false })
        .limit(100);
      if (error) {
        if (isMissingRelation(error.message)) return migrationRequired(res);
        return res.status(500).json({ error: error.message });
      }
      const rows = (data ?? []) as RequestRow[];
      const evals = await loadEvaluationsByRequest(rows.map((r) => r.id));
      const techNames = await loadTechNames([userId]);
      const evaluatedRows = [...evals.values()];
      return res.json({
        technicianUserId: userId,
        technicianDisplayName: techNames.get(userId) || null,
        requests: rows.map((r) =>
          mapRequest(r, evals.get(r.id) ?? null, techNames.get(userId))
        ),
        averageScores: averageScores(evaluatedRows),
        evaluatedCount: evaluatedRows.length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET evaluations/technician:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/rda/evaluations/requests/:id/defer", async (req, res) => {
    try {
      const mgr = await requireManager(req, res);
      if (!mgr) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const body = (req.body || {}) as Record<string, unknown>;
      if (body.evaluatorUserId != null || body.managerUserId != null) {
        return res.status(400).json({
          error: "Não é permitido informar identidade de avaliador no corpo.",
        });
      }
      const note =
        typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
      const until =
        typeof body.until === "string" && body.until.trim()
          ? body.until.trim()
          : null;
      const clientMutationId = mutationIdFromBody(body);

      const { data: row, error } = await supabaseAdmin
        .from("rda_eval_requests")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (isMissingRelation(error.message)) return migrationRequired(res);
        return res.status(500).json({ error: error.message });
      }
      if (!row) return res.status(404).json({ error: "Solicitação não encontrada." });
      const current = row as RequestRow;
      if (current.status === "evaluated" || current.status === "dismissed") {
        return res.status(409).json({
          error: "Solicitação já encerrada; não pode ser adiada.",
        });
      }
      if (current.status === "deferred") {
        const evals = await loadEvaluationsByRequest([current.id]);
        return res.json({
          request: mapRequest(current, evals.get(current.id) ?? null),
          alreadyDeferred: true,
        });
      }

      const nowIso = new Date().toISOString();
      const { data: updated, error: upErr } = await supabaseAdmin
        .from("rda_eval_requests")
        .update({
          status: "deferred",
          deferred_until: until,
          deferred_note: note || null,
          deferred_by_user_id: mgr.userId,
          deferred_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();

      if (upErr) return res.status(500).json({ error: upErr.message });
      if (!updated) {
        return res.status(409).json({ error: "Estado alterado; tente novamente." });
      }

      await insertAudit({
        requestId: id,
        eventType: "deferred",
        actorUserId: mgr.userId,
        actorIsAdmin: mgr.isAdmin,
        payload: { note, until, clientMutationId },
      });

      return res.json({ request: mapRequest(updated as RequestRow, null) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST defer:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/rda/evaluations/requests/:id/dismiss", async (req, res) => {
    try {
      const mgr = await requireManager(req, res);
      if (!mgr) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const body = (req.body || {}) as Record<string, unknown>;
      if (body.evaluatorUserId != null || body.managerUserId != null) {
        return res.status(400).json({
          error: "Não é permitido informar identidade de avaliador no corpo.",
        });
      }
      const reason =
        typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
      const clientMutationId = mutationIdFromBody(body);

      const { data: row, error } = await supabaseAdmin
        .from("rda_eval_requests")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (isMissingRelation(error.message)) return migrationRequired(res);
        return res.status(500).json({ error: error.message });
      }
      if (!row) return res.status(404).json({ error: "Solicitação não encontrada." });
      const current = row as RequestRow;
      if (current.status === "evaluated") {
        return res.status(409).json({ error: "Já avaliada; não pode ser dispensada." });
      }
      if (current.status === "dismissed") {
        return res.json({
          request: mapRequest(current, null),
          alreadyDismissed: true,
        });
      }

      const nowIso = new Date().toISOString();
      const { data: updated, error: upErr } = await supabaseAdmin
        .from("rda_eval_requests")
        .update({
          status: "dismissed",
          dismissed_reason: reason || null,
          dismissed_by_user_id: mgr.userId,
          dismissed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .in("status", ["pending", "deferred"])
        .select("*")
        .maybeSingle();

      if (upErr) return res.status(500).json({ error: upErr.message });
      if (!updated) {
        return res.status(409).json({ error: "Estado alterado; tente novamente." });
      }

      await insertAudit({
        requestId: id,
        eventType: "dismissed",
        actorUserId: mgr.userId,
        actorIsAdmin: mgr.isAdmin,
        payload: {
          reason,
          clientMutationId,
          note: "Dispensa voluntária — não representa nota negativa.",
        },
      });

      return res.json({ request: mapRequest(updated as RequestRow, null) });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST dismiss:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/rda/evaluations/requests/:id/evaluate", async (req, res) => {
    try {
      const mgr = await requireManager(req, res);
      if (!mgr) return;
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const body = (req.body || {}) as Record<string, unknown>;
      if (
        body.evaluatorUserId != null ||
        body.managerUserId != null ||
        body.evaluator_user_id != null
      ) {
        return res.status(400).json({
          error: "Não é permitido avaliar em nome de outro gerente.",
        });
      }

      const scoresRaw = (body.scores as Record<string, unknown> | undefined) || {};
      const technicalQuality = clampScore(
        scoresRaw.technicalQuality ?? body.scoreTechnicalQuality
      );
      const organization = clampScore(
        scoresRaw.organization ?? body.scoreOrganization
      );
      const procedures = clampScore(
        scoresRaw.procedures ?? body.scoreProcedures
      );
      const autonomy = clampScore(scoresRaw.autonomy ?? body.scoreAutonomy);
      const communication = clampScore(
        scoresRaw.communication ?? body.scoreCommunication
      );
      if (
        technicalQuality == null ||
        organization == null ||
        procedures == null ||
        autonomy == null ||
        communication == null
      ) {
        return res.status(400).json({
          error: "Todas as competências devem ter nota inteira de 1 a 5.",
        });
      }

      const positives =
        typeof body.positives === "string" ? body.positives.trim().slice(0, 4000) : "";
      const improvements =
        typeof body.improvements === "string"
          ? body.improvements.trim().slice(0, 4000)
          : "";
      const generalNotes =
        typeof body.generalNotes === "string"
          ? body.generalNotes.trim().slice(0, 4000)
          : "";
      const clientMutationId = mutationIdFromBody(body);

      if (clientMutationId) {
        const { data: byMut } = await supabaseAdmin
          .from("rda_evaluations")
          .select("*")
          .eq("workshop_id", WORKSHOP_ID)
          .eq("client_mutation_id", clientMutationId)
          .maybeSingle();
        if (byMut) {
          const { data: reqRow } = await supabaseAdmin
            .from("rda_eval_requests")
            .select("*")
            .eq("id", (byMut as EvaluationRow).request_id)
            .maybeSingle();
          if (reqRow) {
            return res.json({
              request: mapRequest(reqRow as RequestRow, byMut as EvaluationRow),
              evaluation: mapEvaluation(byMut as EvaluationRow),
              idempotent: true,
            });
          }
        }
      }

      const { data: row, error } = await supabaseAdmin
        .from("rda_eval_requests")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("id", id)
        .maybeSingle();
      if (error) {
        if (isMissingRelation(error.message)) return migrationRequired(res);
        return res.status(500).json({ error: error.message });
      }
      if (!row) return res.status(404).json({ error: "Solicitação não encontrada." });
      const current = row as RequestRow;
      if (current.status === "dismissed") {
        return res.status(409).json({ error: "Solicitação dispensada." });
      }
      if (current.status === "evaluated") {
        const evals = await loadEvaluationsByRequest([current.id]);
        const existing = evals.get(current.id) ?? null;
        return res.json({
          request: mapRequest(current, existing),
          evaluation: existing ? mapEvaluation(existing) : null,
          alreadyEvaluated: true,
        });
      }

      const nowIso = new Date().toISOString();
      const insertPayload = {
        workshop_id: WORKSHOP_ID,
        request_id: current.id,
        work_session_id: current.work_session_id,
        technician_user_id: current.technician_user_id,
        evaluator_user_id: mgr.userId,
        evaluator_is_admin: mgr.isAdmin,
        evaluator_display_name: mgr.displayName,
        score_technical_quality: technicalQuality,
        score_organization: organization,
        score_procedures: procedures,
        score_autonomy: autonomy,
        score_communication: communication,
        positives,
        improvements,
        general_notes: generalNotes,
        client_mutation_id: clientMutationId,
        created_at: nowIso,
        updated_at: nowIso,
      };

      const { data: created, error: insErr } = await supabaseAdmin
        .from("rda_evaluations")
        .insert(insertPayload)
        .select("*")
        .single();

      if (insErr) {
        if (/duplicate key|unique/i.test(insErr.message)) {
          const evals = await loadEvaluationsByRequest([current.id]);
          const existing = evals.get(current.id);
          if (existing) {
            return res.json({
              request: mapRequest(current, existing),
              evaluation: mapEvaluation(existing),
              alreadyEvaluated: true,
            });
          }
        }
        return res.status(500).json({ error: insErr.message });
      }

      const { data: updatedReq, error: upErr } = await supabaseAdmin
        .from("rda_eval_requests")
        .update({
          status: "evaluated",
          evaluated_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", current.id)
        .eq("workshop_id", WORKSHOP_ID)
        .in("status", ["pending", "deferred"])
        .select("*")
        .maybeSingle();

      if (upErr) {
        return res.status(500).json({ error: upErr.message });
      }

      await insertAudit({
        requestId: current.id,
        evaluationId: (created as EvaluationRow).id,
        eventType: "evaluated",
        actorUserId: mgr.userId,
        actorIsAdmin: mgr.isAdmin,
        payload: {
          clientMutationId,
          scores: {
            technicalQuality,
            organization,
            procedures,
            autonomy,
            communication,
          },
        },
      });

      // Não altera etapa/status da OS.
      return res.status(201).json({
        request: mapRequest(
          (updatedReq as RequestRow) || { ...current, status: "evaluated", evaluated_at: nowIso },
          created as EvaluationRow
        ),
        evaluation: mapEvaluation(created as EvaluationRow),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST evaluate:", err);
      return res.status(500).json({ error: message });
    }
  });
}

/** Garante solicitação após finish (idempotente). Falha silenciosa se migration ausente. */
export async function ensureEvalRequestForFinishedSession(params: {
  supabaseAdmin: SupabaseClient;
  workshopId: string;
  sessionId: string;
  clientMutationId?: string | null;
}): Promise<void> {
  const { supabaseAdmin, workshopId, sessionId, clientMutationId } = params;
  const { error } = await supabaseAdmin.rpc("rda_eval_request_ensure_for_session", {
    p_workshop_id: workshopId,
    p_session_id: sessionId,
    p_client_mutation_id: clientMutationId
      ? `${clientMutationId}:eval`
      : null,
  });
  if (error) {
    if (/Could not find the function|does not exist|schema cache/i.test(error.message)) {
      console.warn(
        "[RDA] ensureEvalRequest: RPC/migration de avaliações pendente —",
        error.message
      );
      return;
    }
    console.warn("[RDA] ensureEvalRequest:", error.message);
  }
}
