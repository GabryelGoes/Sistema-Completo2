export type ProactiveCategory = "patio" | "laboratorio" | "estoque" | "produtividade";

export type ProactiveSeverity = "info" | "warning" | "critical";

export type ProactiveAlertStatus = "active" | "acknowledged" | "resolved" | "dismissed";

export type ProactiveAlertDraft = {
  alertKey: string;
  category: ProactiveCategory;
  severity: ProactiveSeverity;
  title: string;
  body: string;
  recommendation: string;
  evidence: string;
  refType?: string | null;
  refId?: string | null;
  payload?: Record<string, unknown>;
};

export type ProactiveAlertRow = {
  id: string;
  workshop_id: string;
  alert_key: string;
  category: ProactiveCategory;
  severity: ProactiveSeverity;
  status: ProactiveAlertStatus;
  title: string;
  body: string;
  recommendation: string;
  evidence: string;
  ref_type: string | null;
  ref_id: string | null;
  payload: Record<string, unknown>;
  notification_id: string | null;
  dismissed_at: string | null;
  acknowledged_at: string | null;
  resolved_at: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
};

export type ProactiveAlertView = {
  id: string;
  alertKey: string;
  category: ProactiveCategory;
  severity: ProactiveSeverity;
  status: ProactiveAlertStatus;
  title: string;
  body: string;
  recommendation: string;
  evidence: string;
  refType: string | null;
  refId: string | null;
  payload: Record<string, unknown>;
  lastSeenAt: string;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  dismissedAt: string | null;
};

export type ProactiveScanResult = {
  ok: boolean;
  skipped: boolean;
  skipReason?: string;
  alertsCreated: number;
  alertsUpdated: number;
  alertsReopened: number;
  alerts: Array<{ alertKey: string; title: string; severity: string; category: string }>;
  runId?: string;
  error?: string;
};

export type ProactiveMonitorConfig = {
  enabled: boolean;
  intervalMinutes: number;
  reopenAfterHours: number;
  notifyOnCreate: boolean;
};
