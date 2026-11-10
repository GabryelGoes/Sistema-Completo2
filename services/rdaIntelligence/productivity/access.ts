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

/** Visibilidade de uma tarefa já carregada (não-gestão: só próprias). */
export function canAccessProductivityTask(
  auth: RdaAuthContext,
  task: {
    assigneeUserId?: string | null;
    requesterUserId?: string | null;
    createdByUserId?: string | null;
  }
): boolean {
  if (canManageProductivity(auth)) return true;
  if (!auth.userId) return false;
  const uid = String(auth.userId);
  return (
    String(task.assigneeUserId || "") === uid ||
    String(task.requesterUserId || "") === uid ||
    String(task.createdByUserId || "") === uid
  );
}

/**
 * Valida filtro assigneeUserId da API.
 * Não-gestão: só pode filtrar pelo próprio id (ou omitir).
 * Retorna mensagem de erro ou null se ok.
 */
export function validateAssigneeFilterAccess(
  auth: RdaAuthContext,
  assigneeUserId: string | null | undefined
): string | null {
  if (canManageProductivity(auth)) return null;
  const requested = String(assigneeUserId || "").trim();
  if (!requested) return null;
  if (!auth.userId || requested !== String(auth.userId)) {
    return "Sem permissão para consultar tarefas de outros funcionários.";
  }
  return null;
}

/**
 * Após resolver o responsável: não-gestão só pode atribuir a si.
 * Retorna mensagem de erro ou null se ok.
 */
export function validateDelegationAccess(
  auth: RdaAuthContext,
  resolvedAssigneeUserId: string | null | undefined
): string | null {
  if (canManageProductivity(auth)) return null;
  const target = String(resolvedAssigneeUserId || "").trim();
  if (!target) return null; // autoatribuirá ao solicitante
  if (!auth.userId || target !== String(auth.userId)) {
    return "Sem permissão para delegar a outro funcionário.";
  }
  return null;
}
