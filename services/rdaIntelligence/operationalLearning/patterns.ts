import { buildServiceDurationRows, buildPauseReasonRows } from "./aggregations.js";
import type { OpsSessionFact, OpsPatternSuggestion, OpsPeriod } from "./types.js";
import { formatDurationPt } from "./stats.js";

type PauseEventLite = { reasonId: string; label: string; pausedMs: number | null };

/**
 * Gera sugestões interpretáveis — nunca conclusões oficiais.
 * Cada item é candidato a proposta na Memória Permanente (aprovação humana).
 */
export function detectOperationalPatterns(
  facts: OpsSessionFact[],
  pauseEvents: PauseEventLite[],
  period: OpsPeriod
): OpsPatternSuggestion[] {
  const out: OpsPatternSuggestion[] = [];
  const periodLabel = `${period.from.slice(0, 10)} → ${period.to.slice(0, 10)}`;

  const slowDiag = buildServiceDurationRows(facts, "diagnostic", 20).filter(
    (r) => r.distribution.sampleCount >= 5 && (r.distribution.medianMs || 0) > 0
  );
  for (const row of slowDiag.slice(0, 3)) {
    const med = row.distribution.medianMs!;
    out.push({
      id: `slow_diagnostic:${row.serviceKey}`,
      kind: "slow_diagnostic",
      title: `Diagnóstico demorado: ${row.serviceLabel}`,
      summary: `Mediana ${formatDurationPt(med)} em ${row.distribution.sampleCount} ocorrência(s) OS+serviço (diagnóstico; sessões somadas) (${periodLabel}). ${row.distribution.note}`,
      sampleCount: row.distribution.sampleCount,
      confidence: row.distribution.confidence,
      proposedKnowledge: {
        title: `Orientação: diagnóstico — ${row.serviceLabel}`,
        content: [
          `Padrão observado (não oficial): mediana de diagnóstico ${formatDurationPt(med)}`,
          `Período: ${periodLabel}; amostras: ${row.distribution.sampleCount}; confiança: ${row.distribution.confidence}.`,
          `Hipótese: revisar checklist, ferramentas e interrupções típicas deste procedimento.`,
          `Fato: baseado apenas em sessões finished com time_kind=diagnostic; pausas não entram no produtivo.`,
        ].join("\n"),
        category: "operational_learning",
        knowledgeKeyHint: `ops.diag.${row.serviceKey}`.slice(0, 100),
      },
    });
  }

  const highVar = buildServiceDurationRows(facts, "all", 40).filter(
    (r) =>
      r.distribution.sampleCount >= 8 &&
      r.distribution.relativeDispersion != null &&
      r.distribution.relativeDispersion >= 0.75
  );
  for (const row of highVar.slice(0, 3)) {
    out.push({
      id: `high_variance:${row.timeKind}:${row.serviceKey}`,
      kind: "high_variance",
      title: `Alta variação (${row.timeKind}): ${row.serviceLabel}`,
      summary: `Dispersão relativa ${row.distribution.relativeDispersion} (IQR/mediana) com n=${row.distribution.sampleCount} ocorrências. Kind isolado; sem misturar diag/exec. Não usar para ranking de pessoas.`,
      sampleCount: row.distribution.sampleCount,
      confidence: row.distribution.confidence,
      proposedKnowledge: {
        title: `Atenção à variação — ${row.serviceLabel}`,
        content: [
          `Cálculo: IQR/mediana = ${row.distribution.relativeDispersion}; n=${row.distribution.sampleCount}; time_kind=${row.timeKind}; período ${periodLabel}.`,
          `Hipótese: complexidade variável, retrabalho ou escopo inconsistente entre OS.`,
          `Sugestão: padronizar escopo e anotar interrupções antes de comparar técnicos.`,
        ].join("\n"),
        category: "operational_learning",
        knowledgeKeyHint: `ops.var.${row.timeKind}.${row.serviceKey}`.slice(0, 100),
      },
    });
  }

  const pauses = buildPauseReasonRows(pauseEvents, 10);
  const top = pauses[0];
  if (top && top.pauseEventCount >= 5) {
    out.push({
      id: `frequent_pause:${top.reasonId}`,
      kind: "frequent_pause",
      title: `Pausa recorrente: ${top.label}`,
      summary: `${top.pauseEventCount} eventos de pausa no período. Pausa não conta como tempo produtivo.`,
      sampleCount: top.pauseEventCount,
      confidence: top.pauseEventCount >= 20 ? "medium" : "low",
      proposedKnowledge: {
        title: `Reduzir pausas — ${top.label}`,
        content: [
          `Fato: motivo "${top.label}" foi o mais recorrente (${top.pauseEventCount} eventos) em ${periodLabel}.`,
          `Hipótese: falta de peça, espera de cliente ou fila interna — validar com gestão.`,
          `Não transformar automaticamente em regra; propor mitigação operacional.`,
        ].join("\n"),
        category: "operational_learning",
        knowledgeKeyHint: `ops.pause.${top.reasonId}`.slice(0, 100),
      },
    });
  }

  const slowExec = buildServiceDurationRows(facts, "execution", 20).filter(
    (r) => r.distribution.sampleCount >= 5 && (r.distribution.medianMs || 0) > 0
  );
  for (const row of slowExec.slice(0, 2)) {
    if (out.some((x) => x.id === `slow_service:${row.serviceKey}`)) continue;
    out.push({
      id: `slow_service:${row.serviceKey}`,
      kind: "slow_service",
      title: `Execução longa: ${row.serviceLabel}`,
      summary: `Mediana de execução ${formatDurationPt(row.distribution.medianMs)} (n=${row.distribution.sampleCount}).`,
      sampleCount: row.distribution.sampleCount,
      confidence: row.distribution.confidence,
      proposedKnowledge: {
        title: `Melhoria de execução — ${row.serviceLabel}`,
        content: [
          `Cálculo: mediana ${formatDurationPt(row.distribution.medianMs)}; n=${row.distribution.sampleCount}; ${periodLabel}.`,
          `Fato: apenas sessões finished de execution; abertas/pausadas excluídas da mediana.`,
          `Hipótese: oportunidade de orientação de bancada / preparação de peças.`,
        ].join("\n"),
        category: "operational_learning",
        knowledgeKeyHint: `ops.exec.${row.serviceKey}`.slice(0, 100),
      },
    });
  }

  return out;
}
