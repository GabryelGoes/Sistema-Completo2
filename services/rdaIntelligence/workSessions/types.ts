export const RDA_WORK_SESSION_STATUSES = [
  "running",
  "paused",
  "finished",
  "cancelled",
] as const;

export type RdaWorkSessionStatus = (typeof RDA_WORK_SESSION_STATUSES)[number];

export const RDA_WORK_EVENT_TYPES = [
  "start",
  "pause",
  "resume",
  "finish",
  "cancel",
  "correct",
] as const;

export type RdaWorkEventType = (typeof RDA_WORK_EVENT_TYPES)[number];

export type RdaWorkPauseReason = {
  id: string;
  label: string;
  requiresNote: boolean;
  sortOrder: number;
};

export type RdaWorkSessionDto = {
  id: string;
  serviceOrderId: string;
  technicianUserId: string;
  budgetId: string | null;
  budgetServiceDescription: string | null;
  status: RdaWorkSessionStatus;
  startedAt: string;
  endedAt: string | null;
  segmentStartedAt: string | null;
  productiveMs: number;
  pausedMs: number;
  /** Totais com segmento aberto (running/paused) já somados até serverNow. */
  liveProductiveMs: number;
  livePausedMs: number;
  currentPauseReasonId: string | null;
  currentPauseNote: string | null;
  currentPauseStartedAt: string | null;
  serverNow: string;
};

export type RdaWorkSessionEventDto = {
  id: string;
  sessionId: string;
  eventType: RdaWorkEventType;
  occurredAt: string;
  pauseReasonId: string | null;
  pauseNote: string | null;
  actorUserId: string | null;
};

export type RdaWorkPerformanceTechnicianRow = {
  technicianUserId: string;
  displayName: string;
  sessionCount: number;
  finishedCount: number;
  liveProductiveMs: number;
  livePausedMs: number;
  pauseByReason: { reasonId: string; label: string; pausedMs: number }[];
  serviceDurations: { description: string; productiveMs: number; sessions: number }[];
};
