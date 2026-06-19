import React, { useState } from 'react';
import { Wrench, Plus, Loader2, Trash2, ArrowRight, ChevronDown } from 'lucide-react';
import type { LabServiceLink } from '../../types';
import type { ServiceOrderDetail } from '../../services/apiService';
import { uiOsModalCardSectionTitle, uiOsModalSectionIconWrap } from '../ui/appTypography';

export type LabBudgetServiceOption = { key: string; label: string };

export type LabProductKindOption = { value: string; label: string };

export type PatioOsModalLabServicesSectionProps = {
  insetCardClass: string;
  inputClass: string;
  wrapClassName?: string;
  newLabServiceMode: 'budget' | 'manual';
  onLabServiceModeChange: (mode: 'budget' | 'manual') => void;
  newLabBudgetRef: string;
  onLabBudgetRefChange: (value: string) => void;
  newLabManualLabel: string;
  onLabManualLabelChange: (value: string) => void;
  newLabServiceDetails: string;
  onLabServiceDetailsChange: (value: string) => void;
  productKindOptions: LabProductKindOption[];
  newLabProductKind: string;
  onLabProductKindChange: (value: string) => void;
  newLabProductOther: string;
  onLabProductOtherChange: (value: string) => void;
  otherProductKindId: string;
  budgetServiceOptions: LabBudgetServiceOption[];
  onCreateLabService: () => void;
  creatingLabService: boolean;
  labServiceLinksSaving: boolean;
  labServiceLinksDraft: LabServiceLink[];
  labOrdersLookup: Record<string, ServiceOrderDetail>;
  getStageName: (status: string) => string;
  getStageStyleClass: (status: string) => string;
  onOpenLaboratoryOrder?: (laboratoryOrderId: string) => void;
  onRemoveLabServiceLink: (linkId: string) => void;
  /** Em tablet/mobile: cabeçalho clicável, conteúdo recolhido por padrão. */
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

export const PatioOsModalLabServicesSection: React.FC<PatioOsModalLabServicesSectionProps> = ({
  insetCardClass,
  inputClass,
  wrapClassName = 'mt-3',
  newLabServiceMode,
  onLabServiceModeChange,
  newLabBudgetRef,
  onLabBudgetRefChange,
  newLabManualLabel,
  onLabManualLabelChange,
  newLabServiceDetails,
  onLabServiceDetailsChange,
  productKindOptions,
  newLabProductKind,
  onLabProductKindChange,
  newLabProductOther,
  onLabProductOtherChange,
  otherProductKindId,
  budgetServiceOptions,
  onCreateLabService,
  creatingLabService,
  labServiceLinksSaving,
  labServiceLinksDraft,
  labOrdersLookup,
  getStageName,
  getStageStyleClass,
  onOpenLaboratoryOrder,
  onRemoveLabServiceLink,
  collapsible = false,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isOpen = !collapsible || expanded;
  const linkedCount = labServiceLinksDraft.length;

  const headerInner = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
        <div className={uiOsModalSectionIconWrap}>
          <Wrench className="h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.25} aria-hidden />
        </div>
        <p className={uiOsModalCardSectionTitle}>Serviços no laboratório</p>
        {collapsible && !isOpen && linkedCount > 0 ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-[#007AFF]/12 px-2 py-0.5 text-[11px] font-semibold text-[#007AFF] dark:bg-[#007AFF]/20 dark:text-[#7ab8ff]">
            {linkedCount}
          </span>
        ) : null}
      </div>
      {collapsible ? (
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-zinc-500 transition-transform duration-200 dark:text-zinc-400 ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden
        />
      ) : null}
    </>
  );

  return (
  <div className={wrapClassName}>
    <div
      className={`${insetCardClass} min-w-0 overflow-hidden shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12),0_2px_12px_-6px_rgba(0,0,0,0.06)] dark:shadow-[0_14px_38px_-12px_rgba(0,0,0,0.5),0_4px_14px_-8px_rgba(0,0,0,0.28)]`}
    >
      <div className="relative min-w-0">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={isOpen}
            className="relative flex w-full items-center justify-between gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 text-left backdrop-blur-[2px] transition-colors hover:bg-white/95 dark:border-white/[0.08] dark:bg-zinc-950/35 dark:hover:bg-zinc-950/50 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4"
          >
            {headerInner}
          </button>
        ) : (
          <div className="relative flex items-center gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 backdrop-blur-[2px] dark:border-white/[0.08] dark:bg-zinc-950/35 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4">
            {headerInner}
          </div>
        )}

        {isOpen ? (
        <div className="space-y-3 border-t border-zinc-200/60 bg-zinc-50/90 px-3 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-4 sm:py-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Tipo de produto
              </label>
              <select
                value={newLabProductKind}
                onChange={(e) => onLabProductKindChange(e.target.value)}
                className={`${inputClass} !h-11 !py-0 text-[13px]`}
              >
                <option value="">Selecione o tipo de produto</option>
                {productKindOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {newLabProductKind === otherProductKindId ? (
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Qual produto?
                </label>
                <input
                  value={newLabProductOther}
                  onChange={(e) => onLabProductOtherChange(e.target.value)}
                  placeholder="Ex.: bomba de direção, atuador…"
                  className={`${inputClass} !h-11 !py-0 text-[13px]`}
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[180px_minmax(0,1fr)_auto]">
            <select
              value={newLabServiceMode}
              onChange={(e) => onLabServiceModeChange(e.target.value === 'manual' ? 'manual' : 'budget')}
              className={`${inputClass} !h-11 !py-0 text-[13px]`}
            >
              <option value="budget">Do orçamento</option>
              <option value="manual">Manual</option>
            </select>
            {newLabServiceMode === 'budget' ? (
              <select
                value={newLabBudgetRef}
                onChange={(e) => onLabBudgetRefChange(e.target.value)}
                className={`${inputClass} !h-11 !py-0 text-[13px]`}
              >
                <option value="">Selecione o serviço do orçamento</option>
                {budgetServiceOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                value={newLabManualLabel}
                onChange={(e) => onLabManualLabelChange(e.target.value)}
                placeholder="Ex.: reparo de módulo ABS"
                className={`${inputClass} !h-11 !py-0 text-[13px]`}
              />
            )}
            <button
              type="button"
              onClick={onCreateLabService}
              disabled={creatingLabService || labServiceLinksSaving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#007AFF] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-55"
            >
              {creatingLabService ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Enviar
            </button>
          </div>

          <div>
            <label
              htmlFor="new-lab-service-details"
              className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
            >
              Detalhes do serviço{' '}
              <span className="font-normal normal-case tracking-normal text-zinc-400 dark:text-zinc-500">
                (opcional)
              </span>
            </label>
            <textarea
              id="new-lab-service-details"
              value={newLabServiceDetails}
              onChange={(e) => onLabServiceDetailsChange(e.target.value)}
              placeholder="Ex.: sintomas, peça avariada, prazo combinado com o cliente..."
              rows={3}
              maxLength={2000}
              disabled={creatingLabService || labServiceLinksSaving}
              className={`${inputClass} min-h-[88px] resize-y text-[13px] leading-relaxed disabled:opacity-55`}
            />
          </div>

          <div className="space-y-2">
            {labServiceLinksDraft.length === 0 ? (
              <p className="rounded-xl border border-dashed border-zinc-300/95 bg-zinc-50/90 p-4 text-[13px] text-zinc-600 dark:border-white/[0.12] dark:bg-white/[0.04] dark:text-zinc-400">
                Nenhum serviço enviado ao laboratório.
              </p>
            ) : (
              labServiceLinksDraft.map((link) => {
                const linkedOrder = labOrdersLookup[link.laboratoryOrderId];
                const statusLabel = linkedOrder ? getStageName(linkedOrder.status) : 'Não localizado';
                const statusStyle = linkedOrder
                  ? getStageStyleClass(linkedOrder.status)
                  : 'bg-zinc-500 text-white border-zinc-600';
                return (
                  <div
                    key={link.id}
                    className="flex flex-col gap-2 rounded-xl border border-zinc-200/70 bg-white/95 p-3 dark:border-white/[0.1] dark:bg-zinc-950/60 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">
                        {link.serviceLabel}
                      </p>
                      {link.serviceDetails?.trim() ? (
                        <p className="mt-1.5 whitespace-pre-wrap text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                          {link.serviceDetails.trim()}
                        </p>
                      ) : null}
                      <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {link.source === 'budget' ? 'Origem: orçamento' : 'Origem: manual'} · OS lab{' '}
                        {link.laboratoryOrderId.slice(0, 8)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusStyle}`}
                      >
                        {statusLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenLaboratoryOrder?.(link.laboratoryOrderId)}
                        className="inline-flex items-center gap-1 rounded-lg border border-[#007AFF]/25 bg-[#007AFF]/10 px-2.5 py-1.5 text-[12px] font-semibold text-[#007AFF]"
                      >
                        Abrir <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveLabServiceLink(link.id)}
                        disabled={labServiceLinksSaving}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-300/70 bg-red-50 px-2.5 py-1.5 text-[12px] font-semibold text-red-700 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-300 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
        ) : null}
      </div>
    </div>
  </div>
  );
};
