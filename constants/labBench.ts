/**
 * Bancada do laboratório — modelo de **vaga fixa**.
 *
 * Layout físico: balcão com 26 compartimentos (5×6), mas os 2 primeiros da
 * primeira linha são grandes e ficam fora do sistema. Os compartimentos **1–24**
 * são numerados e cada produto recebe **um endereço fixo** na entrada.
 *
 * Ao mudar de etapa, o produto **não muda de compartimento** — só a cor/etiqueta
 * no sistema. A etapa é lida no card; a posição física permanece até entrega,
 * arquivamento ou etapa que não usa bancada (ex.: Em serviço).
 *
 * Fila (`bench_queued_at`): quando todos os 24 compartimentos estão ocupados.
 */

export interface ExternalRepair {
  vehicleRef?: string | null;
  productIdentification?: string | null;
  productType?: string | null;
  productTypeOther?: string | null;
  service?: string | null;
  vendor?: string | null;
  sentAt?: string | null;
  expectedAt?: string | null;
  returnedAt?: string | null;
  cost?: string | null;
  notes?: string | null;
}

/** Status que ocupam compartimento físico na bancada (1..24). */
export const LAB_BENCH_STATUSES: string[] = [
  "AGUARDANDO_AVALIACAO",
  "AVALIACAO_TECNICA",
  "AGUARDANDO_APROVACAO",
  "ORCAMENTO_APROVADO",
  "AGUARDANDO_PECAS",
  "PECAS_DISPONIVEIS",
  "ENVIO_CONSERTO",
  "CHEGADA_CONSERTO",
  "PRONTO_PRA_RETIRADA",
];

export const LAB_BENCH_SLOT_COUNT = 24;
export const LAB_BENCH_FIRST_SLOT = 1;
export const LAB_BENCH_LAST_SLOT = 24;

/** Todos os números de compartimento válidos (1..24). */
export const ALL_BENCH_SLOTS: number[] = Array.from(
  { length: LAB_BENCH_SLOT_COUNT },
  (_, i) => i + 1
);

/** Legenda visual das etapas (cores na UI — não define zona física). */
export interface LabBenchStageLegend {
  id: string;
  label: string;
  statuses: string[];
  accent: string;
}

export const LAB_BENCH_STAGE_LEGEND: LabBenchStageLegend[] = [
  {
    id: "AGUARDANDO_AVALIACAO",
    label: "Aguardando avaliação",
    statuses: ["AGUARDANDO_AVALIACAO", "AVALIACAO_TECNICA"],
    accent: "bg-zinc-500",
  },
  {
    id: "AGUARDANDO_APROVACAO",
    label: "Aguardando aprovação",
    statuses: ["AGUARDANDO_APROVACAO", "ORCAMENTO_APROVADO"],
    accent: "bg-amber-500",
  },
  {
    id: "AGUARDANDO_PECAS",
    label: "Aguardando peças",
    statuses: ["AGUARDANDO_PECAS", "PECAS_DISPONIVEIS"],
    accent: "bg-teal-500",
  },
  {
    id: "ENVIO_CONSERTO",
    label: "Envio conserto",
    statuses: ["ENVIO_CONSERTO"],
    accent: "bg-indigo-600",
  },
  {
    id: "CHEGADA_CONSERTO",
    label: "Chegada conserto",
    statuses: ["CHEGADA_CONSERTO"],
    accent: "bg-cyan-600",
  },
  {
    id: "PRONTO_PRA_RETIRADA",
    label: "Pronto pra retirada",
    statuses: ["PRONTO_PRA_RETIRADA"],
    accent: "bg-green-500",
  },
];

/** @deprecated Use LAB_BENCH_STAGE_LEGEND — mantido para imports antigos. */
export const LAB_BENCH_GROUPS = LAB_BENCH_STAGE_LEGEND.map((g, i) => ({
  ...g,
  slots: ALL_BENCH_SLOTS.slice(i * 4, (i + 1) * 4),
}));

/** @deprecated Fila não é restrita ao grupo 1–4. */
export const LAB_BENCH_INTAKE_GROUP = LAB_BENCH_GROUPS[0];

export function statusUsesBench(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim();
  return LAB_BENCH_STATUSES.includes(s);
}

/** Primeiro compartimento livre entre 1..24. */
export function firstFreeBenchSlot(occupiedSlots: Iterable<number>): number | null {
  const occupied = new Set<number>();
  for (const s of occupiedSlots) {
    if (typeof s === "number") occupied.add(s);
  }
  for (let slot = LAB_BENCH_FIRST_SLOT; slot <= LAB_BENCH_LAST_SLOT; slot++) {
    if (!occupied.has(slot)) return slot;
  }
  return null;
}

/**
 * Primeiro compartimento livre se o status usa bancada.
 * (Compatível com chamadas antigas que passavam o status.)
 */
export function firstFreeSlotForStatus(
  status: string | null | undefined,
  occupiedSlots: Iterable<number>
): number | null {
  if (!statusUsesBench(status)) return null;
  return firstFreeBenchSlot(occupiedSlots);
}

/** Legenda da etapa para um status (só visual). */
export function labStageLegendForStatus(status: string | null | undefined): LabBenchStageLegend | null {
  const s = String(status ?? "").trim();
  if (!s) return null;
  return LAB_BENCH_STAGE_LEGEND.find((g) => g.statuses.includes(s)) ?? null;
}

/** @deprecated Vaga fixa: grupos não definem zona. Use labStageLegendForStatus. */
export function labGroupForStatus(status: string | null | undefined): LabBenchStageLegend | null {
  return labStageLegendForStatus(status);
}

/** @deprecated Vaga fixa: compartimento não pertence a um grupo fixo. */
export function groupForSlot(_slot: number | null | undefined): LabBenchStageLegend | null {
  return null;
}

/** True se o status pode entrar na fila quando a bancada (24) está cheia. */
export function statusInIntakeBenchGroup(status: string | null | undefined): boolean {
  return statusUsesBench(status);
}

export function normalizeBenchSlot(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n)) return null;
  if (n < LAB_BENCH_FIRST_SLOT || n > LAB_BENCH_LAST_SLOT) return null;
  return n;
}
