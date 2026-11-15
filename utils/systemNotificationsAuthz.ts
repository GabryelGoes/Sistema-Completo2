/**
 * SEC-04.3 — autorização da configuração global de notificações do sistema
 * (GET/PUT /api/workshop/system-notifications).
 *
 * Privilegio: Gerência | full_access | access_notificacoes_sistema.
 * PUT: elevação legada por senha da Gerência permanece (sessão autenticada obrigatória).
 * GET: sem elevação por senha.
 *
 * Não cobre inbox /api/notifications.
 */

import type { WorkshopSettingsActor } from "./workshopSettingsAuthz.js";

export type SystemNotificationsAuthReason =
  | "unauthenticated"
  | "lookup_failed"
  | "not_in_workshop"
  | "missing_permission"
  | "bad_admin_password"
  | "allow_privilege"
  | "allow_password_elevation";

export type SystemNotificationsAuthDecision =
  | { ok: true; reason: "allow_privilege" | "allow_password_elevation"; httpStatus: 200 }
  | {
      ok: false;
      reason: Exclude<
        SystemNotificationsAuthReason,
        "allow_privilege" | "allow_password_elevation"
      >;
      httpStatus: 401 | 403;
    };

/** Privilegio explícito (sem senha). Lookup fail/missing → false. */
export function actorHasSystemNotificationsPrivilege(actor: WorkshopSettingsActor): boolean {
  if (actor.role === "admin") return true;
  if (actor.role !== "user") return false;
  if (actor.load !== "ok") return false;
  const perms = actor.permissions || {};
  return perms.full_access === true || perms.access_notificacoes_sistema === true;
}

export function authorizeSystemNotificationsGet(
  actor: WorkshopSettingsActor
): SystemNotificationsAuthDecision {
  if (!actor.role) {
    return { ok: false, reason: "unauthenticated", httpStatus: 401 };
  }
  if (actor.role === "admin") {
    return { ok: true, reason: "allow_privilege", httpStatus: 200 };
  }
  if (actor.load === "failed") {
    return { ok: false, reason: "lookup_failed", httpStatus: 403 };
  }
  if (actor.load === "missing") {
    return { ok: false, reason: "not_in_workshop", httpStatus: 403 };
  }
  if (actorHasSystemNotificationsPrivilege(actor)) {
    return { ok: true, reason: "allow_privilege", httpStatus: 200 };
  }
  return { ok: false, reason: "missing_permission", httpStatus: 403 };
}

/**
 * PUT: privilegio OU (sessão autenticada + senha Gerência válida).
 * Se já privilegiado e informar senha, a senha deve ser válida.
 * Sem sessão → 401 mesmo com senha (não eleva anônimo).
 */
export function authorizeSystemNotificationsPut(
  actor: WorkshopSettingsActor,
  opts: { passwordProvided: boolean; passwordValid: boolean | null }
): SystemNotificationsAuthDecision {
  if (!actor.role) {
    return { ok: false, reason: "unauthenticated", httpStatus: 401 };
  }

  const privileged = actorHasSystemNotificationsPrivilege(actor);

  if (privileged) {
    if (opts.passwordProvided && opts.passwordValid === false) {
      return { ok: false, reason: "bad_admin_password", httpStatus: 403 };
    }
    return { ok: true, reason: "allow_privilege", httpStatus: 200 };
  }

  // Não privilegiado (inclui lookup fail / missing / sem chave): elevação legada.
  if (opts.passwordProvided && opts.passwordValid === true) {
    return { ok: true, reason: "allow_password_elevation", httpStatus: 200 };
  }
  if (opts.passwordProvided && opts.passwordValid === false) {
    return { ok: false, reason: "missing_permission", httpStatus: 403 };
  }
  return { ok: false, reason: "missing_permission", httpStatus: 403 };
}

export function systemNotificationsAuthzErrorMessage(
  decision: SystemNotificationsAuthDecision
): string {
  if (decision.ok === true) {
    return "Sem permissão para esta operação.";
  }
  switch (decision.reason) {
    case "unauthenticated":
      return "Sessão inválida ou expirada. Faça login novamente.";
    case "bad_admin_password":
      return "Senha da gerência incorreta.";
    case "lookup_failed":
      return "Não foi possível verificar permissões. Tente novamente.";
    case "not_in_workshop":
      return "Sem permissão para esta operação.";
    default:
      return "Acesso negado.";
  }
}

/** Log seguro: sem senha, token, body ou PII. */
export function systemNotificationsAuthzLogFields(
  decision: SystemNotificationsAuthDecision,
  extra?: { route?: string; role?: string | null; passwordProvided?: boolean }
): Record<string, string | boolean | number | null> {
  return {
    kind: "sec04_system_notifications",
    ok: decision.ok,
    reason: decision.reason,
    httpStatus: decision.httpStatus,
    route: extra?.route ?? null,
    role: extra?.role ?? null,
    passwordProvided: extra?.passwordProvided === true,
  };
}
