import type { WorkSessionAuthRole, WorkSessionViewerFlags } from "../workSessions/access.js";
import { canViewWorkPerformanceSummary } from "../workSessions/access.js";

/** Leitura do painel / tools de pátio inteligente. */
export function canViewPatioIntelligence(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
  permissions?: Record<string, boolean> | null;
}): boolean {
  if (input.role === "admin") return true;
  if (canViewWorkPerformanceSummary(input)) return true;
  const p = input.permissions || input.flags?.permissions || {};
  return p.access_patio === true || p.full_access === true;
}

/** Alterar limiares configuráveis. */
export function canConfigurePatioThresholds(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
}): boolean {
  return canViewWorkPerformanceSummary(input);
}
