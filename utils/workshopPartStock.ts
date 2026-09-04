import type { WorkshopPart } from '../services/apiService';

export type WorkshopPartStockStatus = 'zero' | 'low' | 'ok';

/** Ordem de exibição na lista (não altera o nº do catálogo). */
export type WorkshopPartSortMode = 'recent' | 'oldest';

export const WORKSHOP_PARTS_SORT_STORAGE_KEY = 'workshop-parts-sort-mode';

export function readWorkshopPartSortMode(): WorkshopPartSortMode {
  try {
    const stored = localStorage.getItem(WORKSHOP_PARTS_SORT_STORAGE_KEY);
    if (stored === 'recent' || stored === 'oldest') return stored;
    if (stored === 'alphabetical') return 'recent';
  } catch {
    /* ignore */
  }
  return 'recent';
}

function compareByCreatedAtAsc(a: WorkshopPart, b: WorkshopPart): number {
  const ta = new Date(a.created_at).getTime();
  const tb = new Date(b.created_at).getTime();
  if (ta !== tb) return ta - tb;
  return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
}

/** Ordem fixa do catálogo: cadastro mais antigo = #1, mais novo = #N. */
export function sortWorkshopPartsForCatalogNumber(parts: WorkshopPart[]): WorkshopPart[] {
  return [...parts].sort(compareByCreatedAtAsc);
}

/** Numeração (#1, #2, …) sempre pela data de cadastro (antigo → novo). */
export function buildPartNumberMap(catalogOrderParts: WorkshopPart[]): Map<string, number> {
  const map = new Map<string, number>();
  catalogOrderParts.forEach((p, i) => map.set(p.id, i + 1));
  return map;
}

/** Ordem da lista na tela: recentes (padrão) ou antigos primeiro. */
export function sortWorkshopPartsForDisplay(
  parts: WorkshopPart[],
  mode: WorkshopPartSortMode
): WorkshopPart[] {
  return [...parts].sort((a, b) => {
    const cmp = compareByCreatedAtAsc(a, b);
    return mode === 'recent' ? -cmp : cmp;
  });
}

/**
 * Formata quantidade de estoque para exibição.
 * Inteiros: "2" (não "2.000"). Decimais: até 3 casas, sem zeros à direita ("2,5" → "2.5").
 */
export function formatWorkshopPartQty(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  if (!Number.isFinite(v)) return '0';
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(3).replace(/\.?0+$/, '');
}

export function getWorkshopPartStockStatus(part: WorkshopPart): WorkshopPartStockStatus {
  const stock = Number(part.stock_qty ?? 0);
  const min = Number(part.min_stock_qty ?? 0);
  if (stock <= 0) return 'zero';
  if (min > 0 && stock <= min) return 'low';
  return 'ok';
}

export function countStockAlerts(parts: WorkshopPart[]): { zero: number; low: number } {
  let zero = 0;
  let low = 0;
  for (const p of parts) {
    const s = getWorkshopPartStockStatus(p);
    if (s === 'zero') zero += 1;
    else if (s === 'low') low += 1;
  }
  return { zero, low };
}

export type WorkshopPartCategoryCounts = {
  /** Produto em várias categorias conta em cada uma. */
  counts: Map<string, number>;
  uncategorized: number;
  total: number;
};

export function countPartsByCategory(parts: WorkshopPart[]): WorkshopPartCategoryCounts {
  const counts = new Map<string, number>();
  let uncategorized = 0;
  for (const p of parts) {
    const ids = p.category_ids ?? [];
    if (ids.length === 0) uncategorized += 1;
    else for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return { counts, uncategorized, total: parts.length };
}
