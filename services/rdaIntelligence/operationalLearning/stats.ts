import type { OpsConfidence, OpsDistribution } from "./types.js";

export function percentileNearestRank(sortedAsc: number[], p: number): number | null {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0]!;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank));
  return sortedAsc[idx]!;
}

export function medianMs(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  }
  return sorted[mid]!;
}

export function confidenceFromSamples(n: number): OpsConfidence {
  if (n <= 0) return "insufficient";
  if (n < 5) return "insufficient";
  if (n < 15) return "low";
  if (n < 40) return "medium";
  return "high";
}

export function confidenceNote(n: number, confidence: OpsConfidence): string {
  if (confidence === "insufficient") {
    return `Amostra insuficiente (n=${n}). Não há base para conclusão estatística confiável.`;
  }
  if (confidence === "low") {
    return `Baixa confiança (n=${n}). Use apenas como indício; complexidade e interrupções podem distorcer.`;
  }
  if (confidence === "medium") {
    return `Confiança moderada (n=${n}). Tendência útil, ainda sujeita a contexto operacional.`;
  }
  return `Confiança alta (n=${n}) para o critério e período informados.`;
}

export function buildDistribution(valuesMs: number[]): OpsDistribution {
  const sorted = [...valuesMs].filter((v) => Number.isFinite(v) && v >= 0).sort((a, b) => a - b);
  const n = sorted.length;
  const confidence = confidenceFromSamples(n);
  if (n === 0) {
    return {
      sampleCount: 0,
      medianMs: null,
      p25Ms: null,
      p75Ms: null,
      minMs: null,
      maxMs: null,
      relativeDispersion: null,
      confidence,
      note: confidenceNote(0, confidence),
    };
  }
  const med = medianMs(sorted);
  const p25 = percentileNearestRank(sorted, 25);
  const p75 = percentileNearestRank(sorted, 75);
  let relativeDispersion: number | null = null;
  if (med != null && med > 0 && p25 != null && p75 != null) {
    relativeDispersion = Math.round(((p75 - p25) / med) * 1000) / 1000;
  }
  return {
    sampleCount: n,
    medianMs: med,
    p25Ms: p25,
    p75Ms: p75,
    minMs: sorted[0]!,
    maxMs: sorted[n - 1]!,
    relativeDispersion,
    confidence,
    note: confidenceNote(n, confidence),
  };
}

export function formatDurationPt(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return "—";
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
