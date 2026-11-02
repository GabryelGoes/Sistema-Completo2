export const RDA_EVAL_REQUEST_STATUSES = [
  "pending",
  "deferred",
  "evaluated",
  "dismissed",
] as const;

export type RdaEvalRequestStatus = (typeof RDA_EVAL_REQUEST_STATUSES)[number];

export const RDA_EVAL_COMPETENCY_IDS = [
  "technical_quality",
  "organization",
  "procedures",
  "autonomy",
  "communication",
] as const;

export type RdaEvalCompetencyId = (typeof RDA_EVAL_COMPETENCY_IDS)[number];

export const RDA_EVAL_COMPETENCY_LABELS: Record<RdaEvalCompetencyId, string> = {
  technical_quality: "Qualidade técnica",
  organization: "Organização e limpeza",
  procedures: "Cumprimento dos procedimentos",
  autonomy: "Autonomia",
  communication: "Comunicação e colaboração",
};

export type RdaEvalScores = {
  technicalQuality: number;
  organization: number;
  procedures: number;
  autonomy: number;
  communication: number;
};

export type RdaEvalRequestDto = {
  id: string;
  workSessionId: string;
  serviceOrderId: string;
  technicianUserId: string;
  technicianDisplayName?: string;
  budgetId: string | null;
  serviceDescription: string | null;
  productiveMs: number;
  pausedMs: number;
  sessionStartedAt: string;
  sessionEndedAt: string;
  status: RdaEvalRequestStatus;
  deferredUntil: string | null;
  deferredNote: string | null;
  deferredAt: string | null;
  dismissedReason: string | null;
  dismissedAt: string | null;
  evaluatedAt: string | null;
  createdAt: string;
  evaluation: RdaEvaluationDto | null;
};

export type RdaEvaluationDto = {
  id: string;
  requestId: string;
  workSessionId: string;
  technicianUserId: string;
  evaluatorUserId: string | null;
  evaluatorIsAdmin: boolean;
  evaluatorDisplayName: string;
  scores: RdaEvalScores;
  positives: string;
  improvements: string;
  generalNotes: string;
  createdAt: string;
  updatedAt: string;
};

export type RdaEvalSummaryDto = {
  pending: number;
  deferred: number;
  evaluated: number;
  dismissed: number;
  averageScores: RdaEvalScores | null;
  evaluatedCount: number;
};

export type RdaEvalAuditEventDto = {
  id: string;
  requestId: string | null;
  evaluationId: string | null;
  eventType: string;
  actorUserId: string | null;
  actorIsAdmin: boolean;
  payload: Record<string, unknown>;
  createdAt: string;
};
