export type WorkshopPartStockMovementType = 'sale' | 'consumable';

export type WorkshopPartStockMovement = {
  id: string;
  workshop_id: string;
  part_id: string;
  movement_type: WorkshopPartStockMovementType;
  quantity: number;
  unit_price: number | null;
  total_amount: number | null;
  notes: string | null;
  barcode_scanned: string | null;
  recorded_by_name: string | null;
  stock_before: number;
  stock_after: number;
  created_at: string;
  part_name?: string | null;
  part_unit_of_measure?: string | null;
  part_photo_url?: string | null;
};

export type StockOutboundPartSnapshot = {
  id: string;
  name: string;
  stock_qty: number;
  unit_price: number;
  unit_of_measure: string;
  photo_url?: string | null;
  barcode?: string | null;
};

export type ApplyStockOutboundInput = {
  workshopId: string;
  partId: string;
  movementType: WorkshopPartStockMovementType;
  quantity: number;
  unitPrice?: number | null;
  notes?: string | null;
  barcodeScanned?: string | null;
  recordedByName?: string | null;
  nowIso?: string;
  movementId?: string;
};

export type ApplyStockOutboundResult = {
  movement: WorkshopPartStockMovement;
  part: StockOutboundPartSnapshot;
};

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Aplica baixa de estoque em memória (fallback / testes). Mutates `part.stock_qty`. */
export function applyWorkshopPartStockOutboundInMemory(
  part: StockOutboundPartSnapshot & { unit_price?: number },
  input: ApplyStockOutboundInput
): ApplyStockOutboundResult {
  if (input.movementType !== 'sale' && input.movementType !== 'consumable') {
    throw new Error('Tipo de movimentação inválido.');
  }
  const qty = roundQty(Number(input.quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error('Quantidade inválida.');
  }
  if (part.id !== input.partId) {
    throw new Error('Produto não encontrado.');
  }

  const before = roundQty(Number(part.stock_qty ?? 0));
  if (before < qty) {
    throw new Error(`Estoque insuficiente para "${part.name}". Disponível: ${before}.`);
  }
  const after = roundQty(before - qty);

  let unitPrice: number | null = null;
  let totalAmount: number | null = null;
  if (input.movementType === 'sale') {
    const raw = input.unitPrice != null ? Number(input.unitPrice) : Number(part.unit_price ?? 0);
    if (!Number.isFinite(raw) || raw < 0) {
      throw new Error('Preço unitário inválido.');
    }
    unitPrice = roundMoney(raw);
    totalAmount = roundMoney(unitPrice * qty);
  }

  part.stock_qty = after;

  const movement: WorkshopPartStockMovement = {
    id: input.movementId ?? `mov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    workshop_id: input.workshopId,
    part_id: part.id,
    movement_type: input.movementType,
    quantity: qty,
    unit_price: unitPrice,
    total_amount: totalAmount,
    notes: input.notes?.trim() ? input.notes.trim() : null,
    barcode_scanned: input.barcodeScanned?.trim() ? input.barcodeScanned.trim() : null,
    recorded_by_name: input.recordedByName?.trim() ? input.recordedByName.trim() : null,
    stock_before: before,
    stock_after: after,
    created_at: input.nowIso ?? new Date().toISOString(),
    part_name: part.name,
    part_unit_of_measure: part.unit_of_measure || 'UN',
    part_photo_url: part.photo_url ?? null,
  };

  return {
    movement,
    part: {
      id: part.id,
      name: part.name,
      stock_qty: after,
      unit_price: Number(part.unit_price ?? 0),
      unit_of_measure: part.unit_of_measure || 'UN',
      photo_url: part.photo_url ?? null,
      barcode: part.barcode ?? null,
    },
  };
}

export function stockMovementTypeLabel(type: WorkshopPartStockMovementType): string {
  return type === 'sale' ? 'Venda avulsa' : 'Insumo / consumo';
}
