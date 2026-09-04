/**
 * Estoque em memória quando Supabase não está configurado (dev / Cloud Agent).
 * Não é usado em produção com SUPABASE_URL + SERVICE_ROLE_KEY.
 */
import { findWorkshopPartByCode } from './workshopPartBarcode.js';
import {
  applyWorkshopPartStockOutboundInMemory,
  type ApplyStockOutboundInput,
  type WorkshopPartStockMovement,
  type WorkshopPartStockMovementType,
} from './workshopPartStockOutbound.js';

export type DevMemoryPart = {
  id: string;
  name: string;
  brand: string | null;
  unit_price: number;
  stock_qty: number;
  photo_url: string | null;
  sort_order: number;
  created_at: string;
  original_code: string | null;
  numeric_code: string | null;
  barcode: string | null;
  location: string | null;
  storage_site: 'oficina' | 'deposito';
  description: string | null;
  model: string | null;
  content_qty: number | null;
  content_unit: string | null;
  characteristics: string | null;
  application_similar: string | null;
  notes: string | null;
  ncm_code: string | null;
  unit_of_measure: string;
  min_stock_qty: number;
  max_stock_qty: number | null;
  fiscal_origin: string;
  premium_amount: number;
  commission_pct: number;
  default_profit_pct: number;
  km_limit: number | null;
  validity_months: number | null;
  unit_cost: number;
  fiscal_extra: Record<string, unknown>;
  primary_category_id: string | null;
  category_ids: string[];
};

const WORKSHOP_DEV_ID = 'dev-workshop';

function seedParts(): DevMemoryPart[] {
  const now = new Date().toISOString();
  return [
    {
      id: 'dev-part-abs-sensor',
      name: 'Sensor ABS dianteiro',
      brand: 'Bosch',
      unit_price: 189.9,
      stock_qty: 12,
      photo_url: null,
      sort_order: 0,
      created_at: now,
      original_code: 'ABS-DF-01',
      numeric_code: '10001',
      barcode: '7891234567890',
      location: 'Prateleira A1',
      storage_site: 'oficina',
      description: 'Sensor de roda dianteiro para sistemas ABS.',
      model: 'ABS 8.1',
      content_qty: 1,
      content_unit: 'UN',
      characteristics: null,
      application_similar: null,
      notes: null,
      ncm_code: '87089990',
      unit_of_measure: 'UN',
      min_stock_qty: 2,
      max_stock_qty: 30,
      fiscal_origin: '0',
      premium_amount: 0,
      commission_pct: 0,
      default_profit_pct: 0,
      km_limit: null,
      validity_months: null,
      unit_cost: 95,
      fiscal_extra: {},
      primary_category_id: null,
      category_ids: [],
    },
    {
      id: 'dev-part-brake-fluid',
      name: 'Fluido de freio DOT 4',
      brand: 'TRW',
      unit_price: 42.5,
      stock_qty: 8,
      photo_url: null,
      sort_order: 1,
      created_at: now,
      original_code: 'DOT4-500',
      numeric_code: '10002',
      barcode: '7899876543210',
      location: 'Armário químicos',
      storage_site: 'deposito',
      description: 'Fluido de freio 500 ml.',
      model: 'DOT 4',
      content_qty: 500,
      content_unit: 'ML',
      characteristics: null,
      application_similar: null,
      notes: null,
      ncm_code: '38190000',
      unit_of_measure: 'UN',
      min_stock_qty: 3,
      max_stock_qty: 40,
      fiscal_origin: '0',
      premium_amount: 0,
      commission_pct: 0,
      default_profit_pct: 0,
      km_limit: null,
      validity_months: null,
      unit_cost: 22,
      fiscal_extra: {},
      primary_category_id: null,
      category_ids: [],
    },
    {
      id: 'dev-part-gloves',
      name: 'Luva nitrílica (caixa)',
      brand: 'Descarpack',
      unit_price: 28,
      stock_qty: 20,
      photo_url: null,
      sort_order: 2,
      created_at: now,
      original_code: 'LUV-NIT',
      numeric_code: '10003',
      barcode: '7891111222333',
      location: 'Bancada',
      storage_site: 'oficina',
      description: 'Caixa com 100 unidades — uso interno.',
      model: null,
      content_qty: 100,
      content_unit: 'UN',
      characteristics: null,
      application_similar: null,
      notes: null,
      ncm_code: null,
      unit_of_measure: 'CX',
      min_stock_qty: 2,
      max_stock_qty: null,
      fiscal_origin: '0',
      premium_amount: 0,
      commission_pct: 0,
      default_profit_pct: 0,
      km_limit: null,
      validity_months: null,
      unit_cost: 18,
      fiscal_extra: {},
      primary_category_id: null,
      category_ids: [],
    },
  ];
}

let parts = seedParts();
let movements: WorkshopPartStockMovement[] = [];

export function isWorkshopPartDevMemoryActive(supabaseConfigured: boolean): boolean {
  return !supabaseConfigured;
}

export function getDevMemoryWorkshopId(): string {
  return WORKSHOP_DEV_ID;
}

export function listDevMemoryParts(): DevMemoryPart[] {
  return parts.map((p) => ({ ...p, category_ids: [...p.category_ids] }));
}

export function lookupDevMemoryPart(code: string): DevMemoryPart | null {
  const found = findWorkshopPartByCode(parts, code);
  return found ? { ...found, category_ids: [...found.category_ids] } : null;
}

export function getDevMemoryPartById(id: string): DevMemoryPart | null {
  const found = parts.find((p) => p.id === id);
  return found ? { ...found, category_ids: [...found.category_ids] } : null;
}

export function updateDevMemoryPart(
  id: string,
  patch: Partial<DevMemoryPart>
): DevMemoryPart | null {
  const idx = parts.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  parts[idx] = { ...parts[idx], ...patch, id: parts[idx].id };
  return { ...parts[idx], category_ids: [...parts[idx].category_ids] };
}

export function createDevMemoryPart(input: Partial<DevMemoryPart> & { name: string }): DevMemoryPart {
  const row: DevMemoryPart = {
    id: `dev-part-${Date.now()}`,
    name: input.name,
    brand: input.brand ?? null,
    unit_price: Number(input.unit_price ?? 0),
    stock_qty: Number(input.stock_qty ?? 0),
    photo_url: input.photo_url ?? null,
    sort_order: Number(input.sort_order ?? 0),
    created_at: new Date().toISOString(),
    original_code: input.original_code ?? null,
    numeric_code: input.numeric_code ?? null,
    barcode: input.barcode ?? null,
    location: input.location ?? null,
    storage_site: input.storage_site === 'deposito' ? 'deposito' : 'oficina',
    description: input.description ?? null,
    model: input.model ?? null,
    content_qty: input.content_qty ?? null,
    content_unit: input.content_unit ?? null,
    characteristics: input.characteristics ?? null,
    application_similar: input.application_similar ?? null,
    notes: input.notes ?? null,
    ncm_code: input.ncm_code ?? null,
    unit_of_measure: input.unit_of_measure ?? 'UN',
    min_stock_qty: Number(input.min_stock_qty ?? 0),
    max_stock_qty: input.max_stock_qty ?? null,
    fiscal_origin: input.fiscal_origin ?? '0',
    premium_amount: Number(input.premium_amount ?? 0),
    commission_pct: Number(input.commission_pct ?? 0),
    default_profit_pct: Number(input.default_profit_pct ?? 0),
    km_limit: input.km_limit ?? null,
    validity_months: input.validity_months ?? null,
    unit_cost: Number(input.unit_cost ?? 0),
    fiscal_extra: input.fiscal_extra ?? {},
    primary_category_id: input.primary_category_id ?? null,
    category_ids: input.category_ids ?? [],
  };
  parts = [row, ...parts];
  return { ...row, category_ids: [...row.category_ids] };
}

export function listDevMemoryMovements(opts?: {
  movementType?: WorkshopPartStockMovementType;
  limit?: number;
}): WorkshopPartStockMovement[] {
  let list = [...movements];
  if (opts?.movementType) {
    list = list.filter((m) => m.movement_type === opts.movementType);
  }
  list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const limit = Math.min(200, Math.max(1, opts?.limit ?? 50));
  return list.slice(0, limit);
}

export function applyDevMemoryOutbound(
  input: Omit<ApplyStockOutboundInput, 'workshopId'> & { workshopId?: string }
) {
  const part = parts.find((p) => p.id === input.partId);
  if (!part) throw new Error('Produto não encontrado.');
  const snapshot = {
    id: part.id,
    name: part.name,
    stock_qty: part.stock_qty,
    unit_price: part.unit_price,
    unit_of_measure: part.unit_of_measure || 'UN',
    photo_url: part.photo_url,
    barcode: part.barcode,
  };
  const result = applyWorkshopPartStockOutboundInMemory(snapshot, {
    ...input,
    workshopId: input.workshopId ?? WORKSHOP_DEV_ID,
  });
  part.stock_qty = result.part.stock_qty;
  movements = [result.movement, ...movements];
  return result;
}

export function resetDevMemoryForTests(): void {
  parts = seedParts();
  movements = [];
}
