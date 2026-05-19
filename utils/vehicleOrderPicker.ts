import { getServiceOrders, type ServiceOrderListItem } from '../services/apiService';
import { CANCELLED_STATUS } from '../constants/serviceOrderStages';

export type VehiclePickMode = 'manual' | 'patio' | 'archived';

export function sortOrdersByRecent(orders: ServiceOrderListItem[]): ServiceOrderListItem[] {
  return [...orders].sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
  );
}

export function formatOrderPickLabel(o: ServiceOrderListItem): string {
  const plate = (o.plate ?? '').trim().toUpperCase() || '—';
  const model = (o.vehicle_model ?? '').trim() || 'Veículo';
  const brand = (o.vehicle_brand ?? '').trim();
  const vehicle = [brand, model].filter(Boolean).join(' ') || model;
  const os = o.os_number != null ? ` · OS #${o.os_number}` : '';
  const client = (o.customer_name ?? o.customers?.name ?? '').trim();
  return client ? `${plate} — ${vehicle}${os} (${client})` : `${plate} — ${vehicle}${os}`;
}

export function filterOrders(orders: ServiceOrderListItem[], query: string): ServiceOrderListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return orders;
  const digits = q.replace(/\D/g, '');
  return orders.filter((o) => {
    const plate = (o.plate ?? '').toLowerCase();
    const model = (o.vehicle_model ?? '').toLowerCase();
    const brand = (o.vehicle_brand ?? '').toLowerCase();
    const name = (o.customer_name ?? o.customers?.name ?? '').toLowerCase();
    const os = o.os_number != null ? String(o.os_number) : '';
    if (plate.includes(q) || model.includes(q) || brand.includes(q) || name.includes(q) || os.includes(q)) {
      return true;
    }
    if (digits.length >= 3 && (o.plate ?? '').replace(/\D/g, '').includes(digits)) return true;
    return false;
  });
}

export async function loadVehicleOrdersForPicker(): Promise<{
  patio: ServiceOrderListItem[];
  archived: ServiceOrderListItem[];
}> {
  const [activeAll, archived] = await Promise.all([
    getServiceOrders(undefined, 'vehicle'),
    getServiceOrders(CANCELLED_STATUS, 'vehicle'),
  ]);
  const patio = sortOrdersByRecent(
    activeAll.filter((o) => o.status !== CANCELLED_STATUS && (o.order_type ?? 'vehicle') === 'vehicle')
  );
  return { patio, archived: sortOrdersByRecent(archived) };
}

/** Resumo do veículo para campos de texto (marca, modelo, ano). */
export function vehicleSummaryFromOrder(o: ServiceOrderListItem): string {
  const brand = (o.vehicle_brand ?? '').trim();
  const model = (o.vehicle_model ?? '').trim();
  const year = (o.vehicle_year ?? '').trim();
  return [brand, model, year].filter(Boolean).join(' ') || model || '';
}

export function serviceOrderLabelFromOrder(o: ServiceOrderListItem): string {
  return o.os_number != null ? `OS #${o.os_number}` : '';
}
