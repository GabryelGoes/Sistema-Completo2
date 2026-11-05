/**
 * Selftest Gestão Inteligente do Pátio (Fase 3) — sem banco.
 * npm run test:rda-patio-intel
 */
import {
  authorizeToolInvocation,
  buildPatioDashboard,
  buildProductiveContext,
  canViewPatioIntelligence,
  detectDeliveryRisks,
  detectPatioBottlenecks,
  enrichOrderFact,
  ordersReadyToStart,
  parsePatioThresholds,
  patioStageLabel,
  PATIO_STAGE_IDS,
  productionRdaToolRegistry,
  suggestPatioPriorities,
  thresholdHoursForStatus,
} from "../services/rdaIntelligence/index.js";
import { ensureProductionRdaToolsRegistered } from "../services/rdaIntelligence/tools/registerProduction.js";
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

ensureProductionRdaToolsRegistered();
console.log("RDA patio intelligence selftest (Fase 3)\n");

console.log("1) Etapas reais auditadas");
{
  assert(PATIO_STAGE_IDS.includes("AGUARDANDO_AVALIACAO"), "AGUARDANDO_AVALIACAO");
  assert(PATIO_STAGE_IDS.includes("AVALIACAO_TECNICA"), "AVALIACAO_TECNICA");
  assert(PATIO_STAGE_IDS.includes("AGUARDANDO_APROVACAO"), "AGUARDANDO_APROVACAO");
  assert(PATIO_STAGE_IDS.includes("ORCAMENTO_APROVADO"), "ORCAMENTO_APROVADO");
  assert(PATIO_STAGE_IDS.includes("AGUARDANDO_PECAS"), "AGUARDANDO_PECAS");
  assert(PATIO_STAGE_IDS.includes("EM_SERVICO"), "EM_SERVICO");
  assert(PATIO_STAGE_IDS.includes("FASE_DE_TESTE"), "FASE_DE_TESTE");
  assert(PATIO_STAGE_IDS.includes("FINALIZADO"), "FINALIZADO");
  assert(PATIO_STAGE_IDS.includes("GARANTIA"), "GARANTIA");
  assert(PATIO_STAGE_IDS.includes("ORCAMENTO_NAO_APROVADO"), "ORCAMENTO_NAO_APROVADO");
  assert(patioStageLabel("EM_SERVICO") === "Em serviço", "label Em serviço");
}

console.log("\n2) Permissões");
{
  assert(
    canViewPatioIntelligence({ role: "admin", flags: null }),
    "admin"
  );
  assert(
    canViewPatioIntelligence({
      role: "user",
      userId: "u",
      flags: { isTechnician: false, permissions: { access_patio: true } },
      permissions: { access_patio: true },
    }),
    "access_patio"
  );
  assert(
    !canViewPatioIntelligence({
      role: "user",
      userId: "u",
      flags: { isTechnician: true, permissions: {} },
      permissions: {},
    }),
    "sem perms negado"
  );
}

console.log("\n3) Tools registradas");
{
  for (const id of [
    "rda_patio_attention_today",
    "rda_patio_bottlenecks",
    "rda_patio_priorities",
    "rda_patio_delivery_risks",
    "rda_patio_waiting_parts",
    "rda_patio_ready_to_start",
  ]) {
    assert(!!productionRdaToolRegistry.get(id), id);
  }
  const patioAuth: RdaAuthContext = {
    role: "user",
    userId: "p",
    permissions: { access_patio: true },
  };
  const ok = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: patioAuth,
    toolId: "rda_patio_bottlenecks",
    featureEnabled: true,
  });
  assert(ok.allowed, "tool patio autorizada com access_patio");
}

console.log("\n4) Permanência real / gargalos / prioridades / riscos");
{
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  const orders = [
    enrichOrderFact(
      {
        id: "1",
        plate: "ABC1D23",
        os_number: 101,
        status: "AGUARDANDO_AVALIACAO",
        // updated_at recente (edição) NÃO deve contar como entrada na etapa
        updated_at: "2026-11-05T11:00:00.000Z",
        created_at: "2026-11-03T12:00:00.000Z",
        status_entered_at: "2026-11-03T12:00:00.000Z",
        delivery_date: "2026-11-05T18:00:00.000Z",
      },
      now
    ),
    enrichOrderFact(
      {
        id: "2",
        plate: "XYZ9K88",
        os_number: 102,
        status: "AGUARDANDO_PECAS",
        updated_at: "2026-11-05T10:00:00.000Z",
        created_at: "2026-10-20T12:00:00.000Z",
        status_entered_at: "2026-10-28T12:00:00.000Z",
        delivery_date: "2026-11-04T12:00:00.000Z",
        assigned_technician: "João",
      },
      now
    ),
    enrichOrderFact(
      {
        id: "3",
        plate: "QWE4R56",
        status: "ORCAMENTO_APROVADO",
        updated_at: "2026-11-04T12:00:00.000Z",
        created_at: "2026-11-01T12:00:00.000Z",
        status_entered_at: "2026-11-04T12:00:00.000Z",
      },
      now
    ),
    enrichOrderFact(
      {
        id: "4",
        plate: "READY1",
        status: "PECAS_DISPONIVEIS",
        updated_at: "2026-11-05T08:00:00.000Z",
        created_at: "2026-11-04T08:00:00.000Z",
        status_entered_at: "2026-11-05T08:00:00.000Z",
      },
      now
    ),
    enrichOrderFact(
      {
        id: "5",
        plate: "LEGACY1",
        status: "EM_SERVICO",
        updated_at: "2026-10-01T08:00:00.000Z",
        created_at: "2026-09-01T08:00:00.000Z",
        // sem status_entered_at → desconhecido
      },
      now
    ),
  ];

  assert(orders[0]!.stageTimeKnown === true, "entrada conhecida");
  assert(orders[0]!.hoursInStage === 48, "48h desde status_entered_at (não updated_at)");
  assert(orders[0]!.stageTimeLabel.includes("48"), "label com horas");
  assert(orders[4]!.stageTimeKnown === false, "legado desconhecido");
  assert(orders[4]!.hoursInStage === null, "legado sem horas inventadas");
  assert(
    orders[4]!.stageTimeLabel === "Tempo na etapa desconhecido",
    "rótulo desconhecido"
  );

  const th = parsePatioThresholds(null);
  assert(thresholdHoursForStatus(th, "AGUARDANDO_AVALIACAO") === 24, "default 24h avaliação");
  const bots = detectPatioBottlenecks(orders, th);
  assert(bots.some((b) => b.kind === "waiting_evaluation"), "gargalo avaliação");
  assert(bots.some((b) => b.kind === "waiting_parts"), "gargalo peças");
  assert(
    !bots.some((b) => b.orderIds.includes("5")),
    "legado EM_SERVICO sem status_entered_at não vira gargalo por updated_at"
  );
  assert(
    !bots.some((b) => (b as { kind: string }).kind === "above_historical"),
    "sem gargalo above_historical (Fase 2 ≠ permanência)"
  );

  // Fase 2 com mediana alta NÃO deve criar gargalo por comparação com permanência
  const botsWithHist = detectPatioBottlenecks(orders, th, [
    { medianMs: 3_600_000, sampleCount: 40, confidence: "high" },
  ]);
  assert(
    !botsWithHist.some((b) => String(b.kind) === "above_historical"),
    "histórico Fase 2 não gera above_historical"
  );
  const ctx = buildProductiveContext([
    { medianMs: 3_600_000 * 4, sampleCount: 40, confidence: "high" },
  ]);
  assert(ctx.available === true, "contexto Fase 2 disponível com n≥15");
  assert(ctx.medianProductiveHours === 4, "mediana produtiva contextual");
  assert(ctx.note.toLowerCase().includes("não"), "nota deixa claro que não é permanência");

  const ctxWeak = buildProductiveContext([
    { medianMs: 3_600_000, sampleCount: 3, confidence: "insufficient" },
  ]);
  assert(ctxWeak.available === false, "sem previsão histórica se amostra insuficiente");

  const pri = suggestPatioPriorities(orders, th);
  assert(pri.length >= 1, "prioridades");
  assert(pri[0]!.reasons.length >= 1, "motivos de prioridade");
  const legacyPri = pri.find((p) => p.orderId === "5");
  if (legacyPri) {
    assert(
      legacyPri.reasons.some((r) => /desconhecido/i.test(r)),
      "prioridade legado menciona tempo desconhecido"
    );
  }
  const risks = detectDeliveryRisks(orders);
  assert(risks.some((r) => r.risk === "overdue" || r.risk === "imminent"), "risco entrega");
  assert(ordersReadyToStart(orders).length === 2, "prontos para iniciar");
  const dash = buildPatioDashboard({
    orders,
    thresholds: th,
    histHints: [{ medianMs: 3_600_000, sampleCount: 40, confidence: "high" }],
  });
  assert(dash.summary.totalActive === 5, "resumo");
  assert(dash.summary.unknownStageTimeCount === 1, "conta tempos desconhecidos");
  assert(
    /não updated_at|nao updated_at/i.test(dash.summary.note) ||
      !/\bvia updated_at\b|\b≈ updated_at\b/i.test(dash.summary.note),
    "nota não trata updated_at como fonte de permanência"
  );
  assert(/status_entered_at/i.test(dash.summary.note), "nota cita status_entered_at");
  assert(dash.productiveContext.available === true, "dashboard com contexto produtivo");
  assert(
    !dash.bottlenecks.some((b) => String(b.kind) === "above_historical"),
    "dashboard sem above_historical"
  );
  assert(dash.disclaimer.includes("não altera") || dash.disclaimer.includes("Sem movimentação"), "disclaimer");
  assert(
    dash.proposedKnowledgeDrafts.every((d) => d.category === "operational_learning"),
    "propostas só com aprovação"
  );
}

console.log("\n5) Limiares configuráveis");
{
  const custom = parsePatioThresholds(JSON.stringify({ AGUARDANDO_PECAS: 10 }));
  assert(thresholdHoursForStatus(custom, "AGUARDANDO_PECAS") === 10, "override peças");
  assert(thresholdHoursForStatus(custom, "EM_SERVICO") === 72, "default execução preservado");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
