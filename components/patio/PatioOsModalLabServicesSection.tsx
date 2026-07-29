import React, { useState, useEffect, useCallback } from 'react';
import { Wrench, Plus, Loader2, Trash2, ArrowRight, ChevronDown, ChevronRight, X, Zap } from 'lucide-react';
import type { LabServiceLink } from '../../types';
import type { ServiceOrderDetail } from '../../services/apiService';
import { uiOsModalCardSectionTitle, uiOsModalSectionIconWrap } from '../ui/appTypography';
import { ModalPortal } from '../ui/ModalPortal';
import { iosModalClose, iosModalShell } from '../ui/iosModalStyles';
import {
  getLabQuickServices,
  LAB_QUICK_SERVICE_COLOR_CLASSES,
  LAB_QUICK_SERVICES_CHANGED_EVENT,
  type LabQuickService,
} from '../../utils/labQuickServices';

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
  /** Envio rápido com rótulo de um preset configurado. */
  onQuickSendService?: (preset: LabQuickService) => void;
  quickSendingServiceId?: string | null;
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
  onQuickSendService,
  quickSendingServiceId = null,
  collapsible = false,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [manualProductName, setManualProductName] = useState(false);
  const [quickServices, setQuickServices] = useState<LabQuickService[]>(() => getLabQuickServices());
  const [quickSendModalOpen, setQuickSendModalOpen] = useState(false);
  const isOpen = !collapsible || expanded;
  const listProductKindOptions = productKindOptions.filter((opt) => opt.value !== otherProductKindId);
  const linkedCount = labServiceLinksDraft.length;
  const busy = creatingLabService || labServiceLinksSaving || quickSendingServiceId != null;

  const reloadQuickServices = useCallback(() => {
    setQuickServices(getLabQuickServices());
  }, []);

  useEffect(() => {
    reloadQuickServices();
    const onChange = () => reloadQuickServices();
    window.addEventListener(LAB_QUICK_SERVICES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LAB_QUICK_SERVICES_CHANGED_EVENT, onChange);
  }, [reloadQuickServices]);

  const quickSendingPrevRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = quickSendingPrevRef.current;
    quickSendingPrevRef.current = quickSendingServiceId;
    // Fecha o modal só quando o envio rápido termina (loading → idle).
    if (prev != null && quickSendingServiceId == null) {
      setQuickSendModalOpen(false);
    }
  }, [quickSendingServiceId]);

  const toggleManualProductName = (checked: boolean) => {
    setManualProductName(checked);
    if (checked) {
      onLabProductKindChange(otherProductKindId);
    } else {
      onLabProductKindChange('');
      onLabProductOtherChange('');
    }
  };

  useEffect(() => {
    if (!newLabProductKind && !newLabProductOther.trim()) {
      setManualProductName(false);
    }
  }, [newLabProductKind, newLabProductOther]);

  const handleSelectQuickService = (preset: LabQuickService) => {
    if (!onQuickSendService || busy) return;
    onQuickSendService(preset);
  };

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
          {/* 1. Item a enviar (antes: tipo de produto) */}
          <div className="space-y-2">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-2.5 dark:border-white/[0.1] dark:bg-zinc-950/50">
              <input
                type="checkbox"
                checked={manualProductName}
                onChange={(e) => toggleManualProductName(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-zinc-300 text-[#007AFF] focus:ring-[#007AFF]/40"
              />
              <span className="text-[13px] leading-snug text-zinc-700 dark:text-zinc-200">
                <span className="font-semibold">Item não está na lista</span>
                <span className="block text-[12px] font-normal text-zinc-500 dark:text-zinc-400">
                  Marque para digitar o nome do item manualmente.
                </span>
              </span>
            </label>

            {manualProductName ? (
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Item a enviar
                </label>
                <input
                  value={newLabProductOther}
                  onChange={(e) => onLabProductOtherChange(e.target.value)}
                  placeholder="Ex.: bomba de direção, atuador, válvula solenoide…"
                  className={`${inputClass} !h-11 !py-0 text-[13px]`}
                />
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Item a enviar
                </label>
                <select
                  value={newLabProductKind}
                  onChange={(e) => {
                    const next = e.target.value;
                    onLabProductKindChange(next);
                    if (next !== otherProductKindId) onLabProductOtherChange('');
                  }}
                  className={`${inputClass} !h-11 !py-0 text-[13px]`}
                >
                  <option value="">Selecione o item</option>
                  {listProductKindOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* 2. Serviço (orçamento / manual) + Enviar */}
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
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#007AFF] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-55"
            >
              {creatingLabService ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Enviar
            </button>
          </div>

          {/* 3. Detalhes */}
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
              disabled={busy}
              className={`${inputClass} min-h-[88px] resize-y text-[13px] leading-relaxed disabled:opacity-55`}
            />
          </div>

          {/* 4. Envios rápidos → abre modal com lista */}
          {onQuickSendService && quickServices.length > 0 ? (
            <button
              type="button"
              onClick={() => setQuickSendModalOpen(true)}
              disabled={busy}
              className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200/90 bg-white px-3.5 py-3 text-left shadow-[0_4px_18px_-10px_rgba(0,0,0,0.12)] transition-colors hover:border-[#007AFF]/35 dark:border-white/[0.1] dark:bg-zinc-950/55 dark:hover:border-[#007AFF]/40 disabled:opacity-55"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/12 text-[#007AFF] dark:bg-[#007AFF]/22 dark:text-[#7ab8ff]">
                <Zap className="h-5 w-5" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold text-zinc-900 dark:text-white">
                  Envios rápidos
                </span>
                <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                  {quickServices.length} {quickServices.length === 1 ? 'serviço' : 'serviços'} · selecione o item antes
                </span>
              </span>
              <ChevronRight
                className="h-5 w-5 shrink-0 text-zinc-400 transition-transform group-hover:translate-x-0.5 group-hover:text-[#007AFF] dark:text-zinc-500"
                strokeWidth={2.25}
                aria-hidden
              />
            </button>
          ) : null}

          {/* 5. Serviços já enviados */}
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

    {quickSendModalOpen && onQuickSendService ? (
      <ModalPortal>
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[20px] sm:p-6"
          onClick={() => !busy && setQuickSendModalOpen(false)}
          role="presentation"
        >
          <div
            className={`relative flex max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-md min-h-0 flex-col overflow-hidden ${iosModalShell}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-quick-send-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setQuickSendModalOpen(false)}
              className={iosModalClose}
              aria-label="Fechar envios rápidos"
              disabled={busy}
            >
              <X className="h-5 w-5" />
            </button>

            <div className="shrink-0 border-b border-zinc-200/70 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
              <div className="flex items-start gap-3 pr-10">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/12 text-[#007AFF] dark:bg-[#007AFF]/22 dark:text-[#7ab8ff]">
                  <Zap className="h-5 w-5" strokeWidth={2.25} aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h2
                    id="lab-quick-send-title"
                    className="text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white"
                  >
                    Envios rápidos
                  </h2>
                  <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                    Toque em um serviço da lista para enviar ao laboratório.
                  </p>
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F2F2F7] px-4 py-4 dark:bg-black/25 custom-scrollbar sm:px-6">
              {quickServices.length === 0 ? (
                <p className="rounded-xl border border-dashed border-zinc-300/90 bg-white/80 p-4 text-center text-[13px] text-zinc-500 dark:border-white/[0.12] dark:bg-zinc-900/50 dark:text-zinc-400">
                  Nenhum envio rápido configurado.
                </p>
              ) : (
                <ul className="space-y-2">
                  {quickServices.map((preset) => {
                    const color = LAB_QUICK_SERVICE_COLOR_CLASSES[preset.color];
                    const isLoading = quickSendingServiceId === preset.id;
                    return (
                      <li key={preset.id}>
                        <button
                          type="button"
                          onClick={() => handleSelectQuickService(preset)}
                          disabled={busy && !isLoading}
                          className={`flex w-full items-center gap-3 rounded-xl border-2 px-3.5 py-3.5 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-55 ${color.btn} ${color.btnHover}`}
                        >
                          <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug">
                            {preset.label}
                          </span>
                          {isLoading ? (
                            <Loader2 className="h-5 w-5 shrink-0 animate-spin opacity-90" />
                          ) : (
                            <ChevronRight className="h-5 w-5 shrink-0 opacity-80" aria-hidden />
                          )}
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
    ) : null}
  </div>
  );
};
