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
  /** Totais gravados na sessão (sem live). */
  productiveMs: number;
  pausedMs: number;
  /** Produtivo usable em estatística definitiva (só finished). */
  definitiveProductiveMs: number | null;
  /** Se true, duração NÃO é definitiva (aberta/pausada). */
  isPartial: boolean;
  /** Identidade do serviço (descrição normalizada; line_id opcional se existir). */
  serviceKey: string;
  serviceLabel: string;
  /** Presente só se a coluna existir no banco; senão sempre null. */
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
  relativeDispersion: number | null;
  confidence: OpsConfidence;
  note: string;
};

export type OpsServiceDurationRow = {
  serviceKey: string;
  serviceLabel: string;
  /** Sempre um kind concreto — nunca mistura diagnóstico+execução. */
  timeKind: RdaWorkTimeKind;
  distribution: OpsDistribution;
  /** Sessões finished que entraram no colapso OS+serviço+kind. */
  finishedSessionCount: number;
  /** Ocorrências = OS distintas com ao menos 1 sessão finished deste serviço/kind. */
  finishedOccurrenceCount: number;
  openSessionCount: number;
  distinctTechnicians: number;
  distinctOs: number;
};

export type OpsPauseReasonRow = {
  reasonId: string;
  label: string;
  pauseEventCount: number;
  /**
   * Soma das durações CONFIRMADAS no período (intervalos fechados, clipadas).
   * null se não houver confirmadas ou houver mistura com desconhecidas sem confirmada pura.
   */
  pausedMs: number | null;
  /** Soma de estimativas de pausas ainda abertas (não definitiva). */
  estimatedPausedMs: number | null;
  openPauseCount: number;
  durationKnownCount: number;
  durationUnknownCount: number;
  /** Intervalos que atravessam o limite do período (duração clipada, não integral). */
  crossBoundaryCount: number;
  /** Pausas que cobrem o período inteiro sem evento interno. */
  spansEntirePeriodCount: number;
  durationNote: string;
};

export type OpsLoadCompleteness = {
  complete: boolean;
  truncated: boolean;
  finishedFetched: number;
  finishedLimit: number;
  openFetched: number;
  openLimit: number;
  pauseEventsFetched?: number;
  pauseEventsLimit?: number;
  note: string | null;
};

export type OpsBucketTotals = {
  diagnosticProductiveMs: number;
  executionProductiveMs: number;
  productiveMs: number;
  pausedMs: number;
  /** productive + paused (apontado) — ≠ tempo corrido da OS. */
  totalPointedMs: number;
  sessions: number;
};

export type OpsTechnicianBreakdownRow = {
  technicianUserId: string;
  displayName: string;
  finished: OpsBucketTotals;
  open: OpsBucketTotals;
  finishedSessions: number;
  openSessions: number;
  servicesCount: number;
  /** Aliases legados = finished.* (não incluem parciais). */
  diagnosticMs: number;
  executionMs: number;
  pausedMs: number;
  totalPointedMs: number;
};

export type OpsOverview = {
  period: OpsPeriod;
  finished: OpsBucketTotals;
  open: OpsBucketTotals;
  cancelledSessions: number;
  servicesFinishedCount: number;
  /** Aliases = finished.* para UI/tools. */
  diagnosticMs: number;
  executionMs: number;
  pausedMs: number;
  totalPointedMs: number;
  finishedSessions: number;
  openSessions: number;
  confidenceNote: string;
  reconciliationNote: string;
};

export type OpsPatternSuggestion = {
  id: string;
  kind: "slow_service" | "high_variance" | "frequent_pause" | "slow_diagnostic";
  title: string;
  summary: string;
  sampleCount: number;
  confidence: OpsConfidence;
  proposedKnowledge: {
    title: string;
    content: string;
    category: string;
    knowledgeKeyHint: string;
  };
};

/** Colunas seguras no schema de produção (sem budget_service_line_id). */
export const OPS_SESSION_SELECT_PRODUCTION =
  "id, workshop_id, service_order_id, technician_user_id, time_kind, status, started_at, ended_at, productive_ms, paused_ms, budget_service_description, current_pause_reason_id";

export const OPS_QUERY_DEFAULT_LIMIT = 40;
export const OPS_QUERY_MAX_LIMIT = 200;
export const OPS_QUERY_MAX_ROWS = 5000;
