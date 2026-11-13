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

/** Baixa já feita na OS (produtos do estoque / leitor / manual). */
export type DeliveredStockForReservation = {
  serviceOrderId: string;
  partId: string;
  quantity: number;
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

function deliveryKey(serviceOrderId: string, partId: string): string {
  return `${serviceOrderId}::${partId}`;
}

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Soma baixas por OS + produto (sale/consumable).
 * Quantidades extras além do orçamento ficam no mapa e não criam reserva negativa.
 */
export function buildDeliveredQtyByOsAndPart(
  deliveries: DeliveredStockForReservation[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of deliveries) {
    const soId = String(row.serviceOrderId ?? '').trim();
    const partId = String(row.partId ?? '').trim();
    if (!soId || !partId) continue;
    const qty = roundQty(Number(row.quantity));
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const key = deliveryKey(soId, partId);
    map.set(key, roundQty((map.get(key) ?? 0) + qty));
  }
  return map;
}

/**
 * Extrai reservas de estoque em orçamentos de OS ainda abertas.
 * Inclui peças do estoque mesmo sem aprovação — é referência do que ainda
 * deve sair do estoque. O que já foi entregue na OS via “produtos do estoque”
 * (baixa vinculada à OS) deixa de contar.
 */
export function collectPendingStockReservations(input: {
  budgets: BudgetForReservation[];
  serviceOrders: ServiceOrderForReservation[];
  /** Baixas já feitas na OS (consumable/sale com service_order_id). */
  deliveries?: DeliveredStockForReservation[];
}): {
  items: WorkshopPartStockReservation[];
  reservedQtyByPartId: Record<string, number>;
} {
  const soById = new Map(input.serviceOrders.map((so) => [so.id, so]));
  const deliveredLeft = buildDeliveredQtyByOsAndPart(input.deliveries ?? []);
  const items: WorkshopPartStockReservation[] = [];
  const reservedQtyByPartId: Record<string, number> = {};

  for (const budget of input.budgets) {
    const soId = String(budget.service_order_id ?? '').trim();
    const so = soId ? soById.get(soId) : undefined;
    if (!so) continue;
    const status = String(so.status ?? '').toUpperCase();
    if (status === 'CANCELLED' || status === 'FINALIZADO') continue;

    const parts = Array.isArray(budget.parts) ? budget.parts : [];
    for (const part of parts) {
      if (!isStockLinkedPart(part)) continue;
      const partName = String(part.description ?? '').trim();
      if (!partName) continue;
      const workshopPartId =
        typeof part.workshopPartId === 'string' && part.workshopPartId.trim()
          ? part.workshopPartId.trim()
          : null;
      let quantity = roundQty(parseFinalizePartQuantity(part.quantity));
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      // Já entregue na OS → abate; zera a linha se a quantidade já saiu.
      if (workshopPartId) {
        const key = deliveryKey(so.id, workshopPartId);
        const delivered = deliveredLeft.get(key) ?? 0;
        if (delivered > 0) {
          const used = Math.min(delivered, quantity);
          quantity = roundQty(quantity - used);
          deliveredLeft.set(key, roundQty(delivered - used));
        }
      }
      if (quantity <= 0) continue;

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
        reservedQtyByPartId[workshopPartId] = roundQty(
          (reservedQtyByPartId[workshopPartId] ?? 0) + quantity
        );
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
