/**
 * Selftest Fase 3 — Revisão Semanal / classificação / tools Radar.
 * npm run test:quality-radar-phase3
 */
import {
  computeInterviewProgress,
  defaultWeekBounds,
  draftFieldsFromUnknown,
  inferCoveredTopicsFromText,
  isReviewObservationClassification,
  promoteClassification,
  INTERVIEW_TOPICS,
} from "../services/qualityRadar/weeklyReviewDefaults.js";
import { detectIncompleteSignals } from "../services/qualityRadar/personDossier.js";
import { canAccessQualityRadar } from "../services/qualityRadar/access.js";
import {
  ensureProductionRdaToolsRegistered,
  productionRdaToolRegistry,
  authorizeToolInvocation,
} from "../services/rdaIntelligence/index.js";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

console.log("Quality Radar phase 3 (weekly review / RDA) selftest\n");

console.log("1) Classificação fatos vs percepções");
assert(isReviewObservationClassification("system_fact"), "system_fact válido");
assert(isReviewObservationClassification("leader_observation"), "leader_observation válido");
assert(isReviewObservationClassification("ai_suggestion"), "ai_suggestion válido");
assert(isReviewObservationClassification("unconfirmed"), "unconfirmed válido");
assert(!isReviewObservationClassification("fato"), "rótulo livre inválido");
assert(
  promoteClassification("ai_suggestion", "system_fact") === null,
  "IA não promove sugestão a fato"
);
assert(
  promoteClassification("unconfirmed", "leader_observation") === "leader_observation",
  "líder pode confirmar observação"
);
assert(
  promoteClassification("leader_observation", "system_fact") === null,
  "observação do líder ≠ fato do sistema"
);

console.log("\n2) Progresso da entrevista");
{
  const empty = computeInterviewProgress([]);
  assert(empty.progressPct === 0, "0% sem temas");
  assert(empty.remaining.length === INTERVIEW_TOPICS.length, "todos restantes");
  const halfIds = INTERVIEW_TOPICS.slice(0, 5).map((t) => t.id);
  const half = computeInterviewProgress(halfIds);
  assert(half.covered.length === 5, "5 cobertos");
  assert(half.progressPct > 0 && half.progressPct < 100, "progresso parcial");
}

console.log("\n3) Heurística de temas a partir do texto do líder");
{
  const topics = inferCoveredTopicsFromText([
    "Ele trabalhou bem. Resolveu um defeito complicado, mas precisa melhorar a organização. Precisou de ajuda no começo.",
  ]);
  assert(topics.includes("organizacao"), "detecta organização");
  assert(
    topics.includes("necessidade_ajuda") || topics.includes("problemas_dificeis"),
    "detecta ajuda/difícil"
  );
}

console.log("\n4) Lacunas / ausência ≠ fato negativo");
{
  const gaps = detectIncompleteSignals({
    matrixUnratedCount: 3,
    servicesPatio: 0,
    servicesLab: 0,
    recognitions: 0,
    incidents: 0,
    meetings: 0,
    hasCareerLevel: false,
    hasPdi: false,
    workSessions: 0,
  });
  assert(gaps.some((g) => /sem avaliação/i.test(g)), "sinaliza competências sem nota");
  assert(gaps.some((g) => /serviço/i.test(g)), "sinaliza falta de serviços");
  assert(
    gaps.every((g) => !/\bzero\b/i.test(g) || /não é zero/i.test(g)),
    "não trata ausência como zero punitivo"
  );
}

console.log("\n5) Draft fields + semana padrão");
{
  const d = draftFieldsFromUnknown({
    week_summary: "Ok",
    strengths: "Diagnóstico",
    observed_skills: "Scanner",
  });
  assert(d.weekSummary === "Ok", "week_summary → weekSummary");
  assert(d.observedSkills === "Scanner", "observed_skills");
  const w = defaultWeekBounds(new Date("2026-11-04T15:00:00"));
  assert(/^\d{4}-\d{2}-\d{2}$/.test(w.weekFrom), "weekFrom ISO date");
  assert(w.weekTo >= w.weekFrom, "weekTo >= weekFrom");
}

console.log("\n6) Tools RDA de qualidade registradas + ACL");
ensureProductionRdaToolsRegistered();
const qualityTools = [
  "rda_quality_person_profile",
  "rda_quality_recognitions",
  "rda_quality_incidents",
  "rda_quality_service_history",
  "rda_quality_work_times",
  "rda_quality_career_and_pdi",
  "rda_quality_managerial_evaluations",
  "rda_quality_prior_weekly_reviews",
  "rda_quality_week_dossier",
];
for (const id of qualityTools) {
  assert(productionRdaToolRegistry.has(id), `tool ${id} registrada`);
}

{
  const denied = authorizeToolInvocation({
    toolId: "rda_quality_week_dossier",
    params: {},
    auth: {
      role: "user",
      userId: "tech-1",
      permissions: { access_patio: true },
    },
    featureEnabled: true,
    registry: productionRdaToolRegistry,
  });
  assert(denied.allowed === false, "técnico sem radar não usa tool de qualidade");

  const allowed = authorizeToolInvocation({
    toolId: "rda_quality_week_dossier",
    params: { personName: "Carlos" },
    auth: {
      role: "user",
      userId: "mgr-1",
      permissions: { access_radar_qualidade: true },
    },
    featureEnabled: true,
    registry: productionRdaToolRegistry,
  });
  assert(allowed.allowed === true, "gestão com radar usa dossier");
}

console.log("\n7) ACL Radar");
assert(
  canAccessQualityRadar({
    role: "user",
    userId: "x",
    permissions: { access_home: true },
  }) === false,
  "home sem radar ≠ acesso confidencial"
);
assert(
  canAccessQualityRadar({
    role: "admin",
    userId: "a",
  }) === true,
  "admin acessa"
);

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
