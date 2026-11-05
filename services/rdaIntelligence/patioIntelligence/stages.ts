/**
 * Etapas reais do Pátio (order_type=vehicle) — alinhadas a constants/serviceOrderStages.ts.
 * Não inventar IDs; auditar antes de criar regras.
 */

export const PATIO_STAGE_IDS = [
  "GARANTIA",
  "AGUARDANDO_AVALIACAO",
  "AVALIACAO_TECNICA",
  "AGUARDANDO_APROVACAO",
  "ORCAMENTO_APROVADO",
  "AGUARDANDO_PECAS",
  "PECAS_DISPONIVEIS",
  "EM_SERVICO",
  "FASE_DE_TESTE",
  "FINALIZADO",
  "ORCAMENTO_NAO_APROVADO",
] as const;

export type PatioStageId = (typeof PATIO_STAGE_IDS)[number];

export const PATIO_STAGE_LABELS: Record<PatioStageId, string> = {
  GARANTIA: "Garantia",
  AGUARDANDO_AVALIACAO: "Aguardando avaliação",
  AVALIACAO_TECNICA: "Avaliação técnica",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  ORCAMENTO_APROVADO: "Orçamento aprovado",
  AGUARDANDO_PECAS: "Aguardando peças",
  PECAS_DISPONIVEIS: "Peças disponíveis",
  EM_SERVICO: "Em serviço",
  FASE_DE_TESTE: "Fase de teste",
  FINALIZADO: "Finalizado",
  ORCAMENTO_NAO_APROVADO: "Orçamento não aprovado",
};

/** Etapas ativas no fluxo (exclui terminal/arquivado). */
export const PATIO_ACTIVE_STAGES: PatioStageId[] = [
  "GARANTIA",
  "AGUARDANDO_AVALIACAO",
  "AVALIACAO_TECNICA",
  "AGUARDANDO_APROVACAO",
  "ORCAMENTO_APROVADO",
  "AGUARDANDO_PECAS",
  "PECAS_DISPONIVEIS",
  "EM_SERVICO",
  "FASE_DE_TESTE",
  "ORCAMENTO_NAO_APROVADO",
];

export const PATIO_TERMINAL_STAGES = new Set<string>(["FINALIZADO", "CANCELLED", "ENTREGUE"]);

export function patioStageLabel(status: string): string {
  const id = String(status || "").trim() as PatioStageId;
  return PATIO_STAGE_LABELS[id] || status || "Desconhecido";
}

export function isPatioActiveStatus(status: string): boolean {
  const s = String(status || "").trim();
  if (PATIO_TERMINAL_STAGES.has(s)) return false;
  return PATIO_ACTIVE_STAGES.includes(s as PatioStageId) || Boolean(s);
}
