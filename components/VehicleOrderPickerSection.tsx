import React, { useEffect, useMemo, useState } from 'react';
import { Archive, Car, Loader2, Search } from 'lucide-react';
import type { ServiceOrderListItem } from '../services/apiService';
import {
  filterOrders,
  formatOrderPickLabel,
  loadVehicleOrdersForPicker,
  type VehiclePickMode,
} from '../utils/vehicleOrderPicker';

const ACCENT = {
  amber: {
    tabActive: 'bg-amber-500 text-white shadow-sm',
    spinner: 'text-amber-500',
    selected: 'bg-amber-500/15 font-semibold text-amber-900 ring-1 ring-amber-500/40 dark:text-amber-100',
  },
  rose: {
    tabActive: 'bg-rose-600 text-white shadow-sm',
    spinner: 'text-rose-600',
    selected: 'bg-rose-600/15 font-semibold text-rose-900 ring-1 ring-rose-500/40 dark:text-rose-100',
  },
} as const;

type Props = {
  open: boolean;
  accent?: keyof typeof ACCENT;
  inputClass: string;
  labelClass: string;
  selectedOrderId: string | null;
  onSelectOrder: (order: ServiceOrderListItem) => void;
  onClearSelection?: () => void;
};

export const VehicleOrderPickerSection: React.FC<Props> = ({
  open,
  accent = 'amber',
  inputClass,
  labelClass,
  selectedOrderId,
  onSelectOrder,
  onClearSelection,
}) => {
  const styles = ACCENT[accent];
  const [vehiclePickMode, setVehiclePickMode] = useState<VehiclePickMode>('manual');
  const [patioOrders, setPatioOrders] = useState<ServiceOrderListItem[]>([]);
  const [archivedOrders, setArchivedOrders] = useState<ServiceOrderListItem[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [vehicleSearch, setVehicleSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setOrdersLoading(true);
    void loadVehicleOrdersForPicker()
      .then(({ patio, archived }) => {
        if (!cancelled) {
          setPatioOrders(patio);
          setArchivedOrders(archived);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPatioOrders([]);
          setArchivedOrders([]);
        }
      })
      .finally(() => {
        if (!cancelled) setOrdersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setVehiclePickMode('manual');
      setVehicleSearch('');
    }
  }, [open]);

  const pickerOrders = vehiclePickMode === 'archived' ? archivedOrders : patioOrders;
  const filteredPickerOrders = useMemo(
    () => filterOrders(pickerOrders, vehicleSearch),
    [pickerOrders, vehicleSearch]
  );

  return (
    <div className="sm:col-span-2 rounded-2xl border border-zinc-200/90 bg-zinc-50/80 p-4 dark:border-white/[0.1] dark:bg-zinc-950/50">
      <p className={labelClass}>Veículo</p>
      <div className="mb-3 flex flex-wrap gap-2">
        {(
          [
            { id: 'manual' as const, label: 'Digitar manualmente' },
            { id: 'patio' as const, label: 'No pátio', icon: Car },
            { id: 'archived' as const, label: 'Arquivados', icon: Archive },
          ] as const
        ).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setVehiclePickMode(id);
              setVehicleSearch('');
              if (id === 'manual') onClearSelection?.();
            }}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
              vehiclePickMode === id
                ? styles.tabActive
                : 'bg-white text-zinc-700 ring-1 ring-zinc-200/90 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-white/[0.12] dark:hover:bg-zinc-800'
            }`}
          >
            {Icon ? <Icon className="h-4 w-4 shrink-0" strokeWidth={2} /> : null}
            {label}
          </button>
        ))}
      </div>

      {vehiclePickMode !== 'manual' ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              className={`${inputClass} pl-9`}
              value={vehicleSearch}
              onChange={(e) => setVehicleSearch(e.target.value)}
              placeholder={
                vehiclePickMode === 'patio'
                  ? 'Buscar placa, modelo, cliente ou OS…'
                  : 'Buscar veículo arquivado…'
              }
            />
          </div>
          {ordersLoading ? (
            <div className="flex items-center gap-2 py-6 text-[13px] text-zinc-500">
              <Loader2 className={`h-4 w-4 animate-spin ${styles.spinner}`} />
              Carregando veículos…
            </div>
          ) : filteredPickerOrders.length === 0 ? (
            <p className="py-4 text-center text-[13px] text-zinc-500 dark:text-zinc-400">
              {vehiclePickMode === 'patio' ? 'Nenhum veículo no pátio.' : 'Nenhum veículo arquivado encontrado.'}
            </p>
          ) : (
            <ul className="max-h-44 space-y-1 overflow-y-auto overscroll-contain rounded-xl border border-zinc-200/80 bg-white p-1 dark:border-white/[0.08] dark:bg-zinc-950">
              {filteredPickerOrders.map((o) => {
                const selected = selectedOrderId === o.id;
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => onSelectOrder(o)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left text-[13px] transition-colors ${
                        selected
                          ? styles.selected
                          : 'text-zinc-800 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {formatOrderPickLabel(o)}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {selectedOrderId ? (
            <p className="text-[12px] text-emerald-700 dark:text-emerald-400">
              Veículo selecionado — os campos abaixo foram preenchidos e podem ser ajustados.
            </p>
          ) : (
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              Toque em um veículo da lista para preencher os dados do veículo.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
};
