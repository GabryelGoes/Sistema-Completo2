/**
 * Consultas de dossiê profissional (Fase 3) — usadas por tools RDA e APIs do Radar.
 * Sempre filtra por workshop_id. Separa Pátio (vehicle) e Lab (module).
 * Ausência de registro ≠ nota zero / fato negativo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type PersonRef = {
  systemUserId?: string | null;
  workshopTechnicianId?: string | null;
  personName?: string | null;
};

export type DossierPeriod = { from: string; to: string };

function clampLimit(n: unknown, fallback: number, max = 50): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), max);
}

function normName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export async function resolvePersonIdentity(
  supabase: SupabaseClient,
  workshopId: string,
  ref: PersonRef
): Promise<{
  systemUserId: string | null;
  workshopTechnicianId: string | null;
  personName: string;
  displayNames: string[];
}> {
  let systemUserId = ref.systemUserId?.trim() || null;
  let workshopTechnicianId = ref.workshopTechnicianId?.trim() || null;
  let personName = (ref.personName || "").trim();
  const displayNames: string[] = [];

  if (systemUserId) {
    const { data } = await supabase
      .from("workshop_system_users")
      .select("id, display_name, username")
      .eq("workshop_id", workshopId)
      .eq("id", systemUserId)
      .maybeSingle();
    if (data) {
      const dn = String((data as { display_name?: string }).display_name || "").trim();
      const un = String((data as { username?: string }).username || "").trim();
      if (dn) displayNames.push(dn);
      if (un && un !== dn) displayNames.push(un);
      if (!personName) personName = dn || un;
    }
  }

  if (workshopTechnicianId) {
    const { data } = await supabase
      .from("workshop_technicians")
      .select("id, name")
      .eq("workshop_id", workshopId)
      .eq("id", workshopTechnicianId)
      .maybeSingle();
    if (data) {
      const n = String((data as { name?: string }).name || "").trim();
      if (n) {
        displayNames.push(n);
        if (!personName) personName = n;
      }
    }
  }

  if (!systemUserId && !workshopTechnicianId && personName) {
    const needle = normName(personName);
    const [{ data: users }, { data: techs }] = await Promise.all([
      supabase
        .from("workshop_system_users")
        .select("id, display_name, username")
        .eq("workshop_id", workshopId)
        .eq("is_technician", true),
      supabase.from("workshop_technicians").select("id, name").eq("workshop_id", workshopId),
    ]);
    const u = (users || []).find((row) => {
      const dn = normName(String((row as { display_name?: string }).display_name || ""));
      const un = normName(String((row as { username?: string }).username || ""));
      return dn === needle || un === needle || dn.includes(needle) || un.includes(needle);
    });
    if (u) {
      systemUserId = String((u as { id: string }).id);
      const dn = String((u as { display_name?: string }).display_name || "").trim();
      const un = String((u as { username?: string }).username || "").trim();
      if (dn) displayNames.push(dn);
      if (un) displayNames.push(un);
      personName = dn || un || personName;
    }
    const t = (techs || []).find((row) => {
      const n = normName(String((row as { name?: string }).name || ""));
      return n === needle || n.includes(needle);
    });
    if (t) {
      workshopTechnicianId = String((t as { id: string }).id);
      const n = String((t as { name?: string }).name || "").trim();
      if (n) {
        displayNames.push(n);
        if (!personName) personName = n;
      }
    }
  }

  return {
    systemUserId,
    workshopTechnicianId,
    personName: personName || displayNames[0] || "",
    displayNames: [...new Set(displayNames.filter(Boolean))],
  };
}

export async function fetchPersonProfileBundle(
  supabase: SupabaseClient,
  workshopId: string,
  ref: PersonRef,
  period?: DossierPeriod
) {
  const identity = await resolvePersonIdentity(supabase, workshopId, ref);
  const from = period?.from;
  const to = period?.to;

  const careerQ = async () => {
    let q = supabase
      .from("workshop_quality_person_career")
      .select("career_level_id, notes, assigned_at, assigned_by_name")
      .eq("workshop_id", workshopId);
    if (identity.systemUserId) q = q.eq("system_user_id", identity.systemUserId);
    else if (identity.workshopTechnicianId)
      q = q.eq("workshop_technician_id", identity.workshopTechnicianId);
    else return null;
    const { data } = await q.maybeSingle();
    if (!data) return null;
    const levelId = (data as { career_level_id?: string }).career_level_id;
    let levelName: string | null = null;
    if (levelId) {
      const { data: lvl } = await supabase
        .from("workshop_quality_career_levels")
        .select("code, name")
        .eq("id", levelId)
        .maybeSingle();
      levelName = lvl
        ? `${(lvl as { name: string }).name} (${(lvl as { code: string }).code})`
        : null;
    }
    return { ...data, levelName };
  };

  const assessmentsQ = async () => {
    let q = supabase
      .from("workshop_quality_competency_assessments")
      .select("competency_id, score, note, assessed_at, assessed_by_name")
      .eq("workshop_id", workshopId);
    if (identity.systemUserId) q = q.eq("system_user_id", identity.systemUserId);
    else if (identity.workshopTechnicianId)
      q = q.eq("workshop_technician_id", identity.workshopTechnicianId);
    else return [];
    const { data } = await q;
    return data || [];
  };

  const compsQ = async () => {
    const { data } = await supabase
      .from("workshop_quality_competencies")
      .select("id, code, name, kind")
      .eq("workshop_id", workshopId)
      .eq("active", true)
      .order("sort_order");
    return data || [];
  };

  const [career, assessments, competencies] = await Promise.all([
    careerQ(),
    assessmentsQ(),
    compsQ(),
  ]);

  type CompRow = { id: string; code?: string; name?: string; kind?: string };
  const byId = new Map(
    (competencies as CompRow[]).map((c) => [String(c.id), c])
  );
  const matrix = (assessments as Array<Record<string, unknown>>).map((a) => {
    const c = byId.get(String(a.competency_id));
    return {
      competencyId: a.competency_id,
      code: c?.code ?? null,
      name: c?.name ?? null,
      kind: c?.kind ?? null,
      // null = não avaliado (nunca interpretar como 0)
      score: a.score == null ? null : Number(a.score),
      note: a.note ?? "",
      assessedAt: a.assessed_at ?? null,
      assessedByName: a.assessed_by_name ?? "",
      provenance: "system_fact" as const,
    };
  });
  const unrated = (competencies as CompRow[]).filter(
    (c) => !matrix.some((m) => String(m.competencyId) === String(c.id))
  );

  return {
    identity,
    period: from && to ? { from, to } : null,
    career: career
      ? { ...career, provenance: "system_fact" as const }
      : { note: "Sem nível de carreira atribuído.", provenance: "unconfirmed" as const },
    competencyMatrix: {
      rated: matrix,
      unrated: unrated.map((c) => ({
        competencyId: c.id,
        code: c.code,
        name: c.name,
        score: null,
        note: "Sem avaliação registrada (não é zero).",
        provenance: "unconfirmed" as const,
      })),
    },
  };
}

export async function fetchRecognitions(
  supabase: SupabaseClient,
  workshopId: string,
  identity: Awaited<ReturnType<typeof resolvePersonIdentity>>,
  period: DossierPeriod | undefined,
  limit = 20
) {
  let q = supabase
    .from("workshop_technician_recognitions")
    .select(
      "id, category, title, description, service_order_label, occurred_at, registered_by_name, system_user_id, technician_id"
    )
    .eq("workshop_id", workshopId)
    .is("deleted_at", null)
    .order("occurred_at", { ascending: false })
    .limit(clampLimit(limit, 20));
  if (identity.systemUserId) q = q.eq("system_user_id", identity.systemUserId);
  else if (identity.workshopTechnicianId)
    q = q.eq("technician_id", identity.workshopTechnicianId);
  else if (identity.personName) q = q.ilike("person_name", `%${identity.personName}%`);
  else return { items: [], provenance: "unconfirmed" as const };
  if (period?.from) q = q.gte("occurred_at", period.from);
  if (period?.to) q = q.lte("occurred_at", `${period.to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) return { items: [], error: error.message, provenance: "unconfirmed" as const };
  return {
    items: (data || []).map((r) => ({ ...r, provenance: "system_fact" as const })),
    provenance: "system_fact" as const,
  };
}

export async function fetchIncidents(
  supabase: SupabaseClient,
  workshopId: string,
  identity: Awaited<ReturnType<typeof resolvePersonIdentity>>,
  period: DossierPeriod | undefined,
  limit = 20
) {
  let q = supabase
    .from("workshop_technician_incidents")
    .select(
      "id, title, description, category, severity, status, technician_id, technician_name, occurred_at, created_at, is_fault_attribution"
    )
    .eq("workshop_id", workshopId)
    .order("occurred_at", { ascending: false })
    .limit(clampLimit(limit, 20));
  // soft-delete se existir
  try {
    q = q.is("deleted_at", null);
  } catch {
    /* coluna ausente em ambientes legados */
  }
  if (identity.workshopTechnicianId) q = q.eq("technician_id", identity.workshopTechnicianId);
  else if (identity.personName) q = q.ilike("technician_name", `%${identity.personName}%`);
  else return { items: [], provenance: "unconfirmed" as const };
  if (period?.from) q = q.gte("occurred_at", period.from);
  if (period?.to) q = q.lte("occurred_at", `${period.to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) {
    // fallback sem deleted_at / is_fault
    let q2 = supabase
      .from("workshop_technician_incidents")
      .select(
        "id, title, description, category, severity, status, technician_id, technician_name, occurred_at, created_at"
      )
      .eq("workshop_id", workshopId)
      .order("occurred_at", { ascending: false })
      .limit(clampLimit(limit, 20));
    if (identity.workshopTechnicianId)
      q2 = q2.eq("technician_id", identity.workshopTechnicianId);
    else if (identity.personName)
      q2 = q2.ilike("technician_name", `%${identity.personName}%`);
    if (period?.from) q2 = q2.gte("occurred_at", period.from);
    if (period?.to) q2 = q2.lte("occurred_at", `${period.to}T23:59:59.999Z`);
    const retry = await q2;
    if (retry.error)
      return { items: [], error: retry.error.message, provenance: "unconfirmed" as const };
    return {
      items: (retry.data || []).map((r) => ({ ...r, provenance: "system_fact" as const })),
      provenance: "system_fact" as const,
      note: error.message,
    };
  }
  return {
    items: (data || []).map((r) => ({ ...r, provenance: "system_fact" as const })),
    provenance: "system_fact" as const,
  };
}

export async function fetchServiceHistorySplit(
  supabase: SupabaseClient,
  workshopId: string,
  identity: Awaited<ReturnType<typeof resolvePersonIdentity>>,
  period: DossierPeriod | undefined,
  limit = 15
) {
  const names = identity.displayNames.length
    ? identity.displayNames
    : identity.personName
      ? [identity.personName]
      : [];
  if (!names.length && !identity.systemUserId) {
    return {
      patio: [],
      laboratorio: [],
      note: "Sem identidade para localizar serviços.",
      provenance: "unconfirmed" as const,
    };
  }

  let q = supabase
    .from("service_orders")
    .select(
      "id, os_number, plate, vehicle_model, status, issue_description, assigned_technician, created_at, updated_at, order_type, module_identification"
    )
    .eq("workshop_id", workshopId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (period?.from) q = q.gte("updated_at", period.from);
  if (period?.to) q = q.lte("updated_at", `${period.to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) return { patio: [], laboratorio: [], error: error.message, provenance: "unconfirmed" as const };

  const needles = names.map(normName);
  const matched = (data || []).filter((row) => {
    const at = normName(String((row as { assigned_technician?: string }).assigned_technician || ""));
    return needles.some((n) => at === n || at.includes(n) || n.includes(at));
  });

  const patio = matched
    .filter((r) => String((r as { order_type?: string }).order_type || "") === "vehicle")
    .slice(0, clampLimit(limit, 15))
    .map((r) => ({
      ...r,
      sector: "patio" as const,
      order_type: "vehicle",
      provenance: "system_fact" as const,
    }));
  const laboratorio = matched
    .filter((r) => String((r as { order_type?: string }).order_type || "") === "module")
    .slice(0, clampLimit(limit, 15))
    .map((r) => ({
      ...r,
      sector: "laboratorio" as const,
      order_type: "module",
      provenance: "system_fact" as const,
    }));

  return {
    patio,
    laboratorio,
    note: "Pátio (vehicle) e Laboratório (module) listados separadamente.",
    provenance: "system_fact" as const,
  };
}

export async function fetchWorkTimes(
  supabase: SupabaseClient,
  workshopId: string,
  identity: Awaited<ReturnType<typeof resolvePersonIdentity>>,
  period: DossierPeriod | undefined
) {
  if (!identity.systemUserId) {
    return {
      sessions: [],
      totals: null,
      note: "Tempos produtivos exigem system_user_id do mecânico.",
      provenance: "unconfirmed" as const,
    };
  }
  const from = period?.from || new Date(Date.now() - 7 * 86400000).toISOString();
  const to = period?.to ? `${period.to}T23:59:59.999Z` : new Date().toISOString();
  const { data, error } = await supabase
    .from("rda_work_sessions")
    .select(
      "id, service_order_id, status, started_at, ended_at, productive_ms, paused_ms, budget_service_description, order_type"
    )
    .eq("workshop_id", workshopId)
    .eq("technician_user_id", identity.systemUserId)
    .gte("started_at", from)
    .lte("started_at", to)
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) return { sessions: [], error: error.message, provenance: "unconfirmed" as const };

  let productiveMs = 0;
  let pausedMs = 0;
  const patio: unknown[] = [];
  const laboratorio: unknown[] = [];
  const unknown: unknown[] = [];
  for (const row of data || []) {
    productiveMs += Number((row as { productive_ms?: number }).productive_ms || 0);
    pausedMs += Number((row as { paused_ms?: number }).paused_ms || 0);
    const ot = String((row as { order_type?: string }).order_type || "");
    const enriched = { ...row, provenance: "system_fact" as const };
    if (ot === "vehicle") patio.push(enriched);
    else if (ot === "module") laboratorio.push(enriched);
    else unknown.push(enriched);
  }
  return {
    from,
    to,
    totals: { productiveMs, pausedMs, sessions: (data || []).length },
    bySector: { patio, laboratorio, unknown },
    provenance: "system_fact" as const,
  };
}

export async function fetchPdiAndMeetings(
  supabase: SupabaseClient,
  workshopId: string,
  identity: Awaited<ReturnType<typeof resolvePersonIdentity>>,
  period: DossierPeriod | undefined
) {
  let pdiQ = supabase
    .from("workshop_quality_pdi_plans")
    .select(
      "id, status, current_situation, strengths_summary, development_summary, owner_name, target_date, updated_at"
    )
    .eq("workshop_id", workshopId)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (identity.systemUserId) pdiQ = pdiQ.eq("system_user_id", identity.systemUserId);
  else if (identity.workshopTechnicianId)
    pdiQ = pdiQ.eq("workshop_technician_id", identity.workshopTechnicianId);

  let meetingsQ = supabase
    .from("workshop_quality_meetings")
    .select(
      "id, kind, title, agenda, observations, outcomes, held_at, follow_up_at, employee_ack_at, participants"
    )
    .eq("workshop_id", workshopId)
    .is("deleted_at", null)
    .order("held_at", { ascending: false })
    .limit(20);
  if (identity.systemUserId) meetingsQ = meetingsQ.eq("system_user_id", identity.systemUserId);
  else if (identity.workshopTechnicianId)
    meetingsQ = meetingsQ.eq("workshop_technician_id", identity.workshopTechnicianId);
  if (period?.from) meetingsQ = meetingsQ.gte("held_at", period.from);
  if (period?.to) meetingsQ = meetingsQ.lte("held_at", `${period.to}T23:59:59.999Z`);

  const [pdiRes, meetingsRes] = await Promise.all([pdiQ, meetingsQ]);
  const plans = pdiRes.data || [];
  const goalsByPlan: Record<string, unknown[]> = {};
  for (const p of plans) {
    const { data: goals } = await supabase
      .from("workshop_quality_pdi_goals")
      .select(
        "id, title, description, training_needed, evidence, due_date, status, progress_note, competency_id"
      )
      .eq("plan_id", (p as { id: string }).id)
      .order("sort_order");
    goalsByPlan[String((p as { id: string }).id)] = goals || [];
  }

  return {
    pdi: plans.map((p) => ({
      ...p,
      goals: goalsByPlan[String((p as { id: string }).id)] || [],
      provenance: "system_fact" as const,
    })),
    meetings: (meetingsRes.data || []).map((m) => ({
      ...m,
      provenance: "system_fact" as const,
    })),
    errors: {
      pdi: pdiRes.error?.message || null,
      meetings: meetingsRes.error?.message || null,
    },
  };
}

export async function fetchManagerialEvaluations(
  supabase: SupabaseClient,
  workshopId: string,
  identity: Awaited<ReturnType<typeof resolvePersonIdentity>>,
  period: DossierPeriod | undefined,
  limit = 20
) {
  if (!identity.systemUserId) {
    return {
      items: [],
      note: "Avaliações RDA exigem system_user_id.",
      provenance: "unconfirmed" as const,
    };
  }
  let q = supabase
    .from("rda_eval_requests")
    .select(
      "id, status, service_order_id, technician_user_id, session_ended_at, created_at, deferred_until"
    )
    .eq("workshop_id", workshopId)
    .eq("technician_user_id", identity.systemUserId)
    .order("created_at", { ascending: false })
    .limit(clampLimit(limit, 20));
  if (period?.from) q = q.gte("created_at", period.from);
  if (period?.to) q = q.lte("created_at", `${period.to}T23:59:59.999Z`);
  const { data, error } = await q;
  if (error) return { items: [], error: error.message, provenance: "unconfirmed" as const };
  return {
    items: (data || []).map((r) => ({ ...r, provenance: "system_fact" as const })),
    provenance: "system_fact" as const,
  };
}

export async function fetchPriorWeeklyReviews(
  supabase: SupabaseClient,
  workshopId: string,
  identity: Awaited<ReturnType<typeof resolvePersonIdentity>>,
  limit = 8
) {
  let q = supabase
    .from("workshop_quality_weekly_reviews")
    .select(
      "id, scope, person_name, week_from, week_to, status, progress_pct, topics_covered, updated_at, created_at"
    )
    .eq("workshop_id", workshopId)
    .order("week_from", { ascending: false })
    .limit(clampLimit(limit, 8));
  if (identity.systemUserId) q = q.eq("system_user_id", identity.systemUserId);
  else if (identity.workshopTechnicianId)
    q = q.eq("workshop_technician_id", identity.workshopTechnicianId);
  else if (identity.personName) q = q.ilike("person_name", `%${identity.personName}%`);
  else return { reviews: [], provenance: "unconfirmed" as const };

  const { data, error } = await q;
  if (error) return { reviews: [], error: error.message, provenance: "unconfirmed" as const };

  const reviews = [];
  for (const r of data || []) {
    const { data: drafts } = await supabase
      .from("workshop_quality_weekly_review_drafts")
      .select(
        "id, version, status, week_summary, strengths, difficulties, observed_skills, evolution, recommended_actions, proposed_goals, follow_ups, decided_at, decided_by_name"
      )
      .eq("review_id", (r as { id: string }).id)
      .order("version", { ascending: false })
      .limit(1);
    reviews.push({
      ...r,
      latestDraft: drafts?.[0] || null,
      provenance: "system_fact" as const,
    });
  }
  return { reviews, provenance: "system_fact" as const };
}

/** Monta pacote de lacunas para a entrevista. */
export function detectIncompleteSignals(input: {
  matrixUnratedCount: number;
  servicesPatio: number;
  servicesLab: number;
  recognitions: number;
  incidents: number;
  meetings: number;
  hasCareerLevel: boolean;
  hasPdi: boolean;
  workSessions: number;
}): string[] {
  const gaps: string[] = [];
  if (input.matrixUnratedCount > 0)
    gaps.push(`${input.matrixUnratedCount} competências sem avaliação (não é zero).`);
  if (!input.hasCareerLevel) gaps.push("Nível de carreira não atribuído.");
  if (!input.hasPdi) gaps.push("Sem PDI ativo.");
  if (input.servicesPatio + input.servicesLab === 0)
    gaps.push("Nenhum serviço apontado no período (Pátio/Lab).");
  if (input.workSessions === 0) gaps.push("Sem sessões de tempo no período.");
  if (input.recognitions === 0) gaps.push("Sem reconhecimentos no período.");
  if (input.meetings === 0) gaps.push("Sem reuniões/feedbacks recentes.");
  if (input.incidents === 0) gaps.push("Sem ocorrências no período (pode ser positivo ou lacuna de registro).");
  return gaps;
}
