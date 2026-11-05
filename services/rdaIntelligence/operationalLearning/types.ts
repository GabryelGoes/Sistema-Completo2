import type { RdaWorkTimeKind } from "../workSessions/stageRules.js";

export type OpsConfidence = "high" | "medium" | "low" | "insufficient";

export type OpsPeriod = {
  from: string;
  to: string;
};

export type OpsSessionFact = {
  sessionId: string;
  workshopId: string;
  serviceOrderId: string;
  technicianUserId: string;
  timeKind: RdaWorkTimeKind;
  status: "running" | "paused" | "finished" | "cancelled";
  startedAt: string;
  endedAt: string | null;
  /** Totais gravados (sem live). */
  productiveMs: number;
  pausedMs: number;
  /** Produtivo usable em estatística definitiva (só finished). */
  definitiveProductiveMs: number | null;
  /** Se true, duração NÃO é definitiva (aberta/pausada). */
  isPartial: boolean;
  serviceKey: string;
  serviceLabel: string;
  budgetServiceLineId: string | null;
  orderType: "vehicle" | "module" | null;
  currentPauseReasonId: string | null;
};

export type OpsDistribution = {
  sampleCount: number;
  medianMs: number | null;
  p25Ms: number | null;
  p75Ms: number | null;
  minMs: number | null;
  maxMs: number | null;
  /** IQR / mediana — dispersão relativa; null se insuficientes. */
  relativeDispersion: number | null;
  confidence: OpsConfidence;
  note: string;
};

export type OpsServiceDurationRow = {
  serviceKey: string;
  serviceLabel: string;
  timeKind: RdaWorkTimeKind | "all";
  distribution: OpsDistribution;
  finishedSessionCount: number;
  openSessionCount: number;
  distinctTechnicians: number;
  distinctOs: number;
};

export type OpsPauseReasonRow = {
  reasonId: string;
  label: string;
  pauseEventCount: number;
  /** Soma de intervalos de pausa estimada quando disponível; senão null. */
  pausedMs: number | null;
};

export type OpsTechnicianBreakdownRow = {
  technicianUserId: string;
  displayName: string;
  diagnosticMs: number;
  executionMs: number;
  pausedMs: number;
  totalPointedMs: number;
  finishedSessions: number;
  openSessions: number;
  servicesCount: number;
};

export type OpsOverview = {
  period: OpsPeriod;
  diagnosticMs: number;
  executionMs: number;
  pausedMs: number;
  /** Soma apontada (diag+exec+pausas) — não é tempo desde check-in. */
  totalPointedMs: number;
  finishedSessions: number;
  openSessions: number;
  cancelledSessions: number;
  servicesFinishedCount: number;
  confidenceNote: string;
};

export type OpsPatternSuggestion = {
  id: string;
  kind: "slow_service" | "high_variance" | "frequent_pause" | "slow_diagnostic";
  title: string;
  summary: string;
  sampleCount: number;
  confidence: OpsConfidence;
  /** Rascunho sugerido para Memória (nunca auto-aprovado). */
  proposedKnowledge: {
    title: string;
    content: string;
    category: string;
    knowledgeKeyHint: string;
  };
};
