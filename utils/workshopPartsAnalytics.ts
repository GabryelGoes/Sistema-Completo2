/** Tipos e agregação de analytics do estoque (compartilhado API + front). */

export type WorkshopPartsAnalyticsPeriod = {
  from: string;
  to: string;
  label: string;
};

export type WorkshopPartsAnalyticsSummary = {
  revenueTotal: number;
  cogsTotal: number;
  purchasesExpenseTotal: number;
  expensesTotal: number;
  marginTotal: number;
  marginPct: number;
  partsSoldQty: number;
  approvedLinesCount: number;
  budgetsInPeriod: number;
  stockValueAtCost: number;
  stockValueAtPrice: number;
  productsCount: number;
  alertZero: number;
  alertLow: number;
};

export type WorkshopPartsTopSeller = {
  partId: string | null;
  name: string;
  originalCode: string | null;
  catalogNumber: number | null;
  qty: number;
  revenue: number;
  cost: number;
};

export type WorkshopPartsDailyPoint = {
  date: string;
  label: string;
  revenue: number;
  expenses: number;
  margin: number;
};

export type WorkshopPartsCategoryStock = {
  categoryId: string;
  categoryName: string;
  productCount: number;
  stockQty: number;
  valueAtCost: number;
  valueAtPrice: number;
};

export type WorkshopPartsPurchasePipeline = {
  status: string;
  label: string;
  count: number;
  totalCost: number;
};

export type WorkshopPartsLowStockRow = {
  partId: string;
  name: string;
  originalCode: string | null;
  catalogNumber: number | null;
  stockQty: number;
  minStockQty: number;
  unitOfMeasure: string;
};

export type WorkshopPartsAnalyticsResponse = {
  period: WorkshopPartsAnalyticsPeriod;
  summary: WorkshopPartsAnalyticsSummary;
  daily: WorkshopPartsDailyPoint[];
  topByValue: WorkshopPartsTopSeller[];
  topByUnits: WorkshopPartsTopSeller[];
  stockByCategory: WorkshopPartsCategoryStock[];
  stockHealth: { ok: number; low: number; zero: number };
  purchasesPipeline: WorkshopPartsPurchasePipeline[];
  lowStock: WorkshopPartsLowStockRow[];
};

export type AnalyticsPartRow = {
  id: string;
  name: string;
  original_code?: string | null;
  created_at: string;
  stock_qty: number;
  unit_price: number;
  unit_cost: number;
  min_stock_qty: number;
  unit_of_measure?: string;
  category_ids?: string[];
};

export type AnalyticsCategoryRow = { id: string; name: string };

export type AnalyticsBudgetRow = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  parts: unknown;
};

export type AnalyticsPurchaseRow = {
  id: string;
  part_id: string;
  quantity: number;
  unit_cost: number;
  status: string;
  created_at: string;
};

type BudgetPartLine = {
  description?: string;
  quantity?: string | number;
  approved?: boolean;
  fromStock?: boolean;
  workshopPartId?: string;
};

const PURCHASE_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  ordered: 'Pedido',
  received: 'Recebido',
  cancelled: 'Cancelado',
};

export function normalizeAnalyticsPartName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function parseQty(value: string | number | undefined): number {
  const n = Number(String(value ?? '1').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function budgetEventDate(b: AnalyticsBudgetRow): Date {
  const raw = b.updated_at || b.created_at;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : new Date(b.created_at);
}

function inRange(d: Date, from: Date, to: Date): boolean {
  return d.getTime() >= from.getTime() && d.getTime() <= to.getTime();
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatDayLabel(key: string): string {
  const [y, m, day] = key.split('-');
  return `${day}/${m}`;
}

export function buildCatalogNumberMap(parts: AnalyticsPartRow[]): Map<string, number> {
  const sorted = [...parts].sort((a, b) => {
    const ta = new Date(a.created_at).getTime();
    const tb = new Date(b.created_at).getTime();
    if (ta !== tb) return ta - tb;
    return (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' });
  });
  const map = new Map<string, number>();
  sorted.forEach((p, i) => map.set(p.id, i + 1));
  return map;
}

function resolvePart(
  line: BudgetPartLine,
  byId: Map<string, AnalyticsPartRow>,
  byName: Map<string, AnalyticsPartRow>
): AnalyticsPartRow | undefined {
  if (line.workshopPartId && byId.has(line.workshopPartId)) {
    return byId.get(line.workshopPartId);
  }
  const key = normalizeAnalyticsPartName(line.description || '');
  if (key && byName.has(key)) return byName.get(key);
  return undefined;
}

export function buildWorkshopPartsAnalytics(input: {
  parts: AnalyticsPartRow[];
  categories: AnalyticsCategoryRow[];
  categoryMembers: Map<string, string[]>;
  budgets: AnalyticsBudgetRow[];
  purchases: AnalyticsPurchaseRow[];
  from: Date;
  to: Date;
  periodLabel: string;
}): WorkshopPartsAnalyticsResponse {
  const { parts, categories, categoryMembers, budgets, purchases, from, to, periodLabel } = input;

  const catalogNumbers = buildCatalogNumberMap(parts);
  const byId = new Map(parts.map((p) => [p.id, p]));
  const byName = new Map<string, AnalyticsPartRow>();
  for (const p of parts) {
    const k = normalizeAnalyticsPartName(p.name);
    if (k) byName.set(k, p);
  }

  const agg = new Map<
    string,
    { part: AnalyticsPartRow | null; name: string; qty: number; revenue: number; cost: number }
  >();

  const dailyMap = new Map<string, { revenue: number; expenses: number }>();
  let revenueTotal = 0;
  let cogsTotal = 0;
  let partsSoldQty = 0;
  let approvedLinesCount = 0;
  const budgetIdsInPeriod = new Set<string>();

  for (const budget of budgets) {
    const eventAt = budgetEventDate(budget);
    if (!inRange(eventAt, from, to)) continue;
    budgetIdsInPeriod.add(budget.id);

    const partLines = Array.isArray(budget.parts) ? (budget.parts as BudgetPartLine[]) : [];
    let dayRevenue = 0;
    let dayCogs = 0;

    for (const line of partLines) {
      if (line.approved !== true) continue;
      const qty = parseQty(line.quantity);
      const part = resolvePart(line, byId, byName);
      const unitPrice = part ? Number(part.unit_price ?? 0) : 0;
      const unitCost = part ? Number(part.unit_cost ?? 0) : 0;
      const revenue = qty * unitPrice;
      const cost = qty * unitCost;

      approvedLinesCount += 1;
      partsSoldQty += qty;
      revenueTotal += revenue;
      cogsTotal += cost;
      dayRevenue += revenue;
      dayCogs += cost;

      const key = part?.id ?? `__free__:${normalizeAnalyticsPartName(line.description || 'Outros')}`;
      const name = part?.name ?? String(line.description || 'Peça sem cadastro').trim() || 'Peça sem cadastro';
      const prev = agg.get(key) ?? { part: part ?? null, name, qty: 0, revenue: 0, cost: 0 };
      prev.qty += qty;
      prev.revenue += revenue;
      prev.cost += cost;
      agg.set(key, prev);
    }

    if (dayRevenue > 0 || dayCogs > 0) {
      const dk = dayKey(eventAt);
      const cur = dailyMap.get(dk) ?? { revenue: 0, expenses: 0 };
      cur.revenue += dayRevenue;
      cur.expenses += dayCogs;
      dailyMap.set(dk, cur);
    }
  }

  let purchasesExpenseTotal = 0;
  const purchaseStatusAgg = new Map<string, { count: number; totalCost: number }>();

  for (const pur of purchases) {
    if (pur.status === 'cancelled') continue;
    const created = new Date(pur.created_at);
    if (!inRange(created, from, to)) continue;
    const lineCost = Number(pur.quantity ?? 0) * Number(pur.unit_cost ?? 0);
    purchasesExpenseTotal += lineCost;
    const st = pur.status || 'pending';
    const cur = purchaseStatusAgg.get(st) ?? { count: 0, totalCost: 0 };
    cur.count += 1;
    cur.totalCost += lineCost;
    purchaseStatusAgg.set(st, cur);

    const dk = dayKey(created);
    const curDay = dailyMap.get(dk) ?? { revenue: 0, expenses: 0 };
    curDay.expenses += lineCost;
    dailyMap.set(dk, curDay);
  }

  const expensesTotal = cogsTotal + purchasesExpenseTotal;
  const marginTotal = revenueTotal - expensesTotal;
  const marginPct = revenueTotal > 0 ? (marginTotal / revenueTotal) * 100 : 0;

  const topRows: WorkshopPartsTopSeller[] = [...agg.values()]
    .map((row) => ({
      partId: row.part?.id ?? null,
      name: row.name,
      originalCode: row.part?.original_code?.trim() || null,
      catalogNumber: row.part ? catalogNumbers.get(row.part.id) ?? null : null,
      qty: row.qty,
      revenue: row.revenue,
      cost: row.cost,
    }))
    .filter((r) => r.qty > 0);

  const topByValue = [...topRows].sort((a, b) => b.revenue - a.revenue).slice(0, 12);
  const topByUnits = [...topRows].sort((a, b) => b.qty - a.qty).slice(0, 12);

  const catNameById = new Map(categories.map((c) => [c.id, c.name]));
  const stockByCat = new Map<string, WorkshopPartsCategoryStock>();

  const ensureCat = (categoryId: string, categoryName: string) => {
    if (!stockByCat.has(categoryId)) {
      stockByCat.set(categoryId, {
        categoryId,
        categoryName,
        productCount: 0,
        stockQty: 0,
        valueAtCost: 0,
        valueAtPrice: 0,
      });
    }
    return stockByCat.get(categoryId)!;
  };

  let stockValueAtCost = 0;
  let stockValueAtPrice = 0;
  let alertZero = 0;
  let alertLow = 0;
  let stockOk = 0;
  const lowStock: WorkshopPartsLowStockRow[] = [];

  for (const p of parts) {
    const stock = Number(p.stock_qty ?? 0);
    const min = Number(p.min_stock_qty ?? 0);
    const cost = Number(p.unit_cost ?? 0);
    const price = Number(p.unit_price ?? 0);
    stockValueAtCost += stock * cost;
    stockValueAtPrice += stock * price;

    if (stock <= 0) alertZero += 1;
    else if (min > 0 && stock <= min) {
      alertLow += 1;
      lowStock.push({
        partId: p.id,
        name: p.name,
        originalCode: p.original_code?.trim() || null,
        catalogNumber: catalogNumbers.get(p.id) ?? null,
        stockQty: stock,
        minStockQty: min,
        unitOfMeasure: p.unit_of_measure || 'UN',
      });
    } else stockOk += 1;

    const catIds =
      p.category_ids && p.category_ids.length > 0
        ? p.category_ids
        : categoryMembers.get(p.id) ?? [];

    if (catIds.length === 0) {
      const row = ensureCat('__none__', 'Sem categoria');
      row.productCount += 1;
      row.stockQty += stock;
      row.valueAtCost += stock * cost;
      row.valueAtPrice += stock * price;
    } else {
      for (const cid of catIds) {
        const row = ensureCat(cid, catNameById.get(cid) ?? 'Categoria');
        row.productCount += 1;
        row.stockQty += stock;
        row.valueAtCost += stock * cost;
        row.valueAtPrice += stock * price;
      }
    }
  }

  lowStock.sort((a, b) => a.stockQty - b.stockQty);

  const daily: WorkshopPartsDailyPoint[] = [];
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    const key = dayKey(cursor);
    const pt = dailyMap.get(key) ?? { revenue: 0, expenses: 0 };
    daily.push({
      date: key,
      label: formatDayLabel(key),
      revenue: pt.revenue,
      expenses: pt.expenses,
      margin: pt.revenue - pt.expenses,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  const purchasesPipeline: WorkshopPartsPurchasePipeline[] = [
    'pending',
    'ordered',
    'received',
    'cancelled',
  ].map((status) => ({
    status,
    label: PURCHASE_STATUS_LABEL[status] ?? status,
    count: purchaseStatusAgg.get(status)?.count ?? 0,
    totalCost: purchaseStatusAgg.get(status)?.totalCost ?? 0,
  }));

  return {
    period: { from: from.toISOString(), to: to.toISOString(), label: periodLabel },
    summary: {
      revenueTotal,
      cogsTotal,
      purchasesExpenseTotal,
      expensesTotal,
      marginTotal,
      marginPct,
      partsSoldQty,
      approvedLinesCount,
      budgetsInPeriod: budgetIdsInPeriod.size,
      stockValueAtCost,
      stockValueAtPrice,
      productsCount: parts.length,
      alertZero,
      alertLow,
    },
    daily,
    topByValue,
    topByUnits,
    stockByCategory: [...stockByCat.values()].sort((a, b) => b.valueAtPrice - a.valueAtPrice),
    stockHealth: { ok: stockOk, low: alertLow, zero: alertZero },
    purchasesPipeline,
    lowStock: lowStock.slice(0, 15),
  };
}

export function periodBoundsFromPreset(
  preset: '7d' | '30d' | '90d' | 'month' | 'year'
): { from: Date; to: Date; label: string } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let from: Date;
  let label: string;
  if (preset === '7d') {
    from = new Date(to);
    from.setDate(from.getDate() - 6);
    label = 'Últimos 7 dias';
  } else if (preset === '30d') {
    from = new Date(to);
    from.setDate(from.getDate() - 29);
    label = 'Últimos 30 dias';
  } else if (preset === '90d') {
    from = new Date(to);
    from.setDate(from.getDate() - 89);
    label = 'Últimos 90 dias';
  } else if (preset === 'year') {
    from = new Date(now.getFullYear(), 0, 1);
    label = `Ano ${now.getFullYear()}`;
  } else {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
    label = 'Este mês';
  }
  from.setHours(0, 0, 0, 0);
  return { from, to, label };
}

export function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatCompactBRL(value: number): string {
  if (value >= 1_000_000) return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `R$ ${(value / 1_000).toFixed(1)}k`;
  return formatBRL(value);
}
