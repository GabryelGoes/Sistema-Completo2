/**
 * Blueprint (tipos legados) — Central Gerencial de Funcionários.
 *
 * Persistência real evoluiu nas Fases 1–3 do Radar / RDA:
 * - Fase 1: identidade, reconhecimentos, revisões de ocorrência
 * - Fase 2: competências, níveis, PDI, reuniões
 * - Fase 3: Revisão Semanal com RDA + memória estruturada + rascunhos
 *
 * Este arquivo permanece como referência de contrato; não criar schemas novos aqui.
 */

/** Competência avaliável (catálogo da oficina). */
export type RdaManagerialCompetency = {
  id: string;
  label: string;
  description?: string;
  active: boolean;
  sortOrder: number;
};

export type RdaEvaluationDisposition = "evaluate" | "defer" | "dismiss";

/** Avaliação gerencial pós-serviço (ainda não persistida). */
export type RdaManagerialEvaluationDraft = {
  serviceOrderId: string;
  technicianUserId: string;
  disposition: RdaEvaluationDisposition;
  scores?: { competencyId: string; score: 1 | 2 | 3 | 4 | 5; note?: string }[];
  writtenNotes?: string;
  deferredUntil?: string;
};

export type RdaWorkSessionState = "running" | "paused" | "finished" | "cancelled";

export type RdaWorkSessionBlueprint = {
  id: string;
  serviceOrderId: string;
  technicianUserId: string;
  state: RdaWorkSessionState;
  startedAt: string;
  endedAt?: string;
  pauseReasons?: { at: string; reason: string; resumedAt?: string }[];
};

export type RdaPerformanceSignalKind = "positive" | "negative" | "quality_incident";

/**
 * Sinal de desempenho unificado.
 * `quality_incident` aponta para o Radar existente sem alterá-lo.
 */
export type RdaPerformanceSignal = {
  kind: RdaPerformanceSignalKind;
  technicianUserId?: string;
  technicianName?: string;
  occurredAt: string;
  title: string;
  /** Quando kind === quality_incident */
  qualityIncidentId?: string;
  serviceOrderId?: string;
  meta?: Record<string, unknown>;
};

export type RdaCareerPlanBlueprint = {
  technicianUserId: string;
  goals: string[];
  meetingNotes?: string;
  nextReviewAt?: string;
};

export type RdaDirectorateReportBlueprint = {
  periodFrom: string;
  periodTo: string;
  technicianSummaries: {
    technicianUserId: string;
    displayName: string;
    avgScore?: number;
    productiveMinutes?: number;
    positives: number;
    negatives: number;
    openIncidents: number;
  }[];
  rdaRecommendations?: string[];
};

/** Marcador estável para fases futuras (sem comportamento). */
export const RDA_MANAGERIAL_HUB_BLUEPRINT_VERSION = 1 as const;
