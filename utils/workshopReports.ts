import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  parseISO,
  format,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ServiceOrderListItem, TechnicianServiceReportItem } from '../services/apiService';
import { CANCELLED_STATUS } from '../constants/serviceOrderStages';

export type ReportPeriodMode = 'week' | 'month';

export type ReportWeekStart = 'monday' | 'sunday';

export function weekStartsOnOption(opt: ReportWeekStart): 0 | 1 {
  return opt === 'sunday' ? 0 : 1;
}

export function getPeriodRange(
  mode: ReportPeriodMode,
  reference: Date,
  weekStart: ReportWeekStart
): { start: Date; end: Date; shortLabel: string; longLabel: string } {
  const wk = weekStartsOnOption(weekStart);
  if (mode === 'week') {
    const start = startOfDay(startOfWeek(reference, { weekStartsOn: wk, locale: ptBR }));
    const end = endOfDay(endOfWeek(reference, { weekStartsOn: wk, locale: ptBR }));
    const bounds = formatPeriodBounds(start, end);
    return {
      start,
      end,
      shortLabel: `Sem. ${format(start, 'dd/MM', { locale: ptBR })}`,
      longLabel: `${format(start, "d 'de' MMMM", { locale: ptBR })} – ${format(end, "d 'de' MMMM yyyy", { locale: ptBR })} (${bounds})`,
    };
  }
  const start = startOfDay(startOfMonth(reference));
  const end = endOfDay(endOfMonth(reference));
  const bounds = formatPeriodBounds(start, end);
  return {
    start,
    end,
    shortLabel: format(start, 'MMM/yyyy', { locale: ptBR }),
    longLabel: `${format(start, "MMMM 'de' yyyy", { locale: ptBR })} · ${bounds}`,
  };
}

/** Intervalo legível para conferência (dia civil local). */
export function formatPeriodBounds(start: Date, end: Date): string {
  return `${format(start, 'dd/MM/yyyy', { locale: ptBR })} – ${format(end, 'dd/MM/yyyy', { locale: ptBR })}`;
}

/** Dia civil local (yyyy-MM-dd) para comparar períodos sem erro de fuso. */
export function toLocalDateKey(iso: string | null | undefined): string | null {
  if (!iso || typeof iso !== 'string') return null;
  const trimmed = iso.trim();
  if (!trimmed) return null;
  try {
    // Só data (Postgres date): meio-dia local evita virar dia anterior/posterior
    const d = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? parseISO(`${trimmed}T12:00:00`)
      : parseISO(trimmed);
    if (Number.isNaN(d.getTime())) {
      const fallback = new Date(trimmed);
      if (Number.isNaN(fallback.getTime())) return null;
      return format(fallback, 'yyyy-MM-dd');
    }
    return format(d, 'yyyy-MM-dd');
  } catch {
    return null;
  }
}

/**
 * Verifica se a data da OS (dia civil local) está em [start, end], inclusive.
 */
export function isDateInRange(iso: string, start: Date, end: Date): boolean {
  const key = toLocalDateKey(iso);
  if (!key) return false;
  const startKey = format(start, 'yyyy-MM-dd');
  const endKey = format(end, 'yyyy-MM-dd');
  return key >= startKey && key <= endKey;
}

export function isModuleOrder(o: ServiceOrderListItem): boolean {
  return String(o.order_type ?? 'vehicle').trim().toLowerCase() === 'module';
}

export function filterVehicleOrders(
  orders: ServiceOrderListItem[],
  includeModules: boolean
): ServiceOrderListItem[] {
  if (includeModules) return orders;
  return orders.filter((o) => !isModuleOrder(o));
}

/** Apenas ordens do laboratório (módulos). */
export function filterModuleOrders(orders: ServiceOrderListItem[]): ServiceOrderListItem[] {
  return orders.filter((o) => isModuleOrder(o));
}

/** OS ativas (exclui arquivadas/canceladas). */
export function excludeCancelledOrders(orders: ServiceOrderListItem[]): ServiceOrderListItem[] {
  return orders.filter((o) => o.status !== CANCELLED_STATUS);
}

/** Entradas: data de criação no período (inclui OS já arquivadas — histórico fiel ao banco). */
export function ordersEnteredInPeriod(
  orders: ServiceOrderListItem[],
  start: Date,
  end: Date
): ServiceOrderListItem[] {
  return orders.filter((o) => isDateInRange(o.created_at, start, end));
}

/**
 * OS arquivadas (entregues) no período — data de arquivamento = `updated_at`.
 * Inclui veículos abertos em meses anteriores e entregues neste período.
 */
export function ordersEnteredAndArchivedInPeriod(
  orders: ServiceOrderListItem[],
  start: Date,
  end: Date
): ServiceOrderListItem[] {
  return orders.filter(
    (o) => o.status === CANCELLED_STATUS && isDateInRange(o.updated_at, start, end)
  );
}

export function ordersWarrantyInPeriod(
  orders: ServiceOrderListItem[],
  start: Date,
  end: Date
): ServiceOrderListItem[] {
  return orders.filter((o) => {
    if (!isDateInRange(o.created_at, start, end)) return false;
    return !!o.garantia_tag || o.status === 'GARANTIA';
  });
}

export type TechnicianCountRow = {
  technicianKey: string;
  displayName: string;
  count: number;
  orders: ServiceOrderListItem[];
};

export type TechnicianServicesReportGroup = {
  technicianId: string;
  displayName: string;
  count: number;
  services: TechnicianServiceReportItem[];
};

export function buildTechnicianServicesReport(
  items: TechnicianServiceReportItem[],
  start: Date,
  end: Date,
  hiddenOrderIds?: Set<string>
): TechnicianServicesReportGroup[] {
  const filtered = items.filter((item) => {
    if (hiddenOrderIds?.has(item.serviceOrderId)) return false;
    return isDateInRange(item.recordedAt, start, end);
  });

  const map = new Map<string, { displayName: string; services: TechnicianServiceReportItem[] }>();
  for (const item of filtered) {
    const key = item.technicianId || '__none__';
    const name = item.technicianName?.trim() || 'Técnico';
    if (!map.has(key)) {
      map.set(key, { displayName: name, services: [] });
    }
    map.get(key)!.services.push(item);
  }

  const rows: TechnicianServicesReportGroup[] = [...map.entries()].map(([technicianId, v]) => ({
    technicianId,
    displayName: v.displayName,
    count: v.services.length,
    services: v.services.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
  }));

  rows.sort((a, b) => b.count - a.count || a.displayName.localeCompare(b.displayName, 'pt-BR'));
  return rows;
}

export function formatTechnicianServiceVehicleLabel(item: TechnicianServiceReportItem): string {
  const label = [item.vehicleBrand, item.vehicleModel].filter(Boolean).join(' ').trim();
  return label || '—';
}

export function formatTechnicianServiceOsLabel(item: TechnicianServiceReportItem): string {
  if (item.osNumber != null && Number.isFinite(item.osNumber)) {
    return `#${item.osNumber}`;
  }
  return item.serviceOrderId.slice(0, 8).toUpperCase();
}

export type FinalizedVehicleServiceLine = {
  lineId: string;
  description: string;
  technicianId: string;
  technicianName: string;
  recordedAt: string;
  budgetId: string | null;
};

export type FinalizedVehicleReportGroup = {
  serviceOrderId: string;
  osNumber: number | null;
  plate: string | null;
  vehicleBrand: string | null;
  vehicleModel: string | null;
  orderStatus: string;
  archivedAt: string | null;
  sortAt: string;
  services: FinalizedVehicleServiceLine[];
};

function finalizedVehicleSortKey(item: TechnicianServiceReportItem): string {
  return item.archivedAt || item.recordedAt || '';
}

function finalizedVehicleInPeriod(
  item: TechnicianServiceReportItem,
  start: Date,
  end: Date
): boolean {
  if (item.archivedAt && isDateInRange(item.archivedAt, start, end)) return true;
  if (item.orderStatus === 'FINALIZADO' && isDateInRange(item.recordedAt, start, end)) return true;
  return false;
}

/** Agrupa serviços executados por veículo entregue/finalizado no período. */
export function buildFinalizedVehicleServicesReport(
  items: TechnicianServiceReportItem[],
  start: Date,
  end: Date,
  hiddenOrderIds?: Set<string>
): FinalizedVehicleReportGroup[] {
  const filtered = items.filter((item) => {
    if (hiddenOrderIds?.has(item.serviceOrderId)) return false;
    return finalizedVehicleInPeriod(item, start, end);
  });

  const map = new Map<string, FinalizedVehicleReportGroup>();

  for (const item of filtered) {
    const oid = item.serviceOrderId;
    if (!map.has(oid)) {
      map.set(oid, {
        serviceOrderId: oid,
        osNumber: item.osNumber,
        plate: item.plate,
        vehicleBrand: item.vehicleBrand,
        vehicleModel: item.vehicleModel,
        orderStatus: item.orderStatus,
        archivedAt: item.archivedAt,
        sortAt: finalizedVehicleSortKey(item),
        services: [],
      });
    }
    const group = map.get(oid)!;
    if (item.archivedAt && (!group.archivedAt || item.archivedAt > group.archivedAt)) {
      group.archivedAt = item.archivedAt;
      group.sortAt = item.archivedAt;
    }
    group.services.push({
      lineId: item.lineId,
      description: item.description,
      technicianId: item.technicianId,
      technicianName: item.technicianName,
      recordedAt: item.recordedAt,
      budgetId: item.budgetId ?? null,
    });
  }

  const rows = [...map.values()];
  for (const g of rows) {
    g.services.sort((a, b) => a.description.localeCompare(b.description, 'pt-BR'));
  }
  rows.sort((a, b) => b.sortAt.localeCompare(a.sortAt));
  return rows;
}

export function formatFinalizedVehicleTitle(group: FinalizedVehicleReportGroup): string {
  const model = [group.vehicleBrand, group.vehicleModel].filter(Boolean).join(' ').trim();
  return model || 'Veículo';
}

export function reportTechnicianResponsibility(
  orders: ServiceOrderListItem[],
  start: Date,
  end: Date
): TechnicianCountRow[] {
  const inPeriod = orders.filter((o) => isDateInRange(o.created_at, start, end));
  const map = new Map<string, { displayName: string; orders: ServiceOrderListItem[] }>();
  for (const o of inPeriod) {
    const rawTech = o.assigned_technician?.trim();
    const key = rawTech ? rawTech : '__none__';
    const name = rawTech
      ? (o.assigned_technician_name?.trim() || rawTech || 'Técnico')
      : 'Sem técnico atribuído';
    if (!map.has(key)) {
      map.set(key, { displayName: name, orders: [] });
    }
    map.get(key)!.orders.push(o);
  }
  const rows: TechnicianCountRow[] = [...map.entries()].map(([technicianKey, v]) => ({
    technicianKey,
    displayName: v.displayName,
    count: v.orders.length,
    orders: v.orders,
  }));
  rows.sort((a, b) => b.count - a.count);
  return rows;
}

export type ModelRankRow = {
  key: string;
  brand: string;
  model: string;
  count: number;
};

export function reportTopModels(
  orders: ServiceOrderListItem[],
  start: Date,
  end: Date,
  topN = 16
): ModelRankRow[] {
  const inPeriod = orders.filter((o) => isDateInRange(o.created_at, start, end));
  const map = new Map<string, { brand: string; model: string; count: number }>();
  for (const o of inPeriod) {
    const brand = (o.vehicle_brand ?? '').trim() || '—';
    let model = (o.vehicle_model ?? '').trim();
    if (!model && o.order_type === 'module') {
      model = (o.module_identification ?? '').trim() || 'Módulo';
    }
    if (!model) model = '—';
    const mapKey = `${brand}|${model}`.toLowerCase();
    const cur = map.get(mapKey) ?? { brand, model, count: 0 };
    cur.count += 1;
    map.set(mapKey, cur);
  }
  return [...map.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, topN)
    .map(([key, v]) => ({ key, brand: v.brand, model: v.model, count: v.count }));
}

/** Placa para relatório / exportação (respeita modo cinema). */
export function formatPlateDisplay(plate: string | null | undefined, blur: boolean): string {
  const p = (plate ?? '—').toUpperCase();
  if (!blur) return p;
  if (p.length < 3) return '•••';
  return p.slice(0, 2) + '•••' + p.slice(-1);
}

export function downloadCsv(filename: string, headers: string[], rows: string[][]): void {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const body = [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
  const blob = new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
