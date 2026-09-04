import { normalizeBudgetPartName } from './budgetPartStock.js';
import {
  formatFinalizePartQuantity,
  parseFinalizePartQuantity,
} from './serviceOrderServiceTechnicians.js';

/** Linha de peça em orçamento (JSON) usada para reservas de estoque. */
export type BudgetPartForReservation = {
  description?: string;
  quantity?: string | number;
  fromStock?: boolean;
  workshopPartId?: string;
};

export type BudgetForReservation = {
  id: string;
  card_name?: string | null;
  parts?: BudgetPartForReservation[] | null;
  service_order_id?: string;
};

export type ServiceOrderForReservation = {
  id: string;
  plate?: string | null;
  vehicle_model?: string | null;
  os_number?: number | null;
  status?: string | null;
  finalize_stock_applied_at?: string | null;
};

export type WorkshopPartStockReservation = {
  workshopPartId: string | null;
  partName: string;
  quantity: number;
  quantityLabel: string;
  budgetId: string;
  budgetCardName: string | null;
  serviceOrderId: string;
  plate: string | null;
  vehicleModel: string | null;
  osNumber: number | null;
  status: string | null;
};

function isStockLinkedPart(part: BudgetPartForReservation): boolean {
  const workshopPartId =
    typeof part.workshopPartId === 'string' && part.workshopPartId.trim()
      ? part.workshopPartId.trim()
      : '';
  return part.fromStock === true || Boolean(workshopPartId);
}

/**
 * Extrai reservas de estoque ainda sem baixa (orçamentos de OS com
 * finalize_stock_applied_at nulo). Inclui peças do estoque mesmo sem aprovação —
 * o produto continua no catálogo; a baixa só ocorre no fechamento/finalizado.
 */
export function collectPendingStockReservations(input: {
  budgets: BudgetForReservation[];
  serviceOrders: ServiceOrderForReservation[];
}): {
  items: WorkshopPartStockReservation[];
  reservedQtyByPartId: Record<string, number>;
} {
  const soById = new Map(input.serviceOrders.map((so) => [so.id, so]));
  const items: WorkshopPartStockReservation[] = [];
  const reservedQtyByPartId: Record<string, number> = {};

  for (const budget of input.budgets) {
    const soId = String(budget.service_order_id ?? '').trim();
    const so = soId ? soById.get(soId) : undefined;
    if (!so) continue;
    if (so.finalize_stock_applied_at) continue;
    const status = String(so.status ?? '').toUpperCase();
    if (status === 'CANCELLED') continue;

    const parts = Array.isArray(budget.parts) ? budget.parts : [];
    for (const part of parts) {
      if (!isStockLinkedPart(part)) continue;
      const partName = String(part.description ?? '').trim();
      if (!partName) continue;
      const workshopPartId =
        typeof part.workshopPartId === 'string' && part.workshopPartId.trim()
          ? part.workshopPartId.trim()
          : null;
      const quantity = parseFinalizePartQuantity(part.quantity);
      items.push({
        workshopPartId,
        partName,
        quantity,
        quantityLabel: formatFinalizePartQuantity(quantity),
        budgetId: budget.id,
        budgetCardName: budget.card_name ? String(budget.card_name) : null,
        serviceOrderId: so.id,
        plate: so.plate ? String(so.plate) : null,
        vehicleModel: so.vehicle_model ? String(so.vehicle_model) : null,
        osNumber: so.os_number != null ? Number(so.os_number) : null,
        status: so.status ? String(so.status) : null,
      });
      if (workshopPartId) {
        reservedQtyByPartId[workshopPartId] =
          (reservedQtyByPartId[workshopPartId] ?? 0) + quantity;
      }
    }
  }

  items.sort((a, b) => {
    const nameCmp = normalizeBudgetPartName(a.partName).localeCompare(
      normalizeBudgetPartName(b.partName),
      'pt-BR'
    );
    if (nameCmp !== 0) return nameCmp;
    return (a.plate || '').localeCompare(b.plate || '', 'pt-BR');
  });

  return { items, reservedQtyByPartId };
}
