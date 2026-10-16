/** Tipos e agregação de analytics dos módulos ABS. */

export type AbsModulesAnalyticsPeriod = {
  from: string;
  to: string;
  label: string;
};

export type AbsModulesAnalyticsSummary = {
  modelsCount: number;
  unitsTotal: number;
  unitsAvailable: number;
  unitsOut: number;
  unitsDisassembled: number;
  stockValueAtPrice: number;
  stockValueAtCost: number;
  exitsQty: number;
  exitsRevenue: number;
  entriesQty: number;
  transfersQty: number;
};

export type AbsModulesDailyPoint = {
  date: string;
  label: string;
  exits: number;
  entries: number;
  revenue: number;
};

export type AbsModulesKindStock = {
  kind: string;
  label: string;
  total: number;
  available: number;
  valueAtPrice: number;
};

export type AbsModulesManufacturerStock = {
  manufacturer: string;
  total: number;
  available: number;
  valueAtPrice: number;
};

export type AbsModulesTopExit = {
  publicId: string;
  manufacturer: string | null;
  code: string | null;
  kind: string;
  unitPrice: number;
  exitedAt: string;
};

export type AbsModulesAnalyticsResponse = {
  period: AbsModulesAnalyticsPeriod;
  summary: AbsModulesAnalyticsSummary;
  daily: AbsModulesDailyPoint[];
  byKind: AbsModulesKindStock[];
  byManufacturer: AbsModulesManufacturerStock[];
  statusHealth: {
    disponivel: number;
    fora_estoque: number;
    desmembrado: number;
    reservado: number;
  };
  recentExits: AbsModulesTopExit[];
};

export type AbsAnalyticsModuleRow = {
  id: string;
  public_id: string;
  manufacturer: string | null;
  original_code: string | null;
  module_kind: string;
  status: string;
  unit_price: number;
  unit_cost: number;
  model_id: string | null;
  created_at: string;
};

export type AbsAnalyticsMovementRow = {
  id: string;
  module_id: string;
  movement_type: string;
  created_at: string;
};

function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function dayLabel(isoDate: string): string {
  const [, m, d] = isoDate.split('-');
  return `${d}/${m}`;
}

function kindLabel(kind: string): string {
  if (kind === 'completo') return 'Completo';
  if (kind === 'eletronico') return 'Eletrônico';
  if (kind === 'hidraulico') return 'Hidráulico';
  return 'Outro';
}

export function buildWorkshopAbsModulesAnalytics(input: {
  modules: AbsAnalyticsModuleRow[];
  movements: AbsAnalyticsMovementRow[];
  from: Date;
  to: Date;
  periodLabel: string;
}): AbsModulesAnalyticsResponse {
  const { modules, movements, from, to, periodLabel } = input;
  const moduleById = new Map(modules.map((m) => [m.id, m]));
  const modelIds = new Set(modules.map((m) => m.model_id).filter(Boolean));

  let unitsAvailable = 0;
  let unitsOut = 0;
  let unitsDisassembled = 0;
  let stockValueAtPrice = 0;
  let stockValueAtCost = 0;

  const statusHealth = {
    disponivel: 0,
    fora_estoque: 0,
    desmembrado: 0,
    reservado: 0,
  };

  const byKindMap = new Map<string, AbsModulesKindStock>();
  const byMfrMap = new Map<string, AbsModulesManufacturerStock>();

  for (const m of modules) {
    const price = Number(m.unit_price) || 0;
    const cost = Number(m.unit_cost) || 0;
    const status = String(m.status || '');
    if (status === 'disponivel') {
      unitsAvailable += 1;
      stockValueAtPrice += price;
      stockValueAtCost += cost;
      statusHealth.disponivel += 1;
    } else if (status === 'fora_estoque') {
      unitsOut += 1;
      statusHealth.fora_estoque += 1;
    } else if (status === 'desmembrado') {
      unitsDisassembled += 1;
      statusHealth.desmembrado += 1;
    } else if (status === 'reservado') {
      statusHealth.reservado += 1;
      stockValueAtPrice += price;
      stockValueAtCost += cost;
    }

    const kind = String(m.module_kind || 'outro');
    const kindRow = byKindMap.get(kind) || {
      kind,
      label: kindLabel(kind),
      total: 0,
      available: 0,
      valueAtPrice: 0,
    };
    kindRow.total += 1;
    if (status === 'disponivel' || status === 'reservado') {
      kindRow.available += status === 'disponivel' ? 1 : 0;
      if (status === 'disponivel') kindRow.valueAtPrice += price;
    }
    byKindMap.set(kind, kindRow);

    const mfr = String(m.manufacturer || '').trim() || 'Sem fabricante';
    const mfrRow = byMfrMap.get(mfr) || {
      manufacturer: mfr,
      total: 0,
      available: 0,
      valueAtPrice: 0,
    };
    mfrRow.total += 1;
    if (status === 'disponivel') {
      mfrRow.available += 1;
      mfrRow.valueAtPrice += price;
    }
    byMfrMap.set(mfr, mfrRow);
  }

  const dailyMap = new Map<string, AbsModulesDailyPoint>();
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cursor.getTime() <= end.getTime()) {
    const key = dayKey(cursor);
    dailyMap.set(key, { date: key, label: dayLabel(key), exits: 0, entries: 0, revenue: 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  let exitsQty = 0;
  let exitsRevenue = 0;
  let entriesQty = 0;
  let transfersQty = 0;
  const recentExits: AbsModulesTopExit[] = [];

  const fromMs = from.getTime();
  const toMs = to.getTime();

  for (const mv of movements) {
    const created = new Date(mv.created_at).getTime();
    if (!Number.isFinite(created) || created < fromMs || created > toMs) continue;
    const mod = moduleById.get(mv.module_id);
    const key = dayKey(new Date(mv.created_at));
    const day = dailyMap.get(key);
    const type = String(mv.movement_type || '');
    if (type === 'exit') {
      exitsQty += 1;
      const rev = Number(mod?.unit_price) || 0;
      exitsRevenue += rev;
      if (day) {
        day.exits += 1;
        day.revenue += rev;
      }
      if (mod) {
        recentExits.push({
          publicId: mod.public_id,
          manufacturer: mod.manufacturer,
          code: mod.original_code,
          kind: mod.module_kind,
          unitPrice: Number(mod.unit_price) || 0,
          exitedAt: mv.created_at,
        });
      }
    } else if (type === 'entry') {
      entriesQty += 1;
      if (day) day.entries += 1;
    } else if (type === 'transfer') {
      transfersQty += 1;
    }
  }

  recentExits.sort((a, b) => b.exitedAt.localeCompare(a.exitedAt));

  const byManufacturer = [...byMfrMap.values()]
    .sort((a, b) => b.valueAtPrice - a.valueAtPrice || b.total - a.total)
    .slice(0, 10);

  const byKind = [...byKindMap.values()].sort((a, b) => b.total - a.total);

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      label: periodLabel,
    },
    summary: {
      modelsCount: modelIds.size,
      unitsTotal: modules.length,
      unitsAvailable,
      unitsOut,
      unitsDisassembled,
      stockValueAtPrice,
      stockValueAtCost,
      exitsQty,
      exitsRevenue,
      entriesQty,
      transfersQty,
    },
    daily: [...dailyMap.values()],
    byKind,
    byManufacturer,
    statusHealth,
    recentExits: recentExits.slice(0, 12),
  };
}
