import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  History,
  Loader2,
  RefreshCw,
  Search,
  Shuffle,
  X,
} from 'lucide-react';
import { getEstoqueLedger, type EstoqueLedgerEntry } from '../services/apiService';
import { formatLedgerDateTime } from '../utils/estoqueLedger';
import { formatWorkshopPartQty } from '../utils/workshopPartStock';
import { RegistrationPortal } from './ui/RegistrationPortal';
import { IosModalHeader } from './ui/IosModalHeader';
import {
  iosModalClose,
  iosModalShell,
  resolveIosModalOverlayClass,
  NESTED_STOCK_OVERLAY_Z,
} from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type WorkshopEstoqueLedgerModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onOpenSuppliers?: () => void;
};

type FilterKind = 'all' | 'in' | 'out' | 'part' | 'abs';

export function WorkshopEstoqueLedgerModal({
  isOpen,
  onClose,
  onOpenSuppliers,
}: WorkshopEstoqueLedgerModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [items, setItems] = useState<EstoqueLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKind>('all');

  useBrowserBackLayer(isOpen, onClose);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getEstoqueLedger({ limit: 150 });
      setItems(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar histórico.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setFilter('all');
    void load();
  }, [isOpen, load]);

  const filtered = useMemo(() => {
    let rows = items;
    if (filter === 'in') rows = rows.filter((r) => r.direction === 'in');
    else if (filter === 'out') rows = rows.filter((r) => r.direction === 'out');
    else if (filter === 'part') rows = rows.filter((r) => r.source === 'part');
    else if (filter === 'abs') rows = rows.filter((r) => r.source === 'abs');

    const q = query.trim().toLocaleLowerCase('pt-BR');
    if (!q) return rows;
    return rows.filter((r) =>
      [
        r.item_name,
        r.item_code,
        r.type_label,
        r.nfe_number,
        r.supplier_name,
        r.recorded_by_name,
        r.service_order_label,
        r.notes,
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR')
        .includes(q)
    );
  }, [items, filter, query]);

  if (!isOpen) return null;

  const overlayClass = resolveIosModalOverlayClass(isDesktopShell, NESTED_STOCK_OVERLAY_Z);

  const chips: Array<{ id: FilterKind; label: string }> = [
    { id: 'all', label: 'Tudo' },
    { id: 'in', label: 'Entradas' },
    { id: 'out', label: 'Saídas' },
    { id: 'part', label: 'Peças' },
    { id: 'abs', label: 'ABS' },
  ];

  return (
    <RegistrationPortal>
      <div className={overlayClass} onClick={onClose} role="presentation">
        <div
          className={`${iosModalShell} flex h-[min(78vh,680px)] w-full max-w-6xl flex-col overflow-hidden`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Histórico de compras e movimentações"
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/60 px-5 pb-3 pt-7 pr-20 dark:border-white/[0.06] sm:px-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <IosModalHeader
                icon={<History className="h-5 w-5 text-zinc-800" />}
                title="Histórico de compras"
                subtitle="Entradas e saídas de peças e módulos ABS"
                gradientClass="from-emerald-500 to-teal-700"
              />
              <div className="flex flex-wrap items-center gap-2 lg:pb-0.5">
                <button
                  type="button"
                  onClick={() => void load()}
                  disabled={loading}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-2 text-[12px] font-semibold text-zinc-700 hover:bg-zinc-200 disabled:opacity-50 dark:bg-white/10 dark:text-zinc-200"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>
                {onOpenSuppliers ? (
                  <button
                    type="button"
                    onClick={onOpenSuppliers}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-[12px] font-semibold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-100"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                    Fornecedores
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar produto, NF-e, fornecedor, usuário, OS…"
                  className="w-full rounded-xl border-0 bg-zinc-100 py-2.5 pl-9 pr-3 text-[14px] outline-none dark:bg-white/5 dark:text-white"
                />
              </div>
              <div className="flex shrink-0 flex-wrap gap-1.5">
                {chips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFilter(c.id)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                      filter === c.id
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3.5 custom-scrollbar sm:px-6">
            {error ? (
              <p className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </p>
            ) : null}

            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-12 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Carregando histórico…
              </div>
            ) : filtered.length === 0 ? (
              <p className="py-12 text-center text-[13px] text-zinc-500">
                Nenhuma movimentação encontrada.
              </p>
            ) : (
              <ul className="grid gap-2.5 md:grid-cols-2">
                {filtered.map((row) => {
                  const { date, time } = formatLedgerDateTime(row.created_at);
                  const Icon =
                    row.direction === 'in'
                      ? ArrowDownLeft
                      : row.direction === 'transfer'
                        ? Shuffle
                        : ArrowUpRight;
                  const tone =
                    row.direction === 'in'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200'
                      : row.direction === 'transfer'
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200'
                        : 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100';
                  return (
                    <li
                      key={row.id}
                      className="rounded-2xl border-0 bg-white px-3.5 py-3 dark:bg-white/[0.04]"
                    >
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone}`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                            <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-white">
                              {row.item_name}
                            </p>
                            <p className="shrink-0 text-[11px] font-medium tabular-nums text-zinc-500">
                              {date}
                              {time ? ` · ${time}` : ''}
                            </p>
                          </div>
                          <p className="mt-0.5 text-[12px] font-semibold text-zinc-600 dark:text-zinc-300">
                            {row.type_label}
                            {row.source === 'abs' ? ' · ABS' : ''}
                            {row.quantity != null
                              ? ` · ${formatWorkshopPartQty(row.quantity)}${
                                  row.unit_label ? ` ${row.unit_label}` : ''
                                }`
                              : ''}
                            {row.money_label ? ` · ${row.money_label}` : ''}
                          </p>

                          <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-zinc-500">
                            {row.recorded_by_name ? (
                              <span>
                                <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                                  Usuário:
                                </span>{' '}
                                {row.recorded_by_name}
                              </span>
                            ) : null}
                            {row.nfe_number ? (
                              <span>
                                <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                                  NF-e:
                                </span>{' '}
                                {row.nfe_number}
                              </span>
                            ) : null}
                            {row.supplier_name ? (
                              <span>
                                <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                                  Forn.:
                                </span>{' '}
                                {row.supplier_name}
                              </span>
                            ) : null}
                            {row.service_order_label || row.service_order_id ? (
                              <span>
                                <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                                  OS:
                                </span>{' '}
                                {row.service_order_label || row.service_order_id}
                              </span>
                            ) : null}
                            {row.item_code ? (
                              <span>
                                <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                                  Cód.:
                                </span>{' '}
                                {row.item_code}
                              </span>
                            ) : null}
                            {row.stock_before != null && row.stock_after != null ? (
                              <span>
                                Estoque {formatWorkshopPartQty(row.stock_before)} →{' '}
                                {formatWorkshopPartQty(row.stock_after)}
                              </span>
                            ) : null}
                          </div>
                          {row.notes ? (
                            <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                              {row.notes}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </RegistrationPortal>
  );
}
