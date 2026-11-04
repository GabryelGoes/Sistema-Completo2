/**
 * ACL do Radar de Qualidade — dados confidenciais da equipe.
 * Admin, full_access ou access_radar_qualidade.
 */

export type QualityRadarAuthRole = "admin" | "user";

export function canAccessQualityRadar(input: {
  role: QualityRadarAuthRole | string | undefined;
  userId?: string | null;
  permissions?: Record<string, boolean> | null;
}): boolean {
  if (input.role === "admin") return true;
  if (input.role !== "user" || !input.userId) return false;
  const p = input.permissions || {};
  return p.full_access === true || p.access_radar_qualidade === true;
}

/** Técnico comum (sem radar) não vê observações de outros. */
export function canViewEmployeeConfidentialProfile(input: {
  role: QualityRadarAuthRole | string | undefined;
  userId?: string | null;
  permissions?: Record<string, boolean> | null;
  subjectSystemUserId?: string | null;
}): boolean {
  if (canAccessQualityRadar(input)) return true;
  // Sem permissão gerencial: só o próprio perfil (se houver endpoint self) — Radar não lista equipe.
  return false;
}
