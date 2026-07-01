import React, { useEffect, useState } from 'react';
import { Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { ModalPortal } from '../ui/ModalPortal';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { BudgetPartStockBadge } from '../ui/BudgetPartStockBadge';
import { iosAccentPrimaryButton, iosLabel, iosModalClose, iosModalInsetCard, iosModalShell } from '../ui/iosModalStyles';
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
  services: { description: string; approved?: boolean; labor_hours?: number | null }[];
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
};

export const BudgetApprovalModal: React.FC<BudgetApprovalModalProps> = ({
  open,
  budget,
  serviceOrderId,
  onClose,
  onSaved,
  actorOptions,
  headerIcon,
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

  if (!open || !budget) return null;

  const handleSave = async () => {
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

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[20px] sm:p-6 animate-in fade-in duration-200">
        <div
          className={`relative flex max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-[2rem] animate-in zoom-in-95 duration-200 shadow-[0_10px_36px_-12px_rgba(0,0,0,0.18)] dark:shadow-[0_16px_44px_-14px_rgba(0,0,0,0.55)] ${iosModalShell}`}
        >
          <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
          <div className="shrink-0 border-b border-zinc-200/60 px-5 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
            <div className="flex items-start gap-3 pr-10">
              <IosAccentIconSquircle variant="modal" strokeWidth={2.2}>
                {headerIcon ?? <Check className="h-5 w-5" />}
              </IosAccentIconSquircle>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                  Módulo Orçamentos
                </p>
                <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white">
                  Aprovar orçamento
                </h2>
                <p className="mt-1 flex items-start gap-1.5 text-[13px] leading-snug text-zinc-600 dark:text-zinc-400">
                  <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                  Ligue = aprovado, desligue = reprovado. O técnico verá ✓ ou ✗ em cada item.
                </p>
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-0 space-y-6 overflow-y-auto overscroll-contain px-5 py-5 custom-scrollbar sm:px-8">
            {budget.services.length > 0 ? (
              <section>
                <h3 className={`${iosLabel} mb-2`}>Serviços</h3>
                <ul className="space-y-2">
                  {budget.services.map((s, i) => (
                    <li key={i} className={`flex items-center gap-3 p-3.5 ${iosModalInsetCard}`}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={approvalServices[i]}
                        onClick={() =>
                          setApprovalServices((prev) => {
                            const next = [...prev];
                            next[i] = !next[i];
                            return next;
                          })
                        }
                        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${approvalServices[i] ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                      >
                        <span
                          className="absolute left-0.5 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                          style={{ transform: approvalServices[i] ? 'translateX(20px)' : 'translateX(0)' }}
                        />
                      </button>
                      <div className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">{s.description}</span>
                        {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                          <span className="mt-0.5 block text-[12px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
                            {formatLaborLabel(Number(s.labor_hours))}
                          </span>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 text-xs font-semibold ${approvalServices[i] ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                      >
                        {approvalServices[i] ? 'Aprovado' : 'Reprovado'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
            {budget.parts.length > 0 ? (
              <section>
                <h3 className={`${iosLabel} mb-2`}>Peças</h3>
                <ul className="space-y-2">
                  {budget.parts.map((p, i) => (
                    <li key={i} className={`flex items-center gap-3 p-3.5 ${iosModalInsetCard}`}>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={approvalParts[i]}
                        onClick={() =>
                          setApprovalParts((prev) => {
                            const next = [...prev];
                            next[i] = !next[i];
                            return next;
                          })
                        }
                        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${approvalParts[i] ? 'bg-emerald-500' : 'bg-zinc-400 dark:bg-zinc-600'}`}
                      >
                        <span
                          className="absolute left-0.5 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200"
                          style={{ transform: approvalParts[i] ? 'translateX(20px)' : 'translateX(0)' }}
                        />
                      </button>
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-medium text-zinc-800 dark:text-zinc-200">
                        <span>
                          ({p.quantity}x) {p.description}
                        </span>
                        {p.fromStock ? <BudgetPartStockBadge /> : null}
                      </span>
                      <span
                        className={`shrink-0 text-xs font-semibold ${approvalParts[i] ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
                      >
                        {approvalParts[i] ? 'Aprovado' : 'Reprovado'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-col gap-3 border-t border-zinc-200/60 px-4 py-4 dark:border-white/[0.07] sm:flex-row sm:px-6">
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
              disabled={saving}
              className={`${iosAccentPrimaryButton} flex flex-1 items-center justify-center gap-2 py-3 text-[15px] disabled:opacity-50`}
            >
              {saving ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
              {saving ? 'Salvando…' : 'Salvar aprovação'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
