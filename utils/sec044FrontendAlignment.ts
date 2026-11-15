/**
 * SEC-04.4 — helpers puros de alinhamento frontend × permissões.
 * Não concedem privilégios; só espelham a matriz de apresentação.
 */

import type { AjustesVisibility } from "../components/ajustes/AjustesHubPanel";
import type { EmployeePermissions, EmployeeRole } from "./employeeAccess";
import { resolveAjustesVisibility } from "./employeeAccess";

/** Modais SEC-04.4 que devem montar fora do gate genérico `!isTechnician`. */
export const SEC044_VISIBILITY_MOUNTED_KEYS = [
  "lab_tipos",
  "lab_rapidos",
  "etiquetas",
  "notificacoes_sistema",
  "senhas",
] as const;

export type Sec044MountedKey = (typeof SEC044_VISIBILITY_MOUNTED_KEYS)[number];

/** Gravação de G0/G1 (senhas operacionais): só Gerência. */
export function canWriteOperationalSecrets(input: {
  role: EmployeeRole | undefined;
  isSystemUser: boolean;
  isTechnician: boolean;
}): boolean {
  if (input.role === "admin") return true;
  // Gerência via HomeView: não é system user nem técnico.
  return !input.isSystemUser && !input.isTechnician;
}

export function resolveSec044ModalMounts(visibility: AjustesVisibility): Record<Sec044MountedKey, boolean> {
  return {
    lab_tipos: !!visibility.lab_tipos,
    lab_rapidos: !!visibility.lab_rapidos,
    etiquetas: !!visibility.etiquetas,
    notificacoes_sistema: !!visibility.notificacoes_sistema,
    senhas: !!visibility.senhas,
  };
}

export function sec044VisibilityForProfile(profile: {
  kind: "gerencia" | "full_access" | "lab" | "servicos" | "settings" | "notif" | "none";
  isTechnician?: boolean;
}): AjustesVisibility {
  const isTechnician = profile.isTechnician ?? profile.kind !== "gerencia";
  if (profile.kind === "gerencia") {
    return resolveAjustesVisibility({
      role: "admin",
      permissions: undefined,
      isSystemUser: false,
      isTechnician: false,
      hasTechnicianProfile: false,
      hasLogout: true,
    });
  }
  const permissions: EmployeePermissions =
    profile.kind === "full_access"
      ? { full_access: true }
      : profile.kind === "lab"
        ? { access_laboratorio: true }
        : profile.kind === "servicos"
          ? { access_servicos_oficina: true }
          : profile.kind === "settings"
            ? { access_settings: true }
            : profile.kind === "notif"
              ? { access_notificacoes_sistema: true }
              : { access_home: true };
  return resolveAjustesVisibility({
    role: "user",
    permissions,
    isSystemUser: true,
    isTechnician,
    hasTechnicianProfile: isTechnician,
    hasLogout: true,
  });
}
