/**
 * SEC-05.1.2-B: leitura da Central de Segurança.
 * Só formata o que a API devolve. Não inventa contagem, localização nem ameaça.
 */

export const SECURITY_CENTER_TIME_ZONE = "America/Sao_Paulo";

/** Espelho dos tipos do servidor. O teste compara com securityAudit.ts. */
export const SECURITY_CENTER_EVENT_TYPES = [
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

const CRITICAL_TYPES = new Set<string>([
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

export type SecurityPeriodPreset = "24h" | "7d" | "30d" | "custom";

export type SecuritySummary = {
  truncated: boolean;
  totals: { success: number; denied: number; error: number };
  byType: Array<{ eventType: string; outcome: string; count: number }>;
};

export type SecurityEventItem = {
  id: string;
  occurredAt: string;
  eventType: string;
  outcome: string;
  actorUserId: string | null;
  sessionId: string | null;
  deviceId: string | null;
  origin: string | null;
  clientRef: string | null;
  metadata?: {
    area?: string;
    changedKeys?: string[];
    permissionKeys?: string[];
    targetUserId?: string;
    revokedCount?: number;
  };
};

const GERENCIA_WHEN_ANONYMOUS = new Set<string>([
  "login_succeeded",
  "logout",
  "password_changed",
  "permissions_changed",
  "employee_created",
  "employee_removed",
  "device_blocked_admin",
  "device_unblocked",
  "session_revoked_admin",
  "security_settings_changed",
]);

export const AUDIT_EVENT_TYPES = [
  "password_changed",
  "permissions_changed",
  "employee_created",
  "employee_removed",
  "session_revoked_admin",
  "device_blocked_admin",
  "device_unblocked",
  "security_settings_changed",
] as const;

export const ALERT_EVENT_TYPES = [
  "rate_limited",
  "login_unavailable",
  "session_invalid",
  "session_revoked",
  "device_blocked",
  "session_check_unavailable",
  "rate_limit_unavailable",
  "admin_access_denied",
] as const;

const EVENT_LABELS: Record<(typeof SECURITY_CENTER_EVENT_TYPES)[number], string> = {
  login_succeeded: "Login autorizado",
  login_denied: "Login recusado",
  login_unavailable: "Login indisponível",
  rate_limited: "Limite de tentativas",
  logout: "Saída",
  session_invalid: "Sessão inválida",
  session_revoked: "Sessão revogada",
  device_blocked: "Acesso de aparelho bloqueado",
  password_changed: "Senha alterada",
  permissions_changed: "Permissões alteradas",
  employee_created: "Funcionário criado",
  employee_removed: "Funcionário removido",
  device_blocked_admin: "Bloqueio de aparelho",
  device_unblocked: "Desbloqueio de aparelho",
  session_revoked_admin: "Revogação administrativa",
  security_settings_changed: "Ajuste de segurança",
  session_check_unavailable: "Verificação de sessão indisponível",
  rate_limit_unavailable: "Contador de tentativas indisponível",
  admin_access_denied: "Acesso administrativo recusado",
};

const SETTING_LABELS: Record<string, string> = {
  patio_login_enabled: "Login do pátio",
  admin_password: "Senha da Gerência",
  patio_pin: "PIN do pátio",
  vehicle_delete_password: "Senha de exclusão",
  stock_guard_password: "Senha do estoque",
};

export function securityEventLabel(eventType: string): string {
  return EVENT_LABELS[eventType as (typeof SECURITY_CENTER_EVENT_TYPES)[number]] || "Evento registrado";
}

export function securityOutcomeLabel(outcome: string): string {
  if (outcome === "success") return "Concluído";
  if (outcome === "denied") return "Recusado";
  if (outcome === "error") return "Falha";
  return "Resultado não informado";
}

export function securityOriginLabel(origin: string | null | undefined): string | null {
  if (origin === "vercel") return "Plataforma";
  if (origin === "local") return "Ambiente local";
  if (origin === "unknown") return "Origem não informada";
  return null;
}

export function isCriticalSecurityEvent(eventType: string): boolean {
  return CRITICAL_TYPES.has(eventType);
}

export function securityPeriodBounds(
  preset: SecurityPeriodPreset,
  customFrom: string,
  customTo: string,
  now: number
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  if (preset === "24h") {
    return { ok: true, from: new Date(now - 24 * 60 * 60 * 1000).toISOString(), to: new Date(now).toISOString() };
  }
  if (preset === "7d") {
    return { ok: true, from: new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString(), to: new Date(now).toISOString() };
  }
  if (preset === "30d") {
    return { ok: true, from: new Date(now - 30 * 24 * 60 * 60 * 1000).toISOString(), to: new Date(now).toISOString() };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(customFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(customTo)) {
    return { ok: false, error: "Informe o início e o fim do período." };
  }
  const from = new Date(`${customFrom}T00:00:00.000-03:00`);
  const to = new Date(`${customTo}T23:59:59.999-03:00`);
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || from.getTime() > to.getTime()) {
    return { ok: false, error: "O período personalizado é inválido." };
  }
  return { ok: true, from: from.toISOString(), to: to.toISOString() };
}

export function countEventTypes(summary: SecuritySummary, types: readonly string[]): { count: number; partial: boolean } {
  const wanted = new Set(types);
  let count = 0;
  for (const row of summary.byType) {
    if (wanted.has(row.eventType)) count += row.count;
  }
  return { count, partial: summary.truncated };
}

export const OVERVIEW_CRITICAL_TYPES = [...CRITICAL_TYPES].filter((type) => type !== "login_succeeded");

export function formatSecurityCount(count: number, partial: boolean): string {
  if (!partial) return String(count);
  return count === 0 ? "parcial" : `pelo menos ${count}`;
}

export function actorLabel(
  event: Pick<SecurityEventItem, "eventType" | "actorUserId">,
  names: ReadonlyMap<string, string> | null
): string {
  if (event.actorUserId) {
    if (!names) return "Funcionário";
    return names.get(event.actorUserId) || "Funcionário removido";
  }
  if (GERENCIA_WHEN_ANONYMOUS.has(event.eventType)) return "Gerência";
  return "Não identificado";
}

export function targetLabel(targetUserId: string | undefined, names: ReadonlyMap<string, string> | null): string | null {
  if (!targetUserId) return null;
  if (!names) return "Funcionário";
  return names.get(targetUserId) || "Funcionário removido";
}

export function eventDetail(event: SecurityEventItem, names: ReadonlyMap<string, string> | null): string | null {
  const parts: string[] = [];
  const target = targetLabel(event.metadata?.targetUserId, names);
  if (target) parts.push(target);
  const keys = event.metadata?.changedKeys?.map((key) => SETTING_LABELS[key] || key) || [];
  if (keys.length) parts.push(keys.join(", "));
  const permissions = event.metadata?.permissionKeys || [];
  if (permissions.length) parts.push(permissions.join(", "));
  if (typeof event.metadata?.revokedCount === "number") {
    parts.push(`${event.metadata.revokedCount} sessão(ões) encerrada(s)`);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function matchesEventGroup(eventType: string, group: readonly string[] | null): boolean {
  if (!group) return SECURITY_CENTER_EVENT_TYPES.includes(eventType as (typeof SECURITY_CENTER_EVENT_TYPES)[number]);
  return group.includes(eventType);
}

export function shortReference(value: string | null | undefined): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.length <= 12 ? text : `${text.slice(0, 8)}…`;
}
