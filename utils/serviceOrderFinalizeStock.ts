import { normalizeBudgetPartName, type BudgetPartFields } from './budgetPartStock';

export type BudgetPartRowForStock = {
  description?: string;
  quantity?: string | number;
  approved?: boolean;
  fromStock?: boolean;
  workshopPartId?: string;
};

export type BudgetRowForParts = {
  id: string;
  parts?: BudgetPartRowForStock[] | null;
};

export type FinalizeStockLineInput = {
  description: string;
  quantity: string;
  workshopPartId?: string | null;
  budgetId?: string | null;
};

export function parseFinalizePartQuantity(value: unknown): number {
  const raw = String(value ?? '').replace(',', '.').trim();
  const qty = Number(raw);
  if (!Number.isFinite(qty) || qty <= 0) return 1;
  return qty;
}

export function formatFinalizePartQuantity(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '1';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

/** Peças aprovadas nos orçamentos, agregadas por descrição. */
export function collectApprovedPartsFromBudgets(
  budgets: BudgetRowForParts[]
): FinalizeStockLineInput[] {
  const byKey = new Map<
    string,
    { description: string; quantity: number; budgetId: string | null; workshopPartId: string | null }
  >();

  for (const budget of budgets) {
    const parts = Array.isArray(budget.parts) ? budget.parts : [];
    for (const part of parts) {
      if (part.approved !== true) continue;
      const description = String(part.description ?? '').trim();
      if (!description) continue;
      const key = normalizeBudgetPartName(description);
      const qty = parseFinalizePartQuantity(part.quantity);
      const prev = byKey.get(key);
      if (prev) {
        prev.quantity += qty;
        if (!prev.workshopPartId && part.workshopPartId) {
          prev.workshopPartId = part.workshopPartId;
        }
      } else {
        byKey.set(key, {
          description,
          quantity: qty,
          budgetId: budget.id ?? null,
          workshopPartId: part.workshopPartId ?? null,
        });
      }
    }
  }

  return Array.from(byKey.values()).map((row) => ({
    description: row.description,
    quantity: formatFinalizePartQuantity(row.quantity),
    budgetId: row.budgetId,
    workshopPartId: row.workshopPartId,
  }));
}

export function mergeFinalizeStockDraftLines(
  savedLines: FinalizeStockLineInput[],
  approvedParts: FinalizeStockLineInput[]
): FinalizeStockLineInput[] {
  const saved = savedLines
    .map((l) => ({
      description: (l.description ?? '').trim(),
      quantity: formatFinalizePartQuantity(parseFinalizePartQuantity(l.quantity)),
      workshopPartId: l.workshopPartId ?? null,
      budgetId: l.budgetId ?? null,
    }))
    .filter((l) => l.description);

  if (approvedParts.length === 0) {
    return saved.length > 0 ? saved : [];
  }

  const consumed = new Set<number>();

  const merged = approvedParts.map((part) => {
    const partKey = normalizeBudgetPartName(part.description);
    let matchIdx = -1;

    for (let i = 0; i < saved.length; i++) {
      if (consumed.has(i)) continue;
      const row = saved[i];
      const descMatch = normalizeBudgetPartName(row.description) === partKey;
      const budgetMatch =
        part.budgetId != null && row.budgetId != null && row.budgetId === part.budgetId;
      if (descMatch || budgetMatch) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      consumed.add(matchIdx);
      const row = saved[matchIdx];
      return {
        description: part.description,
        quantity: row.quantity,
        workshopPartId: row.workshopPartId ?? part.workshopPartId ?? null,
        budgetId: part.budgetId ?? null,
      };
    }

    return {
      description: part.description,
      quantity: part.quantity,
      workshopPartId: part.workshopPartId ?? null,
      budgetId: part.budgetId ?? null,
    };
  });

  saved.forEach((row, i) => {
    if (consumed.has(i)) return;
    merged.push(row);
  });

  return merged;
}

export function aggregateFinalizeStockParts(
  lines: FinalizeStockLineInput[]
): Map<string, number> {
  const agg = new Map<string, number>();
  for (const line of lines) {
    const description = (line.description ?? '').trim();
    if (!description) continue;
    const key = normalizeBudgetPartName(description);
    const prev = agg.get(key) ?? 0;
    agg.set(key, prev + parseFinalizePartQuantity(line.quantity));
  }
  return agg;
}

export function mapBudgetPartFieldsToFinalizeLines(
  parts: BudgetPartFields[]
): FinalizeStockLineInput[] {
  return parts
    .filter((p) => (p.description ?? '').trim())
    .map((p) => ({
      description: p.description.trim(),
      quantity: formatFinalizePartQuantity(parseFinalizePartQuantity(p.quantity)),
      workshopPartId: p.workshopPartId ?? null,
      budgetId: null,
    }));
}
