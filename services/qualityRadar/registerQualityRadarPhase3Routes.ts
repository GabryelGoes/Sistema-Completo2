/**
 * Radar Fase 3 — Revisão Semanal com RDA.
 * ACL: requestCanAccessQualityRadar. Rascunhos exigem aprovação humana.
 */
import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { runRdaChatTurn } from "../rdaIntelligence/agent/orchestrator.js";
import {
  describeRdaFeatureFlag,
  RDA_INTELLIGENCE_SETTING_KEY,
} from "../rdaIntelligence/featureFlag.js";
import { RdaProviderDisabledError } from "../rdaIntelligence/providers/types.js";
import type { RdaAuthContext, RdaRole } from "../rdaIntelligence/types.js";
import {
  detectIncompleteSignals,
  fetchIncidents,
  fetchManagerialEvaluations,
  fetchPersonProfileBundle,
  fetchPdiAndMeetings,
  fetchPriorWeeklyReviews,
  fetchRecognitions,
  fetchServiceHistorySplit,
  fetchWorkTimes,
  resolvePersonIdentity,
} from "./personDossier.js";
import {
  computeInterviewProgress,
  defaultWeekBounds,
  draftFieldsFromUnknown,
  EMPTY_WEEKLY_DRAFT,
  inferCoveredTopicsFromText,
  isReviewObservationClassification,
  type ReviewObservationClassification,
  type WeeklyDraftFields,
} from "./weeklyReviewDefaults.js";

type SessionPayload = { r: "admin" | "user"; u?: string; n?: string };

type Deps = {
  WORKSHOP_ID: string | undefined;
  supabaseAdmin: SupabaseClient | null;
  requestCanAccessQualityRadar: (req: Request) => Promise<boolean>;
  getWorkshopSettingValue: (key: string) => Promise<string | null>;
  loadUserPermissions?: (userId: string) => Promise<Record<string, boolean> | null>;
};

function authFromReq(req: Request): SessionPayload | null {
  return (req as unknown as { auth?: SessionPayload }).auth ?? null;
}

function mapDraft(row: Record<string, unknown>) {
  return {
    id: row.id,
    reviewId: row.review_id,
    version: row.version,
    status: row.status,
    weekSummary: row.week_summary ?? "",
    strengths: row.strengths ?? "",
    difficulties: row.difficulties ?? "",
    observedSkills: row.observed_skills ?? "",
    evolution: row.evolution ?? "",
    recommendedActions: row.recommended_actions ?? "",
    proposedGoals: row.proposed_goals ?? "",
    followUps: row.follow_ups ?? "",
    bodyJson: row.body_json ?? {},
    generatedBy: row.generated_by,
    editedByName: row.edited_by_name ?? "",
    decidedByName: row.decided_by_name ?? "",
    decidedAt: row.decided_at ?? null,
    decisionNote: row.decision_note ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReview(row: Record<string, unknown>) {
  return {
    id: row.id,
    scope: row.scope,
    systemUserId: row.system_user_id ?? null,
    workshopTechnicianId: row.workshop_technician_id ?? null,
    personName: row.person_name ?? "",
    weekFrom: row.week_from,
    weekTo: row.week_to,
    status: row.status,
    rdaConversationId: row.rda_conversation_id ?? null,
    topicsCovered: Array.isArray(row.topics_covered) ? row.topics_covered : [],
    incompleteSignals: Array.isArray(row.incomplete_signals) ? row.incomplete_signals : [],
    progressPct: Number(row.progress_pct || 0),
    openedByName: row.opened_by_name ?? "",
    closedAt: row.closed_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerQualityRadarPhase3Routes(app: Express, deps: Deps): void {
  const { WORKSHOP_ID, supabaseAdmin, requestCanAccessQualityRadar } = deps;

  async function actorFromReq(req: Request): Promise<{ userId: string | null; name: string }> {
    const auth = authFromReq(req);
    if (!auth) return { userId: null, name: "" };
    if (auth.r === "admin") {
      return { userId: auth.u || null, name: auth.n || "Administrador" };
    }
    if (!auth.u || !supabaseAdmin || !WORKSHOP_ID) {
      return { userId: auth.u || null, name: auth.n || "" };
    }
    const { data } = await supabaseAdmin
      .from("workshop_system_users")
      .select("display_name, username")
      .eq("id", auth.u)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    const name =
      String((data as { display_name?: string } | null)?.display_name || "").trim() ||
      String((data as { username?: string } | null)?.username || "").trim() ||
      auth.n ||
      "";
    return { userId: auth.u, name };
  }

  async function rdaAuthFromReq(req: Request): Promise<RdaAuthContext | null> {
    const base = authFromReq(req);
    if (!base?.r) return null;
    let permissions: Record<string, boolean> | null = null;
    if (base.r === "user" && base.u && deps.loadUserPermissions) {
      permissions = await deps.loadUserPermissions(base.u);
    }
    return {
      role: base.r as RdaRole,
      userId: base.u,
      username: base.n,
      permissions,
    };
  }

  async function loadReview(id: string) {
    const { data, error } = await supabaseAdmin!
      .from("workshop_quality_weekly_reviews")
      .select("*")
      .eq("workshop_id", WORKSHOP_ID!)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data as Record<string, unknown> | null;
  }

  async function audit(
    reviewId: string,
    action: string,
    actor: { userId: string | null; name: string },
    detail?: unknown,
    draftId?: string | null
  ) {
    await supabaseAdmin!.from("workshop_quality_weekly_review_audit").insert({
      workshop_id: WORKSHOP_ID!,
      review_id: reviewId,
      draft_id: draftId || null,
      action,
      actor_user_id: actor.userId,
      actor_name: actor.name,
      detail: detail ?? null,
    });
  }

  // -------- list --------
  app.get("/api/quality-radar/weekly-reviews", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const systemUserId =
        typeof req.query.systemUserId === "string" ? req.query.systemUserId.trim() : "";
      let q = supabaseAdmin
        .from("workshop_quality_weekly_reviews")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("updated_at", { ascending: false })
        .limit(50);
      if (status) q = q.eq("status", status);
      if (systemUserId) q = q.eq("system_user_id", systemUserId);
      const { data, error } = await q;
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) {
          return res.status(503).json({
            reviews: [],
            code: "MIGRATION_PENDING",
            error: "Tabelas da Fase 3 ainda não aplicadas.",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json({ reviews: (data || []).map((r) => mapReview(r as Record<string, unknown>)) });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- create --------
  app.post("/api/quality-radar/weekly-reviews", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const actor = await actorFromReq(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const scope = body.scope === "team" ? "team" : "person";
      const bounds = defaultWeekBounds();
      const weekFrom =
        typeof body.weekFrom === "string" && body.weekFrom.trim()
          ? body.weekFrom.trim().slice(0, 10)
          : bounds.weekFrom;
      const weekTo =
        typeof body.weekTo === "string" && body.weekTo.trim()
          ? body.weekTo.trim().slice(0, 10)
          : bounds.weekTo;

      let personName = typeof body.personName === "string" ? body.personName.trim() : "";
      let systemUserId =
        typeof body.systemUserId === "string" ? body.systemUserId.trim() : "";
      let workshopTechnicianId =
        typeof body.workshopTechnicianId === "string"
          ? body.workshopTechnicianId.trim()
          : "";

      let incomplete: string[] = [];
      if (scope === "person") {
        const identity = await resolvePersonIdentity(supabaseAdmin, WORKSHOP_ID, {
          personName,
          systemUserId,
          workshopTechnicianId,
        });
        personName = identity.personName || personName || "Funcionário";
        systemUserId = identity.systemUserId || "";
        workshopTechnicianId = identity.workshopTechnicianId || "";

        const period = { from: weekFrom, to: weekTo };
        const profile = await fetchPersonProfileBundle(supabaseAdmin, WORKSHOP_ID, identity, period);
        const [services, times, recog, incidents, careerPdi] = await Promise.all([
          fetchServiceHistorySplit(supabaseAdmin, WORKSHOP_ID, identity, period, 12),
          fetchWorkTimes(supabaseAdmin, WORKSHOP_ID, identity, period),
          fetchRecognitions(supabaseAdmin, WORKSHOP_ID, identity, period, 10),
          fetchIncidents(supabaseAdmin, WORKSHOP_ID, identity, period, 10),
          fetchPdiAndMeetings(supabaseAdmin, WORKSHOP_ID, identity, period),
        ]);
        incomplete = detectIncompleteSignals({
          matrixUnratedCount: profile.competencyMatrix.unrated.length,
          servicesPatio: services.patio?.length || 0,
          servicesLab: services.laboratorio?.length || 0,
          recognitions: recog.items?.length || 0,
          incidents: incidents.items?.length || 0,
          meetings: careerPdi.meetings?.length || 0,
          hasCareerLevel: !!(profile.career && "career_level_id" in (profile.career as object)),
          hasPdi: (careerPdi.pdi || []).length > 0,
          workSessions: times.totals?.sessions || 0,
        });
      } else {
        personName = "Equipe";
        incomplete = ["Revisão de equipe: percorra cada mecânico individualmente quando possível."];
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_quality_weekly_reviews")
        .insert({
          workshop_id: WORKSHOP_ID,
          scope,
          system_user_id: systemUserId || null,
          workshop_technician_id: workshopTechnicianId || null,
          person_name: personName,
          week_from: weekFrom,
          week_to: weekTo,
          status: "in_progress",
          topics_covered: [],
          incomplete_signals: incomplete,
          progress_pct: 0,
          opened_by_user_id: actor.userId,
          opened_by_name: actor.name,
        })
        .select("*")
        .single();
      if (error) {
        if (/does not exist|schema cache/i.test(error.message)) {
          return res.status(503).json({
            code: "MIGRATION_PENDING",
            error: "Tabelas da Fase 3 ainda não aplicadas.",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      await audit(String((data as { id: string }).id), "created", actor, { scope, personName });
      return res.status(201).json({ review: mapReview(data as Record<string, unknown>) });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- detail --------
  app.get("/api/quality-radar/weekly-reviews/:id", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const review = await loadReview(id);
      if (!review) return res.status(404).json({ error: "Revisão não encontrada." });

      const [{ data: observations }, { data: drafts }, { data: messages }] = await Promise.all([
        supabaseAdmin
          .from("workshop_quality_review_observations")
          .select("*")
          .eq("review_id", id)
          .order("created_at", { ascending: true }),
        supabaseAdmin
          .from("workshop_quality_weekly_review_drafts")
          .select("*")
          .eq("review_id", id)
          .order("version", { ascending: false }),
        review.rda_conversation_id
          ? supabaseAdmin
              .from("rda_messages")
              .select("id, role, content, created_at, metadata")
              .eq("workshop_id", WORKSHOP_ID)
              .eq("conversation_id", String(review.rda_conversation_id))
              .in("role", ["user", "assistant"])
              .order("created_at", { ascending: true })
              .limit(80)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      const progress = computeInterviewProgress(
        Array.isArray(review.topics_covered) ? (review.topics_covered as string[]) : []
      );

      return res.json({
        review: mapReview(review),
        progress,
        observations: (observations || []).map((o) => {
          const row = o as Record<string, unknown>;
          return {
            id: row.id,
            classification: row.classification,
            category: row.category,
            content: row.content,
            sourceRefs: row.source_refs,
            createdByName: row.created_by_name,
            createdAt: row.created_at,
          };
        }),
        drafts: (drafts || []).map((d) => mapDraft(d as Record<string, unknown>)),
        messages: (messages || []).map((m) => {
          const row = m as Record<string, unknown>;
          return {
            id: row.id,
            role: row.role,
            content: row.content,
            createdAt: row.created_at,
          };
        }),
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- chat turn --------
  app.post("/api/quality-radar/weekly-reviews/:id/chat", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const auth = await rdaAuthFromReq(req);
      if (!auth) return res.status(401).json({ error: "Não autenticado." });

      const settingValue = await deps.getWorkshopSettingValue(RDA_INTELLIGENCE_SETTING_KEY);
      const flag = describeRdaFeatureFlag({ settingValue });
      if (!flag.enabled) {
        return res.status(403).json({
          error: "RDA Intelligence desligado. Ative em Ajustes para a Revisão Semanal.",
          code: "RDA_FEATURE_DISABLED",
        });
      }

      const id = String(req.params.id || "").trim();
      const review = await loadReview(id);
      if (!review) return res.status(404).json({ error: "Revisão não encontrada." });
      if (review.status === "approved" || review.status === "archived") {
        return res.status(409).json({ error: "Revisão encerrada; abra uma nova para continuar." });
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return res.status(400).json({ error: "message é obrigatório." });

      const actor = await actorFromReq(req);
      const result = await runRdaChatTurn({
        workshopId: WORKSHOP_ID,
        supabase: supabaseAdmin,
        auth,
        settingValue,
        conversationId: review.rda_conversation_id
          ? String(review.rda_conversation_id)
          : null,
        userMessage: message,
        mode: "managerial_interview",
        conversationTitle: `Revisão semanal — ${String(review.person_name || "")}`,
        managerialContext: {
          reviewId: id,
          personName: String(review.person_name || ""),
          systemUserId: (review.system_user_id as string) || null,
          workshopTechnicianId: (review.workshop_technician_id as string) || null,
          weekFrom: String(review.week_from),
          weekTo: String(review.week_to),
          topicsCovered: Array.isArray(review.topics_covered)
            ? (review.topics_covered as string[])
            : [],
          incompleteSignals: Array.isArray(review.incomplete_signals)
            ? (review.incomplete_signals as string[])
            : [],
        },
      });

      // Vincula conversa se nova
      if (!review.rda_conversation_id || String(review.rda_conversation_id) !== result.conversationId) {
        await supabaseAdmin
          .from("workshop_quality_weekly_reviews")
          .update({
            rda_conversation_id: result.conversationId,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id)
          .eq("workshop_id", WORKSHOP_ID);
      }

      // Heurística de progresso a partir da fala do líder
      const prevTopics = Array.isArray(review.topics_covered)
        ? (review.topics_covered as string[])
        : [];
      const inferred = inferCoveredTopicsFromText([message, result.assistantMessage]);
      const merged = [...new Set([...prevTopics, ...inferred])];
      const progress = computeInterviewProgress(merged);
      await supabaseAdmin
        .from("workshop_quality_weekly_reviews")
        .update({
          topics_covered: progress.covered,
          progress_pct: progress.progressPct,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);

      // Observação do líder (cada turno do humano)
      await supabaseAdmin.from("workshop_quality_review_observations").insert({
        workshop_id: WORKSHOP_ID,
        review_id: id,
        classification: "leader_observation",
        category: "entrevista",
        content: message,
        source_refs: [{ kind: "chat_turn", conversationId: result.conversationId }],
        created_by_user_id: actor.userId,
        created_by_name: actor.name,
      });

      await audit(id, "chat_turn", actor, {
        conversationId: result.conversationId,
        toolTrace: result.toolTrace,
      });

      return res.json({
        ...result,
        progress,
        reviewId: id,
      });
    } catch (err: unknown) {
      if (err instanceof RdaProviderDisabledError) {
        return res.status(503).json({ error: err.message, code: err.code });
      }
      console.error("[API] weekly-reviews chat:", err);
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- observations --------
  app.post("/api/quality-radar/weekly-reviews/:id/observations", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const review = await loadReview(id);
      if (!review) return res.status(404).json({ error: "Revisão não encontrada." });
      const actor = await actorFromReq(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const content = typeof body.content === "string" ? body.content.trim() : "";
      if (!content) return res.status(400).json({ error: "content é obrigatório." });
      let classification: ReviewObservationClassification = "leader_observation";
      if (isReviewObservationClassification(body.classification)) {
        // API pública: líder não pode forjar system_fact
        if (body.classification === "system_fact") {
          return res.status(400).json({
            error: "system_fact só pode originar-se de registros do sistema (tools).",
          });
        }
        classification = body.classification;
      }
      const category =
        typeof body.category === "string" && body.category.trim()
          ? body.category.trim().slice(0, 80)
          : "geral";

      const { data, error } = await supabaseAdmin
        .from("workshop_quality_review_observations")
        .insert({
          workshop_id: WORKSHOP_ID,
          review_id: id,
          classification,
          category,
          content,
          source_refs: Array.isArray(body.sourceRefs) ? body.sourceRefs : [],
          created_by_user_id: actor.userId,
          created_by_name: actor.name,
        })
        .select("*")
        .single();
      if (error) return res.status(500).json({ error: error.message });

      const inferred = inferCoveredTopicsFromText([content]);
      const prev = Array.isArray(review.topics_covered) ? (review.topics_covered as string[]) : [];
      const progress = computeInterviewProgress([...prev, ...inferred]);
      await supabaseAdmin
        .from("workshop_quality_weekly_reviews")
        .update({
          topics_covered: progress.covered,
          progress_pct: progress.progressPct,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await audit(id, "observation_added", actor, { classification, category });
      return res.status(201).json({
        observation: {
          id: (data as { id: string }).id,
          classification,
          category,
          content,
        },
        progress,
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- draft upsert (rascunho; não definitivo) --------
  app.put("/api/quality-radar/weekly-reviews/:id/draft", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const review = await loadReview(id);
      if (!review) return res.status(404).json({ error: "Revisão não encontrada." });
      const actor = await actorFromReq(req);
      const fields: WeeklyDraftFields = {
        ...EMPTY_WEEKLY_DRAFT,
        ...draftFieldsFromUnknown(req.body),
      };
      const generatedBy =
        (req.body as { generatedBy?: string })?.generatedBy === "rda" ? "rda" : "leader";

      const { data: existing } = await supabaseAdmin
        .from("workshop_quality_weekly_review_drafts")
        .select("id, version, status")
        .eq("review_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      let draftRow: Record<string, unknown>;
      if (
        existing &&
        ((existing as { status: string }).status === "draft" ||
          (existing as { status: string }).status === "edited")
      ) {
        const { data, error } = await supabaseAdmin
          .from("workshop_quality_weekly_review_drafts")
          .update({
            status: "edited",
            week_summary: fields.weekSummary,
            strengths: fields.strengths,
            difficulties: fields.difficulties,
            observed_skills: fields.observedSkills,
            evolution: fields.evolution,
            recommended_actions: fields.recommendedActions,
            proposed_goals: fields.proposedGoals,
            follow_ups: fields.followUps,
            body_json: fields,
            generated_by: generatedBy,
            edited_by_user_id: actor.userId,
            edited_by_name: actor.name,
            updated_at: new Date().toISOString(),
          })
          .eq("id", (existing as { id: string }).id)
          .select("*")
          .single();
        if (error) return res.status(500).json({ error: error.message });
        draftRow = data as Record<string, unknown>;
      } else {
        const nextVersion = existing ? Number((existing as { version: number }).version) + 1 : 1;
        const { data, error } = await supabaseAdmin
          .from("workshop_quality_weekly_review_drafts")
          .insert({
            workshop_id: WORKSHOP_ID,
            review_id: id,
            version: nextVersion,
            status: "draft",
            week_summary: fields.weekSummary,
            strengths: fields.strengths,
            difficulties: fields.difficulties,
            observed_skills: fields.observedSkills,
            evolution: fields.evolution,
            recommended_actions: fields.recommendedActions,
            proposed_goals: fields.proposedGoals,
            follow_ups: fields.followUps,
            body_json: fields,
            generated_by: generatedBy,
            edited_by_user_id: actor.userId,
            edited_by_name: actor.name,
          })
          .select("*")
          .single();
        if (error) return res.status(500).json({ error: error.message });
        draftRow = data as Record<string, unknown>;
      }

      await supabaseAdmin
        .from("workshop_quality_weekly_reviews")
        .update({ status: "draft_ready", updated_at: new Date().toISOString() })
        .eq("id", id);

      await audit(id, "draft_saved", actor, { version: draftRow.version }, String(draftRow.id));
      return res.json({
        draft: mapDraft(draftRow),
        note: "Rascunho salvo. Avaliações subjetivas NÃO foram aplicadas automaticamente.",
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- approve / reject --------
  app.post("/api/quality-radar/weekly-reviews/:id/draft/decide", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const review = await loadReview(id);
      if (!review) return res.status(404).json({ error: "Revisão não encontrada." });
      const actor = await actorFromReq(req);
      const body = (req.body || {}) as Record<string, unknown>;
      const decision = body.decision === "reject" ? "rejected" : body.decision === "approve" ? "approved" : "";
      if (!decision) {
        return res.status(400).json({ error: "decision deve ser approve ou reject." });
      }
      const note = typeof body.note === "string" ? body.note.trim() : "";

      const { data: draft } = await supabaseAdmin
        .from("workshop_quality_weekly_review_drafts")
        .select("*")
        .eq("review_id", id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!draft) return res.status(404).json({ error: "Nenhum rascunho para decidir." });

      const { data: updated, error } = await supabaseAdmin
        .from("workshop_quality_weekly_review_drafts")
        .update({
          status: decision,
          decided_by_user_id: actor.userId,
          decided_by_name: actor.name,
          decided_at: new Date().toISOString(),
          decision_note: note,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (draft as { id: string }).id)
        .select("*")
        .single();
      if (error) return res.status(500).json({ error: error.message });

      await supabaseAdmin
        .from("workshop_quality_weekly_reviews")
        .update({
          status: decision === "approved" ? "approved" : "rejected",
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", id);

      await audit(
        id,
        decision === "approved" ? "draft_approved" : "draft_rejected",
        actor,
        { note },
        String((draft as { id: string }).id)
      );

      return res.json({
        draft: mapDraft(updated as Record<string, unknown>),
        note:
          decision === "approved"
            ? "Relatório aprovado pelo líder. Nenhuma promoção/punição automática foi aplicada."
            : "Rascunho rejeitado. Nenhuma avaliação subjetiva foi consolidada.",
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- memória estruturada (consulta) --------
  // Rotas estáticas (fora de :id) — memória e preview de dossiê
  app.get("/api/quality-radar/person-memory", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const personName =
        typeof req.query.personName === "string" ? req.query.personName.trim() : "";
      const systemUserId =
        typeof req.query.systemUserId === "string" ? req.query.systemUserId.trim() : "";
      const technicianId =
        typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";
      const months = Math.min(
        24,
        Math.max(1, Number(req.query.months || 3) || 3)
      );
      const identity = await resolvePersonIdentity(supabaseAdmin, WORKSHOP_ID, {
        personName,
        systemUserId,
        workshopTechnicianId: technicianId,
      });
      const prior = await fetchPriorWeeklyReviews(supabaseAdmin, WORKSHOP_ID, identity, 12);
      const fromDate = new Date();
      fromDate.setMonth(fromDate.getMonth() - months);
      const filtered = (prior.reviews || []).filter((r) => {
        const wf = String((r as { week_from?: string }).week_from || "");
        return !wf || wf >= fromDate.toISOString().slice(0, 10);
      });

      // Dificuldades / habilidades a partir de rascunhos aprovados ou últimos
      const difficulties: string[] = [];
      const skills: string[] = [];
      const evolution: string[] = [];
      for (const r of filtered) {
        const d = (r as { latestDraft?: Record<string, unknown> | null }).latestDraft;
        if (!d) continue;
        if (d.difficulties) difficulties.push(String(d.difficulties));
        if (d.observed_skills) skills.push(String(d.observed_skills));
        if (d.evolution) evolution.push(String(d.evolution));
      }

      return res.json({
        identity,
        months,
        reviews: filtered,
        recurringDifficulties: difficulties,
        recentSkills: skills,
        evolutionNotes: evolution,
        provenance: "system_fact",
        note: "Respostas baseadas apenas em revisões/rascunhos persistidos — não inventar.",
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });

  // -------- dossier preview (sem LLM) --------
  app.get("/api/quality-radar/week-dossier-preview", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const bounds = defaultWeekBounds();
      const weekFrom =
        typeof req.query.weekFrom === "string" ? req.query.weekFrom : bounds.weekFrom;
      const weekTo = typeof req.query.weekTo === "string" ? req.query.weekTo : bounds.weekTo;
      const identity = await resolvePersonIdentity(supabaseAdmin, WORKSHOP_ID, {
        personName: typeof req.query.personName === "string" ? req.query.personName : null,
        systemUserId: typeof req.query.systemUserId === "string" ? req.query.systemUserId : null,
        workshopTechnicianId:
          typeof req.query.technicianId === "string" ? req.query.technicianId : null,
      });
      const period = { from: weekFrom, to: weekTo };
      const profile = await fetchPersonProfileBundle(supabaseAdmin, WORKSHOP_ID, identity, period);
      const [services, times, recog, incidents, careerPdi, evals] = await Promise.all([
        fetchServiceHistorySplit(supabaseAdmin, WORKSHOP_ID, identity, period),
        fetchWorkTimes(supabaseAdmin, WORKSHOP_ID, identity, period),
        fetchRecognitions(supabaseAdmin, WORKSHOP_ID, identity, period),
        fetchIncidents(supabaseAdmin, WORKSHOP_ID, identity, period),
        fetchPdiAndMeetings(supabaseAdmin, WORKSHOP_ID, identity, period),
        fetchManagerialEvaluations(supabaseAdmin, WORKSHOP_ID, identity, period),
      ]);
      const incomplete = detectIncompleteSignals({
        matrixUnratedCount: profile.competencyMatrix.unrated.length,
        servicesPatio: services.patio?.length || 0,
        servicesLab: services.laboratorio?.length || 0,
        recognitions: recog.items?.length || 0,
        incidents: incidents.items?.length || 0,
        meetings: careerPdi.meetings?.length || 0,
        hasCareerLevel: !!(profile.career && "career_level_id" in (profile.career as object)),
        hasPdi: (careerPdi.pdi || []).length > 0,
        workSessions: times.totals?.sessions || 0,
      });
      return res.json({
        identity,
        period,
        profile,
        services,
        workTimes: times,
        recognitions: recog,
        incidents,
        careerPdi,
        managerialEvaluations: evals,
        incompleteSignals: incomplete,
      });
    } catch (err: unknown) {
      return res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    }
  });
}
