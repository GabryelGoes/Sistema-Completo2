import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Package, RefreshCw, Sparkles, Wrench, X } from 'lucide-react';
import { ModalPortal } from '../ui/ModalPortal';
import { BudgetPartStockBadge } from '../ui/BudgetPartStockBadge';
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

const approvalShell =
  'relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-2xl border border-sky-100/95 bg-[#fafcfe] shadow-[0_28px_90px_-32px_rgba(14,116,144,0.38),0_12px_32px_-16px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,1)] animate-modal-sheet';

const approvalInset =
  'rounded-[16px] border border-sky-200/80 bg-white shadow-[0_6px_22px_-10px_rgba(14,116,144,0.18),0_2px_12px_-4px_rgba(15,23,42,0.08),inset_0_1px_0_rgba(255,255,255,1)]';

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
          ? 'bg-sky-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.25)]'
          : 'bg-slate-300 shadow-[inset_0_1px_2px_rgba(15,23,42,0.12)]'
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
      <div
        className="fixed inset-0 z-[240] flex items-center justify-center bg-slate-900/55 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm sm:p-6 animate-modal-backdrop"
        style={{ colorScheme: 'light' }}
      >
        <div className={approvalShell}>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-sky-900/10 text-sky-900 transition-colors hover:bg-sky-200/90 hover:text-sky-950 sm:right-4 sm:top-4 sm:h-10 sm:w-10"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="shrink-0 border-b border-sky-100/90 bg-gradient-to-b from-white to-[#f5fbff] px-5 pb-4 pt-6 sm:px-7 sm:pb-5 sm:pt-7">
            <div className="flex items-start gap-3 pr-10">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-sky-200/80 bg-gradient-to-b from-sky-50 to-white shadow-sm">
                {headerIcon ?? <CheckCircle2 className="h-5 w-5 text-sky-600" strokeWidth={2.2} />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700/85">
                  Orçamento
                </p>
                <h2 className="text-[21px] font-semibold leading-tight tracking-tight text-slate-900 sm:text-[22px]">
                  Aprovar orçamento
                </h2>
                <p className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-snug text-sky-900/70">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500" strokeWidth={2} />
                  <span>
                    {gateHint ??
                      'Ative para aprovar e desative para reprovar. O técnico verá ✓ ou ✗ em cada item.'}
                  </span>
                </p>
              </div>
            </div>

            {totalItems > 0 ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white px-3 py-1.5 text-[12px] font-semibold tabular-nums text-sky-900 shadow-sm">
                  <CheckCircle2 className="h-3.5 w-3.5 text-sky-600" strokeWidth={2.2} />
                  {approvedCount.total} de {totalItems} aprovado{approvedCount.total === 1 ? '' : 's'}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={approveAll}
                    className="rounded-lg border border-sky-200/80 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800 transition-colors hover:bg-sky-100"
                  >
                    Aprovar todos
                  </button>
                  <button
                    type="button"
                    onClick={rejectAll}
                    className="rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50"
                  >
                    Reprovar todos
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain bg-[#f8fcfe] px-5 py-5 custom-scrollbar sm:px-7">
            {budget.services.length > 0 ? (
              <section>
                <div className="mb-2.5 flex items-center gap-2">
                  <Wrench className="h-3.5 w-3.5 text-sky-600" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-800/80">
                    Serviços
                  </h3>
                  <span className="text-[11px] font-semibold tabular-nums text-sky-700/55">
                    {approvedCount.services}/{budget.services.length}
                  </span>
                </div>
                <ul className="space-y-2">
                  {budget.services.map((s, i) => {
                    const on = approvalServices[i] === true;
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-3 p-3.5 transition-colors ${approvalInset} ${
                          on ? 'border-sky-300/90 bg-sky-50/70' : ''
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-white text-[13px] font-semibold tabular-nums text-sky-800">
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
                          <span className="block text-[14px] font-medium leading-snug text-slate-800">
                            {s.description}
                          </span>
                          {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                            <span className="mt-0.5 block text-[12px] font-semibold tabular-nums text-sky-700/75">
                              {formatLaborLabel(Number(s.labor_hours))}
                            </span>
                          ) : null}
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            on
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-100 text-slate-500'
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
                  <Package className="h-3.5 w-3.5 text-sky-600" strokeWidth={2.2} aria-hidden />
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-800/80">
                    Peças
                  </h3>
                  <span className="text-[11px] font-semibold tabular-nums text-sky-700/55">
                    {approvedCount.parts}/{budget.parts.length}
                  </span>
                </div>
                <ul className="space-y-2">
                  {budget.parts.map((p, i) => {
                    const on = approvalParts[i] === true;
                    return (
                      <li
                        key={i}
                        className={`flex items-center gap-3 p-3.5 transition-colors ${approvalInset} ${
                          on ? 'border-sky-300/90 bg-sky-50/70' : ''
                        }`}
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-sky-200/80 bg-white text-[13px] font-semibold tabular-nums text-sky-800">
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
                        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-[14px] font-medium leading-snug text-slate-800">
                          <span>
                            <span className="tabular-nums text-sky-800/80">({p.quantity}x)</span>{' '}
                            {p.description}
                          </span>
                          {p.fromStock ? <BudgetPartStockBadge /> : null}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            on
                              ? 'bg-sky-100 text-sky-800'
                              : 'bg-slate-100 text-slate-500'
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
              <p className="rounded-xl border border-dashed border-sky-200 bg-white px-4 py-8 text-center text-[14px] text-slate-600">
                Este orçamento não tem serviços nem peças para aprovar.
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 flex-col gap-2.5 border-t border-sky-100/90 bg-[#f8fcfe] px-4 py-4 sm:flex-row sm:px-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-sky-200/90 bg-white py-3 text-[15px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50/80"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || (requireAtLeastOneApproved && !hasAtLeastOneApproved)}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-sky-600/35 bg-sky-600 py-3 text-[15px] font-semibold text-white shadow-md transition-[transform,background-color,opacity] hover:bg-sky-700 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
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
