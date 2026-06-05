/**
 * Bancada do laboratório.
 *
 * Layout físico: balcão retangular com 26 compartimentos (5 linhas x 6 colunas),
 * mas a primeira linha tem só 2 compartimentos grandes que NÃO entram na
 * organização automática. Os outros 24 (iguais) são numerados de 1 a 24 e cada
 * grupo de 4 corresponde a uma etapa do fluxo:
 *
 *   1..4    Aguardando avaliação   (AGUARDANDO_AVALIACAO / AVALIACAO_TECNICA)
 *   5..8    Aguardando aprovação   (AGUARDANDO_APROVACAO / ORCAMENTO_APROVADO)
 *   9..12   Aguardando peças       (AGUARDANDO_PECAS / PECAS_DISPONIVEIS)
 *   13..16  Envio conserto         (ENVIO_CONSERTO)
 *   17..20  Chegada conserto       (CHEGADA_CONSERTO)
 *   21..24  Pronto pra retirada    (PRONTO_PRA_RETIRADA)
 *
 * EM_SERVICO fica "fora da bancada" (produto com o técnico) => bench_slot = null.
 */

export interface LabBenchGroup {
  /** Identificador estável do grupo (igual ao status principal da etapa). */
  id: string;
  /** Rótulo curto exibido no painel. */
  label: string;
  /** Compartimentos físicos do grupo (1..24). */
  slots: number[];
  /** Status que "moram" neste grupo da bancada. */
  statuses: string[];
  /** Classe Tailwind para a cor do cabeçalho do grupo. */
  accent: string;
}

export const LAB_BENCH_GROUPS: LabBenchGroup[] = [
  {
    id: "AGUARDANDO_AVALIACAO",
    label: "Aguardando avaliação",
    slots: [1, 2, 3, 4],
    statuses: ["AGUARDANDO_AVALIACAO", "AVALIACAO_TECNICA"],
    accent: "bg-zinc-500",
  },
  {
    id: "AGUARDANDO_APROVACAO",
    label: "Aguardando aprovação",
    slots: [5, 6, 7, 8],
    statuses: ["AGUARDANDO_APROVACAO", "ORCAMENTO_APROVADO"],
    accent: "bg-amber-500",
  },
  {
    id: "AGUARDANDO_PECAS",
    label: "Aguardando peças",
    slots: [9, 10, 11, 12],
    statuses: ["AGUARDANDO_PECAS", "PECAS_DISPONIVEIS"],
    accent: "bg-teal-500",
  },
  {
    id: "ENVIO_CONSERTO",
    label: "Envio conserto",
    slots: [13, 14, 15, 16],
    statuses: ["ENVIO_CONSERTO"],
    accent: "bg-indigo-600",
  },
  {
    id: "CHEGADA_CONSERTO",
    label: "Chegada conserto",
    slots: [17, 18, 19, 20],
    statuses: ["CHEGADA_CONSERTO"],
    accent: "bg-cyan-600",
  },
  {
    id: "PRONTO_PRA_RETIRADA",
    label: "Pronto pra retirada",
    slots: [21, 22, 23, 24],
    statuses: ["PRONTO_PRA_RETIRADA"],
    accent: "bg-green-500",
  },
];

/** Grupo da bancada "Aguardando avaliação" (compartimentos 1..4) — único com fila automática. */
export const LAB_BENCH_INTAKE_GROUP = LAB_BENCH_GROUPS[0];

/** True se o status pertence ao grupo Aguardando avaliação (1..4). */
export function statusInIntakeBenchGroup(status: string | null | undefined): boolean {
  const group = labGroupForStatus(status);
  return group?.id === LAB_BENCH_INTAKE_GROUP.id;
}

/** Total de compartimentos numerados da bancada. */
export const LAB_BENCH_SLOT_COUNT = 24;

/** Menor e maior número de compartimento válido. */
export const LAB_BENCH_FIRST_SLOT = 1;
export const LAB_BENCH_LAST_SLOT = 24;

/** Conserto externo (terceiros) — armazenado em service_orders.external_repair (jsonb). */
export interface ExternalRepair {
  /** Veículo ou referência do produto enviado. */
  vehicleRef?: string | null;
  /** Identificação do produto (nº de série, código, etc.). */
  productIdentification?: string | null;
  /** Id do tipo de produto (slug configurável) ou "outro". */
  productType?: string | null;
  /** Texto livre quando productType === "outro". */
  productTypeOther?: string | null;
  /** Serviço solicitado (do pátio ou digitado manualmente). */
  service?: string | null;
  /** Fornecedor / empresa que fará o conserto. */
  vendor?: string | null;
  /** Data de envio (ISO ou yyyy-mm-dd). */
  sentAt?: string | null;
  /** Previsão de retorno. */
  expectedAt?: string | null;
  /** Data de retorno efetivo. */
  returnedAt?: string | null;
  /** Custo do conserto externo (texto livre, ex.: "R$ 250,00"). */
  cost?: string | null;
  /** Observações / nº de pedido / contato. */
  notes?: string | null;
}

/** Grupo da bancada ao qual um status pertence (ou null se fora da bancada). */
export function labGroupForStatus(status: string | null | undefined): LabBenchGroup | null {
  const s = String(status ?? "").trim();
  if (!s) return null;
  return LAB_BENCH_GROUPS.find((g) => g.statuses.includes(s)) ?? null;
}

/** True se o status deve ocupar um compartimento da bancada. */
export function statusUsesBench(status: string | null | undefined): boolean {
  return labGroupForStatus(status) !== null;
}

/** Grupo dono de um compartimento (1..24). */
export function groupForSlot(slot: number | null | undefined): LabBenchGroup | null {
  if (slot == null) return null;
  return LAB_BENCH_GROUPS.find((g) => g.slots.includes(slot)) ?? null;
}

/**
 * Primeiro compartimento livre do grupo de um status.
 * @param status status alvo
 * @param occupiedSlots compartimentos já ocupados por outras OS ativas
 * @returns número do compartimento livre, ou null se o grupo estiver cheio / fora da bancada
 */
export function firstFreeSlotForStatus(
  status: string | null | undefined,
  occupiedSlots: Iterable<number>
): number | null {
  const group = labGroupForStatus(status);
  if (!group) return null;
  const occupied = new Set<number>();
  for (const s of occupiedSlots) {
    if (typeof s === "number") occupied.add(s);
  }
  for (const slot of group.slots) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}

/** Normaliza um valor recebido como número de compartimento válido (ou null). */
export function normalizeBenchSlot(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < LAB_BENCH_FIRST_SLOT || n > LAB_BENCH_LAST_SLOT) return null;
  return n;
}
