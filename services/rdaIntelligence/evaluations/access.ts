/**
 * ACL de avaliações gerenciais (dados confidenciais de funcionários).
 * Admin, full_access ou access_radar_qualidade (autorização gerencial do Radar).
 */

export type EvalAuthRole = "admin" | "user";

export type EvalViewerFlags = {
  permissions: Record<string, boolean>;
};

export function canManageEmployeeEvaluations(input: {
  role: EvalAuthRole | string | undefined;
  userId?: string | null;
  flags: EvalViewerFlags | null;
}): boolean {
  if (input.role === "admin") return true;
  if (input.role !== "user" || !input.userId || !input.flags) return false;
  const p = input.flags.permissions;
  return p.full_access === true || p.access_radar_qualidade === true;
}

export function clampScore(n: unknown): number | null {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isInteger(v) || v < 1 || v > 5) return null;
  return v;
}

export function averageScores(
  rows: {
    score_technical_quality: number;
    score_organization: number;
    score_procedures: number;
    score_autonomy: number;
    score_communication: number;
  }[]
): {
  technicalQuality: number;
  organization: number;
  procedures: number;
  autonomy: number;
  communication: number;
} | null {
  if (rows.length === 0) return null;
  const sum = {
    technicalQuality: 0,
    organization: 0,
    procedures: 0,
    autonomy: 0,
    communication: 0,
  };
  for (const r of rows) {
    sum.technicalQuality += r.score_technical_quality;
    sum.organization += r.score_organization;
    sum.procedures += r.score_procedures;
    sum.autonomy += r.score_autonomy;
    sum.communication += r.score_communication;
  }
  const n = rows.length;
  return {
    technicalQuality: Math.round((sum.technicalQuality / n) * 10) / 10,
    organization: Math.round((sum.organization / n) * 10) / 10,
    procedures: Math.round((sum.procedures / n) * 10) / 10,
    autonomy: Math.round((sum.autonomy / n) * 10) / 10,
    communication: Math.round((sum.communication / n) * 10) / 10,
  };
}
