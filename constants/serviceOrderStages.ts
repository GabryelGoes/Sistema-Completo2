/**
 * Etapas do fluxo de ordem de serviço.
 * Ordem e cores usadas no Pátio e no backend.
 */

export type ServiceOrderStatus =
  | "AGUARDANDO_AVALIACAO"
  | "AVALIACAO_TECNICA"
  | "AGUARDANDO_APROVACAO"
  | "ORCAMENTO_APROVADO"
  | "AGUARDANDO_PECAS"
  | "EM_SERVICO"
  | "FASE_DE_TESTE"
  | "FINALIZADO"
  | "GARANTIA"
  | "ORCAMENTO_NAO_APROVADO"
  | "CANCELLED";

export interface StageConfig {
  id: ServiceOrderStatus;
  name: string;
  /** Classes Tailwind para o badge (bg, text, border) */
  style: string;
  /** Classes Tailwind para aro do modal (ring + ring-offset) */
  ringClass: string;
  pos: number;
}

export const SERVICE_ORDER_STAGES: StageConfig[] = [
  { id: "GARANTIA", name: "Garantia", style: "bg-red-600 text-white border-red-600", ringClass: "ring-2 ring-red-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 0 },
  { id: "AGUARDANDO_AVALIACAO", name: "Aguardando avaliação", style: "bg-zinc-500 text-white border-zinc-600", ringClass: "ring-2 ring-zinc-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 1 },
  { id: "AVALIACAO_TECNICA", name: "Avaliação técnica", style: "bg-brand-yellow text-black border-brand-yellow", ringClass: "ring-2 ring-brand-yellow ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 2 },
  { id: "AGUARDANDO_APROVACAO", name: "Aguardando aprovação", style: "bg-orange-500 text-black border-orange-500", ringClass: "ring-2 ring-orange-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 3 },
  { id: "ORCAMENTO_APROVADO", name: "Orçamento aprovado", style: "bg-orange-600 text-white border-orange-600", ringClass: "ring-2 ring-orange-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 4 },
  { id: "AGUARDANDO_PECAS", name: "Aguardando peças", style: "bg-teal-500 text-white border-teal-500", ringClass: "ring-2 ring-teal-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 5 },
  { id: "EM_SERVICO", name: "Em serviço", style: "bg-blue-600 text-white border-blue-600", ringClass: "ring-2 ring-blue-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 6 },
  { id: "FASE_DE_TESTE", name: "Fase de teste", style: "bg-green-900 text-white border-green-800", ringClass: "ring-2 ring-green-800 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 7 },
  { id: "FINALIZADO", name: "Finalizado", style: "bg-green-400 text-green-950 border-green-500", ringClass: "ring-2 ring-green-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 8 },
  { id: "ORCAMENTO_NAO_APROVADO", name: "Orçamento não aprovado", style: "bg-violet-600 text-white border-violet-600", ringClass: "ring-2 ring-violet-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 9 },
];

/** Primeira etapa (nova OS na recepção) */
export const FIRST_STAGE: ServiceOrderStatus = "AGUARDANDO_AVALIACAO";

/** Status usado para "Entregue / Arquivado" (fora do fluxo) */
export const CANCELLED_STATUS: ServiceOrderStatus = "CANCELLED";

export const ALL_STATUSES: ServiceOrderStatus[] = [
  ...SERVICE_ORDER_STAGES.map((s) => s.id),
  CANCELLED_STATUS,
];

export function getStageConfig(status: string): StageConfig | undefined {
  return SERVICE_ORDER_STAGES.find((s) => s.id === status);
}

export function getStageStyle(status: string): string {
  const stage = getStageConfig(status);
  if (stage) return stage.style;
  if (status === CANCELLED_STATUS) return "bg-zinc-600 text-zinc-300 border-zinc-600";
  return "bg-zinc-500 text-white border-zinc-600";
}

const DEFAULT_RING_CLASS = "ring-2 ring-zinc-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]";

export function getStageRingClass(status: string): string {
  const stage = getStageConfig(status);
  if (stage) return stage.ringClass;
  if (status === CANCELLED_STATUS) return DEFAULT_RING_CLASS;
  return DEFAULT_RING_CLASS;
}
