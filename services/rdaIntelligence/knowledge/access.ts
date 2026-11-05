import { authHasFullAccess } from "../permissions.js";
import type { RdaAuthContext } from "../types.js";
import type { RdaKnowledgeVisibility } from "./types.js";

/** Gestão da memória (aprovar, retirar, purge): admin ou full_access. */
export function canManageRdaKnowledge(auth: RdaAuthContext | null | undefined): boolean {
  if (!auth) return false;
  return authHasFullAccess(auth);
}

/** Propor conhecimento (criar pending): gestão ou quem usa o assistente com radar/pátio. */
export function canProposeRdaKnowledge(auth: RdaAuthContext | null | undefined): boolean {
  if (!auth) return false;
  if (authHasFullAccess(auth)) return true;
  const p = auth.permissions || {};
  return (
    p.access_radar_qualidade === true ||
    p.access_patio === true ||
    p.access_laboratorio === true
  );
}

/** Listar / ler memória na UI admin: só gestão. */
export function canViewRdaKnowledgeAdmin(auth: RdaAuthContext | null | undefined): boolean {
  return canManageRdaKnowledge(auth);
}

/**
 * Visibilidades que o ator pode recuperar como conhecimento oficial.
 * - gestão/admin: workshop + management + restricted
 * - demais: somente workshop
 */
export function allowedKnowledgeVisibilitiesForAuth(
  auth: RdaAuthContext | null | undefined
): RdaKnowledgeVisibility[] {
  if (canManageRdaKnowledge(auth)) {
    return ["workshop", "management", "restricted"];
  }
  return ["workshop"];
}

export function assertVisibilityAllowedForAuth(
  auth: RdaAuthContext | null | undefined,
  visibility: string
): boolean {
  return allowedKnowledgeVisibilitiesForAuth(auth).includes(
    visibility as RdaKnowledgeVisibility
  );
}
