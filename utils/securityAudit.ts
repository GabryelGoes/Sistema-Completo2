/**
 * SEC-05.1.2-A: registro de eventos de segurança.
 * Não guarda senha, token, chave nem IP bruto.
 * A falha ao gravar não muda a resposta da autenticação.
 * Eventos barulhentos repetidos no mesmo processo são omitidos por alguns minutos.
 * A limpeza antiga fica na função SQL e não roda sozinha.
 */

import crypto from "crypto";

export const SECURITY_AUDIT_STANDARD_DAYS = 90;
export const SECURITY_AUDIT_CRITICAL_DAYS = 365;
export const SECURITY_AUDIT_NOISE_MS = 5 * 60 * 1000;
export const SECURITY_AUDIT_PAGE_MAX = 100;
export const SECURITY_AUDIT_FETCH_CAP = 200;
export const SECURITY_AUDIT_SUMMARY_CAP = 2000;

export const SECURITY_EVENT_TYPES = [
  "login_succeeded",
  "login_denied",
  "login_unavailable",
  "rate_limited",
  "logout",
  "session_invalid",
  "session_revoked",
  "device_blocked",
  "password_changed",
  "permissions_changed",
  "employee_created",
  "employee_removed",
  "device_blocked_admin",
  "device_unblocked",
  "session_revoked_admin",
  "security_settings_changed",
  "session_check_unavailable",
  "rate_limit_unavailable",
  "admin_access_denied",
] as const;

export type SecurityEventType = (typeof SECURITY_EVENT_TYPES)[number];
export type SecurityEventOutcome = "success" | "denied" | "error";

export const CRITICAL_SECURITY_EVENTS = new Set<SecurityEventType>([
  "login_succeeded",
  "password_changed",
  "permissions_changed",
  "employee_created",
  "employee_removed",
  "device_blocked_admin",
  "device_unblocked",
  "session_revoked_admin",
  "security_settings_changed",
  "login_unavailable",
  "session_check_unavailable",
  "rate_limit_unavailable",
]);

const NOISY_SECURITY_EVENTS = new Set<SecurityEventType>([
  "login_denied",
  "rate_limited",
  "session_invalid",
  "session_revoked",
  "device_blocked",
  "login_unavailable",
  "session_check_unavailable",
  "rate_limit_unavailable",
  "admin_access_denied",
]);

const SECURITY_SETTING_KEYS = new Set([
  "patio_login_enabled",
  "admin_password",
  "patio_pin",
  "vehicle_delete_password",
  "stock_guard_password",
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const SECURITY_AUDIT_REASONS = [
  "blocked_devices_read",
  "device_session_read",
  "employees_read",
  "auth_store_missing",
  "expired",
  "missing_sid",
  "invalid_signature",
  "invalid_format",
] as const;

export type SecurityAuditReason = (typeof SECURITY_AUDIT_REASONS)[number];

export type SecurityEventMetadata = {
  area?: "login" | "password" | "gerencia" | "users" | "devices" | "settings" | "audit";
  reason?: SecurityAuditReason;
  changedKeys?: string[];
  permissionKeys?: string[];
  targetUserId?: string;
  revokedCount?: number;
};

export type SecurityEventDraft = {
  eventType: SecurityEventType;
  outcome: SecurityEventOutcome;
  actorUserId?: string | null;
  sessionId?: string | null;
  deviceId?: string | null;
  ip?: string | null;
  metadata?: SecurityEventMetadata;
};

export type SecurityEventRow = {
  id: string;
  workshop_id: string;
  occurred_at: string;
  event_type: string;
  outcome: string;
  actor_user_id: string | null;
  session_id: string | null;
  device_id: string | null;
  origin: string | null;
  client_ref: string | null;
  metadata: SecurityEventMetadata;
};

export type SecurityEventQuery = {
  workshopId: string;
  from?: string | null;
  to?: string | null;
  eventType?: string | null;
  outcome?: string | null;
  actorUserId?: string | null;
  limit: number;
  cursor?: { occurredAt: string; id: string } | null;
};

type InsertRow = {
  workshop_id: string;
  occurred_at: string;
  event_type: SecurityEventType;
  outcome: SecurityEventOutcome;
  actor_user_id: string | null;
  session_id: string | null;
  device_id: string | null;
  origin: "vercel" | "local" | "unknown";
  client_ref: string | null;
  metadata: SecurityEventMetadata;
};

function cleanUuid(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  return UUID_RE.test(text) ? text : null;
}

function cleanDevice(value: string | null | undefined): string | null {
  const text = String(value || "").trim().slice(0, 128);
  return text || null;
}

function cleanKeys(values: string[] | undefined, allowed?: Set<string>): string[] | undefined {
  if (!values) return undefined;
  const out: string[] = [];
  for (const value of values) {
    const key = String(value || "").trim().slice(0, 80);
    if (!key || (allowed && !allowed.has(key))) continue;
    if (!out.includes(key)) out.push(key);
    if (out.length >= 20) break;
  }
  return out.length ? out : undefined;
}

export function securityMetadata(input: SecurityEventMetadata | undefined): SecurityEventMetadata {
  if (!input) return {};
  const metadata: SecurityEventMetadata = {};
  if (
    input.area === "login" ||
    input.area === "password" ||
    input.area === "gerencia" ||
    input.area === "users" ||
    input.area === "devices" ||
    input.area === "settings" ||
    input.area === "audit"
  ) {
    metadata.area = input.area;
  }
  const changed = cleanKeys(input.changedKeys, SECURITY_SETTING_KEYS);
  if (changed) metadata.changedKeys = changed;
  const permissions = cleanKeys(input.permissionKeys);
  if (permissions) metadata.permissionKeys = permissions;
  const target = cleanUuid(input.targetUserId);
  if (target) metadata.targetUserId = target;
  if (typeof input.revokedCount === "number" && input.revokedCount >= 0 && input.revokedCount <= 10000) {
    metadata.revokedCount = Math.floor(input.revokedCount);
  }
  if (input.reason && SECURITY_AUDIT_REASONS.includes(input.reason)) metadata.reason = input.reason;
  return metadata;
}

export function securitySettingKeys(keys: string[]): string[] {
  return cleanKeys(keys, SECURITY_SETTING_KEYS) || [];
}

export function changedPermissionKeys(
  before: Record<string, boolean> | null | undefined,
  after: Record<string, boolean> | null | undefined
): string[] {
  const left = before || {};
  const right = after || {};
  const names = new Set([...Object.keys(left), ...Object.keys(right)]);
  return [...names].filter((name) => Boolean(left[name]) !== Boolean(right[name])).sort();
}

export function securityOrigin(env: NodeJS.ProcessEnv): "vercel" | "local" | "unknown" {
  if (env.VERCEL) return "vercel";
  if (env.NODE_ENV === "development" || env.NODE_ENV === "test") return "local";
  return "unknown";
}

/** Pseudônimo diário. Sem a chave do servidor, enumerar IPv4 não recupera o endereço. */
export function securityClientRef(ip: string | null | undefined, secret: string, now = Date.now()): string | null {
  const address = String(ip || "").trim();
  const key = secret.trim();
  if (!address || address === "unknown" || address === "vercel-unknown" || !key) return null;
  const day = new Date(now).toISOString().slice(0, 10);
  return crypto
    .createHmac("sha256", key)
    .update(`security-audit-client|${day}|${address}`)
    .digest("base64url")
    .slice(0, 22);
}

export function encodeSecurityCursor(occurredAt: string, id: string): string {
  return Buffer.from(`${occurredAt}|${id}`, "utf8").toString("base64url");
}

export function decodeSecurityCursor(value: string | null | undefined): { occurredAt: string; id: string } | null {
  if (!value) return null;
  try {
    const text = Buffer.from(value, "base64url").toString("utf8");
    const split = text.lastIndexOf("|");
    if (split <= 0) return null;
    const occurredAt = text.slice(0, split);
    const id = text.slice(split + 1);
    if (!Number.isFinite(Date.parse(occurredAt)) || !cleanUuid(id)) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

export function parseSecurityEventQuery(
  workshopId: string,
  search: URLSearchParams
): { ok: true; query: SecurityEventQuery } | { ok: false; error: string } {
  const from = search.get("from");
  const to = search.get("to");
  if (from && !Number.isFinite(Date.parse(from))) return { ok: false, error: "Período inválido." };
  if (to && !Number.isFinite(Date.parse(to))) return { ok: false, error: "Período inválido." };
  const eventType = search.get("eventType");
  if (eventType && !SECURITY_EVENT_TYPES.includes(eventType as SecurityEventType)) {
    return { ok: false, error: "Tipo de evento inválido." };
  }
  const outcome = search.get("outcome");
  if (outcome && outcome !== "success" && outcome !== "denied" && outcome !== "error") {
    return { ok: false, error: "Resultado inválido." };
  }
  const actorUserId = search.get("actorUserId");
  if (actorUserId && !cleanUuid(actorUserId)) return { ok: false, error: "Funcionário inválido." };
  const rawLimit = Number(search.get("limit") || "50");
  const limit = Number.isFinite(rawLimit) ? Math.min(SECURITY_AUDIT_PAGE_MAX, Math.max(1, Math.floor(rawLimit))) : 50;
  const cursor = decodeSecurityCursor(search.get("cursor"));
  if (search.get("cursor") && !cursor) return { ok: false, error: "Página inválida." };
  return {
    ok: true,
    query: {
      workshopId,
      from,
      to,
      eventType,
      outcome,
      actorUserId,
      limit,
      cursor,
    },
  };
}

function inPeriod(value: string, from?: string | null, to?: string | null): boolean {
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return false;
  if (from && time < Date.parse(from)) return false;
  if (to && time > Date.parse(to)) return false;
  return true;
}

function beforeCursor(row: SecurityEventRow, cursor: { occurredAt: string; id: string }): boolean {
  if (row.occurred_at < cursor.occurredAt) return true;
  if (row.occurred_at > cursor.occurredAt) return false;
  return row.id < cursor.id;
}

export function pageSecurityEvents(rows: SecurityEventRow[], query: SecurityEventQuery): {
  events: SecurityEventRow[];
  nextCursor: string | null;
} {
  const filtered = rows
    .filter((row) => row.workshop_id === query.workshopId)
    .filter((row) => inPeriod(row.occurred_at, query.from, query.to))
    .filter((row) => !query.eventType || row.event_type === query.eventType)
    .filter((row) => !query.outcome || row.outcome === query.outcome)
    .filter((row) => !query.actorUserId || row.actor_user_id === query.actorUserId)
    .filter((row) => !query.cursor || beforeCursor(row, query.cursor))
    .sort((a, b) => (a.occurred_at === b.occurred_at ? (a.id < b.id ? 1 : -1) : a.occurred_at < b.occurred_at ? 1 : -1));
  const events = filtered.slice(0, query.limit);
  const last = events[events.length - 1];
  const nextCursor = filtered.length > query.limit && last ? encodeSecurityCursor(last.occurred_at, last.id) : null;
  return { events, nextCursor };
}

export function summarizeSecurityEvents(rows: SecurityEventRow[], workshopId: string, from?: string | null, to?: string | null): {
  truncated: boolean;
  totals: Record<SecurityEventOutcome, number>;
  byType: Array<{ eventType: string; outcome: string; count: number }>;
} {
  const matched = rows.filter((row) => {
    return row.workshop_id === workshopId && inPeriod(row.occurred_at, from, to);
  });
  const truncated = matched.length > SECURITY_AUDIT_SUMMARY_CAP;
  const sample = matched.slice(0, SECURITY_AUDIT_SUMMARY_CAP);
  const totals: Record<SecurityEventOutcome, number> = { success: 0, denied: 0, error: 0 };
  const counts = new Map<string, number>();
  for (const row of sample) {
    if (row.outcome === "success" || row.outcome === "denied" || row.outcome === "error") totals[row.outcome] += 1;
    const key = `${row.event_type}|${row.outcome}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const byType = [...counts.entries()]
    .map(([key, count]) => {
      const [eventType, outcome] = key.split("|");
      return { eventType, outcome, count };
    })
    .sort((a, b) => b.count - a.count || a.eventType.localeCompare(b.eventType));
  return { truncated, totals, byType };
}

export function publicSecurityEvent(row: SecurityEventRow) {
  return {
    id: row.id,
    occurredAt: row.occurred_at,
    eventType: row.event_type,
    outcome: row.outcome,
    actorUserId: row.actor_user_id,
    sessionId: row.session_id,
    deviceId: row.device_id,
    origin: row.origin,
    clientRef: row.client_ref,
    metadata: securityMetadata(row.metadata),
  };
}

export type SecurityAuditRecorder = {
  record(draft: SecurityEventDraft, now?: number): Promise<{ recorded: boolean }>;
};

export function createSecurityAudit(options: {
  workshopId: () => string | null | undefined;
  secret: () => string;
  env?: NodeJS.ProcessEnv;
  insert: (row: InsertRow) => Promise<{ ok: boolean }>;
  logCritical?: () => void;
  now?: () => number;
}): SecurityAuditRecorder {
  const seen = new Map<string, number>();
  const env = options.env || process.env;
  return {
    async record(draft, now) {
      const workshopId = String(options.workshopId() || "").trim();
      if (!workshopId) return { recorded: false };
      const at = now ?? options.now?.() ?? Date.now();
      const metadata = securityMetadata(draft.metadata);
      const actor = cleanUuid(draft.actorUserId);
      const sessionId = cleanUuid(draft.sessionId);
      const deviceId = cleanDevice(draft.deviceId);
      const clientRef = securityClientRef(draft.ip, options.secret(), at);
      if (NOISY_SECURITY_EVENTS.has(draft.eventType)) {
        const noiseKey = [
          draft.eventType,
          draft.outcome,
          metadata.area || "",
          metadata.reason || "",
          actor || "",
          sessionId || "",
          deviceId || "",
          clientRef || "",
        ].join("|");
        const previous = seen.get(noiseKey) || 0;
        if (at - previous < SECURITY_AUDIT_NOISE_MS) return { recorded: false };
        if (seen.size > 4000) {
          for (const [key, time] of seen) {
            if (at - time >= SECURITY_AUDIT_NOISE_MS) seen.delete(key);
          }
        }
        seen.set(noiseKey, at);
      }
      const row: InsertRow = {
        workshop_id: workshopId,
        occurred_at: new Date(at).toISOString(),
        event_type: draft.eventType,
        outcome: draft.outcome,
        actor_user_id: actor,
        session_id: sessionId,
        device_id: deviceId,
        origin: securityOrigin(env),
        client_ref: clientRef,
        metadata,
      };
      try {
        const result = await options.insert(row);
        if (!result.ok && CRITICAL_SECURITY_EVENTS.has(draft.eventType)) options.logCritical?.();
        return { recorded: result.ok };
      } catch {
        if (CRITICAL_SECURITY_EVENTS.has(draft.eventType)) options.logCritical?.();
        return { recorded: false };
      }
    },
  };
}
