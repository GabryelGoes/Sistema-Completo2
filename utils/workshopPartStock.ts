import type { WorkshopPart } from '../services/apiService';

export type WorkshopPartStockStatus = 'zero' | 'low' | 'ok';

/** Ordem estável para numeração (#1, #2, …) e exibição. */
export function sortWorkshopPartsForDisplay(parts: WorkshopPart[]): WorkshopPart[] {
  return [...parts].sort((a, b) => {
    const so = (a.sort_order ?? 0) - (b.sort_order ?? 0);
    if (so !== 0) return so;
    return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
  });
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
