import type { WorkSessionAuthRole, WorkSessionViewerFlags } from "../workSessions/access.js";
import { canViewWorkPerformanceSummary } from "../workSessions/access.js";

function permsOf(input: {
  flags: WorkSessionViewerFlags | null;
  permissions?: Record<string, boolean> | null;
}): Record<string, boolean> {
  return input.permissions || input.flags?.permissions || {};
}

/** Painel combinado Lab + Estoque (qualquer um dos dois acessos). */
export function canViewLabEstoqueIntelligence(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
  permissions?: Record<string, boolean> | null;
}): boolean {
  if (input.role === "admin") return true;
  if (canViewWorkPerformanceSummary(input)) return true;
  const p = permsOf(input);
  return (
    p.access_laboratorio === true ||
    p.access_estoque_pecas === true ||
    p.full_access === true
  );
}

export function canViewLabIntelligence(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
  permissions?: Record<string, boolean> | null;
}): boolean {
  if (input.role === "admin") return true;
  if (canViewWorkPerformanceSummary(input)) return true;
  const p = permsOf(input);
  return p.access_laboratorio === true || p.full_access === true;
}

export function canViewStockIntelligence(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
  permissions?: Record<string, boolean> | null;
}): boolean {
  if (input.role === "admin") return true;
  if (canViewWorkPerformanceSummary(input)) return true;
  const p = permsOf(input);
  return p.access_estoque_pecas === true || p.full_access === true;
}

export function canConfigureLabThresholds(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
}): boolean {
  return canViewWorkPerformanceSummary(input);
}
