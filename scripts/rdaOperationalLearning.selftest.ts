/**
 * Selftest Aprendizado Operacional RDA (sem banco).
 * npm run test:rda-ops
 */
import {
  buildDistribution,
  buildOverview,
  buildPauseReasonRows,
  buildServiceDurationRows,
  buildTechnicianBreakdown,
  canViewOperationalIntelligence,
  confidenceFromSamples,
  definitiveProductiveValues,
  detectOperationalPatterns,
  medianMs,
  serviceKeyFromDescription,
  toSessionFact,
} from "../services/rdaIntelligence/index.js";
import type { OpsSessionFact } from "../services/rdaIntelligence/operationalLearning/types.js";

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

console.log("RDA operational learning selftest\n");

console.log("1) Permissões gestão");
{
  assert(
    canViewOperationalIntelligence({ role: "admin", userId: "a", flags: null }),
    "admin vê ops"
  );
  assert(
    canViewOperationalIntelligence({
      role: "user",
      userId: "u1",
      flags: { isTechnician: false, permissions: { full_access: true } },
    }),
    "full_access vê ops"
  );
  assert(
    canViewOperationalIntelligence({
      role: "user",
      userId: "u2",
      flags: { isTechnician: true, permissions: { access_radar_qualidade: true } },
    }),
    "radar vê ops"
  );
  assert(
    !canViewOperationalIntelligence({
      role: "user",
      userId: "u3",
      flags: { isTechnician: true, permissions: { access_patio: true } },
    }),
    "técnico pátio NÃO vê breakdown gerencial"
  );
}

console.log("\n2) Sessões: finished vs parcial");
{
  const finished = toSessionFact({
    id: "s1",
    workshop_id: "w1",
    service_order_id: "os1",
    technician_user_id: "t1",
    time_kind: "diagnostic",
    status: "finished",
    started_at: "2026-01-01T10:00:00Z",
    ended_at: "2026-01-01T11:00:00Z",
    productive_ms: 3_600_000,
    paused_ms: 600_000,
    budget_service_line_id: null,
    budget_service_description: "Troca módulo ABS",
    current_pause_reason_id: null,
  });
  const open = toSessionFact({
    id: "s2",
    workshop_id: "w1",
    service_order_id: "os1",
    technician_user_id: "t1",
    time_kind: "diagnostic",
    status: "running",
    started_at: "2026-01-02T10:00:00Z",
    ended_at: null,
    productive_ms: 900_000,
    paused_ms: 0,
    budget_service_line_id: null,
    budget_service_description: "Troca módulo ABS",
    current_pause_reason_id: null,
  });
  const paused = toSessionFact({
    id: "s3",
    workshop_id: "w1",
    service_order_id: "os2",
    technician_user_id: "t2",
    time_kind: "execution",
    status: "paused",
    started_at: "2026-01-03T10:00:00Z",
    ended_at: null,
    productive_ms: 1_200_000,
    paused_ms: 300_000,
    budget_service_line_id: null,
    budget_service_description: "Troca módulo ABS",
    current_pause_reason_id: "awaiting_parts",
  });
  assert(!!finished && finished.definitiveProductiveMs === 3_600_000, "finished tem duração definitiva");
  assert(!!open && open.isPartial && open.definitiveProductiveMs === null, "running é parcial");
  assert(!!paused && paused.isPartial && paused.definitiveProductiveMs === null, "paused é parcial");

  const facts = [finished!, open!, paused!] as OpsSessionFact[];
  const values = definitiveProductiveValues(facts, "diagnostic");
  assert(values.length === 1 && values[0] === 3_600_000, "só finished entra na distribuição");
  assert(
    definitiveProductiveValues(facts, "execution").length === 0,
    "execução parcial não vira duração definitiva"
  );
}

console.log("\n3) Diagnóstico ≠ execução; pausa ≠ produtivo");
{
  const facts: OpsSessionFact[] = [
    toSessionFact({
      id: "d1",
      workshop_id: "w",
      service_order_id: "o1",
      technician_user_id: "t1",
      time_kind: "diagnostic",
      status: "finished",
      started_at: "2026-02-01T08:00:00Z",
      ended_at: "2026-02-01T09:00:00Z",
      productive_ms: 2_000_000,
      paused_ms: 500_000,
      budget_service_line_id: null,
      budget_service_description: "ABS",
      current_pause_reason_id: null,
    })!,
    toSessionFact({
      id: "e1",
      workshop_id: "w",
      service_order_id: "o1",
      technician_user_id: "t1",
      time_kind: "execution",
      status: "finished",
      started_at: "2026-02-01T10:00:00Z",
      ended_at: "2026-02-01T12:00:00Z",
      productive_ms: 4_000_000,
      paused_ms: 100_000,
      budget_service_line_id: null,
      budget_service_description: "ABS",
      current_pause_reason_id: null,
    })!,
  ];
  const ov = buildOverview(facts, { from: "2026-02-01T00:00:00Z", to: "2026-02-28T00:00:00Z" });
  assert(ov.diagnosticMs === 2_000_000, "diagnóstico separado");
  assert(ov.executionMs === 4_000_000, "execução separada");
  assert(ov.pausedMs === 600_000, "pausas somadas e fora do produtivo");
  assert(
    ov.totalPointedMs === 2_000_000 + 4_000_000 + 600_000,
    "total apontado = diag + exec + pausas"
  );
  assert(ov.confidenceNote.includes("entrada do veículo"), "disclaimer de entrada");
}

console.log("\n4) Múltiplas sessões / chave de serviço / amostras insuficientes");
{
  assert(
    serviceKeyFromDescription("Troca Módulo ABS!") === serviceKeyFromDescription("troca modulo abs"),
    "chave normalizada equivalente"
  );
  const many: OpsSessionFact[] = [];
  for (let i = 0; i < 3; i++) {
    many.push(
      toSessionFact({
        id: `m${i}`,
        workshop_id: "w",
        service_order_id: `os${i}`,
        technician_user_id: i % 2 === 0 ? "t1" : "t2",
        time_kind: "execution",
        status: "finished",
        started_at: `2026-03-0${i + 1}T10:00:00Z`,
        ended_at: `2026-03-0${i + 1}T11:00:00Z`,
        productive_ms: (i + 1) * 1_000_000,
        paused_ms: 0,
        budget_service_line_id: null,
        budget_service_description: "Reparo bomba",
        current_pause_reason_id: null,
      })!
    );
  }
  const rows = buildServiceDurationRows(many, "execution", 10);
  assert(rows.length === 1, "agrupa por serviço");
  assert(rows[0]!.distribution.sampleCount === 3, "n=3");
  assert(rows[0]!.distribution.confidence === "insufficient", "n<5 = insufficient");
  assert(confidenceFromSamples(0) === "insufficient", "n=0 insufficient");
  assert(confidenceFromSamples(15) === "medium", "n=15 medium");
  assert(confidenceFromSamples(40) === "high", "n=40 high");
  assert(medianMs([1, 3, 2]) === 2, "mediana ímpar");
  assert(medianMs([1, 2, 3, 4]) === 3 || medianMs([1, 2, 3, 4]) === 2, "mediana par arredondada");
  const dist = buildDistribution([10, 20, 30, 40, 50]);
  assert(dist.sampleCount === 5 && dist.medianMs === 30, "distribuição básica");
}

console.log("\n5) Pausas e técnicos (sem ranking punitivo)");
{
  const pauses = buildPauseReasonRows(
    [
      { reasonId: "awaiting_parts", label: "Aguardando peças", pausedMs: 1000 },
      { reasonId: "awaiting_parts", label: "Aguardando peças", pausedMs: 2000 },
      { reasonId: "break", label: "Intervalo", pausedMs: 500 },
    ],
    10
  );
  assert(pauses[0]!.reasonId === "awaiting_parts" && pauses[0]!.pauseEventCount === 2, "motivo top");
  const facts: OpsSessionFact[] = [
    toSessionFact({
      id: "t1s",
      workshop_id: "w",
      service_order_id: "o",
      technician_user_id: "tech-a",
      time_kind: "diagnostic",
      status: "finished",
      started_at: "2026-04-01T10:00:00Z",
      ended_at: "2026-04-01T11:00:00Z",
      productive_ms: 1_000_000,
      paused_ms: 0,
      budget_service_line_id: null,
      budget_service_description: "X",
      current_pause_reason_id: null,
    })!,
  ];
  const techs = buildTechnicianBreakdown(facts, new Map([["tech-a", "Ana"]]));
  assert(techs[0]!.displayName === "Ana" && techs[0]!.diagnosticMs === 1_000_000, "breakdown técnico");
}

console.log("\n6) Padrões → proposta memória (não auto)");
{
  const facts: OpsSessionFact[] = [];
  for (let i = 0; i < 8; i++) {
    facts.push(
      toSessionFact({
        id: `p${i}`,
        workshop_id: "w",
        service_order_id: `os${i}`,
        technician_user_id: "t1",
        time_kind: "diagnostic",
        status: "finished",
        started_at: `2026-05-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        ended_at: `2026-05-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
        productive_ms: 3_600_000 + i * 100_000,
        paused_ms: 0,
        budget_service_line_id: null,
        budget_service_description: "Diagnóstico ECU",
        current_pause_reason_id: null,
      })!
    );
  }
  const pauseEvents = Array.from({ length: 6 }, () => ({
    reasonId: "awaiting_parts",
    label: "Aguardando peças",
    pausedMs: 1000,
  }));
  const patterns = detectOperationalPatterns(facts, pauseEvents, {
    from: "2026-05-01T00:00:00Z",
    to: "2026-05-31T00:00:00Z",
  });
  assert(patterns.length >= 1, "detecta ao menos um padrão");
  assert(
    patterns.every((p) => p.proposedKnowledge.title && p.proposedKnowledge.content),
    "cada padrão traz rascunho para memória"
  );
  assert(
    patterns.every((p) => p.confidence !== undefined),
    "confiança explícita"
  );
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
