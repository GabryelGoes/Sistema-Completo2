/**
 * SEC-04.2 — autorização por grupo de campos em workshop-settings / uploads equivalentes.
 *
 * Funções puras: o handler carrega permissões no servidor (oficina + id da sessão)
 * e chama estes helpers antes de qualquer escrita. Falha de consulta → deny.
 *
 * G0/G1: somente Gerência (`role === "admin"`). `full_access` não basta.
 * G2: admin | full_access | access_laboratorio | access_servicos_oficina
 * G3: admin | full_access | access_settings
 */

import {
  pickWorkshopSettingsWrite,
  requestsEffectiveCredentialChange,
  type WorkshopSettingsWriteBody,
} from "./workshopSettingsSecrets.js";

export type WorkshopSettingsAuthGroup = "G0" | "G1" | "G2" | "G3";

export type WorkshopSettingsPermissionLoad = "ok" | "failed" | "missing" | "unauthenticated";

export type WorkshopSettingsActor = {
  role: "admin" | "user" | null;
  userId?: string;
  /** Presente só quando load === "ok" para role user. */
  permissions?: Record<string, boolean> | null;
  load: WorkshopSettingsPermissionLoad;
};

export type WorkshopSettingsAuthDecision =
  | { ok: true; groups: WorkshopSettingsAuthGroup[] }
  | {
      ok: false;
      reason:
        | "unauthenticated"
        | "lookup_failed"
        | "not_in_workshop"
        | "missing_permission"
        | "admin_required";
      groups: WorkshopSettingsAuthGroup[];
      deniedGroups: WorkshopSettingsAuthGroup[];
    };

/** Espelho do toque G1 em apiApp (nome/foto/acessos técnicos / login pátio). */
export function touchesSensitiveG1(body: WorkshopSettingsWriteBody): boolean {
  return (
    typeof body.adminDisplayName === "string" ||
    typeof body.adminPhotoUrl === "string" ||
    typeof body.patioLoginEnabled === "boolean" ||
    typeof body.technicianAccessReception === "boolean" ||
    typeof body.technicianAccessAgenda === "boolean" ||
    typeof body.technicianAccessPatio === "boolean"
  );
}

export function touchesG2(body: WorkshopSettingsWriteBody): boolean {
  return Array.isArray(body.labProductKinds) || Array.isArray(body.labQuickServices);
}

export function touchesG3(body: WorkshopSettingsWriteBody): boolean {
  const appearance =
    body.appAppearance !== undefined &&
    body.appAppearance !== null &&
    typeof body.appAppearance === "object";
  const labels =
    body.labelTemplates !== undefined &&
    body.labelTemplates !== null &&
    typeof body.labelTemplates === "object";
  const ai = body.aiImproveTextLevel !== undefined && body.aiImproveTextLevel !== null;
  return appearance || labels || ai;
}

/** Grupos com alteração efetiva reconhecida (secrets vazios não entram em G0). */
export function affectedWriteGroups(body: WorkshopSettingsWriteBody): WorkshopSettingsAuthGroup[] {
  const groups: WorkshopSettingsAuthGroup[] = [];
  if (requestsEffectiveCredentialChange(body)) groups.push("G0");
  if (touchesSensitiveG1(body)) groups.push("G1");
  if (touchesG2(body)) groups.push("G2");
  if (touchesG3(body)) groups.push("G3");
  return groups;
}

export function actorAllowsGroup(
  actor: WorkshopSettingsActor,
  group: WorkshopSettingsAuthGroup
): boolean {
  if (actor.role === "admin") return true;
  if (actor.role !== "user") return false;
  if (actor.load === "failed" || actor.load === "missing" || actor.load === "unauthenticated") {
    return false;
  }
  const perms = actor.permissions || {};
  if (group === "G0" || group === "G1") return false;
  if (perms.full_access === true) return true;
  if (group === "G2") {
    return perms.access_laboratorio === true || perms.access_servicos_oficina === true;
  }
  if (group === "G3") {
    return perms.access_settings === true;
  }
  return false;
}

/**
 * Autorização atômica: se qualquer grupo afetado for negado, a decisão é deny
 * (nenhuma gravação deve ocorrer). Corpo sem grupos efetivos → ok (handler decide 400).
 */
export function authorizeWorkshopSettingsWrite(
  actor: WorkshopSettingsActor,
  bodyInput: unknown
): WorkshopSettingsAuthDecision {
  if (!actor.role) {
    return {
      ok: false,
      reason: "unauthenticated",
      groups: [],
      deniedGroups: [],
    };
  }

  const body = pickWorkshopSettingsWrite(bodyInput);
  const groups = affectedWriteGroups(body);
  if (groups.length === 0) {
    return { ok: true, groups: [] };
  }

  if (actor.role === "user") {
    if (actor.load === "failed") {
      return { ok: false, reason: "lookup_failed", groups, deniedGroups: groups };
    }
    if (actor.load === "missing") {
      return { ok: false, reason: "not_in_workshop", groups, deniedGroups: groups };
    }
  }

  const deniedGroups = groups.filter((g) => !actorAllowsGroup(actor, g));
  if (deniedGroups.length === 0) {
    return { ok: true, groups };
  }

  const adminOnly = deniedGroups.every((g) => g === "G0" || g === "G1");
  return {
    ok: false,
    reason: adminOnly ? "admin_required" : "missing_permission",
    groups,
    deniedGroups,
  };
}

/** POST /api/workshop-admin/photo — somente Gerência. */
export function authorizeAdminPhotoUpload(actor: WorkshopSettingsActor): WorkshopSettingsAuthDecision {
  if (!actor.role) {
    return { ok: false, reason: "unauthenticated", groups: ["G1"], deniedGroups: ["G1"] };
  }
  if (actor.role === "admin") {
    return { ok: true, groups: ["G1"] };
  }
  return {
    ok: false,
    reason: "admin_required",
    groups: ["G1"],
    deniedGroups: ["G1"],
  };
}

/** POST /api/lab-product-kinds/:id/photo — política G2. */
export function authorizeLabProductKindPhoto(
  actor: WorkshopSettingsActor
): WorkshopSettingsAuthDecision {
  if (!actor.role) {
    return { ok: false, reason: "unauthenticated", groups: ["G2"], deniedGroups: ["G2"] };
  }
  if (actor.role === "admin") {
    return { ok: true, groups: ["G2"] };
  }
  if (actor.load === "failed") {
    return { ok: false, reason: "lookup_failed", groups: ["G2"], deniedGroups: ["G2"] };
  }
  if (actor.load === "missing") {
    return { ok: false, reason: "not_in_workshop", groups: ["G2"], deniedGroups: ["G2"] };
  }
  if (actorAllowsGroup(actor, "G2")) {
    return { ok: true, groups: ["G2"] };
  }
  return {
    ok: false,
    reason: "missing_permission",
    groups: ["G2"],
    deniedGroups: ["G2"],
  };
}

/** Mensagem HTTP estável (sem listar chaves sensíveis). */
export function workshopSettingsAuthzErrorMessage(decision: WorkshopSettingsAuthDecision): string {
  if (decision.ok === true) {
    return "Sem permissão para alterar estas configurações.";
  }
  switch (decision.reason) {
    case "admin_required":
      return "Apenas a Gerência pode alterar estas configurações.";
    case "lookup_failed":
      return "Não foi possível verificar permissões. Tente novamente.";
    case "not_in_workshop":
      return "Sem permissão para esta operação.";
    case "unauthenticated":
      return "Sessão inválida ou expirada. Faça login novamente.";
    default:
      return "Sem permissão para alterar estas configurações.";
  }
}

/** Log seguro: sem secrets, tokens ou body. */
export function workshopSettingsAuthzLogFields(
  decision: WorkshopSettingsAuthDecision,
  extra?: { route?: string; role?: string | null }
): Record<string, string | boolean | number | null> {
  if (decision.ok === true) {
    return {
      kind: "sec04_workshop_settings",
      ok: true,
      route: extra?.route ?? null,
      role: extra?.role ?? null,
      groups: decision.groups.join(","),
      reason: "allow",
      denied: "",
    };
  }
  return {
    kind: "sec04_workshop_settings",
    ok: false,
    route: extra?.route ?? null,
    role: extra?.role ?? null,
    groups: decision.groups.join(","),
    reason: decision.reason,
    denied: decision.deniedGroups.join(","),
  };
}
