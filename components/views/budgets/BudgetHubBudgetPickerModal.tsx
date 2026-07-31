import React, { useMemo } from 'react';
import { CalendarDays, ChevronRight, FileText, X } from 'lucide-react';
import {
  budgetChronologicalNumber,
  type PatioVehicleBudgetAggregateItem,
} from '../../../services/apiService';
import { BudgetVerifiedSeal } from '../../budget/BudgetVerifiedSeal';
import { ModalPortal } from '../../ui/ModalPortal';
import { iosModalClose, iosModalShell } from '../../ui/iosModalStyles';
import { MercosulPlateMockup } from '../../ui/MercosulPlateMockup';
import { isBudgetRecentlyCreated, type VehicleBudgetGroup } from '../../../utils/budgetsHubViews';

function formatBudgetCreated(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export type BudgetHubBudgetPickerModalProps = {
  open: boolean;
  group: VehicleBudgetGroup | null;
  pulseByBudgetId?: Record<string, 'created' | 'edited'>;
  blurPlates?: boolean;
  onClose: () => void;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
};

/**
 * Modal compacto: lista os orçamentos do veículo/OS para o usuário escolher qual abrir.
 */
export function BudgetHubBudgetPickerModal({
  open,
  group,
  pulseByBudgetId = {},
  blurPlates = false,
  onClose,
  onOpenBudget,
}: BudgetHubBudgetPickerModalProps) {
  const items = useMemo(() => {
    if (!group) return [] as PatioVehicleBudgetAggregateItem[];
    return [...group.items].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [group]);

  if (!open || !group) return null;

  const head = group.head;
  const isLab = head.orderType === 'module';
  const model =
    (head.vehicleModel ?? '').trim() ||
    (isLab ? (head.moduleIdentification ?? '').trim() || 'Módulo' : 'Veículo');
  const plate = (head.plate ?? '').trim() || '---';
  const moduleId = (head.moduleIdentification ?? head.vehicleModel ?? '').trim() || '—';
  const chrono = items.map((x) => ({ id: x.budgetId, createdAt: x.createdAt }));

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[220] flex items-end justify-center bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[16px] sm:items-center sm:p-6 animate-modal-backdrop"
        onClick={onClose}
        role="presentation"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="budget-hub-picker-title"
          className={`${iosModalShell} max-h-[min(72dvh,32rem)] w-full max-w-[24rem] animate-modal-sheet sm:max-w-[26rem]`}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/70 px-5 pb-3.5 pt-5 dark:border-white/[0.08] sm:px-6 sm:pt-6">
            <div className="flex items-start gap-3 pr-10">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] border border-zinc-200/80 bg-white/80 shadow-sm dark:border-white/[0.1] dark:bg-zinc-900/70">
                <FileText className="h-5 w-5 text-[#007AFF]" strokeWidth={2.1} aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                  Escolher orçamento
                </p>
                <h2
                  id="budget-hub-picker-title"
                  className="truncate text-[17px] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white"
                >
                  {model}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {head.osNumber != null ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300">
                      OS #{head.osNumber}
                    </span>
                  ) : null}
                  <span className="rounded-full bg-zinc-200/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-700 dark:bg-white/[0.1] dark:text-zinc-300">
                    {items.length} orç.
                  </span>
                  {!isLab ? (
                    <MercosulPlateMockup plate={plate} blurPlates={blurPlates} size="cardCompact" />
                  ) : (
                    <span className="truncate rounded-lg border border-zinc-200/80 bg-white/70 px-2 py-0.5 font-mono text-[11px] font-bold text-zinc-800 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-zinc-200">
                      {moduleId}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 custom-scrollbar sm:px-5">
            {items.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-8 text-center text-[14px] text-zinc-500 dark:border-white/[0.1] dark:bg-zinc-950/40 dark:text-zinc-400">
                Nenhum orçamento neste veículo.
              </p>
            ) : (
              <ul className="space-y-2">
                {items.map((row) => {
                  const bid = String(row.budgetId).trim();
                  const budgetNum = budgetChronologicalNumber(chrono, row.budgetId);
                  const pulse = pulseByBudgetId[bid];
                  const isNew = pulse === 'created' || isBudgetRecentlyCreated(row);
                  const name = (row.cardName ?? '').trim();
                  return (
                    <li key={row.budgetId}>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenBudget(row.serviceOrderId, row.budgetId);
                          onClose();
                        }}
                        className={`flex w-full items-start gap-2 rounded-2xl border px-3 py-2.5 text-left transition-colors active:scale-[0.99] ${
                          row.hasApprovedItems
                            ? 'border-sky-300/70 bg-sky-50/90 hover:bg-sky-100/90 dark:border-sky-400/30 dark:bg-sky-500/10 dark:hover:bg-sky-500/15'
                            : row.isVerified
                              ? 'border-emerald-300/60 bg-emerald-50/80 hover:bg-emerald-100/80 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15'
                              : 'border-amber-300/55 bg-amber-50/70 hover:bg-amber-100/80 dark:border-amber-500/25 dark:bg-amber-500/10 dark:hover:bg-amber-500/15'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[13px] font-bold uppercase tracking-[0.05em] text-zinc-800 dark:text-zinc-100">
                              Orç. {budgetNum}
                            </span>
                            {row.isVerified ? (
                              <BudgetVerifiedSeal
                                variant="social"
                                size="md"
                                verifiedAt={row.verifiedAt}
                                verifiedByName={row.verifiedByName}
                              />
                            ) : (
                              <span className="rounded-full border border-amber-400/50 bg-amber-100/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-200">
                                Não verif.
                              </span>
                            )}
                            {row.hasApprovedItems ? (
                              <span className="rounded-full bg-sky-600/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-sky-800 dark:bg-sky-400/20 dark:text-sky-200">
                                Aprovado
                              </span>
                            ) : (
                              <span className="rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                                Sem aprov.
                              </span>
                            )}
                            {isNew ? (
                              <span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-emerald-800 dark:text-emerald-300">
                                Novo
                              </span>
                            ) : null}
                            {pulse === 'edited' ? (
                              <span className="rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-amber-900 dark:text-amber-200">
                                Editado
                              </span>
                            ) : null}
                          </div>
                          {name ? (
                            <p className="mt-1 truncate text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                              {name}
                            </p>
                          ) : null}
                          <p className="mt-1 flex items-center gap-1 text-[11px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                            <CalendarDays className="h-3 w-3 shrink-0" strokeWidth={2.2} aria-hidden />
                            {formatBudgetCreated(row.createdAt)}
                          </p>
                        </div>
                        <ChevronRight
                          className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400"
                          strokeWidth={2.4}
                          aria-hidden
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="shrink-0 border-t border-zinc-200/70 px-4 py-3 dark:border-white/[0.08] sm:px-5">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl border border-zinc-200/90 bg-white py-2.5 text-[14px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
