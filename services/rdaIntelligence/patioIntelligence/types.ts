export type PatioStageTimeSource = "status_entered_at" | "unknown";

export type PatioOrderFact = {
  id: string;
  osNumber: number | null;
  plate: string | null;
  vehicleModel: string | null;
  vehicleBrand: string | null;
  status: string;
  statusLabel: string;
  assignedTechnician: string | null;
  issueDescription: string | null;
  deliveryDate: string | null;
  createdAt: string;
  updatedAt: string;
  /** Entrada real na etapa atual (ISO); null se desconhecida. */
  statusEnteredAt: string | null;
  /** true quando status_entered_at é confiável. */
  stageTimeKnown: boolean;
  stageTimeSource: PatioStageTimeSource;
  /** Horas desde a entrada na etapa; null se desconhecido (nunca usar updated_at como exato). */
  hoursInStage: number | null;
  /** Rótulo amigável para UI / textos. */
  stageTimeLabel: string;
  /** Horas até a data prometida (negativo = atrasado). */
  hoursToDelivery: number | null;
  orderType: "vehicle";
};

export type PatioBottleneckKind =
  | "waiting_evaluation"
  | "slow_diagnostic"
  | "waiting_approval"
  | "approved_not_started"
  | "waiting_parts"
  | "parts_ready_not_started"
  | "slow_execution"
  | "waiting_test_or_finish";

export type PatioBottleneck = {
  kind: PatioBottleneckKind;
  title: string;
  status: string;
  count: number;
  thresholdHours: number;
  evidence: string;
  orderIds: string[];
  sample: Array<{
    id: string;
    plate: string | null;
    osNumber: number | null;
    hoursInStage: number | null;
    stageTimeLabel: string;
    technician: string | null;
  }>;
};

export type PatioPriorityItem = {
  orderId: string;
  plate: string | null;
  osNumber: number | null;
  status: string;
  statusLabel: string;
  score: number;
  reasons: string[];
  hoursInStage: number | null;
  stageTimeLabel: string;
  hoursToDelivery: number | null;
  technician: string | null;
};

export type PatioDeliveryRisk = {
  orderId: string;
  plate: string | null;
  osNumber: number | null;
  status: string;
  statusLabel: string;
  deliveryDate: string;
  hoursToDelivery: number;
  risk: "overdue" | "imminent" | "watch";
  reasons: string[];
};

export type PatioAttentionItem = {
  orderId: string;
  plate: string | null;
  osNumber: number | null;
  status: string;
  statusLabel: string;
  kind: string;
  summary: string;
  hoursInStage: number | null;
  stageTimeLabel: string;
};

export type PatioOperationalSummary = {
  totalActive: number;
  byStatus: Record<string, number>;
  bottleneckCount: number;
  priorityCount: number;
  riskCount: number;
  attentionCount: number;
  unknownStageTimeCount: number;
  note: string;
};

/** Contexto Fase 2 compatível (tempo produtivo apontado) — não confundir com permanência na etapa. */
export type PatioProductiveContext = {
  available: boolean;
  sampleCount: number;
  confidence: string;
  medianProductiveHours: number | null;
  note: string;
};

export type PatioDashboard = {
  summary: PatioOperationalSummary;
  attention: PatioAttentionItem[];
  bottlenecks: PatioBottleneck[];
  priorities: PatioPriorityItem[];
  risks: PatioDeliveryRisk[];
  thresholds: Record<string, number>;
  productiveContext: PatioProductiveContext;
  knowledgeHints: Array<{ knowledgeKey: string; title: string; excerpt: string }>;
  proposedKnowledgeDrafts: Array<{
    title: string;
    content: string;
    knowledgeKeyHint: string;
    category: string;
  }>;
  disclaimer: string;
};
