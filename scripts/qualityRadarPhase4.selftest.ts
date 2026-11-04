/**
 * Selftest Fase 4 — ciclo semanal / agenda / indicadores / versões.
 * npm run test:quality-radar-phase4
 */
import {
  buildUnavailableFields,
  compareIndicatorWeeks,
  DEFAULT_WEEKLY_CYCLE_SCHEDULE,
  msToHours,
  parseWeeklyCycleSchedule,
  shouldRunWeeklyPrepareNow,
  weekBoundsInTimeZone,
  WEEKLY_CYCLE_SETTING_KEYS,
  zonedParts,
  type PersonReportIndicators,
} from "../services/qualityRadar/weeklyCycleDefaults.js";
import { draftBodyFromPreliminary } from "../services/qualityRadar/prepareWeeklyCycle.js";
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

console.log("Quality Radar phase 4 (weekly cycle / reports) selftest\n");

console.log("1) Agenda padrão sexta 16h America/Sao_Paulo");
{
  const s = parseWeeklyCycleSchedule({});
  assert(s.enabled === true, "enabled default true");
  assert(s.weekday === 5, "weekday = sexta");
  assert(s.hour === 16, "hour = 16");
  assert(s.timezone === "America/Sao_Paulo", "timezone SP");
  assert(DEFAULT_WEEKLY_CYCLE_SCHEDULE.weekday === 5, "const default sex");
  assert(WEEKLY_CYCLE_SETTING_KEYS.enabled.includes("quality_weekly"), "setting key");
}

console.log("\n2) Janela de agendamento (idempotente / no-op fora)");
{
  const cfg = { ...DEFAULT_WEEKLY_CYCLE_SCHEDULE, enabled: false };
  const off = shouldRunWeeklyPrepareNow(cfg, new Date());
  assert(off.run === false, "desabilitado → não roda");

  const wrongDay = shouldRunWeeklyPrepareNow(
    {
      ...DEFAULT_WEEKLY_CYCLE_SCHEDULE,
      weekday: (zonedParts(new Date(), "America/Sao_Paulo").weekday + 1) % 7,
    },
    new Date()
  );
  assert(wrongDay.run === false, "dia diferente → skip");
}

console.log("\n3) Semana atravessa meses / bounds locais");
{
  const b = weekBoundsInTimeZone(new Date("2026-11-04T18:00:00Z"), "America/Sao_Paulo");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(b.weekFrom), "weekFrom ISO");
  assert(b.weekTo >= b.weekFrom, "weekTo >= weekFrom");
  const b2 = weekBoundsInTimeZone(new Date("2025-10-30T18:00:00Z"), "America/Sao_Paulo");
  assert(b2.weekFrom <= b2.weekTo, "semana fim de mês válida");
}

console.log("\n4) Ausência ≠ desempenho ruim / sem auto-nota");
{
  const indicators: PersonReportIndicators = {
    servicesPatio: null,
    servicesLab: null,
    productiveHours: null,
    pausedHours: null,
    evaluationsCount: null,
    occurrencesCount: null,
    reworkHintCount: null,
    recognitionsCount: null,
    goalsDoneCount: null,
    meetingsCount: null,
  };
  const unavailable = buildUnavailableFields(indicators);
  assert(unavailable.length >= 5, "marca campos indisponíveis");
  assert(msToHours(null) === null, "ms null → null");
  assert(msToHours(7200000) === 2, "2h");

  const draft = draftBodyFromPreliminary({
    personName: "Carlos",
    jobTitle: "Mecânico",
    weekFrom: "2026-11-02",
    weekTo: "2026-11-08",
    leaderName: "Chefe",
    indicators,
    unavailableFields: unavailable,
    incompleteSignals: ["Sem sessões de tempo no período."],
  });
  assert(!/nota\s*1|score\s*=/i.test(draft.analysis.overall), "não inventa nota");
  assert(/não interpretar como desempenho ruim/i.test(draft.analysis.overall), "ausência explícita");
  assert(draft.unavailableFields.length > 0, "lista lacunas no corpo");
}

console.log("\n5) Comparação semana vs anterior sem ranking");
{
  const cur: PersonReportIndicators = {
    servicesPatio: 4,
    servicesLab: 1,
    productiveHours: 20,
    pausedHours: 2,
    evaluationsCount: 2,
    occurrencesCount: 0,
    reworkHintCount: 0,
    recognitionsCount: 1,
    goalsDoneCount: 1,
    meetingsCount: 1,
  };
  const prev: PersonReportIndicators = {
    ...cur,
    servicesPatio: 2,
    productiveHours: 18,
    occurrencesCount: 1,
  };
  const cmp = compareIndicatorWeeks(cur, prev);
  assert(cmp.some((c) => c.field.includes("Pátio") && c.delta === 2), "delta serviços");
  assert(compareIndicatorWeeks(cur, null).length === 0, "sem anterior → vazio");
}

console.log("\n6) Tool de relatórios aprovados + ACL");
ensureProductionRdaToolsRegistered();
assert(
  productionRdaToolRegistry.has("rda_quality_approved_weekly_reports"),
  "tool relatórios aprovados"
);
{
  const denied = authorizeToolInvocation({
    toolId: "rda_quality_approved_weekly_reports",
    params: {},
    auth: { role: "user", userId: "t", permissions: { access_patio: true } },
    featureEnabled: true,
    registry: productionRdaToolRegistry,
  });
  assert(denied.allowed === false, "sem radar → negado");
  const ok = authorizeToolInvocation({
    toolId: "rda_quality_approved_weekly_reports",
    params: { personName: "Carlos" },
    auth: { role: "user", userId: "g", permissions: { access_radar_qualidade: true } },
    featureEnabled: true,
    registry: productionRdaToolRegistry,
  });
  assert(ok.allowed === true, "gestão → ok");
}

console.log("\n7) ACL Radar");
assert(
  canAccessQualityRadar({ role: "user", userId: "x", permissions: {} }) === false,
  "sem permissão"
);

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
process.exit(failed > 0 ? 1 : 0);
