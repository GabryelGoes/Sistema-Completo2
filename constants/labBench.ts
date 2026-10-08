/**
 * Bancada do laboratório — modelo de **vaga fixa**.
 *
 * Layout físico: balcão com 26 compartimentos (5×6), mas os 2 primeiros da
 * primeira linha são grandes e ficam fora do sistema. Os compartimentos **1–24**
 * são numerados e cada produto recebe **um endereço fixo** na entrada.
 *
 * Ao mudar de etapa, o produto **não muda de compartimento** — só a cor/etiqueta
 * no sistema. A etapa é lida no card; a posição física permanece até entrega,
 * arquivamento ou etapa fora da bancada.
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
  "GARANTIA",
  "AGUARDANDO_AVALIACAO",
  "AVALIACAO_TECNICA",
  "AGUARDANDO_APROVACAO",
  "ORCAMENTO_APROVADO",
  "AGUARDANDO_PECAS",
  "FINALIZADO",
  "SEM_CONSERTO",
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

/**
 * Bancada da oficina — 24 vagas em letras (A–X), paralelas ao depósito 1–24.
 * Atribuição automática na entrada; liberadas na Saída (→ depósito).
 */
export const OFICINA_SHELF_COUNT = 24;
export const OFICINA_SHELF_LETTERS: string[] = Array.from(
  { length: OFICINA_SHELF_COUNT },
  (_, i) => String.fromCharCode(65 + i) // A … X
);

/** Normaliza letra A–X; retorna null se inválida/vazia. */
export function normalizeOficinaShelf(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim().toUpperCase();
  if (!OFICINA_SHELF_LETTERS.includes(s)) return null;
  return s;
}

/** Primeira letra livre entre A–X. */
export function firstFreeOficinaShelf(occupiedLetters: Iterable<string>): string | null {
  const occupied = new Set<string>();
  for (const raw of occupiedLetters) {
    const n = normalizeOficinaShelf(raw);
    if (n) occupied.add(n);
  }
  for (const letter of OFICINA_SHELF_LETTERS) {
    if (!occupied.has(letter)) return letter;
  }
  return null;
}

/** Legenda visual das etapas (cores na UI — não define zona física). */
export interface LabBenchStageLegend {
  id: string;
  label: string;
  statuses: string[];
  accent: string;
}

export const LAB_BENCH_STAGE_LEGEND: LabBenchStageLegend[] = [
  {
    id: "GARANTIA",
    label: "Garantia",
    statuses: ["GARANTIA"],
    accent: "bg-red-600",
  },
  {
    id: "AGUARDANDO_AVALIACAO",
    label: "Aguardando avaliação",
    statuses: ["AGUARDANDO_AVALIACAO"],
    accent: "bg-zinc-500",
  },
  {
    id: "AVALIACAO_TECNICA",
    label: "Em análise",
    statuses: ["AVALIACAO_TECNICA"],
    accent: "bg-[#F5D00B]",
  },
  {
    id: "AGUARDANDO_APROVACAO",
    label: "Aguardando aprovação",
    statuses: ["AGUARDANDO_APROVACAO"],
    accent: "bg-amber-500",
  },
  {
    id: "ORCAMENTO_APROVADO",
    label: "Reparo aprovado",
    statuses: ["ORCAMENTO_APROVADO"],
    accent: "bg-orange-600",
  },
  {
    id: "AGUARDANDO_PECAS",
    label: "Aguardando peças",
    statuses: ["AGUARDANDO_PECAS"],
    accent: "bg-teal-500",
  },
  {
    id: "FINALIZADO",
    label: "Finalizado",
    statuses: ["FINALIZADO"],
    accent: "bg-green-900",
  },
  {
    id: "SEM_CONSERTO",
    label: "Sem conserto",
    statuses: ["SEM_CONSERTO"],
    accent: "bg-[#9A6434]",
  },
  {
    id: "PRONTO_PRA_RETIRADA",
    label: "Pronto pra entrega",
    statuses: ["PRONTO_PRA_RETIRADA"],
    accent: "bg-green-400",
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
  return (LAB_BENCH_STATUSES as string[]).includes(s);
}

/** Mesmos status da bancada do depósito usam vaga na oficina (letra A–X). */
export function statusUsesOficinaShelf(status: string | null | undefined): boolean {
  return statusUsesBench(status);
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
