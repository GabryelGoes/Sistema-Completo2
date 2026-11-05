import type { ProactiveAlertDraft, ProactiveCategory } from "./types.js";

/** Monta texto de recomendação explícita (hipótese de ação — não executada). */
export function buildRecommendation(input: {
  category: ProactiveCategory;
  kind: string;
  context?: string;
}): string {
  const ctx = input.context ? ` ${input.context}` : "";
  switch (input.kind) {
    case "delivery_overdue":
      return `Recomendo priorizar este veículo e alinhar nova previsão com o cliente.${ctx}`;
    case "delivery_imminent":
      return `Recomendo confirmar status e peças/aprovação para cumprir a entrega de hoje.${ctx}`;
    case "waiting_parts":
      return `Recomendo confirmar a previsão de chegada das peças com o fornecedor.${ctx}`;
    case "waiting_approval":
      return `Recomendo acompanhar a aprovação do orçamento com o responsável pelo cliente.${ctx}`;
    case "approved_not_started":
      return `Recomendo atribuir ou iniciar o serviço aprovado o quanto antes.${ctx}`;
    case "stage_bottleneck":
      return `Recomendo revisar a fila desta etapa e redistribuir atenção da equipe.${ctx}`;
    case "lab_analysis_slow":
      return `Recomendo verificar o andamento com o responsável técnico do módulo.${ctx}`;
    case "lab_ready_pickup":
      return `Recomendo avisar o cliente/oficina para retirada do módulo pronto.${ctx}`;
    case "bench_full":
      return `Recomendo liberar bancadas finalizadas ou acelerar entregas para reduzir a fila.${ctx}`;
    case "low_stock":
      return `Recomendo avaliar reposição desta peça (estoque abaixo do mínimo).${ctx}`;
    case "out_of_stock":
      return `Recomendo priorizar compra/reposição — peça esgotada.${ctx}`;
    case "ops_pattern":
      return `Recomendo revisar o padrão operacional (hipótese) e, se fizer sentido, propor orientação à Memória com aprovação humana.${ctx}`;
    case "long_session":
      return `Recomendo conferir se há cronômetro esquecido em execução/pausa.${ctx}`;
    default:
      return `Recomendo analisar a evidência e decidir a próxima ação operacional.${ctx}`;
  }
}

export function formatAlertBody(draft: Pick<ProactiveAlertDraft, "body" | "evidence" | "recommendation">): string {
  return [
    draft.body,
    draft.evidence ? `Evidência: ${draft.evidence}` : "",
    draft.recommendation ? `Recomendação: ${draft.recommendation}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
