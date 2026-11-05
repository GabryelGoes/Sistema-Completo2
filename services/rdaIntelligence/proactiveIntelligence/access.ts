import type { WorkSessionAuthRole, WorkSessionViewerFlags } from "../workSessions/access.js";
import { canViewWorkPerformanceSummary } from "../workSessions/access.js";
import type { ProactiveCategory } from "./types.js";

function permsOf(input: {
  flags: WorkSessionViewerFlags | null;
  permissions?: Record<string, boolean> | null;
}): Record<string, boolean> {
  return input.permissions || input.flags?.permissions || {};
}

/** Ver painel / listar alertas (qualquer área relevante). */
export function canViewProactiveIntelligence(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
  permissions?: Record<string, boolean> | null;
}): boolean {
  if (input.role === "admin") return true;
  if (canViewWorkPerformanceSummary(input)) return true;
  const p = permsOf(input);
  return (
    p.full_access === true ||
    p.access_radar_qualidade === true ||
    p.access_patio === true ||
    p.access_laboratorio === true ||
    p.access_estoque_pecas === true
  );
}

export function canConfigureProactiveMonitor(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
}): boolean {
  return canViewWorkPerformanceSummary(input);
}

/** Categorias visíveis conforme permissões. */
export function allowedProactiveCategories(input: {
  role: WorkSessionAuthRole | string | undefined;
  flags: WorkSessionViewerFlags | null;
  permissions?: Record<string, boolean> | null;
}): ProactiveCategory[] {
  if (input.role === "admin" || canViewWorkPerformanceSummary(input)) {
    return ["patio", "laboratorio", "estoque", "produtividade"];
  }
  const p = permsOf(input);
  const out: ProactiveCategory[] = [];
  if (p.full_access === true || p.access_patio === true) out.push("patio");
  if (p.full_access === true || p.access_laboratorio === true) out.push("laboratorio");
  if (p.full_access === true || p.access_estoque_pecas === true) out.push("estoque");
  if (p.full_access === true || p.access_radar_qualidade === true) out.push("produtividade");
  return out;
}

export function canMutateProactiveAlerts(input: {
  role: WorkSessionAuthRole | string | undefined;
  userId?: string | null;
  flags: WorkSessionViewerFlags | null;
  permissions?: Record<string, boolean> | null;
}): boolean {
  return canViewProactiveIntelligence(input);
}

/** Transição/histórico só na categoria permitida ao usuário. */
export function canAccessProactiveCategory(
  input: {
    role: WorkSessionAuthRole | string | undefined;
    flags: WorkSessionViewerFlags | null;
    permissions?: Record<string, boolean> | null;
  },
  category: ProactiveCategory | string | null | undefined
): boolean {
  if (!category) return false;
  return allowedProactiveCategories(input).includes(category as ProactiveCategory);
}
