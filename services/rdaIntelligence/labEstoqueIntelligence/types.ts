export type LabOrderFact = {
  id: string;
  osNumber: number | null;
  plate: string | null;
  vehicleModel: string | null;
  vehicleBrand: string | null;
  customerName: string | null;
  moduleIdentification: string | null;
  moduleKind: string | null;
  status: string;
  statusLabel: string;
  assignedTechnician: string | null;
  benchSlot: number | null;
  deliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
  statusEnteredAt: string | null;
  stageTimeKnown: boolean;
  hoursInStage: number | null;
  stageTimeLabel: string;
  hoursInLab: number | null;
  labTimeLabel: string;
  orderType: "module";
};

export type LabBottleneckKind =
  | "waiting_evaluation"
  | "slow_analysis"
  | "waiting_approval"
  | "approved_not_started"
  | "waiting_parts"
  | "slow_repair"
  | "finished_awaiting_pickup"
  | "ready_for_pickup"
  | "external_repair_long";

export type LabBottleneck = {
  kind: LabBottleneckKind;
  title: string;
  status: string;
  count: number;
  thresholdHours: number;
  evidence: string;
  orderIds: string[];
  sample: Array<{
    id: string;
    osNumber: number | null;
    moduleIdentification: string | null;
    benchSlot: number | null;
    hoursInStage: number | null;
    stageTimeLabel: string;
    technician: string | null;
  }>;
};

export type LabAttentionItem = {
  orderId: string;
  osNumber: number | null;
  moduleIdentification: string | null;
  status: string;
  statusLabel: string;
  kind: string;
  summary: string;
  benchSlot: number | null;
  stageTimeLabel: string;
};

export type LabBenchOccupancy = {
  totalSlots: number;
  occupied: number;
  free: number;
  queuedEstimate: number;
  slots: Array<{
    slot: number;
    occupied: boolean;
    orderId: string | null;
    osNumber: number | null;
    moduleIdentification: string | null;
    status: string | null;
    statusLabel: string | null;
  }>;
};

export type AbsUnitFact = {
  id: string;
  publicId: string;
  sequenceNumber: number | null;
  sequenceLabel: string | null;
  moduleKind: string;
  status: string;
  condition: string | null;
  itemState: string | null;
  itemCondition: string | null;
  manufacturer: string | null;
  originalCode: string | null;
  application: string | null;
  model: string | null;
  location: string | null;
  modelId: string | null;
  /** true se unidade eletrônica/hidráulica já desmembrada e disponível. */
  directlySellableAsPart: boolean;
  /** true se módulo completo disponível — parte separada só via desmembramento. */
  availableOnlyViaDisassembly: boolean;
};

export type AbsSearchResult = {
  query: string;
  availableParts: AbsUnitFact[];
  availableComplete: AbsUnitFact[];
  availableViaDisassembly: AbsUnitFact[];
  located: AbsUnitFact[];
  note: string;
  compatibilityConfirmed: boolean;
};

export type StockPartFact = {
  id: string;
  name: string;
  /** Código do produto = workshop_parts.original_code (coluna sku não existe). */
  sku: string | null;
  barcode: string | null;
  brand: string | null;
  quantity: number;
  minQuantity: number | null;
  location: string | null;
  lowStock: boolean;
};

export type StockSummary = {
  absAvailable: number;
  absReserved: number;
  absOut: number;
  absDisassembled: number;
  absByKind: Record<string, number>;
  partsSkus: number;
  partsLowStock: number;
  partsOutOfStock: number;
  note: string;
};

export type LabEstoqueDashboard = {
  summary: {
    labActive: number;
    labByStatus: Record<string, number>;
    labBottleneckCount: number;
    labAttentionCount: number;
    labUnknownStageTimeCount: number;
    benchOccupied: number;
    benchFree: number;
    readyForPickup: number;
    stock?: StockSummary;
    note: string;
  };
  labAttention: LabAttentionItem[];
  labBottlenecks: LabBottleneck[];
  bench: LabBenchOccupancy | null;
  stockSummary: StockSummary | null;
  lowStockParts: StockPartFact[];
  knowledgeHints: Array<{ knowledgeKey: string; title: string; excerpt: string }>;
  proposedKnowledgeDrafts: Array<{
    title: string;
    content: string;
    knowledgeKeyHint: string;
    category: string;
  }>;
  scopes: { lab: boolean; stock: boolean };
  disclaimer: string;
};
