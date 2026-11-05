/**
 * Etapas reais do Laboratório (order_type=module) —
 * alinhadas a LABORATORY_SERVICE_ORDER_STAGES / labBench.
 */

export const LAB_STAGE_IDS = [
  "GARANTIA",
  "AGUARDANDO_AVALIACAO",
  "AVALIACAO_TECNICA",
  "AGUARDANDO_APROVACAO",
  "ORCAMENTO_APROVADO",
  "AGUARDANDO_PECAS",
  "EM_SERVICO",
  "FINALIZADO",
  "SEM_CONSERTO",
  "PRONTO_PRA_RETIRADA",
  "ORCAMENTO_NAO_APROVADO",
  "EM_CONSERTO_EXTERNO",
] as const;

export type LabStageId = (typeof LAB_STAGE_IDS)[number];

export const LAB_STAGE_LABELS: Record<LabStageId, string> = {
  GARANTIA: "Garantia",
  AGUARDANDO_AVALIACAO: "Aguardando avaliação",
  AVALIACAO_TECNICA: "Em análise",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  ORCAMENTO_APROVADO: "Reparo aprovado",
  AGUARDANDO_PECAS: "Aguardando peças",
  EM_SERVICO: "Em reparo",
  FINALIZADO: "Finalizado",
  SEM_CONSERTO: "Sem conserto",
  PRONTO_PRA_RETIRADA: "Pronto pra entrega",
  ORCAMENTO_NAO_APROVADO: "Orçamento não aprovado",
  EM_CONSERTO_EXTERNO: "Em conserto externo",
};

/** Etapas que ainda estão no fluxo do lab (exclui arquivado). */
export const LAB_ACTIVE_STAGES: LabStageId[] = [
  "GARANTIA",
  "AGUARDANDO_AVALIACAO",
  "AVALIACAO_TECNICA",
  "AGUARDANDO_APROVACAO",
  "ORCAMENTO_APROVADO",
  "AGUARDANDO_PECAS",
  "EM_SERVICO",
  "FINALIZADO",
  "SEM_CONSERTO",
  "PRONTO_PRA_RETIRADA",
  "ORCAMENTO_NAO_APROVADO",
  "EM_CONSERTO_EXTERNO",
];

export const LAB_TERMINAL_STAGES = new Set<string>(["CANCELLED", "ENTREGUE"]);

export const LAB_BENCH_SLOT_COUNT = 24;

export function labStageLabel(status: string): string {
  const id = String(status || "").trim() as LabStageId;
  return LAB_STAGE_LABELS[id] || status || "Desconhecido";
}

export function isLabActiveStatus(status: string): boolean {
  const s = String(status || "").trim();
  if (LAB_TERMINAL_STAGES.has(s)) return false;
  return LAB_ACTIVE_STAGES.includes(s as LabStageId) || Boolean(s);
}
