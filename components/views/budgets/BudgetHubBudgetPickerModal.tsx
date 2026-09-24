import React, { useMemo } from 'react';
import { ChevronRight, X } from 'lucide-react';
import {
  budgetChronologicalNumber,
  type PatioVehicleBudgetAggregateItem,
} from '../../../services/apiService';
import { ModalPortal } from '../../ui/ModalPortal';
import { iosModalClose, iosModalShell } from '../../ui/iosModalStyles';
import { MercosulPlateMockup } from '../../ui/MercosulPlateMockup';
import type { VehicleBudgetGroup } from '../../../utils/budgetsHubViews';

function formatBudgetCreated(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function budgetPreviewText(row: PatioVehicleBudgetAggregateItem): string {
  const diagnosis = (row.diagnosisPreview ?? '').trim();
  if (diagnosis) return diagnosis.slice(0, 80);
  const name = (row.cardName ?? '').trim();
  if (name) return name.slice(0, 80);
  return 'Orçamento';
}

export type BudgetHubBudgetPickerModalProps = {
  open: boolean;
  group: VehicleBudgetGroup | null;
  blurPlates?: boolean;
  onClose: () => void;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
};

/**
 * Modal compacto: lista os orçamentos do veículo/OS para o usuário escolher qual abrir.
 * Prévia alinhada à lista do modal do veículo.
 */
export function BudgetHubBudgetPickerModal({
  open,
  group,
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
          className={`${iosModalShell} max-h-[min(72dvh,34rem)] w-full max-w-[24rem] animate-modal-sheet sm:max-w-[26rem]`}
          onClick={(e) => e.stopPropagation()}
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/70 px-5 pb-3.5 pt-5 dark:border-white/[0.08] sm:px-6 sm:pt-6">
            <p className="pr-10 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
              Escolher orçamento
            </p>
            <div className="mt-2 flex min-w-0 items-center gap-3 pr-10">
              <h2
                id="budget-hub-picker-title"
                className="min-w-0 flex-1 truncate text-[17px] font-bold leading-tight tracking-tight text-zinc-900 dark:text-white"
              >
                {model}
              </h2>
              {!isLab ? (
                <MercosulPlateMockup plate={plate} blurPlates={blurPlates} size="cardCompact" />
              ) : (
                <span className="max-w-[45%] shrink-0 truncate rounded-lg border-0 bg-zinc-100 px-2 py-1 font-mono text-[11px] font-bold text-zinc-800 dark:bg-zinc-950/50 dark:text-zinc-200">
                  {moduleId}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {head.osNumber != null ? (
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300">
                  OS #{head.osNumber}
                </span>
              ) : null}
              <span className="rounded-full bg-zinc-200/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-700 dark:bg-white/[0.1] dark:text-zinc-300">
                {items.length} orçamento{items.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3.5 custom-scrollbar sm:px-5">
            {items.length === 0 ? (
              <p className="rounded-2xl border-0 bg-zinc-50/80 px-4 py-8 text-center text-[14px] text-zinc-500 shadow-none dark:bg-zinc-950/40 dark:text-zinc-400">
                Nenhum orçamento neste veículo.
              </p>
            ) : (
              <ul className="space-y-2.5">
                {items.map((row) => {
                  const budgetNum = budgetChronologicalNumber(chrono, row.budgetId);
                  const preview = budgetPreviewText(row);
                  const services = row.servicesCount ?? 0;
                  const parts = row.partsCount ?? 0;
                  return (
                    <li key={row.budgetId}>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenBudget(row.serviceOrderId, row.budgetId);
                          onClose();
                        }}
                        className="group relative w-full overflow-hidden rounded-[16px] border border-zinc-200/80 bg-white/95 p-3 text-left shadow-[0_6px_16px_-8px_rgba(0,0,0,0.18)] transition-[border-color,box-shadow] hover:border-[#007AFF]/35 hover:shadow-[0_10px_22px_-8px_rgba(0,122,255,0.28)] dark:border-white/[0.08] dark:bg-zinc-950/85 dark:hover:border-[#93c5fd]/35"
                      >
                        <div className="mb-2 flex items-center justify-between gap-1.5">
                          <span className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">
                            Orçamento {budgetNum}
                          </span>
                          {row.isVerified ? (
                            <span
                              className="inline-flex shrink-0 items-center rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-700 dark:bg-emerald-500/18 dark:text-emerald-300"
                              title={
                                row.verifiedByName
                                  ? `Verificado por ${row.verifiedByName}${row.verifiedAt ? ` · ${formatBudgetCreated(row.verifiedAt)}` : ''}`
                                  : undefined
                              }
                            >
                              Verificado
                            </span>
                          ) : (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-amber-800 dark:bg-amber-500/18 dark:text-amber-200">
                              Aguardando
                            </span>
                          )}
                        </div>
                        <p className="mb-2 line-clamp-2 text-[13px] font-semibold leading-snug text-zinc-900 dark:text-zinc-100">
                          {preview}
                        </p>
                        <div className="mb-2 flex items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                          <span>
                            {services} serviço{services !== 1 ? 's' : ''}
                          </span>
                          <span>·</span>
                          <span>
                            {parts} peça{parts !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-1 border-t border-zinc-200/80 pt-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:border-white/[0.08] dark:text-zinc-400">
                          <span className="min-w-0 truncate">{formatBudgetCreated(row.createdAt)}</span>
                          <span className="inline-flex shrink-0 items-center gap-0.5 text-[#007AFF] dark:text-[#93c5fd]">
                            Abrir
                            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                          </span>
                        </div>
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
