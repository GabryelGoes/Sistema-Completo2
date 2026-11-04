/**
 * Radar Fase 2: competências, níveis, PDI, reuniões/feedbacks, evolução.
 */
import type { Express, Request } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_CAREER_LEVELS,
  DEFAULT_COMPETENCIES,
  readinessAgainstRequirements,
  scoreOrUnrated,
} from "./careerDefaults.js";

type SessionPayload = { r: "admin" | "user"; u?: string; n?: string };

type Deps = {
  WORKSHOP_ID: string | undefined;
  supabaseAdmin: SupabaseClient | null;
  requestCanAccessQualityRadar: (req: Request) => Promise<boolean>;
};

function authFromReq(req: Request): SessionPayload | null {
  return (req as unknown as { auth?: SessionPayload }).auth ?? null;
}

export function registerQualityRadarPhase2Routes(app: Express, deps: Deps): void {
  const { WORKSHOP_ID, supabaseAdmin, requestCanAccessQualityRadar } = deps;

  async function actorFromReq(req: Request): Promise<{ userId: string | null; name: string }> {
    const auth = authFromReq(req);
    if (!auth) return { userId: null, name: "" };
    if (auth.r === "admin") return { userId: auth.u || null, name: auth.n || "Administrador" };
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

  async function ensureCatalogSeeded(): Promise<{ ok: boolean; missingFn: boolean }> {
    if (!supabaseAdmin || !WORKSHOP_ID) return { ok: false, missingFn: false };
    const { data, error } = await supabaseAdmin
      .from("workshop_quality_competencies")
      .select("id")
      .eq("workshop_id", WORKSHOP_ID)
      .limit(1);
    if (error) {
      if (/does not exist|relation/i.test(error.message)) {
        return { ok: false, missingFn: true };
      }
      return { ok: false, missingFn: false };
    }
    if ((data ?? []).length > 0) return { ok: true, missingFn: false };

    // Seed competências + rubricas
    for (const c of DEFAULT_COMPETENCIES) {
      const { data: row, error: insErr } = await supabaseAdmin
        .from("workshop_quality_competencies")
        .insert({
          workshop_id: WORKSHOP_ID,
          code: c.code,
          name: c.name,
          description: c.description,
          kind: c.kind,
          sort_order: c.sortOrder,
        })
        .select("id")
        .single();
      if (insErr || !row) continue;
      const competencyId = String((row as { id: string }).id);
      await supabaseAdmin.from("workshop_quality_competency_rubrics").insert(
        c.rubrics.map((r) => ({
          workshop_id: WORKSHOP_ID,
          competency_id: competencyId,
          level: r.level,
          label: r.label,
          description: r.description,
        }))
      );
    }

    // Seed níveis
    const { data: comps } = await supabaseAdmin
      .from("workshop_quality_competencies")
      .select("id, code")
      .eq("workshop_id", WORKSHOP_ID);
    const codeToId = new Map(
      (comps ?? []).map((c) => [
        String((c as { code: string }).code),
        String((c as { id: string }).id),
      ])
    );

    for (const lvl of DEFAULT_CAREER_LEVELS) {
      const { data: levelRow, error: lvlErr } = await supabaseAdmin
        .from("workshop_quality_career_levels")
        .insert({
          workshop_id: WORKSHOP_ID,
          code: lvl.code,
          name: lvl.name,
          description: lvl.description,
          sort_order: lvl.sortOrder,
        })
        .select("id")
        .single();
      if (lvlErr || !levelRow) continue;
      const levelId = String((levelRow as { id: string }).id);
      const reqs = Object.entries(lvl.requirements)
        .map(([code, min]) => {
          const competencyId = codeToId.get(code);
          if (!competencyId) return null;
          return {
            workshop_id: WORKSHOP_ID,
            career_level_id: levelId,
            competency_id: competencyId,
            min_level: min,
          };
        })
        .filter(Boolean);
      if (reqs.length) {
        await supabaseAdmin.from("workshop_quality_career_level_requirements").insert(reqs);
      }
    }

    return { ok: true, missingFn: false };
  }

  // ---------- Catálogo ----------
  app.get("/api/quality-career/catalog", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const seed = await ensureCatalogSeeded();
      if (seed.missingFn) {
        return res.status(503).json({
          error: "Migration Fase 2 pendente (20261104190000).",
          code: "QUALITY_RADAR_PHASE2_MIGRATION_REQUIRED",
        });
      }

      const [{ data: competencies }, { data: levels }, { data: rubrics }, { data: reqs }] =
        await Promise.all([
          supabaseAdmin
            .from("workshop_quality_competencies")
            .select("*")
            .eq("workshop_id", WORKSHOP_ID)
            .eq("active", true)
            .order("sort_order", { ascending: true }),
          supabaseAdmin
            .from("workshop_quality_career_levels")
            .select("*")
            .eq("workshop_id", WORKSHOP_ID)
            .eq("active", true)
            .order("sort_order", { ascending: true }),
          supabaseAdmin
            .from("workshop_quality_competency_rubrics")
            .select("*")
            .eq("workshop_id", WORKSHOP_ID),
          supabaseAdmin
            .from("workshop_quality_career_level_requirements")
            .select("*")
            .eq("workshop_id", WORKSHOP_ID),
        ]);

      const rubricsByComp = new Map<string, unknown[]>();
      for (const r of rubrics ?? []) {
        const cid = String((r as { competency_id: string }).competency_id);
        const list = rubricsByComp.get(cid) || [];
        list.push({
          level: (r as { level: number }).level,
          label: (r as { label: string }).label,
          description: (r as { description: string }).description,
        });
        rubricsByComp.set(cid, list);
      }

      const reqsByLevel = new Map<string, unknown[]>();
      for (const r of reqs ?? []) {
        const lid = String((r as { career_level_id: string }).career_level_id);
        const list = reqsByLevel.get(lid) || [];
        list.push({
          competencyId: (r as { competency_id: string }).competency_id,
          minLevel: (r as { min_level: number }).min_level,
        });
        reqsByLevel.set(lid, list);
      }

      return res.json({
        competencies: (competencies ?? []).map((c) => {
          const row = c as Record<string, unknown>;
          return {
            id: row.id,
            code: row.code,
            name: row.name,
            description: row.description ?? "",
            kind: row.kind,
            sortOrder: row.sort_order,
            rubrics: (rubricsByComp.get(String(row.id)) || []).sort(
              (a, b) =>
                Number((a as { level: number }).level) - Number((b as { level: number }).level)
            ),
          };
        }),
        careerLevels: (levels ?? []).map((l) => {
          const row = l as Record<string, unknown>;
          return {
            id: row.id,
            code: row.code,
            name: row.name,
            description: row.description ?? "",
            sortOrder: row.sort_order,
            requirements: reqsByLevel.get(String(row.id)) || [],
          };
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  // ---------- Avaliações de competência ----------
  app.get("/api/quality-career/assessments", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const systemUserId =
        typeof req.query.systemUserId === "string" ? req.query.systemUserId.trim() : "";
      const technicianId =
        typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";
      let query = supabaseAdmin
        .from("workshop_quality_competency_assessments")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID);
      if (systemUserId) query = query.eq("system_user_id", systemUserId);
      else if (technicianId) query = query.eq("workshop_technician_id", technicianId);

      const { data, error } = await query;
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.json({ assessments: [], code: "QUALITY_RADAR_PHASE2_MIGRATION_REQUIRED" });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json({
        assessments: (data ?? []).map((a) => {
          const row = a as Record<string, unknown>;
          return {
            id: row.id,
            competencyId: row.competency_id,
            systemUserId: row.system_user_id ?? null,
            workshopTechnicianId: row.workshop_technician_id ?? null,
            personName: row.person_name ?? "",
            score: scoreOrUnrated(row.score as number | null),
            assessedAt: row.assessed_at ?? null,
            assessedByName: row.assessed_by_name ?? "",
            note: row.note ?? "",
            updatedAt: row.updated_at,
          };
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.put("/api/quality-career/assessments", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const b = (req.body || {}) as Record<string, unknown>;
      const competencyId = typeof b.competencyId === "string" ? b.competencyId.trim() : "";
      const personName = typeof b.personName === "string" ? b.personName.trim() : "";
      const systemUserId =
        typeof b.systemUserId === "string" && b.systemUserId.trim()
          ? b.systemUserId.trim()
          : null;
      const workshopTechnicianId =
        typeof b.workshopTechnicianId === "string" && b.workshopTechnicianId.trim()
          ? b.workshopTechnicianId.trim()
          : null;
      const clearScore = b.score === null || b.score === "";
      const score = clearScore ? null : scoreOrUnrated(Number(b.score));
      if (!competencyId || !personName) {
        return res.status(400).json({ error: "competencyId e personName são obrigatórios." });
      }
      if (!clearScore && score == null) {
        return res.status(400).json({ error: "Nota deve ser 1–5 ou null (não avaliado)." });
      }
      const actor = await actorFromReq(req);
      const now = new Date().toISOString();

      // Busca existente
      let existingQ = supabaseAdmin
        .from("workshop_quality_competency_assessments")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("competency_id", competencyId);
      if (systemUserId) existingQ = existingQ.eq("system_user_id", systemUserId);
      else if (workshopTechnicianId) {
        existingQ = existingQ.eq("workshop_technician_id", workshopTechnicianId).is("system_user_id", null);
      } else {
        return res.status(400).json({ error: "Informe systemUserId ou workshopTechnicianId." });
      }
      const { data: existing } = await existingQ.maybeSingle();
      const prevScore = existing
        ? scoreOrUnrated((existing as { score?: number | null }).score)
        : null;
      const prevNote = existing ? String((existing as { note?: string }).note || "") : "";

      const payload = {
        workshop_id: WORKSHOP_ID,
        competency_id: competencyId,
        system_user_id: systemUserId,
        workshop_technician_id: workshopTechnicianId,
        person_name: personName,
        score,
        assessed_at: score == null ? null : now,
        assessed_by_user_id: actor.userId,
        assessed_by_name: actor.name,
        note: typeof b.note === "string" ? b.note : "",
        updated_at: now,
      };

      let row: Record<string, unknown> | null = null;
      if (existing) {
        const { data, error } = await supabaseAdmin
          .from("workshop_quality_competency_assessments")
          .update(payload)
          .eq("id", (existing as { id: string }).id)
          .select("*")
          .single();
        if (error) return res.status(500).json({ error: error.message });
        row = data as Record<string, unknown>;
      } else {
        const { data, error } = await supabaseAdmin
          .from("workshop_quality_competency_assessments")
          .insert(payload)
          .select("*")
          .single();
        if (error) return res.status(500).json({ error: error.message });
        row = data as Record<string, unknown>;
      }

      if (row) {
        await supabaseAdmin.from("workshop_quality_competency_assessment_revisions").insert({
          workshop_id: WORKSHOP_ID,
          assessment_id: row.id,
          actor_user_id: actor.userId,
          actor_name: actor.name,
          previous_score: prevScore,
          next_score: score,
          previous_note: prevNote,
          next_note: payload.note,
        });
      }

      return res.json({
        assessment: {
          id: row?.id,
          competencyId: row?.competency_id,
          score: scoreOrUnrated(row?.score as number | null),
          note: row?.note ?? "",
          assessedAt: row?.assessed_at ?? null,
          assessedByName: row?.assessed_by_name ?? "",
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  // ---------- Nível de carreira da pessoa ----------
  app.get("/api/quality-career/person-summary", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      await ensureCatalogSeeded();
      const systemUserId =
        typeof req.query.systemUserId === "string" ? req.query.systemUserId.trim() : "";
      const technicianId =
        typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";
      const personName =
        typeof req.query.personName === "string" ? req.query.personName.trim() : "";

      const [{ data: competencies }, { data: levels }, { data: assessments }, careerRes, pdiRes] =
        await Promise.all([
          supabaseAdmin
            .from("workshop_quality_competencies")
            .select("id, code, name, kind, sort_order")
            .eq("workshop_id", WORKSHOP_ID)
            .eq("active", true)
            .order("sort_order"),
          supabaseAdmin
            .from("workshop_quality_career_levels")
            .select("id, code, name, description, sort_order")
            .eq("workshop_id", WORKSHOP_ID)
            .eq("active", true)
            .order("sort_order"),
          (async () => {
            let q = supabaseAdmin!
              .from("workshop_quality_competency_assessments")
              .select("*")
              .eq("workshop_id", WORKSHOP_ID);
            if (systemUserId) q = q.eq("system_user_id", systemUserId);
            else if (technicianId) q = q.eq("workshop_technician_id", technicianId);
            else return { data: [] as unknown[] };
            return q;
          })(),
          (async () => {
            let q = supabaseAdmin!
              .from("workshop_quality_person_career")
              .select("*")
              .eq("workshop_id", WORKSHOP_ID);
            if (systemUserId) q = q.eq("system_user_id", systemUserId);
            else if (technicianId) q = q.eq("workshop_technician_id", technicianId);
            else return { data: null };
            return q.maybeSingle();
          })(),
          (async () => {
            let q = supabaseAdmin!
              .from("workshop_quality_pdi_plans")
              .select("id, status, current_situation, target_date, owner_name, updated_at")
              .eq("workshop_id", WORKSHOP_ID)
              .in("status", ["draft", "active"])
              .order("updated_at", { ascending: false })
              .limit(1);
            if (systemUserId) q = q.eq("system_user_id", systemUserId);
            else if (technicianId) q = q.eq("workshop_technician_id", technicianId);
            else return { data: [] as unknown[] };
            return q;
          })(),
        ]);

      const { data: reqs } = await supabaseAdmin
        .from("workshop_quality_career_level_requirements")
        .select("career_level_id, competency_id, min_level")
        .eq("workshop_id", WORKSHOP_ID);

      const idToCode = new Map(
        (competencies ?? []).map((c) => [
          String((c as { id: string }).id),
          String((c as { code: string }).code),
        ])
      );
      const scoresByCode: Record<string, number | null> = {};
      const scoresById: Record<string, number | null> = {};
      for (const a of assessments ?? []) {
        const row = a as Record<string, unknown>;
        const cid = String(row.competency_id);
        const sc = scoreOrUnrated(row.score as number | null);
        scoresById[cid] = sc;
        const code = idToCode.get(cid);
        if (code) scoresByCode[code] = sc;
      }

      const levelReadiness = (levels ?? []).map((l) => {
        const row = l as Record<string, unknown>;
        const levelId = String(row.id);
        const levelReqs = (reqs ?? [])
          .filter((r) => String((r as { career_level_id: string }).career_level_id) === levelId)
          .map((r) => ({
            competencyCode: idToCode.get(String((r as { competency_id: string }).competency_id)) || "",
            minLevel: Number((r as { min_level: number }).min_level),
          }))
          .filter((r) => r.competencyCode);
        const readiness = readinessAgainstRequirements({
          requirements: levelReqs,
          scoresByCode,
        });
        return {
          id: levelId,
          code: row.code,
          name: row.name,
          description: row.description,
          sortOrder: row.sort_order,
          readiness,
        };
      });

      const mastered = (competencies ?? [])
        .filter((c) => {
          const id = String((c as { id: string }).id);
          const sc = scoresById[id];
          return sc != null && sc >= 4;
        })
        .map((c) => ({
          id: (c as { id: string }).id,
          name: (c as { name: string }).name,
          score: scoresById[String((c as { id: string }).id)],
        }));
      const developing = (competencies ?? [])
        .filter((c) => {
          const id = String((c as { id: string }).id);
          const sc = scoresById[id];
          return sc != null && sc >= 1 && sc <= 3;
        })
        .map((c) => ({
          id: (c as { id: string }).id,
          name: (c as { name: string }).name,
          score: scoresById[String((c as { id: string }).id)],
        }));
      const unrated = (competencies ?? [])
        .filter((c) => scoresById[String((c as { id: string }).id)] == null)
        .map((c) => ({
          id: (c as { id: string }).id,
          name: (c as { name: string }).name,
          score: null as null,
        }));

      return res.json({
        personName,
        systemUserId: systemUserId || null,
        workshopTechnicianId: technicianId || null,
        career: careerRes.data
          ? {
              careerLevelId: (careerRes.data as { career_level_id?: string }).career_level_id ?? null,
              notes: (careerRes.data as { notes?: string }).notes ?? "",
              assignedAt: (careerRes.data as { assigned_at?: string }).assigned_at ?? null,
              assignedByName: (careerRes.data as { assigned_by_name?: string }).assigned_by_name ?? "",
            }
          : null,
        assessments: (assessments ?? []).map((a) => {
          const row = a as Record<string, unknown>;
          return {
            competencyId: row.competency_id,
            score: scoreOrUnrated(row.score as number | null),
            note: row.note ?? "",
            assessedAt: row.assessed_at ?? null,
          };
        }),
        mastered,
        developing,
        unrated,
        levelReadiness,
        activePdi: (pdiRes.data ?? [])[0]
          ? {
              id: ((pdiRes.data as unknown[])[0] as { id: string }).id,
              status: ((pdiRes.data as unknown[])[0] as { status: string }).status,
              currentSituation: ((pdiRes.data as unknown[])[0] as { current_situation?: string })
                .current_situation,
              targetDate: ((pdiRes.data as unknown[])[0] as { target_date?: string }).target_date,
              ownerName: ((pdiRes.data as unknown[])[0] as { owner_name?: string }).owner_name,
            }
          : null,
        note: "Ausência de nota ≠ zero. Pronto para nível só com todos os requisitos avaliados e atingidos. Promoção é decisão humana.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] person-summary:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.put("/api/quality-career/person-level", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const b = (req.body || {}) as Record<string, unknown>;
      const personName = typeof b.personName === "string" ? b.personName.trim() : "";
      const careerLevelId =
        typeof b.careerLevelId === "string" && b.careerLevelId.trim()
          ? b.careerLevelId.trim()
          : null;
      const systemUserId =
        typeof b.systemUserId === "string" && b.systemUserId.trim()
          ? b.systemUserId.trim()
          : null;
      const workshopTechnicianId =
        typeof b.workshopTechnicianId === "string" && b.workshopTechnicianId.trim()
          ? b.workshopTechnicianId.trim()
          : null;
      if (!personName || (!systemUserId && !workshopTechnicianId)) {
        return res.status(400).json({ error: "Informe pessoa e identificador." });
      }
      const actor = await actorFromReq(req);
      const now = new Date().toISOString();
      const payload = {
        workshop_id: WORKSHOP_ID,
        system_user_id: systemUserId,
        workshop_technician_id: workshopTechnicianId,
        person_name: personName,
        career_level_id: careerLevelId,
        notes: typeof b.notes === "string" ? b.notes : "",
        assigned_by_user_id: actor.userId,
        assigned_by_name: actor.name,
        assigned_at: now,
        updated_at: now,
      };

      let q = supabaseAdmin
        .from("workshop_quality_person_career")
        .select("id")
        .eq("workshop_id", WORKSHOP_ID);
      if (systemUserId) q = q.eq("system_user_id", systemUserId);
      else q = q.eq("workshop_technician_id", workshopTechnicianId!).is("system_user_id", null);
      const { data: existing } = await q.maybeSingle();

      const result = existing
        ? await supabaseAdmin
            .from("workshop_quality_person_career")
            .update(payload)
            .eq("id", (existing as { id: string }).id)
            .select("*")
            .single()
        : await supabaseAdmin
            .from("workshop_quality_person_career")
            .insert(payload)
            .select("*")
            .single();

      if (result.error) {
        if (/does not exist|relation/i.test(result.error.message)) {
          return res.status(503).json({
            error: "Migration Fase 2 pendente.",
            code: "QUALITY_RADAR_PHASE2_MIGRATION_REQUIRED",
          });
        }
        return res.status(500).json({ error: result.error.message });
      }
      return res.json({ career: result.data, note: "Atribuição manual — sem promoção automática." });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  // ---------- PDI ----------
  app.get("/api/quality-career/pdi", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const systemUserId =
        typeof req.query.systemUserId === "string" ? req.query.systemUserId.trim() : "";
      const technicianId =
        typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";
      let q = supabaseAdmin
        .from("workshop_quality_pdi_plans")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("updated_at", { ascending: false });
      if (systemUserId) q = q.eq("system_user_id", systemUserId);
      if (technicianId) q = q.eq("workshop_technician_id", technicianId);
      const { data: plans, error } = await q;
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.json({ plans: [], code: "QUALITY_RADAR_PHASE2_MIGRATION_REQUIRED" });
        }
        return res.status(500).json({ error: error.message });
      }
      const planIds = (plans ?? []).map((p) => String((p as { id: string }).id));
      const { data: goals } = planIds.length
        ? await supabaseAdmin
            .from("workshop_quality_pdi_goals")
            .select("*")
            .eq("workshop_id", WORKSHOP_ID)
            .in("plan_id", planIds)
            .order("sort_order")
        : { data: [] };
      const goalsByPlan = new Map<string, unknown[]>();
      for (const g of goals ?? []) {
        const pid = String((g as { plan_id: string }).plan_id);
        const list = goalsByPlan.get(pid) || [];
        const row = g as Record<string, unknown>;
        list.push({
          id: row.id,
          title: row.title,
          description: row.description,
          competencyId: row.competency_id,
          trainingNeeded: row.training_needed,
          evidence: row.evidence,
          dueDate: row.due_date,
          status: row.status,
          progressNote: row.progress_note,
        });
        goalsByPlan.set(pid, list);
      }
      return res.json({
        plans: (plans ?? []).map((p) => {
          const row = p as Record<string, unknown>;
          return {
            id: row.id,
            personName: row.person_name,
            systemUserId: row.system_user_id,
            workshopTechnicianId: row.workshop_technician_id,
            currentSituation: row.current_situation,
            strengthsSummary: row.strengths_summary,
            developmentSummary: row.development_summary,
            ownerName: row.owner_name,
            targetDate: row.target_date,
            status: row.status,
            updatedAt: row.updated_at,
            goals: goalsByPlan.get(String(row.id)) || [],
          };
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/quality-career/pdi", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const b = (req.body || {}) as Record<string, unknown>;
      const personName = typeof b.personName === "string" ? b.personName.trim() : "";
      if (!personName) return res.status(400).json({ error: "personName obrigatório." });
      const actor = await actorFromReq(req);
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("workshop_quality_pdi_plans")
        .insert({
          workshop_id: WORKSHOP_ID,
          person_name: personName,
          system_user_id: typeof b.systemUserId === "string" ? b.systemUserId : null,
          workshop_technician_id:
            typeof b.workshopTechnicianId === "string" ? b.workshopTechnicianId : null,
          current_situation: typeof b.currentSituation === "string" ? b.currentSituation : "",
          strengths_summary: typeof b.strengthsSummary === "string" ? b.strengthsSummary : "",
          development_summary:
            typeof b.developmentSummary === "string" ? b.developmentSummary : "",
          owner_user_id: actor.userId,
          owner_name: actor.name || (typeof b.ownerName === "string" ? b.ownerName : ""),
          target_date: typeof b.targetDate === "string" ? b.targetDate : null,
          status: "active",
          created_by_user_id: actor.userId,
          created_by_name: actor.name,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error: "Migration Fase 2 pendente.",
            code: "QUALITY_RADAR_PHASE2_MIGRATION_REQUIRED",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      await supabaseAdmin.from("workshop_quality_pdi_revisions").insert({
        workshop_id: WORKSHOP_ID,
        plan_id: (data as { id: string }).id,
        actor_user_id: actor.userId,
        actor_name: actor.name,
        summary: "PDI criado",
        snapshot: data,
      });
      return res.status(201).json({ plan: data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/quality-career/pdi/:planId/goals", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const planId = String(req.params.planId || "").trim();
      const b = (req.body || {}) as Record<string, unknown>;
      const title = typeof b.title === "string" ? b.title.trim() : "";
      if (!title) return res.status(400).json({ error: "Título da meta obrigatório." });
      const { data, error } = await supabaseAdmin
        .from("workshop_quality_pdi_goals")
        .insert({
          workshop_id: WORKSHOP_ID,
          plan_id: planId,
          title,
          description: typeof b.description === "string" ? b.description : "",
          competency_id: typeof b.competencyId === "string" ? b.competencyId : null,
          training_needed: typeof b.trainingNeeded === "string" ? b.trainingNeeded : "",
          evidence: typeof b.evidence === "string" ? b.evidence : "",
          due_date: typeof b.dueDate === "string" ? b.dueDate : null,
          status: "open",
          progress_note: "",
        })
        .select("*")
        .single();
      if (error) return res.status(500).json({ error: error.message });
      const actor = await actorFromReq(req);
      await supabaseAdmin.from("workshop_quality_pdi_revisions").insert({
        workshop_id: WORKSHOP_ID,
        plan_id: planId,
        actor_user_id: actor.userId,
        actor_name: actor.name,
        summary: `Meta adicionada: ${title}`,
        snapshot: data,
      });
      return res.status(201).json({ goal: data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.patch("/api/quality-career/pdi/goals/:goalId", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const goalId = String(req.params.goalId || "").trim();
      const b = (req.body || {}) as Record<string, unknown>;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof b.status === "string") updates.status = b.status;
      if (typeof b.progressNote === "string") updates.progress_note = b.progressNote;
      if (typeof b.evidence === "string") updates.evidence = b.evidence;
      if (typeof b.trainingNeeded === "string") updates.training_needed = b.trainingNeeded;
      const { data, error } = await supabaseAdmin
        .from("workshop_quality_pdi_goals")
        .update(updates)
        .eq("id", goalId)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();
      if (error) return res.status(500).json({ error: error.message });
      const actor = await actorFromReq(req);
      await supabaseAdmin.from("workshop_quality_pdi_revisions").insert({
        workshop_id: WORKSHOP_ID,
        plan_id: (data as { plan_id: string }).plan_id,
        actor_user_id: actor.userId,
        actor_name: actor.name,
        summary: `Meta atualizada (${(data as { title?: string }).title || goalId})`,
        snapshot: data,
      });
      return res.json({ goal: data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  // ---------- Reuniões ----------
  app.get("/api/quality-meetings", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const systemUserId =
        typeof req.query.systemUserId === "string" ? req.query.systemUserId.trim() : "";
      const technicianId =
        typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";
      let q = supabaseAdmin
        .from("workshop_quality_meetings")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .is("deleted_at", null)
        .order("held_at", { ascending: false })
        .limit(200);
      if (systemUserId) q = q.eq("system_user_id", systemUserId);
      if (technicianId) q = q.eq("workshop_technician_id", technicianId);
      const { data, error } = await q;
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.json({ meetings: [], code: "QUALITY_RADAR_PHASE2_MIGRATION_REQUIRED" });
        }
        return res.status(500).json({ error: error.message });
      }
      const ids = (data ?? []).map((m) => String((m as { id: string }).id));
      const { data: commits } = ids.length
        ? await supabaseAdmin
            .from("workshop_quality_meeting_commitments")
            .select("*")
            .eq("workshop_id", WORKSHOP_ID)
            .in("meeting_id", ids)
        : { data: [] };
      const byMeeting = new Map<string, unknown[]>();
      for (const c of commits ?? []) {
        const mid = String((c as { meeting_id: string }).meeting_id);
        const list = byMeeting.get(mid) || [];
        const row = c as Record<string, unknown>;
        list.push({
          id: row.id,
          description: row.description,
          ownerName: row.owner_name,
          dueDate: row.due_date,
          status: row.status,
        });
        byMeeting.set(mid, list);
      }
      return res.json({
        meetings: (data ?? []).map((m) => {
          const row = m as Record<string, unknown>;
          return {
            id: row.id,
            kind: row.kind,
            title: row.title,
            agenda: row.agenda,
            observations: row.observations,
            outcomes: row.outcomes,
            personName: row.person_name,
            systemUserId: row.system_user_id,
            workshopTechnicianId: row.workshop_technician_id,
            participants: row.participants,
            heldAt: row.held_at,
            followUpAt: row.follow_up_at,
            employeeAckAt: row.employee_ack_at,
            employeeAckNote: row.employee_ack_note,
            registeredByName: row.registered_by_name,
            commitments: byMeeting.get(String(row.id)) || [],
          };
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/quality-meetings", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const b = (req.body || {}) as Record<string, unknown>;
      const personName = typeof b.personName === "string" ? b.personName.trim() : "";
      if (!personName) return res.status(400).json({ error: "personName obrigatório." });
      const kind =
        typeof b.kind === "string" &&
        ["individual", "feedback_positive", "feedback_corrective", "follow_up", "other"].includes(
          b.kind
        )
          ? b.kind
          : "individual";
      const actor = await actorFromReq(req);
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("workshop_quality_meetings")
        .insert({
          workshop_id: WORKSHOP_ID,
          kind,
          title: typeof b.title === "string" ? b.title.trim() : "",
          agenda: typeof b.agenda === "string" ? b.agenda : "",
          observations: typeof b.observations === "string" ? b.observations : "",
          outcomes: typeof b.outcomes === "string" ? b.outcomes : "",
          person_name: personName,
          system_user_id: typeof b.systemUserId === "string" ? b.systemUserId : null,
          workshop_technician_id:
            typeof b.workshopTechnicianId === "string" ? b.workshopTechnicianId : null,
          participants: typeof b.participants === "string" ? b.participants : "",
          held_at: typeof b.heldAt === "string" ? b.heldAt : now,
          follow_up_at: typeof b.followUpAt === "string" ? b.followUpAt : null,
          registered_by_user_id: actor.userId,
          registered_by_name: actor.name,
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error: "Migration Fase 2 pendente.",
            code: "QUALITY_RADAR_PHASE2_MIGRATION_REQUIRED",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      const meetingId = String((data as { id: string }).id);
      const commitments = Array.isArray(b.commitments) ? b.commitments : [];
      if (commitments.length) {
        await supabaseAdmin.from("workshop_quality_meeting_commitments").insert(
          commitments
            .map((c) => {
              const item = c as Record<string, unknown>;
              const description =
                typeof item.description === "string" ? item.description.trim() : "";
              if (!description) return null;
              return {
                workshop_id: WORKSHOP_ID,
                meeting_id: meetingId,
                description,
                owner_name: typeof item.ownerName === "string" ? item.ownerName : "",
                due_date: typeof item.dueDate === "string" ? item.dueDate : null,
                status: "open",
              };
            })
            .filter(Boolean)
        );
      }
      return res.status(201).json({ meeting: data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/quality-meetings/:id/ack", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const note =
        typeof (req.body as { note?: string })?.note === "string"
          ? String((req.body as { note?: string }).note)
          : "";
      const { data, error } = await supabaseAdmin
        .from("workshop_quality_meetings")
        .update({
          employee_ack_at: new Date().toISOString(),
          employee_ack_note: note,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();
      if (error) return res.status(500).json({ error: error.message });
      return res.json({
        meeting: data,
        note: "Ciência registrada — não implica concordância com a avaliação.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  // ---------- Apoio a decisões (consolidado, sem auto-promoção) ----------
  app.get("/api/quality-career/decision-insights", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      await ensureCatalogSeeded();
      const systemUserId =
        typeof req.query.systemUserId === "string" ? req.query.systemUserId.trim() : "";
      const technicianId =
        typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";

      // Reusa person-summary logic via internal fetch pattern — simplified signals
      const signals: string[] = [];
      let qAssess = supabaseAdmin
        .from("workshop_quality_competency_assessments")
        .select("score, competency_id")
        .eq("workshop_id", WORKSHOP_ID);
      if (systemUserId) qAssess = qAssess.eq("system_user_id", systemUserId);
      else if (technicianId) qAssess = qAssess.eq("workshop_technician_id", technicianId);
      const { data: assessments } = await qAssess;

      const scored = (assessments ?? []).filter((a) => (a as { score?: number | null }).score != null);
      const unratedGap =
        scored.length === 0
          ? "Ainda não há avaliações de competência — não há base para discussão de promoção."
          : null;
      if (unratedGap) signals.push(unratedGap);

      const low = scored.filter((a) => Number((a as { score: number }).score) <= 2);
      if (low.length >= 3) {
        signals.push(
          `${low.length} competências com nota ≤ 2 — considerar treinamento direcionado.`
        );
      }
      const high = scored.filter((a) => Number((a as { score: number }).score) >= 4);
      if (high.length >= 5) {
        signals.push(
          `${high.length} competências em nível avançado — possível preparação para ampliação de responsabilidades (decisão humana).`
        );
      }

      let qMeet = supabaseAdmin
        .from("workshop_quality_meetings")
        .select("id, kind, follow_up_at, held_at")
        .eq("workshop_id", WORKSHOP_ID)
        .is("deleted_at", null)
        .order("held_at", { ascending: false })
        .limit(20);
      if (systemUserId) qMeet = qMeet.eq("system_user_id", systemUserId);
      else if (technicianId) qMeet = qMeet.eq("workshop_technician_id", technicianId);
      const { data: meetings } = await qMeet;
      const overdueFollowUps = (meetings ?? []).filter((m) => {
        const fu = (m as { follow_up_at?: string | null }).follow_up_at;
        return fu && Date.parse(fu) < Date.now();
      });
      if (overdueFollowUps.length) {
        signals.push(
          `${overdueFollowUps.length} reunião(ões) com data de revisão vencida — reagendar acompanhamento.`
        );
      }

      return res.json({
        signals,
        disclaimer:
          "Sinais informativos para discussão da diretoria. Não geram promoção, remanejamento nem alteração salarial automática.",
        scoredCount: scored.length,
        meetingCount: (meetings ?? []).length,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });
}
