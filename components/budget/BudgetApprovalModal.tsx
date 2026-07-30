import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Package, RefreshCw, Sparkles, Wrench, X } from 'lucide-react';
import { ModalPortal } from '../ui/ModalPortal';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { BudgetPartStockBadge } from '../ui/BudgetPartStockBadge';
import {
  iosAccentPrimaryButton,
  iosModalClose,
  iosModalInsetCard,
  iosModalShell,
} from '../ui/iosModalStyles';
import type { BudgetPartFields } from '../../utils/budgetPartStock';
import { formatLaborLabel } from '../../utils/workshopLaborFormat';
import {
  updateServiceOrderBudget,
  type SavedBudgetFromApi,
  type ServiceOrderUpdateActor,
} from '../../services/apiService';

export type BudgetApprovalModalBudget = {
  id: string;
  cardName: string;
  diagnosis: string;
  services: {
    description: string;
    approved?: boolean;
    labor_hours?: number | null;
    outsourced?: boolean;
    suggested_value?: number | null;
    lab_preset_id?: string | null;
    pre_approved?: boolean;
    source?: string;
    line_observations?: string;
  }[];
  parts: BudgetPartFields[];
  observations: string;
};

export type BudgetApprovalModalProps = {
  open: boolean;
  budget: BudgetApprovalModalBudget | null;
  serviceOrderId: string;
  onClose: () => void;
  onSaved: (updated: SavedBudgetFromApi) => void;
  actorOptions?: ServiceOrderUpdateActor;
  headerIcon?: React.ReactNode;
  /** Exige ao menos um item aprovado antes de salvar (ex.: mudança para etapa Orçamento aprovado). */
  requireAtLeastOneApproved?: boolean;
  /** Texto de apoio quando `requireAtLeastOneApproved` (substitui o hint padrão). */
  gateHint?: string;
};

function ApprovalToggle({
  checked,
  onToggle,
  ariaLabel,
}: {
  checked: boolean;
  onToggle: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
        checked
          ? 'bg-[#007AFF] shadow-[inset_0_1px_0_rgba(255,255,255,0.25)] dark:bg-[#0A84FF]'
          : 'bg-zinc-300 shadow-[inset_0_1px_2px_rgba(15,23,42,0.12)] dark:bg-zinc-600'
      }`}
    >
      <span
        className="absolute left-0.5 top-1 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200"
        style={{ transform: checked ? 'translateX(20px)' : 'translateX(0)' }}
      />
    </button>
  );
}

export const BudgetApprovalModal: React.FC<BudgetApprovalModalProps> = ({
  open,
  budget,
  serviceOrderId,
  onClose,
  onSaved,
  actorOptions,
  headerIcon,
  requireAtLeastOneApproved = false,
  gateHint,
}) => {
  const [approvalServices, setApprovalServices] = useState<boolean[]>([]);
  const [approvalParts, setApprovalParts] = useState<boolean[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !budget) {
      setApprovalServices([]);
      setApprovalParts([]);
      return;
    }
    setApprovalServices(budget.services.map((s) => s.approved === true));
    setApprovalParts(budget.parts.map((p) => p.approved === true));
  }, [open, budget?.id]);

  const approvedCount = useMemo(() => {
    const s = approvalServices.filter(Boolean).length;
    const p = approvalParts.filter(Boolean).length;
    return { services: s, parts: p, total: s + p };
  }, [approvalServices, approvalParts]);

  if (!open || !budget) return null;

  const hasAtLeastOneApproved = approvedCount.total > 0;
  const totalItems = budget.services.length + budget.parts.length;

  const handleSave = async () => {
    if (requireAtLeastOneApproved && !hasAtLeastOneApproved) {
      alert('Aprove pelo menos um serviço ou peça para continuar.');
      return;
    }
    setSaving(true);
    try {
      const services = budget.services.map((s, i) => ({
        description: s.description,
        approved: approvalServices[i] ?? false,
        labor_hours: s.labor_hours ?? null,
        outsourced: s.outsourced,
        suggested_value: s.suggested_value ?? null,
        lab_preset_id: s.lab_preset_id ?? null,
        pre_approved: s.pre_approved,
        source: s.source,
        line_observations: s.line_observations,
      }));
      const parts = budget.parts.map((p, i) => {
        const row: BudgetPartFields = {
          description: p.description,
          quantity: p.quantity,
          approved: approvalParts[i] ?? false,
        };
        if (p.fromStock) {
          row.fromStock = true;
          if (p.workshopPartId) row.workshopPartId = p.workshopPartId;
        }
        return row;
      });
      const updated = await updateServiceOrderBudget(
        serviceOrderId,
        budget.id,
        {
          cardName: budget.cardName,
          diagnosis: budget.diagnosis,
          services,
          parts,
          observations: budget.observations,
        },
        actorOptions
      );
      onSaved(updated);
      onClose();
      window.dispatchEvent(new CustomEvent('rda-patio-budgets-changed'));
    } catch (err: unknown) {
      alert((err as Error)?.message ?? 'Erro ao salvar aprovação.');
    } finally {
      setSaving(false);
    }
  };

  const approveAll = () => {
    setApprovalServices(budget.services.map(() => true));
    setApprovalParts(budget.parts.map(() => true));
  };

  const rejectAll = () => {
    setApprovalServices(budget.services.map(() => false));
    setApprovalParts(budget.parts.map(() => false));
  };

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[20px] sm:p-6 lg:p-8 animate-in fade-in duration-200">
        <div
          className={`${iosModalShell} flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full min-h-0 max-w-xl flex-col animate-in zoom-in-95 duration-200 sm:max-w-2xl lg:max-h-[min(88dvh,52rem)] lg:max-w-4xl xl:max-w-5xl`}
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-zinc-200/60 px-5 pb-4 pt-7 dark:border-white/[0.07] sm:px-8 sm:pb-5 sm:pt-8 lg:px-10">
            <div className="flex items-start gap-3 pr-10 sm:gap-3.5">
              <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                {headerIcon ?? <CheckCircle2 className="h-5 w-5" strokeWidth={2.2} />}
              </IosAccentIconSquircle>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#007AFF] dark:text-[#7ab8ff]">
                  Orçamento
                </p>
                <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white sm:text-[24px]">
                  Aprovar orçamento
                </h2>
                <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-zinc-600 dark:text-zinc-400 sm:text-[14px]">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2} />
                  <span>
                    {gateHint ??
                      'Ative para aprovar e desative para reprovar. O técnico verá ✓ ou ✗ em cada item.'}
                  </span>
                </p>
              </div>
            </div>

            {totalItems > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 sm:mt-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-[#007AFF]/25 bg-[#007AFF]/[0.08] px-3 py-1.5 text-[12px] font-semibold tabular-nums text-[#007AFF] dark:border-[#007AFF]/35 dark:bg-[#007AFF]/15 dark:text-[#7ab8ff]">
                  <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />
                  {approvedCount.total} de {totalItems} aprovado{approvedCount.total === 1 ? '' : 's'}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={approveAll}
                    className="rounded-lg border border-[#007AFF]/30 bg-[#007AFF]/[0.1] px-2.5 py-1 text-[11px] font-semibold text-[#007AFF] transition-colors hover:bg-[#007AFF]/18 dark:border-[#007AFF]/40 dark:bg-[#007AFF]/18 dark:text-[#7ab8ff] dark:hover:bg-[#007AFF]/28"
                  >
                    Aprovar todos
                  </button>
                  <button
                    type="button"
                    onClick={rejectAll}
                    className="rounded-lg border border-zinc-200/90 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-white/[0.1] dark:bg-white/[0.06] dark:text-zinc-300 dark:hover:bg-white/[0.1]"
                  >
                    Reprovar todos
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-5 py-5 custom-scrollbar sm:space-y-6 sm:px-8 sm:py-6 lg:px-10 lg:py-7">
            {budget.services.length > 0 ? (
              <section>
                <div className="mb-2.5 flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Serviços
                  </h3>
                  <span className="text-[11px] font-semibold tabular-nums text-zinc-400 dark:text-zinc-500">
                    {approvedCount.services}/{budget.services.length}
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-2.5">
                  {budget.services.map((s, i) => {
                    const on = approvalServices[i] === true;
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-3 p-3.5 transition-colors sm:p-4 ${iosModalInsetCard} ${
                          on
                            ? 'border-[#007AFF]/35 bg-[#007AFF]/[0.06] dark:border-[#007AFF]/40 dark:bg-[#007AFF]/12'
                            : ''
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-white text-[13px] font-semibold tabular-nums text-zinc-700 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-zinc-200">
                          {i + 1}
                        </span>
                        <ApprovalToggle
                          checked={on}
                          ariaLabel={`${on ? 'Reprovar' : 'Aprovar'} serviço ${i + 1}`}
                          onToggle={() =>
                            setApprovalServices((prev) => {
                              const next = [...prev];
                              next[i] = !next[i];
                              return next;
                            })
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <span className="block text-[14px] font-medium leading-snug text-zinc-800 dark:text-zinc-100 sm:text-[15px]">
                            {s.description}
                          </span>
                          {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                            <span className="mt-0.5 block text-[12px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                              {formatLaborLabel(Number(s.labor_hours))}
                            </span>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            on
                              ? 'bg-[#007AFF]/15 text-[#007AFF] dark:bg-[#007AFF]/22 dark:text-[#7ab8ff]'
                              : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.08] dark:text-zinc-400'
                          }`}
                        >
                          {on ? 'Aprovado' : 'Reprovado'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {budget.parts.length > 0 ? (
              <section>
                <div className="mb-2.5 flex items-center gap-2">
                  <Package className="h-3.5 w-3.5 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Peças
                  </h3>
                  <span className="text-[11px] font-semibold tabular-nums text-zinc-400 dark:text-zinc-500">
                    {approvedCount.parts}/{budget.parts.length}
                  </span>
                </div>
                <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-2.5">
                  {budget.parts.map((p, i) => {
                    const on = approvalParts[i] === true;
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-3 p-3.5 transition-colors sm:p-4 ${iosModalInsetCard} ${
                          on
                            ? 'border-[#007AFF]/35 bg-[#007AFF]/[0.06] dark:border-[#007AFF]/40 dark:bg-[#007AFF]/12'
                            : ''
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/80 bg-white text-[13px] font-semibold tabular-nums text-zinc-700 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-zinc-200">
                          {i + 1}
                        </span>
                        <ApprovalToggle
                          checked={on}
                          ariaLabel={`${on ? 'Reprovar' : 'Aprovar'} peça ${i + 1}`}
                          onToggle={() =>
                            setApprovalParts((prev) => {
                              const next = [...prev];
                              next[i] = !next[i];
                              return next;
                            })
                          }
                        />
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[14px] font-medium leading-snug text-zinc-800 dark:text-zinc-100 sm:text-[15px]">
                          <span>
                            <span className="tabular-nums text-zinc-500 dark:text-zinc-400">({p.quantity}x)</span>{' '}
                            {p.description}
                          </span>
                          {p.fromStock ? <BudgetPartStockBadge /> : null}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            on
                              ? 'bg-[#007AFF]/15 text-[#007AFF] dark:bg-[#007AFF]/22 dark:text-[#7ab8ff]'
                              : 'bg-zinc-100 text-zinc-500 dark:bg-white/[0.08] dark:text-zinc-400'
                          }`}
                        >
                          {on ? 'Aprovado' : 'Reprovado'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ) : null}

            {totalItems === 0 ? (
              <p className={`${iosModalInsetCard} px-4 py-8 text-center text-[14px] text-zinc-600 dark:text-zinc-400`}>
                Este orçamento não tem serviços nem peças para aprovar.
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2.5 border-t border-zinc-200/60 px-4 py-4 dark:border-white/[0.07] sm:flex-row sm:px-8 lg:px-10">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-zinc-200/90 py-3 text-[15px] font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || (requireAtLeastOneApproved && !hasAtLeastOneApproved)}
              className={`${iosAccentPrimaryButton} flex flex-1 items-center justify-center gap-2 py-3 text-[15px] disabled:opacity-50`}
            >
              {saving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {saving
                ? 'Salvando…'
                : requireAtLeastOneApproved
                  ? 'Aprovar e mudar etapa'
                  : 'Salvar aprovação'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
