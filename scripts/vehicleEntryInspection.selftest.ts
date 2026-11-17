/**
 * Selftest: Inspeção de Entrada v2 — registro simples, sem bloqueios.
 * npm run test:vehicle-entry-inspection
 */
import assert from "node:assert/strict";
import {
  VEHICLE_ENTRY_CHECKLIST_ID,
  VEHICLE_ENTRY_CHECKLIST_VERSION,
  VEHICLE_ENTRY_QUESTIONS_V1,
  VEHICLE_ENTRY_QUESTIONS_V2,
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
assert.equal(VEHICLE_ENTRY_CHECKLIST_VERSION, 2);
assert.equal(VEHICLE_ENTRY_QUESTIONS_V1.length, 14);
assert.equal(VEHICLE_ENTRY_QUESTIONS_V2.length, 17);

const snap = snapshotVehicleEntryQuestions(2);
assert.equal(snap.length, 17);
assert.ok(snap.every((q) => q.prompt && q.options.length > 0));
assert.ok(!snap.some((q) => q.group === "registro"));

// Grupos v2
assert.ok(snap.some((q) => q.id === "arrival_mode"));
assert.ok(snap.some((q) => q.id === "misalignment"));
assert.ok(snap.some((q) => q.id === "brake_fluid_state"));
assert.ok(snap.some((q) => q.id === "airbag_srs_light"));
assert.ok(snap.some((q) => q.id === "tpms_light"));
assert.ok(!snap.some((q) => q.id === "client_complaint_recorded"));
assert.ok(!snap.some((q) => q.id === "anomaly_photos_documented"));

// Chegada rodando/guincho
const arrival = snap.find((q) => q.id === "arrival_mode")!;
assert.deepEqual([...arrival.options], ["rodando", "guincho", "nao_verificado"]);

// Estado visual do fluido
const fluidState = snap.find((q) => q.id === "brake_fluid_state")!;
assert.ok(fluidState.options.includes("bom"));
assert.ok(fluidState.options.includes("escurecido"));
assert.ok(fluidState.options.includes("contaminado"));
assert.ok(fluidState.options.includes("nao_verificado"));
assert.ok(!fluidState.options.includes("normal"));

// Luzes do painel
const abs = snap.find((q) => q.id === "abs_warning_light")!;
assert.deepEqual([...abs.options], ["apagada", "acesa", "intermitente", "nao_verificado"]);

const tpms = snap.find((q) => q.id === "tpms_light")!;
assert.ok(tpms.options.includes("nao_equipado"));
assert.ok(tpms.options.includes("intermitente"));

// Sem bloqueios / justificativa
const answers: EntryInspectionAnswers = {
  brake_pedal: { value: "anormal" },
  hydraulic_leak: { value: "sim" },
  brake_behavior: { value: "anormal" },
};
const safety = evaluateEntryInspectionSafety({ questions: snap, answers });
assert.equal(safety.blocksRoadTest, false);
assert.equal(safety.criticalFindings.length, 0);
assert.equal(safety.anomalySummary.length, 0);
assert.equal(safety.missingJustifications.length, 0);

const unchecked = validateEntryAnswersPayload({
  questions: snap,
  answers: { brake_pedal: { value: "nao_verificado" } },
});
assert.equal(unchecked.ok, true);

// Rodagem: compat não bloqueia por crítico
assert.equal(
  canConfirmRoadTestPerformed({
    blocksRoadTest: true,
    criticalCleared: false,
    confirm: true,
  }).ok,
  true
);
assert.equal(
  deriveRoadTestStatus({
    blocksRoadTest: true,
    criticalCleared: false,
    roadTestPerformed: false,
  }),
  "not_requested"
);

// Progresso
const partial: EntryInspectionAnswers = {
  arrival_mode: { value: "rodando" },
  ext_damage: { value: "nao" },
};
const prog = computeEntryInspectionProgress({ questions: snap, answers: partial });
assert.equal(prog.answered, 2);
assert.equal(prog.total, 17);
assert.equal(deriveEntryInspectionStatus({ answers: partial, questions: snap }), "in_progress");

// Merge
const merged = mergeEntryAnswers(
  { arrival_mode: { value: "guincho" } },
  { misalignment: { value: "sim" } },
  "2026-11-16T12:00:00.000Z"
);
assert.equal(merged.arrival_mode?.value, "guincho");
assert.equal(merged.misalignment?.value, "sim");

// Snapshot v1 legado continua legível
const v1 = snapshotVehicleEntryQuestions(1);
assert.equal(v1.length, 14);
assert.ok(v1.some((q) => q.group === "registro"));
const legacySafety = evaluateEntryInspectionSafety({
  questions: v1,
  answers: { brake_pedal: { value: "anormal" } },
});
assert.equal(legacySafety.blocksRoadTest, false);

assert.deepEqual(normalizeAnswersFromUnknown(null), {});
assert.deepEqual(normalizeAnswersFromUnknown({ x: { value: "???" } }).x?.value, null);

// Autorização
const policy = productionAuthorizationPolicy();
assert.ok(
  findMatchingRules(policy, "GET", "/api/service-orders/os-1/entry-inspection").some(
    (r) => r.id === "os_entry_inspection_read"
  )
);
assert.ok(
  findMatchingRules(policy, "PUT", "/api/service-orders/os-1/entry-inspection").some(
    (r) => r.id === "os_entry_inspection_update"
  )
);
assert.ok(
  findMatchingRules(policy, "POST", "/api/service-orders/os-1/entry-inspection/start").some(
    (r) => r.id === "os_entry_inspection_start"
  )
);

console.log("OK — v2 (17 perguntas), sem bloqueios, snapshot v1 preservado e autorização.\n");
