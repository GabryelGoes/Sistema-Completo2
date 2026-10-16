/**
 * Histórico unificado de entradas/saídas do estoque (peças + módulos ABS).
 */

import type { WorkshopPartStockMovement } from './workshopPartStockOutbound.js';
import type { WorkshopAbsModuleMovementListItem } from './workshopAbsModules.js';
import {
  absModuleMovementLabel,
  describeAbsModuleMovement,
} from './workshopAbsModules.js';

export type EstoqueLedgerSource = 'part' | 'abs';
export type EstoqueLedgerDirection = 'in' | 'out' | 'transfer';

export type EstoqueLedgerEntry = {
  id: string;
  source: EstoqueLedgerSource;
  direction: EstoqueLedgerDirection;
  /** Código interno do tipo (sale, purchase, entry, exit…). */
  movement_type: string;
  type_label: string;
  item_name: string;
  item_code: string | null;
  quantity: number | null;
  unit_label: string | null;
  money_label: string | null;
  nfe_number: string | null;
  supplier_name: string | null;
  recorded_by_name: string | null;
  service_order_id: string | null;
  service_order_label: string | null;
  notes: string | null;
  stock_before: number | null;
  stock_after: number | null;
  created_at: string;
};

function fmtMoney(n: number | null | undefined): string | null {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function partTypeLabel(type: string): string {
  if (type === 'purchase') return 'Entrada / compra';
  if (type === 'sale') return 'Venda avulsa';
  if (type === 'consumable') return 'Consumo / OS';
  return type;
}

export function partMovementToLedgerEntry(m: WorkshopPartStockMovement): EstoqueLedgerEntry {
  const direction: EstoqueLedgerDirection =
    m.movement_type === 'purchase' ? 'in' : 'out';
  const qty = Number(m.quantity ?? 0);
  const unit = m.part_unit_of_measure || 'UN';
  let money: string | null = null;
  if (m.movement_type === 'purchase') {
    money =
      fmtMoney(m.product_total ?? m.total_amount) ||
      (m.unit_cost != null ? `${fmtMoney(m.unit_cost)} / un.` : null);
  } else if (m.movement_type === 'sale') {
    money = fmtMoney(m.total_amount) || (m.unit_price != null ? `${fmtMoney(m.unit_price)} / un.` : null);
  }

  return {
    id: `part:${m.id}`,
    source: 'part',
    direction,
    movement_type: m.movement_type,
    type_label: partTypeLabel(m.movement_type),
    item_name: m.part_name?.trim() || 'Produto',
    item_code: m.barcode_scanned || null,
    quantity: Number.isFinite(qty) ? qty : null,
    unit_label: unit,
    money_label: money,
    nfe_number: m.nfe_number ?? null,
    supplier_name: m.supplier_name ?? null,
    recorded_by_name: m.recorded_by_name ?? null,
    service_order_id: m.service_order_id ?? null,
    service_order_label: m.service_order_label ?? null,
    notes: m.notes ?? null,
    stock_before: m.stock_before ?? null,
    stock_after: m.stock_after ?? null,
    created_at: m.created_at,
  };
}

export function absMovementToLedgerEntry(
  m: WorkshopAbsModuleMovementListItem
): EstoqueLedgerEntry {
  const direction: EstoqueLedgerDirection =
    m.movement_type === 'entry'
      ? 'in'
      : m.movement_type === 'transfer'
        ? 'transfer'
        : 'out';
  const titleBits = [
    m.public_id,
    m.manufacturer,
    m.module_kind ? String(m.module_kind) : null,
  ].filter(Boolean);
  return {
    id: `abs:${m.id}`,
    source: 'abs',
    direction,
    movement_type: m.movement_type,
    type_label: `ABS · ${absModuleMovementLabel(m.movement_type)}`,
    item_name: titleBits.join(' · ') || 'Módulo ABS',
    item_code: m.public_id || m.original_code || null,
    quantity: 1,
    unit_label: 'UN',
    money_label: fmtMoney(m.unit_price ?? m.unit_cost),
    nfe_number: null,
    supplier_name: null,
    recorded_by_name: m.recorded_by_name ?? null,
    service_order_id: m.service_order_id ?? null,
    service_order_label: m.reason_ref || null,
    notes: describeAbsModuleMovement(m) || m.notes || null,
    stock_before: null,
    stock_after: null,
    created_at: m.created_at,
  };
}

export function mergeEstoqueLedger(
  parts: WorkshopPartStockMovement[],
  abs: WorkshopAbsModuleMovementListItem[],
  limit = 120
): EstoqueLedgerEntry[] {
  const merged = [
    ...parts.map(partMovementToLedgerEntry),
    ...abs.map(absMovementToLedgerEntry),
  ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return merged.slice(0, Math.max(1, limit));
}

export function formatLedgerDateTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '—', time: '' };
  return {
    date: d.toLocaleDateString('pt-BR'),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}
