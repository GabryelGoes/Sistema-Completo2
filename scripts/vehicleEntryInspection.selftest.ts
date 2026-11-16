/**
 * Selftest: Inspeção de Entrada — regras, validação, CAS e compatibilidade.
 * npm run test:vehicle-entry-inspection
 */
import assert from "node:assert/strict";
import {
  VEHICLE_ENTRY_CHECKLIST_ID,
  VEHICLE_ENTRY_CHECKLIST_VERSION,
  VEHICLE_ENTRY_QUESTIONS_V1,
  canConfirmRoadTestPerformed,
  computeEntryInspectionProgress,
  deriveEntryInspectionStatus,
  deriveRoadTestStatus,
  evaluateEntryInspectionSafety,
  mergeEntryAnswers,
  normalizeAnswersFromUnknown,
  snapshotVehicleEntryQuestions,
  validateEntryAnswersPayload,
  type EntryInspectionAnswers,
} from "../utils/vehicleEntryInspection.js";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { findMatchingRules } from "../utils/authorizeRequest.js";

console.log("Vehicle entry inspection selftest\n");

assert.equal(VEHICLE_ENTRY_CHECKLIST_ID, "vehicle_entry_inspection");
assert.equal(VEHICLE_ENTRY_CHECKLIST_VERSION, 1);
assert.equal(VEHICLE_ENTRY_QUESTIONS_V1.length, 14);

const snap = snapshotVehicleEntryQuestions(1);
assert.equal(snap.length, 14);
assert.ok(snap.every((q) => q.prompt && q.options.length > 0));

// Respostas específicas por pergunta (não Sim/Não indiscriminado)
const pedal = snap.find((q) => q.id === "brake_pedal")!;
assert.ok(pedal.options.includes("normal"));
assert.ok(pedal.options.includes("anormal"));
assert.ok(!pedal.options.includes("sim"));

const lamp = snap.find((q) => q.id === "abs_warning_light")!;
assert.ok(lamp.options.includes("acesa"));
assert.ok(lamp.options.includes("apagada"));

// Críticos bloqueiam rodagem
const answersCritical: EntryInspectionAnswers = {
  brake_pedal: { value: "anormal" },
  hydraulic_leak: { value: "sim" },
  brake_performance: { value: "sim" },
};
const safety = evaluateEntryInspectionSafety({ questions: snap, answers: answersCritical });
assert.equal(safety.blocksRoadTest, true);
assert.ok(safety.criticalFindings.length >= 3);
assert.ok(safety.anomalySummary.some((s) => /pedal|hidráulico|Frenagem/i.test(s)));

// Justificativa obrigatória em item crítico não verificado
const unchecked: EntryInspectionAnswers = {
  brake_pedal: { value: "nao_verificado" },
};
const bad = validateEntryAnswersPayload({ questions: snap, answers: unchecked });
assert.equal(bad.ok, false);
if (!bad.ok) assert.equal(bad.code, "justification_required");

const okUnchecked = validateEntryAnswersPayload({
  questions: snap,
  answers: { brake_pedal: { value: "nao_verificado", note: "Elevador ocupado" } },
});
assert.equal(okUnchecked.ok, true);

// Rodagem exige confirmação explícita
const noConfirm = canConfirmRoadTestPerformed({
  blocksRoadTest: false,
  criticalCleared: false,
  confirm: false,
});
assert.equal(noConfirm.ok, false);
if (!noConfirm.ok) assert.equal(noConfirm.code, "road_test_unconfirmed");

const blocked = canConfirmRoadTestPerformed({
  blocksRoadTest: true,
  criticalCleared: false,
  confirm: true,
});
assert.equal(blocked.ok, false);
if (!blocked.ok) assert.equal(blocked.code, "road_test_blocked");

const allowed = canConfirmRoadTestPerformed({
  blocksRoadTest: true,
  criticalCleared: true,
  confirm: true,
});
assert.equal(allowed.ok, true);

assert.equal(
  deriveRoadTestStatus({
    blocksRoadTest: true,
    criticalCleared: false,
    roadTestPerformed: false,
  }),
  "blocked"
);
assert.equal(
  deriveRoadTestStatus({
    blocksRoadTest: true,
    criticalCleared: true,
    roadTestPerformed: false,
  }),
  "cleared"
);
assert.equal(
  deriveRoadTestStatus({
    blocksRoadTest: false,
    criticalCleared: false,
    roadTestPerformed: true,
  }),
  "performed"
);

// Progresso e status
const partial: EntryInspectionAnswers = {
  ext_damage: { value: "nao" },
  underbody_leak: { value: "nao" },
};
const prog = computeEntryInspectionProgress({ questions: snap, answers: partial });
assert.equal(prog.answered, 2);
assert.equal(prog.total, 14);
assert.equal(deriveEntryInspectionStatus({ answers: partial, questions: snap }), "in_progress");
assert.equal(deriveEntryInspectionStatus({ answers: {}, questions: snap }), "pending");

// Merge não apaga respostas omitidas
const merged = mergeEntryAnswers(
  { ext_damage: { value: "sim", note: "para-choque" } },
  { warning_lights: { value: "nao" } },
  "2026-11-16T12:00:00.000Z"
);
assert.equal(merged.ext_damage?.value, "sim");
assert.equal(merged.warning_lights?.value, "nao");

// Snapshot antigo permanece utilizável (compatibilidade)
const legacySnap = snap.map((q) =>
  q.id === "ext_damage" ? { ...q, prompt: "Avarias externas? (legado)" } : q
);
const legacyAnswers: EntryInspectionAnswers = {
  ext_damage: { value: "sim" },
};
const legacySafety = evaluateEntryInspectionSafety({
  questions: legacySnap,
  answers: legacyAnswers,
});
assert.ok(legacySafety.anomalySummary[0].includes("legado"));

// Normalize lixo
assert.deepEqual(normalizeAnswersFromUnknown(null), {});
assert.deepEqual(normalizeAnswersFromUnknown({ x: { value: "???" } }).x?.value, null);

// Autorização das rotas novas (catálogo declarativo)
const policy = productionAuthorizationPolicy();
const readRules = findMatchingRules(policy, "GET", "/api/service-orders/os-1/entry-inspection");
assert.ok(readRules.some((r) => r.id === "os_entry_inspection_read"));
assert.ok(readRules[0]?.anyOf.includes("access_patio"));
assert.ok(readRules[0]?.anyOf.includes("access_relatorios"));

const putRules = findMatchingRules(policy, "PUT", "/api/service-orders/os-1/entry-inspection");
assert.ok(putRules.some((r) => r.id === "os_entry_inspection_update"));
assert.ok(putRules[0]?.anyOf.includes("access_patio"));
assert.ok(!putRules[0]?.anyOf.includes("access_relatorios"));

const startRules = findMatchingRules(
  policy,
  "POST",
  "/api/service-orders/os-1/entry-inspection/start"
);
assert.ok(startRules.some((r) => r.id === "os_entry_inspection_start"));

const clearRules = findMatchingRules(
  policy,
  "POST",
  "/api/service-orders/os-1/entry-inspection/clear-critical"
);
assert.ok(clearRules.some((r) => r.id === "os_entry_inspection_clear_critical"));

const roadRules = findMatchingRules(
  policy,
  "POST",
  "/api/service-orders/os-1/entry-inspection/confirm-road-test"
);
assert.ok(roadRules.some((r) => r.id === "os_entry_inspection_confirm_road_test"));

// Templates admin continuam com regras próprias
const adminTpl = findMatchingRules(policy, "GET", "/api/workshop/checklist-templates");
assert.ok(adminTpl.some((r) => r.id === "checklists_read" || r.id.includes("checklist")));

console.log("OK — regras, justificativa, rodagem, snapshot legado e autorização.\n");
