/**
 * Preparação do ciclo semanal — SEM LLM, sem auto-nota.
 * Idempotente por (workshop_id, week_from, week_to) e por pessoa no ciclo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
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
  buildUnavailableFields,
  msToHours,
  weekBoundsInTimeZone,
  type PersonReportBody,
  type PersonReportIndicators,
  EMPTY_ACTION,
  EMPTY_ANALYSIS,
  EMPTY_CONCLUSION,
} from "./weeklyCycleDefaults.js";

export type PrepareWeeklyCycleInput = {
  workshopId: string;
  supabase: SupabaseClient;
  triggerSource: "cron" | "manual" | "vercel" | "pg_cron";
  timezone?: string;
  weekFrom?: string;
  weekTo?: string;
  force?: boolean; // ignora janela; ainda idempotente
  notify?: boolean;
};

export type PrepareWeeklyCycleResult = {
  ok: boolean;
  skipped: boolean;
  skipReason?: string;
  cycleId?: string;
  weekFrom?: string;
  weekTo?: string;
  personsPrepared: number;
  personsExisting: number;
  notified: boolean;
  cronRunId?: string;
  error?: string;
};

type ActivePerson = {
  systemUserId: string | null;
  workshopTechnicianId: string | null;
  personName: string;
  jobTitle: string;
};

async function listActivePeople(
  supabase: SupabaseClient,
  workshopId: string
): Promise<ActivePerson[]> {
  const { loadWorkshopPeople, peopleEligibleForWeeklyCycle } = await import(
    "./loadWorkshopPeople.js"
  );
  const loaded = await loadWorkshopPeople(supabase, workshopId);
  if (!loaded.ok) {
    console.error("[prepareWeeklyCycle] falha ao listar pessoas:", loaded.fatalError, loaded.queryErrors);
    return [];
  }
  if (loaded.queryErrors.technicians || loaded.queryErrors.systemUsers) {
    console.warn("[prepareWeeklyCycle] query parcial:", loaded.queryErrors);
  }
  return peopleEligibleForWeeklyCycle(loaded.people).map((p) => ({
    systemUserId: p.systemUserId,
    workshopTechnicianId: p.workshopTechnicianId,
    personName: p.name.startsWith("(sem nome") ? "Técnico" : p.name,
    jobTitle: p.jobTitle?.trim() || p.professionalRole || "Mecânico",
  }));
}

async function buildPreliminaryForPerson(
  supabase: SupabaseClient,
  workshopId: string,
  person: ActivePerson,
  weekFrom: string,
  weekTo: string
): Promise<{
  indicators: PersonReportIndicators;
  incompleteSignals: string[];
  preliminary: Record<string, unknown>;
  unavailableFields: string[];
}> {
  const identity = await resolvePersonIdentity(supabase, workshopId, {
    systemUserId: person.systemUserId,
    workshopTechnicianId: person.workshopTechnicianId,
    personName: person.personName,
  });
  const period = { from: weekFrom, to: weekTo };
  const [profile, services, times, recog, incidents, careerPdi, evals, prior] = await Promise.all([
    fetchPersonProfileBundle(supabase, workshopId, identity, period),
    fetchServiceHistorySplit(supabase, workshopId, identity, period, 20),
    fetchWorkTimes(supabase, workshopId, identity, period),
    fetchRecognitions(supabase, workshopId, identity, period, 20),
    fetchIncidents(supabase, workshopId, identity, period, 20),
    fetchPdiAndMeetings(supabase, workshopId, identity, period),
    fetchManagerialEvaluations(supabase, workshopId, identity, period, 20),
    fetchPriorWeeklyReviews(supabase, workshopId, identity, 4),
  ]);

  const productiveMs = times.totals?.productiveMs;
  const pausedMs = times.totals?.pausedMs;
  const goalsDone = (careerPdi.pdi || []).reduce((acc, p) => {
    const goals = (p as { goals?: Array<{ status?: string }> }).goals || [];
    return acc + goals.filter((g) => g.status === "done").length;
  }, 0);

  const reworkHint = (incidents.items || []).filter((i) => {
    const blob = `${(i as { category?: string }).category || ""} ${(i as { title?: string }).title || ""} ${(i as { description?: string }).description || ""}`.toLowerCase();
    return /retrabalho|garantia|refazer|retorno/.test(blob);
  }).length;

  const indicators: PersonReportIndicators = {
    servicesPatio: services.patio?.length ?? null,
    servicesLab: services.laboratorio?.length ?? null,
    productiveHours: msToHours(productiveMs ?? null),
    pausedHours: msToHours(pausedMs ?? null),
    evaluationsCount: evals.items?.length ?? null,
    occurrencesCount: incidents.items?.length ?? null,
    reworkHintCount: incidents.items ? reworkHint : null,
    recognitionsCount: recog.items?.length ?? null,
    goalsDoneCount: careerPdi.pdi ? goalsDone : null,
    meetingsCount: careerPdi.meetings?.length ?? null,
  };

  const incompleteSignals = detectIncompleteSignals({
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

  const unavailableFields = [
    ...buildUnavailableFields(indicators),
    ...incompleteSignals.map((s) => `Lacuna: ${s}`),
  ];

  return {
    indicators,
    incompleteSignals,
    unavailableFields,
    preliminary: {
      note: "Resumo preliminar automático — sem notas atribuídas. Ausência ≠ desempenho ruim.",
      identity,
      indicators,
      incompleteSignals,
      servicesSummary: {
        patioCount: services.patio?.length || 0,
        labCount: services.laboratorio?.length || 0,
      },
      priorReviewCount: prior.reviews?.length || 0,
      careerLevel:
        profile.career && "levelName" in (profile.career as object)
          ? (profile.career as { levelName?: string | null }).levelName
          : null,
    },
  };
}

export function draftBodyFromPreliminary(input: {
  personName: string;
  jobTitle: string;
  weekFrom: string;
  weekTo: string;
  leaderName: string;
  indicators: PersonReportIndicators;
  unavailableFields: string[];
  incompleteSignals: string[];
}): PersonReportBody {
  const hasAny =
    (input.indicators.servicesPatio || 0) +
      (input.indicators.servicesLab || 0) +
      (input.indicators.evaluationsCount || 0) +
      (input.indicators.recognitionsCount || 0) >
    0;

  return {
    header: {
      personName: input.personName,
      jobTitle: input.jobTitle,
      periodFrom: input.weekFrom,
      periodTo: input.weekTo,
      leaderName: input.leaderName,
      elaboratedAt: new Date().toISOString(),
    },
    indicators: input.indicators,
    analysis: {
      ...EMPTY_ANALYSIS,
      overall: hasAny
        ? "Preliminar com base em registros do sistema. Aguardando entrevista com o líder."
        : "Poucos ou nenhum registro objetivo na semana. Não interpretar como desempenho ruim — aguardar entrevista.",
    },
    actionPlan: { ...EMPTY_ACTION },
    conclusion: {
      ...EMPTY_CONCLUSION,
      periodSynthesis: input.incompleteSignals.length
        ? `Informações incompletas: ${input.incompleteSignals.slice(0, 3).join("; ")}`
        : "",
    },
    unavailableFields: input.unavailableFields,
  };
}

export async function prepareWeeklyCycle(
  input: PrepareWeeklyCycleInput
): Promise<PrepareWeeklyCycleResult> {
  const { workshopId, supabase, triggerSource } = input;
  const timezone = input.timezone || "America/Sao_Paulo";
  const bounds =
    input.weekFrom && input.weekTo
      ? { weekFrom: input.weekFrom, weekTo: input.weekTo }
      : weekBoundsInTimeZone(new Date(), timezone);

  const { data: cronRun, error: cronInsErr } = await supabase
    .from("workshop_quality_weekly_cron_runs")
    .insert({
      workshop_id: workshopId,
      trigger_source: triggerSource,
      started_at: new Date().toISOString(),
      detail_json: { weekFrom: bounds.weekFrom, weekTo: bounds.weekTo, timezone },
    })
    .select("id")
    .single();
  if (cronInsErr) {
    // tabela pode não existir ainda
    if (/does not exist|schema cache/i.test(cronInsErr.message)) {
      return {
        ok: false,
        skipped: true,
        skipReason: "Migration Fase 4 pendente.",
        personsPrepared: 0,
        personsExisting: 0,
        notified: false,
        error: cronInsErr.message,
      };
    }
  }
  const cronRunId = cronRun ? String((cronRun as { id: string }).id) : undefined;

  try {
    // Upsert ciclo (idempotente)
    const { data: existingCycle } = await supabase
      .from("workshop_quality_weekly_cycles")
      .select("*")
      .eq("workshop_id", workshopId)
      .eq("week_from", bounds.weekFrom)
      .eq("week_to", bounds.weekTo)
      .maybeSingle();

    let cycleId: string;
    let cycleCreated = false;
    if (existingCycle) {
      cycleId = String((existingCycle as { id: string }).id);
      if (!input.force && (existingCycle as { prepared_at?: string }).prepared_at) {
        // Já preparado — ainda pode completar pessoas faltantes
      }
    } else {
      const { data: created, error } = await supabase
        .from("workshop_quality_weekly_cycles")
        .insert({
          workshop_id: workshopId,
          week_from: bounds.weekFrom,
          week_to: bounds.weekTo,
          timezone,
          status: "pending",
          prepared_by: triggerSource === "manual" ? "manual" : "cron",
        })
        .select("id")
        .single();
      if (error) {
        // race: unique violation → refetch
        const { data: again } = await supabase
          .from("workshop_quality_weekly_cycles")
          .select("id")
          .eq("workshop_id", workshopId)
          .eq("week_from", bounds.weekFrom)
          .eq("week_to", bounds.weekTo)
          .maybeSingle();
        if (!again) throw new Error(error.message);
        cycleId = String((again as { id: string }).id);
      } else {
        cycleId = String((created as { id: string }).id);
        cycleCreated = true;
      }
    }

    const people = await listActivePeople(supabase, workshopId);
    const { data: existingReports } = await supabase
      .from("workshop_quality_weekly_person_reports")
      .select("id, system_user_id, workshop_technician_id")
      .eq("cycle_id", cycleId);

    const existingKeys = new Set<string>();
    for (const r of existingReports || []) {
      const su = (r as { system_user_id?: string | null }).system_user_id;
      const wt = (r as { workshop_technician_id?: string | null }).workshop_technician_id;
      if (su) existingKeys.add(`su:${su}`);
      else if (wt) existingKeys.add(`wt:${wt}`);
    }

    let prepared = 0;
    let existing = existingKeys.size;

    for (const person of people) {
      const key = person.systemUserId
        ? `su:${person.systemUserId}`
        : `wt:${person.workshopTechnicianId}`;
      if (existingKeys.has(key)) continue;

      const built = await buildPreliminaryForPerson(
        supabase,
        workshopId,
        person,
        bounds.weekFrom,
        bounds.weekTo
      );

      // Cria revisão Fase 3 vinculada (pendente) — sem chat LLM
      let weeklyReviewId: string | null = null;
      const { data: review, error: revErr } = await supabase
        .from("workshop_quality_weekly_reviews")
        .insert({
          workshop_id: workshopId,
          scope: "person",
          system_user_id: person.systemUserId,
          workshop_technician_id: person.workshopTechnicianId,
          person_name: person.personName,
          week_from: bounds.weekFrom,
          week_to: bounds.weekTo,
          status: "in_progress",
          topics_covered: [],
          incomplete_signals: built.incompleteSignals,
          progress_pct: 0,
          opened_by_name: "Sistema (ciclo semanal)",
        })
        .select("id")
        .single();
      if (!revErr && review) weeklyReviewId = String((review as { id: string }).id);

      const draftBody = draftBodyFromPreliminary({
        personName: person.personName,
        jobTitle: person.jobTitle,
        weekFrom: bounds.weekFrom,
        weekTo: bounds.weekTo,
        leaderName: "",
        indicators: built.indicators,
        unavailableFields: built.unavailableFields,
        incompleteSignals: built.incompleteSignals,
      });

      const { data: report, error: repErr } = await supabase
        .from("workshop_quality_weekly_person_reports")
        .insert({
          workshop_id: workshopId,
          cycle_id: cycleId,
          system_user_id: person.systemUserId,
          workshop_technician_id: person.workshopTechnicianId,
          person_name: person.personName,
          job_title: person.jobTitle,
          status: "pending",
          weekly_review_id: weeklyReviewId,
          current_version: 1,
          preliminary_json: built.preliminary,
          incomplete_signals: built.incompleteSignals,
        })
        .select("id")
        .single();

      if (repErr) {
        // duplicata por corrida
        if (/duplicate|unique/i.test(repErr.message)) {
          existing += 1;
          continue;
        }
        throw new Error(repErr.message);
      }

      await supabase.from("workshop_quality_weekly_person_report_versions").insert({
        workshop_id: workshopId,
        report_id: (report as { id: string }).id,
        version: 1,
        status: "draft",
        header_json: draftBody.header,
        indicators_json: draftBody.indicators,
        analysis_json: draftBody.analysis,
        action_plan_json: draftBody.actionPlan,
        conclusion_json: draftBody.conclusion,
        unavailable_fields: draftBody.unavailableFields,
        source_refs: [{ kind: "system_prepare", cycleId }],
        created_by_name: "Sistema",
        change_summary: "Versão preliminar automática (sem notas).",
      });

      prepared += 1;
      existingKeys.add(key);
    }

    const personCount = existingKeys.size;
    await supabase
      .from("workshop_quality_weekly_cycles")
      .update({
        prepared_at: new Date().toISOString(),
        prepared_by: triggerSource === "manual" ? "manual" : "cron",
        person_count: personCount,
        status: "in_progress",
        updated_at: new Date().toISOString(),
      })
      .eq("id", cycleId);

    // Team report shell
    await supabase.from("workshop_quality_weekly_team_reports").upsert(
      {
        workshop_id: workshopId,
        cycle_id: cycleId,
        status: "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "workshop_id,cycle_id" }
    );

    let notified = false;
    if (input.notify !== false) {
      const alertKey = `quality_weekly_cycle:${bounds.weekFrom}:${bounds.weekTo}`;
      const { data: existingNotif } = await supabase
        .from("rda_management_alerts")
        .select("id, dismissed_at")
        .eq("workshop_id", workshopId)
        .eq("alert_key", alertKey)
        .maybeSingle();
      const alreadyOpen =
        existingNotif && !(existingNotif as { dismissed_at?: string | null }).dismissed_at;
      if (!alreadyOpen || cycleCreated) {
        const title = "Revisão semanal pronta para iniciar";
        const body = `Ciclo ${bounds.weekFrom} → ${bounds.weekTo}: ${prepared} preparação(ões) nova(s), ${personCount} pessoa(s) no total. Abra o Radar → Relatórios / Revisão Semanal. Sem notas automáticas.`;
        const { data: notif } = await supabase
          .from("notifications")
          .insert({
            workshop_id: workshopId,
            type: "quality_weekly_cycle_ready",
            payload: {
              title,
              body,
              alertKey,
              cycleId,
              weekFrom: bounds.weekFrom,
              weekTo: bounds.weekTo,
              severity: "info",
            },
            target_type: "admin",
            target_slug: null,
          })
          .select("id")
          .maybeSingle();
        await supabase.from("rda_management_alerts").upsert(
          {
            workshop_id: workshopId,
            alert_key: alertKey,
            severity: "info",
            title,
            body,
            payload: { cycleId, weekFrom: bounds.weekFrom, weekTo: bounds.weekTo },
            notification_id: (notif as { id?: string } | null)?.id || null,
            dismissed_at: null,
            created_at: new Date().toISOString(),
          },
          { onConflict: "workshop_id,alert_key" }
        );
        await supabase
          .from("workshop_quality_weekly_cycles")
          .update({ notify_sent_at: new Date().toISOString() })
          .eq("id", cycleId);
        notified = true;
      }
    }

    if (cronRunId) {
      await supabase
        .from("workshop_quality_weekly_cron_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: true,
          skipped: false,
          cycle_id: cycleId,
          persons_prepared: prepared,
          detail_json: {
            weekFrom: bounds.weekFrom,
            weekTo: bounds.weekTo,
            personsExisting: existing,
            personsPrepared: prepared,
            notified,
          },
        })
        .eq("id", cronRunId);
    }

    return {
      ok: true,
      skipped: false,
      cycleId,
      weekFrom: bounds.weekFrom,
      weekTo: bounds.weekTo,
      personsPrepared: prepared,
      personsExisting: existing,
      notified,
      cronRunId,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Erro na preparação";
    if (cronRunId) {
      await supabase
        .from("workshop_quality_weekly_cron_runs")
        .update({
          finished_at: new Date().toISOString(),
          ok: false,
          error_message: message,
        })
        .eq("id", cronRunId);
    }
    return {
      ok: false,
      skipped: false,
      personsPrepared: 0,
      personsExisting: 0,
      notified: false,
      cronRunId,
      error: message,
    };
  }
}
