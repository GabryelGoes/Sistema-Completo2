import type { PatioStageId } from "./stages.js";
import { PATIO_ACTIVE_STAGES } from "./stages.js";

/** Chave em workshop_settings — JSON de horas por etapa. Ausência = defaults. */
export const RDA_PATIO_THRESHOLDS_SETTING_KEY = "rda_patio_stage_thresholds_hours";

/**
 * Limites padrão (horas na etapa via updated_at) — configuráveis pela gestão.
 * Não são prazos fixos rígidos; apenas alertas de atenção.
 */
export const DEFAULT_PATIO_STAGE_THRESHOLD_HOURS: Record<PatioStageId, number> = {
  GARANTIA: 72,
  AGUARDANDO_AVALIACAO: 24,
  AVALIACAO_TECNICA: 48,
  AGUARDANDO_APROVACAO: 48,
  ORCAMENTO_APROVADO: 24,
  AGUARDANDO_PECAS: 72,
  PECAS_DISPONIVEIS: 24,
  EM_SERVICO: 72,
  FASE_DE_TESTE: 24,
  FINALIZADO: 9999,
  ORCAMENTO_NAO_APROVADO: 168,
};

export type PatioThresholds = Record<string, number>;

export function parsePatioThresholds(raw: string | null | undefined): PatioThresholds {
  const base: PatioThresholds = { ...DEFAULT_PATIO_STAGE_THRESHOLD_HOURS };
  if (!raw || !String(raw).trim()) return base;
  try {
    const parsed = JSON.parse(String(raw)) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return base;
    for (const [k, v] of Object.entries(parsed)) {
      const n = typeof v === "number" ? v : Number(v);
      if (Number.isFinite(n) && n > 0 && n < 10_000) {
        base[k] = Math.round(n);
      }
    }
  } catch {
    /* keep defaults */
  }
  return base;
}

export function thresholdHoursForStatus(
  thresholds: PatioThresholds,
  status: string
): number {
  const s = String(status || "").trim();
  if (thresholds[s] != null && Number.isFinite(thresholds[s])) return thresholds[s]!;
  return DEFAULT_PATIO_STAGE_THRESHOLD_HOURS[s as PatioStageId] ?? 48;
}

export function serializePatioThresholds(t: PatioThresholds): string {
  const out: Record<string, number> = {};
  for (const id of PATIO_ACTIVE_STAGES) {
    out[id] = thresholdHoursForStatus(t, id);
  }
  return JSON.stringify(out);
}
