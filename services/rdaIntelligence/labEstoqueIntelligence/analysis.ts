import { LAB_BENCH_SLOT_COUNT, labStageLabel } from "./stages.js";
import { thresholdHoursForLabStatus, type LabThresholds } from "./thresholds.js";
import type {
  AbsUnitFact,
  LabAttentionItem,
  LabBenchOccupancy,
  LabBottleneck,
  LabBottleneckKind,
  LabEstoqueDashboard,
  LabOrderFact,
  StockPartFact,
  StockSummary,
} from "./types.js";

function hoursSinceIso(iso: string | null | undefined, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (nowMs - t) / 3_600_000);
}

export function formatStageTimeLabel(hours: number | null, known: boolean): string {
  if (!known || hours == null) return "Tempo na etapa desconhecido";
  return `${Math.round(hours * 10) / 10}h na etapa`;
}

export function formatLabTimeLabel(hours: number | null): string {
  if (hours == null) return "Tempo no laboratório desconhecido";
  return `${Math.round(hours * 10) / 10}h no laboratório`;
}

export function enrichLabOrderFact(
  row: {
    id: string;
    os_number?: number | null;
    plate?: string | null;
    vehicle_model?: string | null;
    vehicle_brand?: string | null;
    module_identification?: string | null;
    module_kind?: string | null;
    status?: string | null;
    assigned_technician?: string | null;
    bench_slot?: number | null;
    delivery_date?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    status_entered_at?: string | null;
    customers?: { name?: string | null } | null;
  },
  nowMs = Date.now()
): LabOrderFact {
  const status = String(row.status || "").trim();
  const updatedAt = String(row.updated_at || row.created_at || new Date(nowMs).toISOString());
  const createdAt = String(row.created_at || updatedAt);
  const rawEntered =
    row.status_entered_at != null && String(row.status_entered_at).trim() !== ""
      ? String(row.status_entered_at)
      : null;
  const stageTimeKnown = rawEntered != null;
  const hoursRaw = stageTimeKnown ? hoursSinceIso(rawEntered, nowMs) : null;
  const hoursInStage = hoursRaw == null ? null : Math.round(hoursRaw * 10) / 10;
  const labHoursRaw = hoursSinceIso(createdAt, nowMs);
  const hoursInLab = labHoursRaw == null ? null : Math.round(labHoursRaw * 10) / 10;
  const bench =
    row.bench_slot != null && Number.isFinite(Number(row.bench_slot))
      ? Number(row.bench_slot)
      : null;

  return {
    id: row.id,
    osNumber: row.os_number ?? null,
    plate: row.plate ?? null,
    vehicleModel: row.vehicle_model ?? null,
    vehicleBrand: row.vehicle_brand ?? null,
    customerName: row.customers?.name ?? null,
    moduleIdentification: row.module_identification ?? null,
    moduleKind: row.module_kind ?? null,
    status,
    statusLabel: labStageLabel(status),
    assignedTechnician: row.assigned_technician ?? null,
    benchSlot: bench != null && bench >= 1 && bench <= LAB_BENCH_SLOT_COUNT ? bench : null,
    deliveryDate: row.delivery_date ?? null,
    createdAt,
    updatedAt,
    statusEnteredAt: rawEntered,
    stageTimeKnown,
    hoursInStage,
    stageTimeLabel: formatStageTimeLabel(hoursInStage, stageTimeKnown),
    hoursInLab,
    labTimeLabel: formatLabTimeLabel(hoursInLab),
    orderType: "module",
  };
}

function knownHours(o: LabOrderFact): number | null {
  return o.stageTimeKnown && o.hoursInStage != null ? o.hoursInStage : null;
}

function buildBottleneck(
  kind: LabBottleneckKind,
  title: string,
  status: string,
  orders: LabOrderFact[],
  thresholdHours: number,
  evidence: string
): LabBottleneck | null {
  if (!orders.length) return null;
  return {
    kind,
    title,
    status,
    count: orders.length,
    thresholdHours,
    evidence,
    orderIds: orders.map((o) => o.id),
    sample: orders.slice(0, 8).map((o) => ({
      id: o.id,
      osNumber: o.osNumber,
      moduleIdentification: o.moduleIdentification,
      benchSlot: o.benchSlot,
      hoursInStage: o.hoursInStage,
      stageTimeLabel: o.stageTimeLabel,
      technician: o.assignedTechnician,
    })),
  };
}

export function detectLabBottlenecks(
  orders: LabOrderFact[],
  thresholds: LabThresholds
): LabBottleneck[] {
  const over = (status: string) => {
    const th = thresholdHoursForLabStatus(thresholds, status);
    return {
      th,
      list: orders.filter((o) => {
        if (o.status !== status) return false;
        const h = knownHours(o);
        return h != null && h >= th;
      }),
    };
  };

  const out: LabBottleneck[] = [];
  const push = (b: LabBottleneck | null) => {
    if (b) out.push(b);
  };

  {
    const { th, list } = over("AGUARDANDO_AVALIACAO");
    push(
      buildBottleneck(
        "waiting_evaluation",
        "Aguardando avaliação além do limite",
        "AGUARDANDO_AVALIACAO",
        list,
        th,
        `${list.length} módulo(s) ≥ ${th}h (status_entered_at).`
      )
    );
  }
  {
    const { th, list } = over("AVALIACAO_TECNICA");
    push(
      buildBottleneck(
        "slow_analysis",
        "Análises demoradas",
        "AVALIACAO_TECNICA",
        list,
        th,
        `${list.length} módulo(s) em análise ≥ ${th}h.`
      )
    );
  }
  {
    const { th, list } = over("AGUARDANDO_APROVACAO");
    push(
      buildBottleneck(
        "waiting_approval",
        "Aguardando aprovação de reparo",
        "AGUARDANDO_APROVACAO",
        list,
        th,
        `${list.length} módulo(s) aguardando aprovação ≥ ${th}h.`
      )
    );
  }
  {
    const { th, list } = over("ORCAMENTO_APROVADO");
    push(
      buildBottleneck(
        "approved_not_started",
        "Reparo aprovado sem início",
        "ORCAMENTO_APROVADO",
        list,
        th,
        `${list.length} módulo(s) com reparo aprovado ≥ ${th}h.`
      )
    );
  }
  {
    const { th, list } = over("AGUARDANDO_PECAS");
    push(
      buildBottleneck(
        "waiting_parts",
        "Aguardando peças",
        "AGUARDANDO_PECAS",
        list,
        th,
        `${list.length} módulo(s) aguardando peças ≥ ${th}h.`
      )
    );
  }
  {
    const { th, list } = over("EM_SERVICO");
    push(
      buildBottleneck(
        "slow_repair",
        "Em reparo acima do limite",
        "EM_SERVICO",
        list,
        th,
        `${list.length} módulo(s) em reparo ≥ ${th}h (permanência ≠ tempo apontado).`
      )
    );
  }
  {
    const { th, list } = over("FINALIZADO");
    push(
      buildBottleneck(
        "finished_awaiting_pickup",
        "Finalizados aguardando avanço/retirada",
        "FINALIZADO",
        list,
        th,
        `${list.length} módulo(s) finalizados ≥ ${th}h na etapa.`
      )
    );
  }
  {
    const { th, list } = over("PRONTO_PRA_RETIRADA");
    push(
      buildBottleneck(
        "ready_for_pickup",
        "Prontos pra entrega há tempo demais",
        "PRONTO_PRA_RETIRADA",
        list,
        th,
        `${list.length} módulo(s) prontos pra entrega ≥ ${th}h.`
      )
    );
  }
  {
    const { th, list } = over("EM_CONSERTO_EXTERNO");
    push(
      buildBottleneck(
        "external_repair_long",
        "Conserto externo prolongado",
        "EM_CONSERTO_EXTERNO",
        list,
        th,
        `${list.length} módulo(s) em conserto externo ≥ ${th}h.`
      )
    );
  }

  return out.sort((a, b) => b.count - a.count || b.thresholdHours - a.thresholdHours);
}

export function buildLabBenchOccupancy(orders: LabOrderFact[]): LabBenchOccupancy {
  const bySlot = new Map<number, LabOrderFact>();
  let queuedEstimate = 0;
  for (const o of orders) {
    if (o.benchSlot != null) {
      if (!bySlot.has(o.benchSlot)) bySlot.set(o.benchSlot, o);
    } else if (
      o.status !== "EM_CONSERTO_EXTERNO" &&
      o.status !== "ORCAMENTO_NAO_APROVADO" &&
      o.status !== "CANCELLED"
    ) {
      queuedEstimate += 1;
    }
  }
  const slots: LabBenchOccupancy["slots"] = [];
  for (let s = 1; s <= LAB_BENCH_SLOT_COUNT; s++) {
    const o = bySlot.get(s);
    slots.push({
      slot: s,
      occupied: !!o,
      orderId: o?.id ?? null,
      osNumber: o?.osNumber ?? null,
      moduleIdentification: o?.moduleIdentification ?? null,
      status: o?.status ?? null,
      statusLabel: o?.statusLabel ?? null,
    });
  }
  const occupied = bySlot.size;
  return {
    totalSlots: LAB_BENCH_SLOT_COUNT,
    occupied,
    free: LAB_BENCH_SLOT_COUNT - occupied,
    queuedEstimate,
    slots,
  };
}

export function listReadyForPickup(orders: LabOrderFact[]): LabOrderFact[] {
  return orders.filter((o) => o.status === "PRONTO_PRA_RETIRADA");
}

export function listLongestInLab(orders: LabOrderFact[], limit = 15): LabOrderFact[] {
  return [...orders]
    .filter((o) => o.hoursInLab != null)
    .sort((a, b) => (b.hoursInLab || 0) - (a.hoursInLab || 0))
    .slice(0, limit);
}

export function buildLabAttention(
  bottlenecks: LabBottleneck[],
  ready: LabOrderFact[],
  longest: LabOrderFact[],
  limit = 25
): LabAttentionItem[] {
  const byId = new Map<string, LabAttentionItem>();
  for (const o of ready.slice(0, 10)) {
    byId.set(o.id, {
      orderId: o.id,
      osNumber: o.osNumber,
      moduleIdentification: o.moduleIdentification,
      status: o.status,
      statusLabel: o.statusLabel,
      kind: "ready_pickup",
      summary: `Pronto pra entrega${o.benchSlot != null ? ` · bancada ${o.benchSlot}` : ""}`,
      benchSlot: o.benchSlot,
      stageTimeLabel: o.stageTimeLabel,
    });
  }
  for (const b of bottlenecks) {
    for (const s of b.sample.slice(0, 3)) {
      if (byId.has(s.id)) continue;
      byId.set(s.id, {
        orderId: s.id,
        osNumber: s.osNumber,
        moduleIdentification: s.moduleIdentification,
        status: b.status,
        statusLabel: labStageLabel(b.status),
        kind: b.kind,
        summary: b.title,
        benchSlot: s.benchSlot,
        stageTimeLabel: s.stageTimeLabel,
      });
    }
  }
  for (const o of longest.slice(0, 8)) {
    if (byId.has(o.id)) continue;
    byId.set(o.id, {
      orderId: o.id,
      osNumber: o.osNumber,
      moduleIdentification: o.moduleIdentification,
      status: o.status,
      statusLabel: o.statusLabel,
      kind: "long_dwell_lab",
      summary: o.labTimeLabel,
      benchSlot: o.benchSlot,
      stageTimeLabel: o.stageTimeLabel,
    });
  }
  return [...byId.values()].slice(0, limit);
}

export function enrichAbsUnit(row: {
  id: string;
  public_id?: string | null;
  sequence_number?: number | null;
  module_kind?: string | null;
  status?: string | null;
  condition?: string | null;
  item_state?: string | null;
  item_condition?: string | null;
  manufacturer?: string | null;
  original_code?: string | null;
  application?: string | null;
  model?: string | null;
  location?: string | null;
  model_id?: string | null;
}): AbsUnitFact {
  const kind = String(row.module_kind || "").trim() || "outro";
  const status = String(row.status || "").trim();
  const seq =
    row.sequence_number != null && Number.isFinite(Number(row.sequence_number))
      ? Number(row.sequence_number)
      : null;
  const disponivel = status === "disponivel";
  const isPart = kind === "eletronico" || kind === "hidraulico";
  const isComplete = kind === "completo";
  return {
    id: row.id,
    publicId: String(row.public_id || ""),
    sequenceNumber: seq,
    sequenceLabel: seq != null ? `#${seq}` : null,
    moduleKind: kind,
    status,
    condition: row.condition != null ? String(row.condition) : null,
    itemState: row.item_state != null ? String(row.item_state) : null,
    itemCondition: row.item_condition != null ? String(row.item_condition) : null,
    manufacturer: row.manufacturer ?? null,
    originalCode: row.original_code ?? null,
    application: row.application ?? null,
    model: row.model ?? null,
    location: row.location ?? null,
    modelId: row.model_id ?? null,
    directlySellableAsPart: disponivel && isPart,
    availableOnlyViaDisassembly: disponivel && isComplete,
  };
}

export function buildStockSummary(
  absRows: Array<{ status?: string | null; module_kind?: string | null }>,
  parts: StockPartFact[]
): StockSummary {
  const absByKind: Record<string, number> = {};
  let absAvailable = 0;
  let absReserved = 0;
  let absOut = 0;
  let absDisassembled = 0;
  for (const r of absRows) {
    const st = String(r.status || "");
    const kind = String(r.module_kind || "outro");
    if (st === "disponivel") {
      absAvailable += 1;
      absByKind[kind] = (absByKind[kind] || 0) + 1;
    } else if (st === "reservado") absReserved += 1;
    else if (st === "desmembrado") absDisassembled += 1;
    else absOut += 1;
  }
  return {
    absAvailable,
    absReserved,
    absOut,
    absDisassembled,
    absByKind,
    partsSkus: parts.length,
    partsLowStock: parts.filter((p) => p.lowStock).length,
    partsOutOfStock: parts.filter((p) => p.quantity <= 0).length,
    note: "ABS: unidades físicas (workshop_abs_modules). Peças: cadastro workshop_parts. Completo disponível ≠ parte separada vendável sem desmembramento.",
  };
}

export function buildLabEstoqueDashboard(input: {
  labOrders: LabOrderFact[];
  thresholds: LabThresholds;
  includeLab: boolean;
  includeStock: boolean;
  stockSummary?: StockSummary | null;
  lowStockParts?: StockPartFact[];
  knowledgeHints?: LabEstoqueDashboard["knowledgeHints"];
}): LabEstoqueDashboard {
  const labOrders = input.includeLab ? input.labOrders : [];
  const byStatus: Record<string, number> = {};
  let unknownStageTimeCount = 0;
  for (const o of labOrders) {
    byStatus[o.status] = (byStatus[o.status] || 0) + 1;
    if (!o.stageTimeKnown) unknownStageTimeCount += 1;
  }
  const bottlenecks = input.includeLab
    ? detectLabBottlenecks(labOrders, input.thresholds)
    : [];
  const bench = input.includeLab ? buildLabBenchOccupancy(labOrders) : null;
  const ready = input.includeLab ? listReadyForPickup(labOrders) : [];
  const longest = input.includeLab ? listLongestInLab(labOrders) : [];
  const attention = input.includeLab
    ? buildLabAttention(bottlenecks, ready, longest)
    : [];

  const proposedKnowledgeDrafts: LabEstoqueDashboard["proposedKnowledgeDrafts"] = [];
  for (const b of bottlenecks.slice(0, 2)) {
    if (b.count < 4) continue;
    proposedKnowledgeDrafts.push({
      title: `Orientação Lab — ${b.title}`,
      content: [
        `Padrão observado (não oficial): ${b.evidence}`,
        `Etapa: ${b.status}; limiar: ${b.thresholdHours}h.`,
        `Hipótese: revisar fila de bancada, peças ou comunicação.`,
        `Não gravar OS individuais como memória — só orientação após aprovação.`,
      ].join("\n"),
      knowledgeKeyHint: `lab.bottleneck.${b.kind}`.slice(0, 100),
      category: "operational_learning",
    });
  }

  const stockSummary = input.includeStock ? input.stockSummary || null : null;
  const lowStockParts = input.includeStock ? input.lowStockParts || [] : [];

  return {
    summary: {
      labActive: labOrders.length,
      labByStatus: byStatus,
      labBottleneckCount: bottlenecks.length,
      labAttentionCount: attention.length,
      labUnknownStageTimeCount: unknownStageTimeCount,
      benchOccupied: bench?.occupied ?? 0,
      benchFree: bench?.free ?? 0,
      readyForPickup: ready.length,
      stock: stockSummary || undefined,
      note: input.includeLab
        ? "Laboratório = order_type=module. Permanência = status_entered_at (não updated_at). RDA não altera bancadas/etapas."
        : "Escopo estoque apenas nesta consulta.",
    },
    labAttention: attention,
    labBottlenecks: bottlenecks,
    bench,
    stockSummary,
    lowStockParts: lowStockParts.slice(0, 40),
    knowledgeHints: input.knowledgeHints || [],
    proposedKnowledgeDrafts,
    scopes: { lab: input.includeLab, stock: input.includeStock },
    disclaimer:
      "Somente leitura. Lab ≠ estoque ABS. Módulo completo disponível exige desmembramento para venda de parte. Sem movimentação automática. Compatibilidade só quando houver evidência no cadastro.",
  };
}
