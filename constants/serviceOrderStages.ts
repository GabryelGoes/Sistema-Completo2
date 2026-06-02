/**
 * Etapas do fluxo de ordem de serviço.
 * Pátio (veículos) e Laboratório (módulos/produtos) têm colunas diferentes.
 */

export type ServiceOrderStatus =
  | "AGUARDANDO_AVALIACAO"
  | "AVALIACAO_TECNICA"
  | "AGUARDANDO_APROVACAO"
  | "ORCAMENTO_APROVADO"
  | "AGUARDANDO_PECAS"
  | "PECAS_DISPONIVEIS"
  | "ENVIO_CONSERTO"
  | "EM_CONSERTO_EXTERNO"
  | "CHEGADA_CONSERTO"
  | "EM_SERVICO"
  | "FASE_DE_TESTE"
  | "FINALIZADO"
  | "PRONTO_PRA_RETIRADA"
  | "GARANTIA"
  | "ORCAMENTO_NAO_APROVADO"
  | "CANCELLED";

export interface StageConfig {
  id: ServiceOrderStatus;
  name: string;
  /** Classes Tailwind para o badge (bg, text, border) */
  style: string;
  /** Classes Tailwind para o aro do modal (ring + ring-offset) */
  ringClass: string;
  pos: number;
}

/** Fluxo do Pátio (veículos) — 10 etapas operacionais + garantia. */
export const SERVICE_ORDER_STAGES: StageConfig[] = [
  { id: "GARANTIA", name: "Garantia", style: "bg-red-600 text-white border-red-600", ringClass: "ring-2 ring-red-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 0 },
  { id: "AGUARDANDO_AVALIACAO", name: "Aguardando avaliação", style: "bg-zinc-500 text-white border-zinc-600", ringClass: "ring-2 ring-zinc-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 1 },
  { id: "AVALIACAO_TECNICA", name: "Avaliação técnica", style: "bg-[#F5D00B] text-black border-[#F5D00B]", ringClass: "ring-2 ring-[#F5D00B] ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 2 },
  { id: "AGUARDANDO_APROVACAO", name: "Aguardando aprovação", style: "bg-amber-500 text-amber-950 border-amber-600", ringClass: "ring-2 ring-amber-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 3 },
  { id: "ORCAMENTO_APROVADO", name: "Orçamento aprovado", style: "bg-orange-600 text-white border-orange-600", ringClass: "ring-2 ring-orange-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 4 },
  { id: "AGUARDANDO_PECAS", name: "Aguardando peças", style: "bg-teal-500 text-white border-teal-500", ringClass: "ring-2 ring-teal-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 5 },
  { id: "PECAS_DISPONIVEIS", name: "Peças disponíveis", style: "bg-pink-500 text-white border-pink-500", ringClass: "ring-2 ring-pink-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 6 },
  { id: "EM_SERVICO", name: "Em serviço", style: "bg-blue-600 text-white border-blue-600", ringClass: "ring-2 ring-blue-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 7 },
  { id: "FASE_DE_TESTE", name: "Fase de teste", style: "bg-green-900 text-white border-green-800", ringClass: "ring-2 ring-green-800 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 8 },
  { id: "FINALIZADO", name: "Finalizado", style: "bg-green-400 text-green-950 border-green-500", ringClass: "ring-2 ring-green-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 9 },
  { id: "ORCAMENTO_NAO_APROVADO", name: "Orçamento não aprovado", style: "bg-violet-600 text-white border-violet-600", ringClass: "ring-2 ring-violet-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 10 },
];

/** Fluxo do Laboratório — sem fase de teste nem finalizado (usa pronto pra retirada). */
export const LABORATORY_SERVICE_ORDER_STAGES: StageConfig[] = [
  { id: "GARANTIA", name: "Garantia", style: "bg-red-600 text-white border-red-600", ringClass: "ring-2 ring-red-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 0 },
  { id: "AGUARDANDO_AVALIACAO", name: "Aguardando avaliação", style: "bg-zinc-500 text-white border-zinc-600", ringClass: "ring-2 ring-zinc-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 1 },
  { id: "AVALIACAO_TECNICA", name: "Avaliação técnica", style: "bg-[#F5D00B] text-black border-[#F5D00B]", ringClass: "ring-2 ring-[#F5D00B] ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 2 },
  { id: "AGUARDANDO_APROVACAO", name: "Aguardando aprovação", style: "bg-amber-500 text-amber-950 border-amber-600", ringClass: "ring-2 ring-amber-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 3 },
  { id: "ORCAMENTO_APROVADO", name: "Orçamento aprovado", style: "bg-orange-600 text-white border-orange-600", ringClass: "ring-2 ring-orange-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 4 },
  { id: "AGUARDANDO_PECAS", name: "Aguardando peças", style: "bg-teal-500 text-white border-teal-500", ringClass: "ring-2 ring-teal-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 5 },
  { id: "PECAS_DISPONIVEIS", name: "Peças disponíveis", style: "bg-pink-500 text-white border-pink-500", ringClass: "ring-2 ring-pink-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 6 },
  { id: "ENVIO_CONSERTO", name: "Envio conserto", style: "bg-indigo-600 text-white border-indigo-600", ringClass: "ring-2 ring-indigo-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 7 },
  { id: "CHEGADA_CONSERTO", name: "Chegada conserto", style: "bg-cyan-600 text-white border-cyan-600", ringClass: "ring-2 ring-cyan-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 8 },
  { id: "EM_SERVICO", name: "Em serviço", style: "bg-blue-600 text-white border-blue-600", ringClass: "ring-2 ring-blue-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 9 },
  { id: "PRONTO_PRA_RETIRADA", name: "Pronto pra retirada", style: "bg-green-400 text-green-950 border-green-500", ringClass: "ring-2 ring-green-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 10 },
  { id: "ORCAMENTO_NAO_APROVADO", name: "Orçamento não aprovado", style: "bg-violet-600 text-white border-violet-600", ringClass: "ring-2 ring-violet-600 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]", pos: 11 },
];

/**
 * Status "fora do quadro" do Laboratório: o módulo foi fisicamente enviado a um
 * terceiro e está em conserto externo. Não aparece como coluna da bancada — é
 * gerenciado na aba "Conserto externo".
 */
export const EXTERNAL_REPAIR_STATUS: ServiceOrderStatus = "EM_CONSERTO_EXTERNO";

export const EXTERNAL_REPAIR_STAGE: StageConfig = {
  id: "EM_CONSERTO_EXTERNO",
  name: "Em conserto externo",
  style: "bg-purple-700 text-white border-purple-700",
  ringClass: "ring-2 ring-purple-700 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]",
  pos: 99,
};

/** Etapas do laboratório que existem mas NÃO viram coluna no quadro. */
export const LABORATORY_OFF_BOARD_STAGES: StageConfig[] = [EXTERNAL_REPAIR_STAGE];

export function isExternalRepairStatus(status: string | null | undefined): boolean {
  return String(status ?? "").trim() === EXTERNAL_REPAIR_STATUS;
}

/** Status legados do pátio ainda aceitos no banco — mapeados ao abrir o quadro do laboratório. */
export const LABORATORY_LEGACY_STATUS_MAP: Partial<Record<string, ServiceOrderStatus>> = {
  FINALIZADO: "PRONTO_PRA_RETIRADA",
  FASE_DE_TESTE: "EM_SERVICO",
};

/** Primeira etapa padrão (nova OS na recepção) */
export const FIRST_STAGE: ServiceOrderStatus = "AGUARDANDO_AVALIACAO";

/** Status usado para "Entregue / Arquivado" (fora do fluxo) */
export const CANCELLED_STATUS: ServiceOrderStatus = "CANCELLED";

/** Etapas em que uma OS de laboratório pode entrar no cadastro (recepção). */
export const LAB_MODULE_INTAKE_STATUSES: ServiceOrderStatus[] = LABORATORY_SERVICE_ORDER_STAGES.filter(
  (s) => s.id !== "ORCAMENTO_NAO_APROVADO"
).map((s) => s.id);

export const ALL_STATUSES: ServiceOrderStatus[] = [
  ...new Set([
    ...SERVICE_ORDER_STAGES.map((s) => s.id),
    ...LABORATORY_SERVICE_ORDER_STAGES.map((s) => s.id),
    ...LABORATORY_OFF_BOARD_STAGES.map((s) => s.id),
    CANCELLED_STATUS,
  ]),
];

export type ServiceOrderFlowKind = "vehicle" | "module";

export function getServiceOrderStages(flow: ServiceOrderFlowKind = "vehicle"): StageConfig[] {
  return flow === "module" ? LABORATORY_SERVICE_ORDER_STAGES : SERVICE_ORDER_STAGES;
}

export function normalizeStatusForFlow(
  status: string | undefined,
  flow: ServiceOrderFlowKind = "vehicle"
): ServiceOrderStatus {
  const s = String(status ?? "").trim();
  if (s === CANCELLED_STATUS) return CANCELLED_STATUS;
  if (flow === "module" && s === EXTERNAL_REPAIR_STATUS) return EXTERNAL_REPAIR_STATUS;
  const stages = getServiceOrderStages(flow);
  if (stages.some((st) => st.id === s)) return s as ServiceOrderStatus;
  if (flow === "module") {
    const mapped = LABORATORY_LEGACY_STATUS_MAP[s];
    if (mapped) return mapped;
  }
  return FIRST_STAGE;
}

export function getStageConfig(
  status: string,
  flow?: ServiceOrderFlowKind
): StageConfig | undefined {
  const s = String(status ?? "").trim();
  if (s === EXTERNAL_REPAIR_STATUS) return EXTERNAL_REPAIR_STAGE;
  if (flow === "module") {
    const mapped = LABORATORY_LEGACY_STATUS_MAP[s];
    const id = (mapped ?? s) as ServiceOrderStatus;
    return (
      LABORATORY_SERVICE_ORDER_STAGES.find((st) => st.id === id) ??
      LABORATORY_OFF_BOARD_STAGES.find((st) => st.id === id) ??
      SERVICE_ORDER_STAGES.find((st) => st.id === s)
    );
  }
  return (
    SERVICE_ORDER_STAGES.find((st) => st.id === s) ??
    LABORATORY_SERVICE_ORDER_STAGES.find((st) => st.id === s) ??
    LABORATORY_OFF_BOARD_STAGES.find((st) => st.id === s)
  );
}

export function getStageStyle(status: string, flow?: ServiceOrderFlowKind): string {
  const stage = getStageConfig(status, flow);
  if (stage) return stage.style;
  if (status === CANCELLED_STATUS) return "bg-zinc-600 text-zinc-300 border-zinc-600";
  return "bg-zinc-500 text-white border-zinc-600";
}

const DEFAULT_RING_CLASS =
  "ring-2 ring-zinc-500 ring-offset-2 ring-offset-zinc-50 dark:ring-offset-[#0a0a0a]";

export function getStageRingClass(status: string, flow?: ServiceOrderFlowKind): string {
  const stage = getStageConfig(status, flow);
  if (stage) return stage.ringClass;
  if (status === CANCELLED_STATUS) return DEFAULT_RING_CLASS;
  return DEFAULT_RING_CLASS;
}

/**
 * OS ainda em fluxo operacional no Pátio (aparecem no quadro como “em andamento”).
 */
export function isServiceOrderActivePatioFlow(status: string): boolean {
  const s = String(status || "").trim();
  if (!s || s === CANCELLED_STATUS) return false;
  return s !== "FINALIZADO" && s !== "ORCAMENTO_NAO_APROVADO";
}

/** OS ainda em fluxo no Laboratório. */
export function isServiceOrderActiveLabFlow(status: string): boolean {
  const s = String(status || "").trim();
  if (!s || s === CANCELLED_STATUS) return false;
  if (s === "FINALIZADO") return false;
  return s !== "PRONTO_PRA_RETIRADA" && s !== "ORCAMENTO_NAO_APROVADO";
}

export function isServiceOrderActiveFlow(status: string, flow: ServiceOrderFlowKind): boolean {
  return flow === "module"
    ? isServiceOrderActiveLabFlow(status)
    : isServiceOrderActivePatioFlow(status);
}
