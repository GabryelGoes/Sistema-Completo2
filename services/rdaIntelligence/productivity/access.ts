import type { RdaAuthContext } from "../types.js";
import { authHasFullAccess } from "../permissions.js";

/** Quem pode ver o painel / listar tarefas (próprias ou de gestão). */
export function canViewProductivity(auth: RdaAuthContext | null | undefined): boolean {
  if (!auth?.role) return false;
  if (authHasFullAccess(auth)) return true;
  if (auth.role !== "user") return false;
  const p = auth.permissions || {};
  return (
    p.access_radar_qualidade === true ||
    p.access_patio === true ||
    p.access_laboratorio === true ||
    p.access_estoque_pecas === true ||
    p.access_home === true
  );
}

/** Gerência: criar para outros, reatribuir, cancelar qualquer, ver todas. */
export function canManageProductivity(auth: RdaAuthContext | null | undefined): boolean {
  if (!auth?.role) return false;
  if (authHasFullAccess(auth)) return true;
  if (auth.role !== "user") return false;
  const p = auth.permissions || {};
  return p.access_radar_qualidade === true || p.full_access === true;
}

export function actorDisplayName(auth: RdaAuthContext): string {
  return (auth.username || auth.userId || auth.role || "usuário").trim();
}

export function canUpdateTaskAsAssignee(
  auth: RdaAuthContext,
  assigneeUserId: string | null | undefined
): boolean {
  if (!assigneeUserId || !auth.userId) return false;
  return String(assigneeUserId) === String(auth.userId);
}
