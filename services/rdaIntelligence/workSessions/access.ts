/**
 * Escopo de leitura das sessões de tempo RDA.
 * Regras de servidor — não confiar na UI.
 */

export type WorkSessionAuthRole = "admin" | "user";

export type WorkSessionViewerFlags = {
  isTechnician: boolean;
  permissions: Record<string, boolean>;
};

export type WorkSessionListScope =
  | { allowed: false; scope: "none" }
  | { allowed: true; scope: "all" }
  | { allowed: true; scope: "self"; selfUserId: string };

export function isElevatedWorkSessionViewer(
  flags: WorkSessionViewerFlags | null | undefined
): boolean {
  if (!flags) return false;
  return (
    flags.permissions.full_access === true ||
    flags.permissions.access_radar_qualidade === true
  );
}

/**
 * Quem pode enxergar endpoints de tempo (motivos, listagens, detalhe).
 * - admin / full_access / radar: sim
 * - técnico autenticado: sim (próprias sessões)
 * - patio/lab isolados: não (evita vazar tempos de funcionários)
 */
export function canAccessWorkSessionApis(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
}): boolean {
  if (input.role === "admin") return true;
  if (input.role !== "user" || !input.userId || !input.flags) return false;
  if (isElevatedWorkSessionViewer(input.flags)) return true;
  if (input.flags.isTechnician) return true;
  return false;
}

export function resolveWorkSessionListScope(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
}): WorkSessionListScope {
  if (input.role === "admin") {
    return { allowed: true, scope: "all" };
  }
  if (input.role !== "user" || !input.userId || !input.flags) {
    return { allowed: false, scope: "none" };
  }
  if (isElevatedWorkSessionViewer(input.flags)) {
    return { allowed: true, scope: "all" };
  }
  if (input.flags.isTechnician) {
    return { allowed: true, scope: "self", selfUserId: input.userId };
  }
  return { allowed: false, scope: "none" };
}

/** Resumo gerencial (todos os técnicos) — só admin/radar/full. */
export function canViewWorkPerformanceSummary(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
}): boolean {
  if (input.role === "admin") return true;
  if (input.role !== "user" || !input.userId || !input.flags) return false;
  return isElevatedWorkSessionViewer(input.flags);
}

export function canViewSessionRow(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
  sessionTechnicianUserId: string;
}): boolean {
  if (input.role === "admin") return true;
  if (input.role !== "user" || !input.userId || !input.flags) return false;
  if (isElevatedWorkSessionViewer(input.flags)) return true;
  return input.sessionTechnicianUserId === input.userId;
}
