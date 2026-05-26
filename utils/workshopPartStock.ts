import type { WorkshopPart } from '../services/apiService';

export type WorkshopPartStockStatus = 'zero' | 'low' | 'ok';

export type WorkshopPartSortMode = 'recent' | 'alphabetical';

export const WORKSHOP_PARTS_SORT_STORAGE_KEY = 'workshop-parts-sort-mode';

export function readWorkshopPartSortMode(): WorkshopPartSortMode {
  try {
    const stored = localStorage.getItem(WORKSHOP_PARTS_SORT_STORAGE_KEY);
    if (stored === 'recent' || stored === 'alphabetical') return stored;
  } catch {
    /* ignore */
  }
  return 'alphabetical';
}

/** Ordem de exibição e numeração (#1, #2, …). */
export function sortWorkshopParts(parts: WorkshopPart[], mode: WorkshopPartSortMode): WorkshopPart[] {
  return [...parts].sort((a, b) => {
    if (mode === 'recent') {
      const tb = new Date(b.created_at).getTime();
      const ta = new Date(a.created_at).getTime();
      if (tb !== ta) return tb - ta;
      return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
    }
    return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
  });
}

/** @deprecated Use {@link sortWorkshopParts} com modo explícito. */
export function sortWorkshopPartsForDisplay(parts: WorkshopPart[]): WorkshopPart[] {
  return sortWorkshopParts(parts, 'alphabetical');
}

export function buildPartNumberMap(sortedParts: WorkshopPart[]): Map<string, number> {
  const map = new Map<string, number>();
  sortedParts.forEach((p, i) => map.set(p.id, i + 1));
  return map;
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
