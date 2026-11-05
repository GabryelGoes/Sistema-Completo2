import type { LabStageId } from "./stages.js";
import { LAB_ACTIVE_STAGES } from "./stages.js";

export const RDA_LAB_THRESHOLDS_SETTING_KEY = "rda_lab_stage_thresholds_hours";

/**
 * Limites padrão (horas desde status_entered_at) — configuráveis.
 * OS sem status_entered_at não entram nos gargalos de permanência.
 */
export const DEFAULT_LAB_STAGE_THRESHOLD_HOURS: Record<LabStageId, number> = {
  GARANTIA: 72,
  AGUARDANDO_AVALIACAO: 24,
  AVALIACAO_TECNICA: 48,
  AGUARDANDO_APROVACAO: 48,
  ORCAMENTO_APROVADO: 24,
  AGUARDANDO_PECAS: 72,
  EM_SERVICO: 72,
  FINALIZADO: 48,
  SEM_CONSERTO: 72,
  PRONTO_PRA_RETIRADA: 48,
  ORCAMENTO_NAO_APROVADO: 72,
  EM_CONSERTO_EXTERNO: 120,
};

export type LabThresholds = Record<string, number>;

export function parseLabThresholds(raw: string | null | undefined): LabThresholds {
  const base: LabThresholds = { ...DEFAULT_LAB_STAGE_THRESHOLD_HOURS };
  if (!raw || !String(raw).trim()) return base;
  try {
    const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
    for (const id of LAB_ACTIVE_STAGES) {
      const v = parsed[id];
      if (typeof v === "number" && Number.isFinite(v) && v > 0) {
        base[id] = Math.min(Math.max(Math.round(v), 1), 720);
      }
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

export function serializeLabThresholds(t: LabThresholds): string {
  return JSON.stringify(t);
}

export function thresholdHoursForLabStatus(thresholds: LabThresholds, status: string): number {
  const s = String(status || "").trim();
  const v = thresholds[s];
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return v;
  return DEFAULT_LAB_STAGE_THRESHOLD_HOURS[s as LabStageId] || 48;
}
