import { normalizeBudgetPartName } from './budgetPartStock.js';

/** Peça aprovada no orçamento (JSON). */
export type MaintenanceBudgetPart = {
  description?: string;
  quantity?: string | number;
  approved?: boolean;
  fromStock?: boolean;
  workshopPartId?: string;
  budgetId?: string | null;
};

/** Baixa confirmada em “Peças do estoque” na OS. */
export type MaintenanceStockDelivery = {
  partId: string;
  quantity: number;
  partName?: string | null;
};

export type MaintenanceVisitPart = {
  description: string;
  quantity: string;
  fromStock: boolean;
  workshopPartId: string | null;
  budgetId: string | null;
};

function isStockLinkedPart(part: MaintenanceBudgetPart): boolean {
  const workshopPartId =
    typeof part.workshopPartId === 'string' && part.workshopPartId.trim()
      ? part.workshopPartId.trim()
      : '';
  return part.fromStock === true || Boolean(workshopPartId);
}

function qtyLabel(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '1';
  const rounded = Math.round(n * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

function parseBudgetQty(raw: string | number | undefined): number {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) return raw;
  const s = String(raw ?? '1').trim().replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/**
 * Peças do histórico de manutenções por OS:
 * - Peças fora do estoque aprovadas no orçamento → sempre.
 * - Peças do estoque → só se houve retirada confirmada em “Peças do estoque”.
 * - Baixas na OS sem linha no orçamento → também entram (uso confirmado no veículo).
 */
export function collectMaintenanceVisitParts(input: {
  budgetParts: MaintenanceBudgetPart[];
  deliveries: MaintenanceStockDelivery[];
}): MaintenanceVisitPart[] {
  const deliveredByPartId = new Map<
    string,
    { quantity: number; partName: string | null }
  >();
  for (const d of input.deliveries) {
    const partId = String(d.partId ?? '').trim();
    if (!partId) continue;
    const qty = Number(d.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const prev = deliveredByPartId.get(partId);
    const name =
      (typeof d.partName === 'string' && d.partName.trim()) || prev?.partName || null;
    deliveredByPartId.set(partId, {
      quantity: Math.round(((prev?.quantity ?? 0) + qty) * 1000) / 1000,
      partName: name,
    });
  }

  const budgetByPartId = new Map<
    string,
    { description: string; budgetId: string | null }
  >();
  const nonStock: MaintenanceVisitPart[] = [];
  const seenNonStock = new Set<string>();

  for (const part of input.budgetParts) {
    if (part?.approved !== true) continue;
    const description = String(part.description ?? '').trim();
    if (!description) continue;
    const workshopPartId =
      typeof part.workshopPartId === 'string' && part.workshopPartId.trim()
        ? part.workshopPartId.trim()
        : null;
    const fromStock = isStockLinkedPart(part);
    const budgetId =
      typeof part.budgetId === 'string' && part.budgetId.trim()
        ? part.budgetId.trim()
        : null;

    if (fromStock) {
      if (workshopPartId && !budgetByPartId.has(workshopPartId)) {
        budgetByPartId.set(workshopPartId, { description, budgetId });
      }
      continue;
    }

    const key = `name:${normalizeBudgetPartName(description)}`;
    if (seenNonStock.has(key)) continue;
    seenNonStock.add(key);
    nonStock.push({
      description,
      quantity: qtyLabel(parseBudgetQty(part.quantity)),
      fromStock: false,
      workshopPartId: null,
      budgetId,
    });
  }

  const stockParts: MaintenanceVisitPart[] = [];
  for (const [partId, delivered] of deliveredByPartId) {
    const budgetMeta = budgetByPartId.get(partId);
    const description =
      (delivered.partName && delivered.partName.trim()) ||
      budgetMeta?.description ||
      'Peça do estoque';
    stockParts.push({
      description,
      quantity: qtyLabel(delivered.quantity),
      fromStock: true,
      workshopPartId: partId,
      budgetId: budgetMeta?.budgetId ?? null,
    });
  }

  stockParts.sort((a, b) =>
    normalizeBudgetPartName(a.description).localeCompare(
      normalizeBudgetPartName(b.description),
      'pt-BR'
    )
  );

  return [...nonStock, ...stockParts];
}
