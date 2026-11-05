import {
  canViewWorkPerformanceSummary,
  type WorkSessionAuthRole,
  type WorkSessionViewerFlags,
} from "../workSessions/access.js";

/** Visão agregada da oficina (sem ranking punitivo) — gestão. */
export function canViewOperationalIntelligence(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
}): boolean {
  return canViewWorkPerformanceSummary(input);
}

/** Breakdown individual de técnicos — mesma restrição de gestão. */
export function canViewTechnicianTimeBreakdown(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
}): boolean {
  return canViewWorkPerformanceSummary(input);
}
