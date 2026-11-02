/**
 * Blueprint (somente tipos) — futura Central Gerencial de Funcionários.
 *
 * O hub visual do Radar (`QualityRadarView` + painéis gerenciais) já expõe a
 * navegação alvo. Este arquivo documenta o contrato de dados futuro — ainda
 * sem migrations nem persistência de avaliações/tempo/planos.
 *
 * Reuso do Radar:
 * - Shell de hub / filtros / período / relatório por pessoa
 * - Resolução de técnicos (WT + system users)
 * - Incidentes como histórico operacional (não nota 1–5)
 *
 * Domínios novos (a criar em fases posteriores):
 * - Avaliações por competência (1–5) + adiar/dispensar
 * - Sessões de tempo produtivo (start/pause/resume/finish)
 * - Pontos positivos/negativos estruturados
 * - Histórico de desempenho, reuniões, planos de carreira
 * - Relatórios diretoria + recomendações RDA
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
