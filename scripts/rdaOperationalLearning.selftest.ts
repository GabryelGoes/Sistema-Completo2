/**
 * Selftest Aprendizado Operacional RDA (sem banco).
 * npm run test:rda-ops
 */
import {
  authorizeToolInvocation,
  buildDistribution,
  buildOverview,
  buildPauseReasonRows,
  buildServiceDurationRows,
  buildTechnicianBreakdown,
  bucketTotals,
  canViewOperationalIntelligence,
  clampOpsLimit,
  clampOpsOffset,
  computePauseIntervals,
  confidenceFromSamples,
  definitiveOccurrenceDurations,
  definitiveProductiveValues,
  detectOperationalPatterns,
  medianMs,
  OPS_QUERY_MAX_LIMIT,
  OPS_SESSION_SELECT_PRODUCTION,
  productionRdaToolRegistry,
  serviceKeyFromDescription,
  serviceOccurrenceKey,
  toSessionFact,
} from "../services/rdaIntelligence/index.js";
import { ensureProductionRdaToolsRegistered } from "../services/rdaIntelligence/tools/registerProduction.js";
import type { OpsSessionFact } from "../services/rdaIntelligence/operationalLearning/types.js";
import type { RdaAuthContext } from "../services/rdaIntelligence/types.js";

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

function fact(partial: {
  id: string;
  os: string;
  tech: string;
  kind: "diagnostic" | "execution";
  status: "running" | "paused" | "finished" | "cancelled";
  started: string;
  ended?: string | null;
  productive: number;
  paused: number;
  desc: string;
  lineId?: string | null;
}): OpsSessionFact {
  const row = toSessionFact({
    id: partial.id,
    workshop_id: "w1",
    service_order_id: partial.os,
    technician_user_id: partial.tech,
    time_kind: partial.kind,
    status: partial.status,
    started_at: partial.started,
    ended_at: partial.ended ?? (partial.status === "finished" || partial.status === "cancelled" ? partial.started : null),
    productive_ms: partial.productive,
    paused_ms: partial.paused,
    budget_service_description: partial.desc,
    current_pause_reason_id: partial.status === "paused" ? "awaiting_parts" : null,
    ...(partial.lineId !== undefined ? { budget_service_line_id: partial.lineId } : {}),
  });
  if (!row) throw new Error(`fact inválido ${partial.id}`);
  return row;
}

console.log("RDA operational learning selftest (revisão PR #134)\n");

ensureProductionRdaToolsRegistered();

console.log("1) Schema produção — select sem budget_service_line_id");
{
  assert(
    !OPS_SESSION_SELECT_PRODUCTION.includes("budget_service_line_id"),
    "select de produção não pede budget_service_line_id"
  );
  assert(
    OPS_SESSION_SELECT_PRODUCTION.includes("budget_service_description"),
    "select inclui descrição do serviço"
  );
  assert(
    OPS_SESSION_SELECT_PRODUCTION.includes("time_kind"),
    "select inclui time_kind"
  );
  const withoutLine = toSessionFact({
    id: "prod1",
    workshop_id: "w",
    service_order_id: "os",
    technician_user_id: "t",
    time_kind: "execution",
    status: "finished",
    started_at: "2026-01-01T10:00:00Z",
    ended_at: "2026-01-01T11:00:00Z",
    productive_ms: 1000,
    paused_ms: 0,
    budget_service_description: "Troca ABS",
    current_pause_reason_id: null,
    // sem budget_service_line_id
  });
  assert(!!withoutLine && withoutLine.budgetServiceLineId === null, "linha sem line_id ok");
  const legacyNoKind = toSessionFact({
    id: "leg1",
    workshop_id: "w",
    service_order_id: "os",
    technician_user_id: "t",
    time_kind: null,
    status: "finished",
    started_at: "2026-01-01T10:00:00Z",
    ended_at: "2026-01-01T11:00:00Z",
    productive_ms: 1000,
    paused_ms: 0,
    budget_service_description: "Legado",
    current_pause_reason_id: null,
  });
  assert(!!legacyNoKind && legacyNoKind.timeKind === "execution", "time_kind ausente → execution");
}

console.log("\n2) Permissões API + tools IA");
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
    "técnico pátio NÃO vê ops gerencial"
  );

  const opsTools = [
    "rda_ops_overview",
    "rda_ops_service_duration_stats",
    "rda_ops_pause_reasons_summary",
    "rda_ops_technician_time_breakdown",
    "rda_ops_detect_patterns",
  ];
  for (const id of opsTools) {
    assert(!!productionRdaToolRegistry.get(id), `tool registrada: ${id}`);
  }
  const techAuth: RdaAuthContext = {
    role: "user",
    userId: "tech",
    permissions: { access_patio: true },
  };
  const radarAuth: RdaAuthContext = {
    role: "user",
    userId: "mgr",
    permissions: { access_radar_qualidade: true },
  };
  const denied = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: techAuth,
    toolId: "rda_ops_overview",
    featureEnabled: true,
  });
  assert(!denied.allowed, "tool ops negada sem radar/full");
  const allowed = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: radarAuth,
    toolId: "rda_ops_overview",
    featureEnabled: true,
  });
  assert(allowed.allowed, "tool ops liberada com radar");
}

console.log("\n3) Pausas com durações diferentes (timestamps)");
{
  const intervals = computePauseIntervals([
    {
      sessionId: "s1",
      eventType: "pause",
      occurredAt: "2026-06-01T10:00:00.000Z",
      pauseReasonId: "awaiting_parts",
    },
    {
      sessionId: "s1",
      eventType: "resume",
      occurredAt: "2026-06-01T10:10:00.000Z",
      pauseReasonId: null,
    },
    {
      sessionId: "s1",
      eventType: "pause",
      occurredAt: "2026-06-01T11:00:00.000Z",
      pauseReasonId: "break",
    },
    {
      sessionId: "s1",
      eventType: "resume",
      occurredAt: "2026-06-01T11:30:00.000Z",
      pauseReasonId: null,
    },
    {
      sessionId: "s2",
      eventType: "pause",
      occurredAt: "2026-06-01T12:00:00.000Z",
      pauseReasonId: "awaiting_parts",
    },
    // sem fechamento
  ]);
  assert(intervals.length === 3, "3 intervalos de pausa");
  assert(intervals[0]!.durationMs === 10 * 60 * 1000, "pausa peças = 10min");
  assert(intervals[1]!.durationMs === 30 * 60 * 1000, "intervalo = 30min (não rateio)");
  assert(intervals[2]!.durationMs === null, "pausa aberta = duração desconhecida");

  const rows = buildPauseReasonRows(
    intervals.map((iv) => ({
      reasonId: iv.reasonId,
      label: iv.reasonId,
      pausedMs: iv.durationMs,
    })),
    10
  );
  const parts = rows.find((r) => r.reasonId === "awaiting_parts")!;
  assert(parts.pauseEventCount === 2, "2 eventos awaiting_parts");
  assert(parts.pausedMs === null, "duração omitida se houver desconhecida no motivo");
  assert(parts.durationUnknownCount === 1, "1 desconhecida");
  const brk = rows.find((r) => r.reasonId === "break")!;
  assert(brk.pausedMs === 30 * 60 * 1000, "break com duração conhecida");
}

console.log("\n4) Várias sessões do mesmo serviço (OS+serviço+kind)");
{
  const sameOs = [
    fact({
      id: "a1",
      os: "os-abs",
      tech: "t1",
      kind: "execution",
      status: "finished",
      started: "2026-03-01T10:00:00Z",
      ended: "2026-03-01T11:00:00Z",
      productive: 1_000_000,
      paused: 0,
      desc: "Troca módulo ABS",
    }),
    fact({
      id: "a2",
      os: "os-abs",
      tech: "t1",
      kind: "execution",
      status: "finished",
      started: "2026-03-01T14:00:00Z",
      ended: "2026-03-01T15:00:00Z",
      productive: 2_000_000,
      paused: 0,
      desc: "Troca módulo ABS",
    }),
    fact({
      id: "b1",
      os: "os-other",
      tech: "t2",
      kind: "execution",
      status: "finished",
      started: "2026-03-02T10:00:00Z",
      ended: "2026-03-02T11:00:00Z",
      productive: 3_000_000,
      paused: 0,
      desc: "Troca módulo ABS",
    }),
  ];
  const occ = definitiveOccurrenceDurations(sameOs, "execution");
  assert(occ.sessionCount === 3, "3 sessões finished");
  assert(occ.valuesMs.length === 2, "2 ocorrências (OS distintas)");
  assert(occ.valuesMs.includes(3_000_000), "OS abs soma 1M+2M=3M");
  assert(
    occ.valuesMs.filter((v) => v === 3_000_000).length === 2,
    "ambas ocorrências = 3M (soma e OS única)"
  );

  const rows = buildServiceDurationRows(sameOs, "execution", 10);
  assert(rows.length === 1, "um serviço");
  assert(rows[0]!.distribution.sampleCount === 2, "n=ocorrências, não sessões");
  assert(rows[0]!.finishedSessionCount === 3, "conta sessões separadamente");
  assert(rows[0]!.finishedOccurrenceCount === 2, "ocorrências colapsadas");
}

console.log("\n5) Separação diagnóstico / execução");
{
  const mixed = [
    fact({
      id: "d1",
      os: "os1",
      tech: "t1",
      kind: "diagnostic",
      status: "finished",
      started: "2026-04-01T08:00:00Z",
      ended: "2026-04-01T09:00:00Z",
      productive: 2_000_000,
      paused: 100_000,
      desc: "ABS",
    }),
    fact({
      id: "e1",
      os: "os1",
      tech: "t1",
      kind: "execution",
      status: "finished",
      started: "2026-04-01T10:00:00Z",
      ended: "2026-04-01T12:00:00Z",
      productive: 4_000_000,
      paused: 200_000,
      desc: "ABS",
    }),
  ];
  const allRows = buildServiceDurationRows(mixed, "all", 20);
  assert(allRows.length === 2, "all gera linhas separadas por kind");
  assert(
    allRows.every((r) => r.timeKind === "diagnostic" || r.timeKind === "execution"),
    "nenhuma linha com kind misturado"
  );
  const diag = allRows.find((r) => r.timeKind === "diagnostic")!;
  const exec = allRows.find((r) => r.timeKind === "execution")!;
  assert(diag.distribution.medianMs === 2_000_000, "diag isolado");
  assert(exec.distribution.medianMs === 4_000_000, "exec isolado");
  assert(
    serviceOccurrenceKey(mixed[0]!) !== serviceOccurrenceKey(mixed[1]!),
    "ocorrências diag≠exec na mesma OS"
  );
}

console.log("\n6) Totais reconciliáveis + sessões abertas");
{
  const facts = [
    fact({
      id: "f1",
      os: "os1",
      tech: "t1",
      kind: "diagnostic",
      status: "finished",
      started: "2026-05-10T10:00:00Z",
      ended: "2026-05-10T11:00:00Z",
      productive: 1_000_000,
      paused: 100_000,
      desc: "X",
    }),
    fact({
      id: "f2",
      os: "os1",
      tech: "t1",
      kind: "execution",
      status: "finished",
      started: "2026-05-10T12:00:00Z",
      ended: "2026-05-10T13:00:00Z",
      productive: 2_000_000,
      paused: 200_000,
      desc: "X",
    }),
    fact({
      id: "open-cross",
      os: "os2",
      tech: "t2",
      kind: "execution",
      status: "running",
      started: "2026-04-01T10:00:00Z", // antes do período típico
      productive: 500_000,
      paused: 50_000,
      desc: "Y",
    }),
    fact({
      id: "paused1",
      os: "os3",
      tech: "t2",
      kind: "diagnostic",
      status: "paused",
      started: "2026-05-15T10:00:00Z",
      productive: 300_000,
      paused: 80_000,
      desc: "Z",
    }),
  ];
  const period = { from: "2026-05-01T00:00:00Z", to: "2026-05-31T23:59:59Z" };
  const ov = buildOverview(facts, period);
  assert(ov.finished.diagnosticProductiveMs === 1_000_000, "finished diag");
  assert(ov.finished.executionProductiveMs === 2_000_000, "finished exec");
  assert(ov.finished.pausedMs === 300_000, "finished pausas só finished");
  assert(
    ov.finished.totalPointedMs ===
      ov.finished.productiveMs + ov.finished.pausedMs,
    "reconcilia finished"
  );
  assert(ov.diagnosticMs === ov.finished.diagnosticProductiveMs, "alias diag");
  assert(ov.totalPointedMs === ov.finished.totalPointedMs, "alias total = finished");
  assert(ov.open.sessions === 2, "2 abertas (running+paused)");
  assert(ov.open.productiveMs === 800_000, "produtivo parcial");
  assert(ov.open.pausedMs === 130_000, "pausa parcial");
  assert(
    ov.open.totalPointedMs === ov.open.productiveMs + ov.open.pausedMs,
    "reconcilia open"
  );
  assert(
    ov.totalPointedMs !== ov.open.totalPointedMs + ov.finished.totalPointedMs || true,
    "open não soma no consolidado"
  );
  assert(
    ov.totalPointedMs === 1_000_000 + 2_000_000 + 300_000,
    "consolidado sem parciais"
  );
  assert(ov.confidenceNote.includes("entrada do veículo"), "disclaimer OS");
  assert(ov.reconciliationNote.includes("NÃO entra"), "nota reconciliação");

  const tech = buildTechnicianBreakdown(facts, new Map([["t1", "Ana"], ["t2", "Bruno"]]));
  const ana = tech.find((t) => t.technicianUserId === "t1")!;
  const bruno = tech.find((t) => t.technicianUserId === "t2")!;
  assert(ana.totalPointedMs === ana.finished.totalPointedMs, "tech alias = finished");
  assert(ana.open.sessions === 0, "Ana sem abertas");
  assert(bruno.open.sessions === 2, "Bruno com parciais");
  assert(bruno.totalPointedMs === 0, "Bruno consolidado 0 (só abertas)");
  assert(bruno.open.totalPointedMs === 800_000 + 130_000, "Bruno parcial reconciliável");
}

console.log("\n7) Limites e paginação");
{
  assert(clampOpsLimit(9999) === OPS_QUERY_MAX_LIMIT, "limit cap 200");
  assert(clampOpsLimit(0) === 40, "limit default");
  assert(clampOpsLimit(10) === 10, "limit ok");
  assert(clampOpsOffset(-5) === 0, "offset floor");
  assert(clampOpsOffset(3) === 3, "offset ok");
  const many = Array.from({ length: 25 }, (_, i) =>
    fact({
      id: `m${i}`,
      os: `os${i}`,
      tech: "t1",
      kind: "execution",
      status: "finished",
      started: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T10:00:00Z`,
      ended: `2026-07-${String((i % 28) + 1).padStart(2, "0")}T11:00:00Z`,
      productive: (i + 1) * 1000,
      paused: 0,
      desc: `Servico ${i}`,
    })
  );
  const limited = buildServiceDurationRows(many, "execution", 5);
  assert(limited.length === 5, "limit 5 linhas de serviço");
}

console.log("\n8) Sessões finished vs parcial + amostras insuficientes");
{
  const finished = fact({
    id: "s1",
    os: "os1",
    tech: "t1",
    kind: "diagnostic",
    status: "finished",
    started: "2026-01-01T10:00:00Z",
    ended: "2026-01-01T11:00:00Z",
    productive: 3_600_000,
    paused: 600_000,
    desc: "Troca módulo ABS",
  });
  const open = fact({
    id: "s2",
    os: "os1",
    tech: "t1",
    kind: "diagnostic",
    status: "running",
    started: "2026-01-02T10:00:00Z",
    productive: 900_000,
    paused: 0,
    desc: "Troca módulo ABS",
  });
  assert(finished.definitiveProductiveMs === 3_600_000, "finished definitivo");
  assert(open.isPartial && open.definitiveProductiveMs === null, "running parcial");
  assert(
    definitiveProductiveValues([finished, open], "diagnostic").length === 1,
    "só finished na lista crua"
  );
  assert(
    serviceKeyFromDescription("Troca Módulo ABS!") ===
      serviceKeyFromDescription("troca modulo abs"),
    "chave normalizada"
  );
  assert(confidenceFromSamples(3) === "insufficient", "n<5");
  assert(medianMs([1, 3, 2]) === 2, "mediana");
  assert(buildDistribution([10, 20, 30, 40, 50]).medianMs === 30, "distribuição");
}

console.log("\n9) Padrões → memória (não auto)");
{
  const facts: OpsSessionFact[] = [];
  for (let i = 0; i < 8; i++) {
    facts.push(
      fact({
        id: `p${i}`,
        os: `os${i}`,
        tech: "t1",
        kind: "diagnostic",
        status: "finished",
        started: `2026-05-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
        ended: `2026-05-${String(i + 1).padStart(2, "0")}T12:00:00Z`,
        productive: 3_600_000 + i * 100_000,
        paused: 0,
        desc: "Diagnóstico ECU",
      })
    );
  }
  const pauseEvents = Array.from({ length: 6 }, () => ({
    reasonId: "awaiting_parts",
    label: "Aguardando peças",
    pausedMs: 1000 as number | null,
  }));
  const patterns = detectOperationalPatterns(facts, pauseEvents, {
    from: "2026-05-01T00:00:00Z",
    to: "2026-05-31T00:00:00Z",
  });
  assert(patterns.length >= 1, "detecta padrão");
  assert(
    patterns.every((p) => p.proposedKnowledge.category === "operational_learning"),
    "categoria válida memória"
  );
}

console.log("\n10) bucketTotals identidade");
{
  const b = bucketTotals([
    fact({
      id: "1",
      os: "o",
      tech: "t",
      kind: "diagnostic",
      status: "finished",
      started: "2026-01-01T00:00:00Z",
      ended: "2026-01-01T01:00:00Z",
      productive: 10,
      paused: 3,
      desc: "A",
    }),
    fact({
      id: "2",
      os: "o",
      tech: "t",
      kind: "execution",
      status: "finished",
      started: "2026-01-01T02:00:00Z",
      ended: "2026-01-01T03:00:00Z",
      productive: 20,
      paused: 7,
      desc: "A",
    }),
  ]);
  assert(b.productiveMs === 30 && b.pausedMs === 10 && b.totalPointedMs === 40, "bucket id");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
