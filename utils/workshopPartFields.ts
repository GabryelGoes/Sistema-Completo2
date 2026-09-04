import type { WorkshopPart, WorkshopPartFiscalExtra, WorkshopPartPurchase } from '../services/apiService';

export const PART_ORIGIN_OPTIONS: { value: string; label: string }[] = [
  { value: '0', label: '0 — Nacional, exceto códigos 3, 4, 5 e 8' },
  { value: '1', label: '1 — Estrangeira — importação direta' },
  { value: '2', label: '2 — Estrangeira — adquirida no mercado interno' },
  { value: '3', label: '3 — Nacional — conteúdo importação > 40%' },
  { value: '4', label: '4 — Nacional — processos produtivos básicos' },
  { value: '5', label: '5 — Nacional — conteúdo importação ≤ 40%' },
  { value: '6', label: '6 — Estrangeira — importação direta, sem similar' },
  { value: '7', label: '7 — Estrangeira — mercado interno, sem similar' },
  { value: '8', label: '8 — Nacional — conteúdo importação > 70%' },
];

/** Sigla gravada no banco; `label` é o nome exibido na lista do seletor. */
export const UNIT_OF_MEASURE_OPTIONS: { value: string; label: string }[] = [
  { value: 'UN', label: 'Unidade' },
  { value: 'PC', label: 'Peça' },
  { value: 'PAR', label: 'Par' },
  { value: 'CX', label: 'Caixa' },
  { value: 'KIT', label: 'Kit' },
  { value: 'JOGO', label: 'Jogo' },
  { value: 'KG', label: 'Quilograma' },
  { value: 'G', label: 'Grama' },
  { value: 'L', label: 'Litro' },
  { value: 'ML', label: 'Mililitro' },
  { value: 'M', label: 'Metro' },
  { value: 'CM', label: 'Centímetro' },
  { value: 'MM', label: 'Milímetro' },
];

/** Unidade do conteúdo da embalagem (litros, ml, kg…). */
export const CONTENT_UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: 'L', label: 'Litros (L)' },
  { value: 'ML', label: 'Mililitros (ml)' },
  { value: 'KG', label: 'Quilogramas (kg)' },
  { value: 'G', label: 'Gramas (g)' },
  { value: 'UN', label: 'Unidades' },
  { value: 'PC', label: 'Peças' },
  { value: 'CX', label: 'Caixas' },
  { value: 'KIT', label: 'Kits' },
];

export type WorkshopPartStorageSite = 'oficina' | 'deposito';

/** Barracão / empresa onde o produto está guardado. */
export const STORAGE_SITE_OPTIONS: { value: WorkshopPartStorageSite; label: string; hint: string }[] = [
  { value: 'oficina', label: 'Oficina principal', hint: 'Barracão da oficina' },
  { value: 'deposito', label: 'Depósito / Estoque', hint: 'Barracão de estoque' },
];

export function storageSiteLabel(site: string | null | undefined): string {
  const found = STORAGE_SITE_OPTIONS.find((o) => o.value === site);
  return found?.label ?? 'Oficina principal';
}

export function formatPartContent(
  qty: number | null | undefined,
  unit: string | null | undefined
): string | null {
  if (qty == null || !Number.isFinite(Number(qty))) return null;
  const u = String(unit || '').trim();
  const n = Number(qty);
  const qtyLabel = Number.isInteger(n) ? String(n) : String(n);
  return u ? `${qtyLabel} ${u}` : qtyLabel;
}

/** NCM frequentes (oficina automotiva) — usuário pode digitar outro. */
export const COMMON_NCM_SUGGESTIONS: { code: string; label: string }[] = [
  { code: '87083099', label: '87083099 — Servo-freio / ABS' },
  { code: '87089990', label: '87089990 — Outras peças veículos' },
  { code: '40169300', label: '40169300 — Juntas / vedações borracha' },
  { code: '84818099', label: '84818099 — Válvulas' },
  { code: '87082999', label: '87082999 — Carroceria / acessórios' },
  { code: '27101932', label: '27101932 — Óleos lubrificantes' },
  { code: '34031900', label: '34031990 — Preparações lubrificantes' },
  { code: '85365090', label: '85365090 — Conectores elétricos' },
];

export type WorkshopPartFormValues = {
  name: string;
  brand: string;
  original_code: string;
  /** IDs das categorias do estoque vinculadas ao produto. */
  category_ids: string[];
  numeric_code: string;
  barcode: string;
  location: string;
  storage_site: WorkshopPartStorageSite;
  description: string;
  model: string;
  content_qty: string;
  content_unit: string;
  characteristics: string;
  application_similar: string;
  notes: string;
  ncm_code: string;
  unit_of_measure: string;
  min_stock_qty: string;
  max_stock_qty: string;
  fiscal_origin: string;
  unit_price: string;
  premium_amount: string;
  commission_pct: string;
  default_profit_pct: string;
  km_limit: string;
  validity_months: string;
  unit_cost: string;
  stock_qty: string;
  fiscal_extra: WorkshopPartFiscalExtra;
};

export type WorkshopPartPurchaseDraft = {
  id?: string;
  supplier_name: string;
  quantity: string;
  unit_cost: string;
  expected_date: string;
  notes: string;
  status: WorkshopPartPurchase['status'];
};

export function emptyPartFormValues(): WorkshopPartFormValues {
  return {
    name: '',
    brand: '',
    original_code: '',
    category_ids: [],
    numeric_code: '',
    barcode: '',
    location: '',
    storage_site: 'oficina',
    description: '',
    model: '',
    content_qty: '',
    content_unit: '',
    characteristics: '',
    application_similar: '',
    notes: '',
    ncm_code: '',
    unit_of_measure: 'UN',
    min_stock_qty: '0',
    max_stock_qty: '',
    fiscal_origin: '0',
    unit_price: '0.00',
    premium_amount: '0.00',
    commission_pct: '0',
    default_profit_pct: '0',
    km_limit: '',
    validity_months: '',
    unit_cost: '0.00',
    stock_qty: '0',
    fiscal_extra: {},
  };
}

export function partToFormValues(part: WorkshopPart): WorkshopPartFormValues {
  const site = part.storage_site === 'deposito' ? 'deposito' : 'oficina';
  return {
    name: part.name ?? '',
    brand: part.brand ?? '',
    original_code: part.original_code ?? '',
    category_ids: [...(part.category_ids ?? (part.primary_category_id ? [part.primary_category_id] : []))],
    numeric_code: part.numeric_code ?? '',
    barcode: part.barcode ?? '',
    location: part.location ?? '',
    storage_site: site,
    description: part.description ?? '',
    model: part.model ?? '',
    content_qty: part.content_qty != null ? String(part.content_qty) : '',
    content_unit: part.content_unit ?? '',
    characteristics: part.characteristics ?? '',
    application_similar: part.application_similar ?? '',
    notes: part.notes ?? '',
    ncm_code: part.ncm_code ?? '',
    unit_of_measure: part.unit_of_measure ?? 'UN',
    min_stock_qty: String(part.min_stock_qty ?? 0),
    max_stock_qty: part.max_stock_qty != null ? String(part.max_stock_qty) : '',
    fiscal_origin: part.fiscal_origin ?? '0',
    unit_price: Number(part.unit_price ?? 0).toFixed(2),
    premium_amount: Number(part.premium_amount ?? 0).toFixed(2),
    commission_pct: String(part.commission_pct ?? 0),
    default_profit_pct: String(part.default_profit_pct ?? 0),
    km_limit: part.km_limit != null ? String(part.km_limit) : '',
    validity_months: part.validity_months != null ? String(part.validity_months) : '',
    unit_cost: Number(part.unit_cost ?? 0).toFixed(2),
    stock_qty: String(part.stock_qty ?? 0),
    fiscal_extra: part.fiscal_extra ?? {},
  };
}

export function purchaseToDraft(p: WorkshopPartPurchase): WorkshopPartPurchaseDraft {
  return {
    id: p.id,
    supplier_name: p.supplier_name ?? '',
    quantity: String(p.quantity ?? 1),
    unit_cost: Number(p.unit_cost ?? 0).toFixed(2),
    expected_date: p.expected_date ?? '',
    notes: p.notes ?? '',
    status: p.status ?? 'pending',
  };
}

export function emptyPurchaseDraft(): WorkshopPartPurchaseDraft {
  return {
    supplier_name: '',
    quantity: '1',
    unit_cost: '0.00',
    expected_date: '',
    notes: '',
    status: 'pending',
  };
}

export function parseDecimalInput(value: string, fallback = 0): number {
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : fallback;
}

export function formValuesToApiPayload(values: WorkshopPartFormValues): Record<string, unknown> {
  const maxQtyRaw = values.max_stock_qty.trim();
  const kmRaw = values.km_limit.trim();
  const monthsRaw = values.validity_months.trim();
  const contentQtyRaw = values.content_qty.trim();
  return {
    name: values.name.trim(),
    brand: values.brand.trim() || null,
    original_code: values.original_code.trim() || null,
    numeric_code: values.numeric_code.trim() || null,
    barcode: values.barcode.trim() || null,
    location: values.location.trim() || null,
    storage_site: values.storage_site === 'deposito' ? 'deposito' : 'oficina',
    description: values.description.trim() || null,
    model: values.model.trim() || null,
    content_qty: contentQtyRaw ? parseDecimalInput(contentQtyRaw, 0) : null,
    content_unit: values.content_unit.trim() || null,
    characteristics: values.characteristics.trim() || null,
    application_similar: values.application_similar.trim() || null,
    notes: values.notes.trim() || null,
    ncm_code: values.ncm_code.trim() || null,
    unit_of_measure: values.unit_of_measure.trim() || 'UN',
    min_stock_qty: parseDecimalInput(values.min_stock_qty, 0),
    max_stock_qty: maxQtyRaw ? parseDecimalInput(maxQtyRaw, 0) : null,
    fiscal_origin: values.fiscal_origin || '0',
    unit_price: parseDecimalInput(values.unit_price, 0),
    premium_amount: parseDecimalInput(values.premium_amount, 0),
    commission_pct: parseDecimalInput(values.commission_pct, 0),
    default_profit_pct: parseDecimalInput(values.default_profit_pct, 0),
    km_limit: kmRaw ? parseDecimalInput(kmRaw, 0) : null,
    validity_months: monthsRaw ? Math.max(0, Math.round(parseDecimalInput(monthsRaw, 0))) : null,
    unit_cost: parseDecimalInput(values.unit_cost, 0),
    stock_qty: parseDecimalInput(values.stock_qty, 0),
    fiscal_extra: values.fiscal_extra ?? {},
    primary_category_id: values.category_ids[0] ?? null,
  };
}

/** Linha de compra com dados para sincronizar no servidor. */
export function purchaseDraftShouldSync(d: WorkshopPartPurchaseDraft): boolean {
  return (
    !!d.id ||
    d.supplier_name.trim() !== '' ||
    parseDecimalInput(d.quantity, 0) > 0 ||
    parseDecimalInput(d.unit_cost, 0) > 0 ||
    d.expected_date.trim() !== '' ||
    d.notes.trim() !== '' ||
    d.status !== 'pending'
  );
}

export function purchaseDraftToPayload(d: WorkshopPartPurchaseDraft): {
  supplier_name: string | null;
  quantity: number;
  unit_cost: number;
  expected_date: string | null;
  notes: string | null;
  status: WorkshopPartPurchase['status'];
} {
  return {
    supplier_name: d.supplier_name.trim() || null,
    quantity: Math.max(0, parseDecimalInput(d.quantity, 1)),
    unit_cost: Math.max(0, parseDecimalInput(d.unit_cost, 0)),
    expected_date: d.expected_date.trim() || null,
    notes: d.notes.trim() || null,
    status: d.status,
  };
}
