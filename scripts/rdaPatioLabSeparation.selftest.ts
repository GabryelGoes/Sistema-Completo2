/**
 * Garante isolamento Pátio (vehicle) × Laboratório (module) nas tools RDA.
 * Rode: npx tsx scripts/rdaPatioLabSeparation.selftest.ts
 */
import {
  executeRdaTool,
  ensureProductionRdaToolsRegistered,
  productionRdaToolRegistry,
  RDA_ORDER_TYPE_LAB,
  RDA_ORDER_TYPE_PATIO,
  RDA_PRODUCTION_TOOLS,
} from "../services/rdaIntelligence/index.js";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

type FakeRow = Record<string, unknown>;

type EqFilter = { col: string; value: unknown };

/**
 * Cliente Supabase mínimo em memória: registra .eq e filtra rows.
 */
function createFakeSupabase(rowsByTable: Record<string, FakeRow[]>) {
  const eqLog: EqFilter[] = [];

  function makeBuilder(table: string) {
    const state = {
      filters: [] as EqFilter[],
      neq: [] as EqFilter[],
      limitN: 1000,
      orderAsc: true,
    };

    const api: Record<string, unknown> = {};
    const self = () => api;

    api.select = () => self();
    api.eq = (col: string, value: unknown) => {
      const f = { col, value };
      state.filters.push(f);
      eqLog.push(f);
      return self();
    };
    api.neq = (col: string, value: unknown) => {
      state.neq.push({ col, value });
      return self();
    };
    api.in = () => self();
    api.gte = () => self();
    api.lte = () => self();
    api.lt = () => self();
    api.ilike = () => self();
    api.or = () => self();
    api.order = (_col: string, opts?: { ascending?: boolean }) => {
      state.orderAsc = opts?.ascending !== false;
      return self();
    };
    api.limit = (n: number) => {
      state.limitN = n;
      return self();
    };
    const resolve = async () => {
      let rows = [...(rowsByTable[table] || [])];
      for (const f of state.filters) {
        rows = rows.filter((r) => r[f.col] === f.value);
      }
      for (const f of state.neq) {
        rows = rows.filter((r) => r[f.col] !== f.value);
      }
      rows = rows.slice(0, state.limitN);
      return { data: rows, error: null };
    };

    api.maybeSingle = async () => {
      const res = await resolve();
      return { data: res.data?.[0] || null, error: res.error };
    };

    // Thenable para await da cadeia
    (api as { then: typeof Promise.prototype.then }).then = (
      onfulfilled,
      onrejected
    ) => resolve().then(onfulfilled, onrejected);

    return { api, getFilters: () => state.filters };
  }

  const lastBuilders: Array<ReturnType<typeof makeBuilder>> = [];

  return {
    eqLog,
    from(table: string) {
      const b = makeBuilder(table);
      lastBuilders.push(b);
      return b.api;
    },
    lastOrderTypeEq(): unknown {
      const hits = eqLog.filter((f) => f.col === "order_type");
      return hits.length ? hits[hits.length - 1].value : undefined;
    },
    orderTypeEqValues(): unknown[] {
      return eqLog.filter((f) => f.col === "order_type").map((f) => f.value);
    },
  };
}

const now = Date.now();
const hoursAgo = (h: number) => new Date(now - h * 3600000).toISOString();

const WID = "w1";

const mixedOrders: FakeRow[] = [
  {
    id: "v1",
    workshop_id: WID,
    os_number: 1,
    plate: "ABC1D23",
    vehicle_model: "Gol",
    vehicle_brand: "VW",
    status: "EM_SERVICO",
    updated_at: hoursAgo(72),
    status_entered_at: hoursAgo(72),
    created_at: hoursAgo(100),
    assigned_technician: "A",
    issue_description: "ABS falhando",
    order_type: "vehicle",
    module_identification: null,
  },
  {
    id: "v2",
    workshop_id: WID,
    os_number: 2,
    plate: "XYZ9Z99",
    vehicle_model: "Onix",
    vehicle_brand: "GM",
    status: "AGUARDANDO_APROVACAO",
    updated_at: hoursAgo(10),
    status_entered_at: hoursAgo(10),
    created_at: hoursAgo(20),
    assigned_technician: "B",
    issue_description: "ruído",
    order_type: "vehicle",
    module_identification: null,
  },
  {
    id: "m1",
    workshop_id: WID,
    os_number: 101,
    plate: "MOD1234",
    vehicle_model: "ABS Bosch",
    vehicle_brand: "",
    status: "EM_SERVICO",
    updated_at: hoursAgo(80),
    status_entered_at: hoursAgo(80),
    created_at: hoursAgo(120),
    assigned_technician: "C",
    issue_description: "módulo sem comunicação",
    order_type: "module",
    module_identification: "ABS-9",
  },
  {
    id: "m2",
    workshop_id: WID,
    os_number: 102,
    plate: "LAB0001",
    vehicle_model: "TCU",
    vehicle_brand: "",
    status: "AGUARDANDO_PECAS",
    updated_at: hoursAgo(5),
    status_entered_at: hoursAgo(5),
    created_at: hoursAgo(40),
    assigned_technician: "D",
    issue_description: "reparo externo",
    order_type: "module",
    module_identification: "TCU-1",
  },
  {
    id: "done_v",
    workshop_id: WID,
    os_number: 3,
    plate: "OLD0001",
    status: "FINALIZADO",
    updated_at: hoursAgo(200),
    status_entered_at: hoursAgo(200),
    created_at: hoursAgo(300),
    order_type: "vehicle",
    issue_description: "ok",
  },
];

console.log("RDA Pátio × Laboratório separation selftest\n");

ensureProductionRdaToolsRegistered();

console.log("1) Registry");
assert(
  productionRdaToolRegistry.has("rda_list_stalled_vehicles"),
  "stalled vehicles"
);
assert(
  productionRdaToolRegistry.has("rda_list_stalled_modules"),
  "stalled modules"
);
assert(
  productionRdaToolRegistry.has("rda_patio_stage_snapshot"),
  "patio snapshot"
);
assert(productionRdaToolRegistry.has("rda_lab_stage_snapshot"), "lab snapshot");
assert(
  productionRdaToolRegistry.list().length === RDA_PRODUCTION_TOOLS.length,
  `registry size ${RDA_PRODUCTION_TOOLS.length}`
);

console.log("\n2) list stalled — Pátio nunca retorna Lab");
{
  const sb = createFakeSupabase({ service_orders: mixedOrders });
  const res = await executeRdaTool(
    "rda_list_stalled_vehicles",
    { minHours: 24, limit: 20 },
    { workshopId: WID, supabase: sb as never }
  );
  assert(res.ok === true, "stalled vehicles ok");
  const items = ((res as { data: { items: FakeRow[] } }).data.items || []) as FakeRow[];
  assert(
    items.every((i) => i.order_type === RDA_ORDER_TYPE_PATIO),
    "todos items vehicle"
  );
  assert(
    items.every((i) => i.sector === "patio"),
    "todos sector patio"
  );
  assert(
    !items.some((i) => i.id === "m1" || i.id === "m2"),
    "sem OS de módulo"
  );
  assert(
    items.some((i) => i.id === "v1"),
    "inclui veículo parado"
  );
  assert(
    sb.orderTypeEqValues().includes(RDA_ORDER_TYPE_PATIO),
    "query filtrada order_type=vehicle"
  );
  assert(
    !sb.orderTypeEqValues().includes(RDA_ORDER_TYPE_LAB),
    "query Pátio sem filter module"
  );
}

console.log("\n3) list stalled — Lab nunca retorna Pátio");
{
  const sb = createFakeSupabase({ service_orders: mixedOrders });
  const res = await executeRdaTool(
    "rda_list_stalled_modules",
    { minHours: 24, limit: 20 },
    { workshopId: WID, supabase: sb as never }
  );
  assert(res.ok === true, "stalled modules ok");
  const items = ((res as { data: { items: FakeRow[] } }).data.items || []) as FakeRow[];
  assert(
    items.every((i) => i.order_type === RDA_ORDER_TYPE_LAB),
    "todos items module"
  );
  assert(
    items.every((i) => i.sector === "laboratorio"),
    "todos sector laboratorio"
  );
  assert(!items.some((i) => i.id === "v1" || i.id === "v2"), "sem OS de veículo");
  assert(items.some((i) => i.id === "m1"), "inclui módulo parado");
  assert(
    sb.orderTypeEqValues().includes(RDA_ORDER_TYPE_LAB),
    "query filtrada order_type=module"
  );
}

console.log("\n4) snapshots isolados");
{
  const sbPatio = createFakeSupabase({ service_orders: mixedOrders });
  const patio = await executeRdaTool(
    "rda_patio_stage_snapshot",
    {},
    { workshopId: WID, supabase: sbPatio as never }
  );
  assert(patio.ok === true, "patio snapshot ok");
  const patioData = (patio as { data: Record<string, unknown> }).data;
  assert(patioData.sector === "patio", "snapshot sector patio");
  assert(patioData.orderType === RDA_ORDER_TYPE_PATIO, "snapshot order vehicle");
  const patioCounts = patioData.countsByStatus as Record<string, number>;
  const patioTotal = Object.values(patioCounts).reduce((a, b) => a + b, 0);
  // Snapshot exclui só CANCELLED (FINALIZADO entra na contagem) — mas nunca módulos.
  assert(patioTotal === 3, `pátio conta só veículos (got ${patioTotal})`);
  assert(!patioCounts["EM_SERVICO"] || patioCounts["EM_SERVICO"] >= 1, "pátio tem EM_SERVICO de veículo");
  assert(
    sbPatio.orderTypeEqValues().includes(RDA_ORDER_TYPE_PATIO),
    "patio snapshot filtra vehicle"
  );

  const sbLab = createFakeSupabase({ service_orders: mixedOrders });
  const lab = await executeRdaTool(
    "rda_lab_stage_snapshot",
    {},
    { workshopId: WID, supabase: sbLab as never }
  );
  assert(lab.ok === true, "lab snapshot ok");
  const labData = (lab as { data: Record<string, unknown> }).data;
  assert(labData.sector === "laboratorio", "snapshot sector lab");
  assert(labData.orderType === RDA_ORDER_TYPE_LAB, "snapshot order module");
  const labCounts = labData.countsByStatus as Record<string, number>;
  const labTotal = Object.values(labCounts).reduce((a, b) => a + b, 0);
  assert(labTotal === 2, `lab conta só módulos (got ${labTotal})`);
  assert(
    sbLab.orderTypeEqValues().includes(RDA_ORDER_TYPE_LAB),
    "lab snapshot filtra module"
  );
}

console.log("\n5) get_service_order ainda encontra veículo e módulo");
{
  const sb = createFakeSupabase({ service_orders: mixedOrders });
  const vehicle = await executeRdaTool(
    "rda_get_service_order",
    { serviceOrderId: "v1" },
    { workshopId: WID, supabase: sb as never }
  );
  assert(vehicle.ok === true, "get vehicle ok");
  const vItems = ((vehicle as { data: { items: FakeRow[] } }).data.items || []) as FakeRow[];
  assert(vItems[0]?.id === "v1" && vItems[0]?.sector === "patio", "vehicle setor pátio");

  const sb2 = createFakeSupabase({ service_orders: mixedOrders });
  const mod = await executeRdaTool(
    "rda_get_service_order",
    { serviceOrderId: "m1" },
    { workshopId: WID, supabase: sb2 as never }
  );
  assert(mod.ok === true, "get module ok");
  const mItems = ((mod as { data: { items: FakeRow[] } }).data.items || []) as FakeRow[];
  assert(
    mItems[0]?.id === "m1" && mItems[0]?.sector === "laboratorio",
    "module setor laboratório"
  );
}

console.log("\n6) histórico de veículo não mistura Lab");
{
  const sb = createFakeSupabase({
    service_orders: [
      ...mixedOrders,
      {
        id: "m_same_plate",
        workshop_id: WID,
        plate: "ABC1D23",
        order_type: "module",
        status: "EM_SERVICO",
        created_at: hoursAgo(1),
        issue_description: "módulo mesma placa",
        module_identification: "X",
      },
    ],
  });
  const res = await executeRdaTool(
    "rda_vehicle_maintenance_history",
    { plate: "ABC1D23", limit: 20 },
    { workshopId: WID, supabase: sb as never }
  );
  assert(res.ok === true, "history ok");
  const items = ((res as { data: { items: FakeRow[] } }).data.items || []) as FakeRow[];
  assert(
    items.every((i) => i.order_type === RDA_ORDER_TYPE_PATIO),
    "histórico só vehicle"
  );
  assert(!items.some((i) => i.id === "m_same_plate"), "sem módulo no histórico");
  assert(sb.orderTypeEqValues().includes(RDA_ORDER_TYPE_PATIO), "history filtra vehicle");
}

console.log("\n7) estoque não usa service_orders");
{
  const sb = createFakeSupabase({
    service_orders: mixedOrders,
    workshop_parts: [
      {
        id: "p1",
        workshop_id: WID,
        name: "Módulo ABS Bosch",
        stock_qty: 2,
        min_stock_qty: 0,
        original_code: "ABS-1",
        barcode: "7891000100015",
      },
    ],
  });
  const res = await executeRdaTool(
    "rda_search_stock_parts",
    { query: "Módulo ABS", onlyInStock: true, limit: 10 },
    { workshopId: WID, supabase: sb as never }
  );
  assert(res.ok === true, "stock ok");
  const data = (res as { data: { source?: string; items: FakeRow[] } }).data;
  assert(data.source === "workshop_parts", "source workshop_parts");
  assert(
    (data.items || []).every((i) => i.id === "p1"),
    "retorna peça de estoque, não OS"
  );
  assert(
    !sb.orderTypeEqValues().length,
    "estoque não filtra order_type de service_orders"
  );

  const byCode = await executeRdaTool(
    "rda_search_stock_parts",
    { query: "ABS-1", onlyInStock: true, limit: 10 },
    { workshopId: WID, supabase: sb as never }
  );
  assert(byCode.ok === true, "busca por original_code ok");
  assert(
    (((byCode as { data: { items: FakeRow[] } }).data.items || []) as FakeRow[]).some(
      (i) => i.id === "p1"
    ),
    "encontra peça pelo original_code"
  );

  const byBarcode = await executeRdaTool(
    "rda_search_stock_parts",
    { query: "7891000100015", onlyInStock: true, limit: 10 },
    { workshopId: WID, supabase: sb as never }
  );
  assert(byBarcode.ok === true, "busca por barcode ok");
  assert(
    (((byBarcode as { data: { items: FakeRow[] } }).data.items || []) as FakeRow[]).some(
      (i) => i.id === "p1"
    ),
    "encontra peça pelo barcode"
  );
}

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
if (failed > 0) process.exit(1);
process.exit(0);
