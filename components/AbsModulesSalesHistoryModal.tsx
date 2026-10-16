import React, { useEffect, useState } from 'react';
import { Loader2, ShoppingBag, X } from 'lucide-react';
import {
  getWorkshopAbsModulesSales,
  type WorkshopAbsModuleMovementListItem,
} from '../services/apiService';
import {
  absModuleExitReasonLabel,
  absModuleKindLabel,
  formatAbsModuleMoney,
  formatAbsModuleSequence,
  formatAbsModuleWhen,
} from '../utils/workshopAbsModules';
import { ModalPortal } from './ui/ModalPortal';
import { useBrowserBackLayer } from './ui/BackNavigationContext';

export type AbsModulesSalesHistoryModalProps = {
  open: boolean;
  onClose: () => void;
  onOpenUnit?: (publicId: string) => void;
};

function saleSourceLabel(m: WorkshopAbsModuleMovementListItem): string {
  const reason = absModuleExitReasonLabel(m.reason_type);
  if (/desmembramento/i.test(String(m.notes || ''))) {
    return `Desmembramento · ${reason}`;
  }
  return reason;
}

export function AbsModulesSalesHistoryModal({
  open,
  onClose,
  onOpenUnit,
}: AbsModulesSalesHistoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<WorkshopAbsModuleMovementListItem[]>([]);

  useBrowserBackLayer(open, onClose);

  useEffect(() => {
    if (!open) {
      setItems([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getWorkshopAbsModulesSales({ limit: 400 })
      .then((list) => {
        if (!cancelled) setItems(list);
      })
      .catch((e) => {
        if (!cancelled) {
          setItems([]);
          setError(e instanceof Error ? e.message : 'Falha ao carregar vendas.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
        onClick={onClose}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Histórico de vendas ABS"
          className="flex max-h-[min(920px,94dvh)] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl dark:bg-zinc-950 sm:rounded-3xl"
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-zinc-100 px-4 py-4 dark:border-white/[0.06] sm:px-5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-800 dark:text-sky-200">
              <ShoppingBag className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700 dark:text-sky-300">
                Estoque ABS
              </p>
              <h2 className="text-[18px] font-bold text-zinc-900 dark:text-white">
                Histórico de vendas
              </h2>
              <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                Módulos que saíram do estoque (venda, OS, laboratório ou desmembramento).
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-white/10 dark:text-zinc-200"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-5 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-sky-600" />
              </div>
            ) : error ? (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-[14px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
                {error}
              </div>
            ) : items.length === 0 ? (
              <p className="py-12 text-center text-[14px] text-zinc-500">
                Nenhuma venda registrada.
              </p>
            ) : (
              <ul className="space-y-2 pb-4">
                {items.map((m) => {
                  const canOpen = Boolean(m.public_id && onOpenUnit);
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        disabled={!canOpen}
                        onClick={() => {
                          if (m.public_id && onOpenUnit) onOpenUnit(m.public_id);
                        }}
                        className={`w-full rounded-2xl px-3.5 py-3 text-left transition-colors ${
                          canOpen
                            ? 'bg-zinc-50 hover:bg-sky-50/80 dark:bg-white/[0.04] dark:hover:bg-sky-950/30'
                            : 'bg-zinc-50 dark:bg-white/[0.04]'
                        } disabled:cursor-default`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <p className="font-mono text-[14px] font-bold tracking-wide text-zinc-900 dark:text-white">
                            {m.public_id || '—'}
                            {m.sequence_number != null ? (
                              <span className="ml-2 text-[12px] font-semibold text-sky-700 dark:text-sky-300">
                                {formatAbsModuleSequence(m.sequence_number)}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
                            {formatAbsModuleWhen(m.created_at)}
                          </p>
                        </div>
                        <p className="mt-1 text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
                          {saleSourceLabel(m)}
                          {m.reason_ref ? ` · ${m.reason_ref}` : ''}
                        </p>
                        <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                          {[
                            m.module_kind ? absModuleKindLabel(m.module_kind) : null,
                            m.manufacturer,
                            m.original_code ? `Cód. ${m.original_code}` : null,
                            m.unit_price != null && Number(m.unit_price) > 0
                              ? formatAbsModuleMoney(m.unit_price)
                              : null,
                            m.recorded_by_name ? `por ${m.recorded_by_name}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
