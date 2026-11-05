/**
 * Selftest Inteligência Lab + Estoque (Fase 4) — sem banco.
 * npm run test:rda-lab-estoque
 */
import {
  authorizeToolInvocation,
  buildLabBenchOccupancy,
  buildLabEstoqueDashboard,
  buildStockSummary,
  canViewLabEstoqueIntelligence,
  canViewLabIntelligence,
  canViewStockIntelligence,
  detectLabBottlenecks,
  enrichAbsUnit,
  enrichLabOrderFact,
  LAB_STAGE_IDS,
  labStageLabel,
  listReadyForPickup,
  parseLabThresholds,
  productionRdaToolRegistry,
  thresholdHoursForLabStatus,
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
console.log("RDA lab+estoque intelligence selftest (Fase 4)\n");

console.log("1) Etapas reais do laboratório");
{
  assert(LAB_STAGE_IDS.includes("AGUARDANDO_AVALIACAO"), "AGUARDANDO_AVALIACAO");
  assert(LAB_STAGE_IDS.includes("AVALIACAO_TECNICA"), "Em análise");
  assert(LAB_STAGE_IDS.includes("EM_SERVICO"), "Em reparo");
  assert(LAB_STAGE_IDS.includes("PRONTO_PRA_RETIRADA"), "Pronto pra entrega");
  assert(LAB_STAGE_IDS.includes("EM_CONSERTO_EXTERNO"), "conserto externo");
  assert(labStageLabel("EM_SERVICO") === "Em reparo", "label Em reparo");
  assert(labStageLabel("PRONTO_PRA_RETIRADA") === "Pronto pra entrega", "label entrega");
}

console.log("\n2) Permissões");
{
  assert(
    canViewLabEstoqueIntelligence({ role: "admin", flags: null }),
    "admin combinado"
  );
  assert(
    canViewLabIntelligence({
      role: "user",
      userId: "u",
      flags: { isTechnician: false, permissions: { access_laboratorio: true } },
      permissions: { access_laboratorio: true },
    }),
    "lab"
  );
  assert(
    canViewStockIntelligence({
      role: "user",
      userId: "u",
      flags: { isTechnician: false, permissions: { access_estoque_pecas: true } },
      permissions: { access_estoque_pecas: true },
    }),
    "estoque"
  );
  assert(
    !canViewLabIntelligence({
      role: "user",
      userId: "u",
      flags: { isTechnician: true, permissions: {} },
      permissions: {},
    }),
    "lab negado"
  );
}

console.log("\n3) Tools Fase 4");
{
  for (const id of [
    "rda_lab_estoque_dashboard",
    "rda_lab_attention",
    "rda_lab_bottlenecks",
    "rda_lab_bench_status",
    "rda_lab_ready_pickup",
    "rda_lab_longest_modules",
    "rda_stock_abs_search",
    "rda_stock_abs_locate",
    "rda_stock_low_parts",
    "rda_stock_summary",
  ]) {
    assert(!!productionRdaToolRegistry.get(id), id);
  }
  const auth: RdaAuthContext = {
    role: "user",
    userId: "l",
    permissions: { access_laboratorio: true },
  };
  assert(
    authorizeToolInvocation({
      registry: productionRdaToolRegistry,
      auth,
      toolId: "rda_lab_bottlenecks",
      featureEnabled: true,
    }).allowed,
    "tool lab autorizada"
  );
}

console.log("\n4) Análise lab / estoque");
{
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  const orders = [
    enrichLabOrderFact(
      {
        id: "m1",
        os_number: 501,
        module_identification: "ABS Corolla",
        module_kind: "completo",
        status: "AGUARDANDO_APROVACAO",
        bench_slot: 3,
        created_at: "2026-10-20T12:00:00.000Z",
        updated_at: "2026-11-05T10:00:00.000Z",
        status_entered_at: "2026-11-01T12:00:00.000Z",
      },
      now
    ),
    enrichLabOrderFact(
      {
        id: "m2",
        os_number: 502,
        module_identification: "Hidráulico Civic",
        status: "PRONTO_PRA_RETIRADA",
        bench_slot: 7,
        created_at: "2026-11-01T12:00:00.000Z",
        updated_at: "2026-11-05T08:00:00.000Z",
        status_entered_at: "2026-11-03T12:00:00.000Z",
      },
      now
    ),
    enrichLabOrderFact(
      {
        id: "m3",
        status: "EM_SERVICO",
        bench_slot: 1,
        created_at: "2026-09-01T12:00:00.000Z",
        updated_at: "2026-09-02T12:00:00.000Z",
        // legado sem status_entered_at
      },
      now
    ),
  ];

  assert(orders[0]!.stageTimeKnown === true, "etapa conhecida");
  assert(orders[0]!.hoursInStage === 96, "96h desde status_entered_at");
  assert(orders[2]!.stageTimeKnown === false, "legado desconhecido");
  assert(orders[2]!.stageTimeLabel === "Tempo na etapa desconhecido", "rótulo");
  assert(listReadyForPickup(orders).length === 1, "pronto pra entrega");

  const th = parseLabThresholds(null);
  assert(thresholdHoursForLabStatus(th, "AGUARDANDO_APROVACAO") === 48, "default aprovação");
  const bots = detectLabBottlenecks(orders, th);
  assert(bots.some((b) => b.kind === "waiting_approval"), "gargalo aprovação");
  assert(!bots.some((b) => b.orderIds.includes("m3")), "legado sem entered_at fora do gargalo");

  const bench = buildLabBenchOccupancy(orders);
  assert(bench.occupied === 3, "3 bancadas ocupadas");
  assert(bench.free === 21, "21 livres");
  assert(bench.slots.find((s) => s.slot === 3)?.occupied === true, "slot 3");

  const part = enrichAbsUnit({
    id: "a1",
    public_id: "ABS-000004",
    sequence_number: 4,
    module_kind: "eletronico",
    status: "disponivel",
    location: "Prateleira A",
  });
  assert(part.sequenceLabel === "#4", "label #4");
  assert(part.directlySellableAsPart === true, "eletrônico vendável");

  const complete = enrichAbsUnit({
    id: "a2",
    public_id: "ABS-000010",
    sequence_number: 10,
    module_kind: "completo",
    status: "disponivel",
  });
  assert(complete.availableOnlyViaDisassembly === true, "completo só via desmembramento");
  assert(complete.directlySellableAsPart === false, "completo não é parte direta");

  const stock = buildStockSummary(
    [
      { status: "disponivel", module_kind: "completo" },
      { status: "disponivel", module_kind: "eletronico" },
      { status: "reservado", module_kind: "hidraulico" },
    ],
    [
      {
        id: "p1",
        name: "Sensor",
        sku: "S1",
        barcode: null,
        brand: null,
        quantity: 1,
        minQuantity: 2,
        location: null,
        lowStock: true,
      },
    ]
  );
  assert(stock.absAvailable === 2, "2 ABS disponíveis");
  assert(stock.partsLowStock === 1, "1 peça baixa");

  const dash = buildLabEstoqueDashboard({
    labOrders: orders,
    thresholds: th,
    includeLab: true,
    includeStock: true,
    stockSummary: stock,
    lowStockParts: [
      {
        id: "p1",
        name: "Sensor",
        sku: "S1",
        barcode: null,
        brand: null,
        quantity: 1,
        minQuantity: 2,
        location: null,
        lowStock: true,
      },
    ],
  });
  assert(dash.summary.labActive === 3, "resumo lab");
  assert(dash.summary.readyForPickup === 1, "resumo retirada");
  assert(dash.scopes.lab && dash.scopes.stock, "escopos");
  assert(/desmembr/i.test(dash.disclaimer), "disclaimer desmembramento");
  assert(!/updated_at/i.test(dash.summary.note) || /não updated_at/i.test(dash.summary.note), "nota sem updated_at como fonte");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
