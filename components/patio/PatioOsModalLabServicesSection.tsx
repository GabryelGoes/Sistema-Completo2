import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Plus, Loader2, Trash2, ArrowRight, ChevronDown, ChevronRight, X, Check, Pencil, Paperclip } from 'lucide-react';
import type { LabServiceLink } from '../../types';
import type { ServiceOrderDetail } from '../../services/apiService';
import {
  PatioOriginAttachmentsPicker,
  type PatioOriginAttachmentItem,
} from './PatioOriginAttachmentsPicker';
import { uiOsModalCardSectionTitle, uiOsModalSectionAppIcon } from '../ui/appTypography';
import { IosNotificationBadge } from '../ui/IosNotificationBadge';
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
  /** Anexos da OS do pátio para copiar à OS do laboratório. */
  patioAttachments?: PatioOriginAttachmentItem[];
  selectedPatioAttachmentPaths?: string[];
  onSelectedPatioAttachmentPathsChange?: (paths: string[]) => void;
  /** Copia anexos selecionados para uma OS do laboratório já enviada. */
  onCopyPatioAttachmentsToLab?: (laboratoryOrderId: string, paths: string[]) => Promise<boolean | void> | boolean | void;
  copyingPatioAttachments?: boolean;
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
  patioAttachments = [],
  selectedPatioAttachmentPaths = [],
  onSelectedPatioAttachmentPathsChange,
  onCopyPatioAttachmentsToLab,
  copyingPatioAttachments = false,
  collapsible = false,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [manualProductName, setManualProductName] = useState(false);
  const [itemPickerOpen, setItemPickerOpen] = useState(false);
  const [quickServices, setQuickServices] = useState<LabQuickService[]>(() => getLabQuickServices());
  const [quickSendModalOpen, setQuickSendModalOpen] = useState(false);
  const [attachToLabOrderId, setAttachToLabOrderId] = useState<string | null>(null);
  const [attachToLabPaths, setAttachToLabPaths] = useState<string[]>([]);
  /** Arquivos do pátio só abrem ao clicar no botão — não ficam expostos por padrão. */
  const [patioFilesPanelOpen, setPatioFilesPanelOpen] = useState(false);
  const isOpen = !collapsible || expanded;
  const listProductKindOptions = productKindOptions.filter((opt) => opt.value !== otherProductKindId);
  const linkedCount = labServiceLinksDraft.length;
  const busy = creatingLabService || labServiceLinksSaving || quickSendingServiceId != null;
  /** Mais recentes primeiro — ficam logo abaixo do título. */
  const sentLinksNewestFirst = useMemo(() => {
    return [...labServiceLinksDraft].sort((a, b) => {
      const ta = Date.parse(a.createdAt ?? '') || 0;
      const tb = Date.parse(b.createdAt ?? '') || 0;
      if (ta !== tb) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });
  }, [labServiceLinksDraft]);

  const selectedItemLabel = manualProductName
    ? newLabProductOther.trim() || 'Item não está na lista'
    : listProductKindOptions.find((opt) => opt.value === newLabProductKind)?.label ?? '';

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

  useEffect(() => {
    if (newLabProductKind === otherProductKindId) {
      setManualProductName(true);
      return;
    }
    if (!newLabProductKind && !newLabProductOther.trim()) {
      setManualProductName(false);
    }
  }, [newLabProductKind, newLabProductOther, otherProductKindId]);

  const handleSelectListedItem = (value: string) => {
    setManualProductName(false);
    onLabProductKindChange(value);
    onLabProductOtherChange('');
    setItemPickerOpen(false);
  };

  const handleSelectItemNotInList = () => {
    setManualProductName(true);
    onLabProductKindChange(otherProductKindId);
    setItemPickerOpen(false);
  };

  useEffect(() => {
    if (!itemPickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setItemPickerOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [itemPickerOpen]);

  const handleSelectQuickService = (preset: LabQuickService) => {
    if (!onQuickSendService || busy) return;
    onQuickSendService(preset);
  };

  const itemPickerOverlay =
    itemPickerOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            className="fixed inset-0 z-[350] flex items-end justify-center bg-black/50 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[12px] sm:items-center sm:p-6"
            onClick={() => setItemPickerOpen(false)}
            role="presentation"
            data-lab-item-picker=""
          >
            <div
              className={`relative mb-1 flex max-h-[min(70dvh,32rem)] w-full max-w-sm min-h-[16rem] flex-col overflow-hidden rounded-[1.5rem] border-0 bg-white shadow-none dark:bg-zinc-900 sm:mb-0 sm:rounded-[1.75rem]`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="lab-item-picker-title"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setItemPickerOpen(false)}
                className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15"
                aria-label="Fechar lista de itens"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="shrink-0 border-b border-zinc-200/70 px-5 pb-3.5 pt-5 dark:border-white/[0.07]">
                <h2
                  id="lab-item-picker-title"
                  className="pr-10 text-[18px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white"
                >
                  Item a enviar
                </h2>
                <p className="mt-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                  Escolha na lista ou informe um item que não está cadastrado.
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F2F2F7] px-3 py-3 dark:bg-black/25 [-webkit-overflow-scrolling:touch]">
                <ul className="space-y-1.5 pb-1">
                  {listProductKindOptions.map((opt) => {
                    const selected = !manualProductName && newLabProductKind === opt.value;
                    return (
                      <li key={opt.value}>
                        <button
                          type="button"
                          onClick={() => handleSelectListedItem(opt.value)}
                          className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition active:scale-[0.99] ${
                            selected
                              ? 'border-[#007AFF]/45 bg-[#007AFF]/10 shadow-sm dark:border-[#007AFF]/40 dark:bg-[#007AFF]/18'
                              : 'border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-white/[0.1] dark:bg-zinc-950/70 dark:hover:border-white/[0.16]'
                          }`}
                        >
                          <span
                            className={`min-w-0 flex-1 text-[15px] font-semibold leading-snug ${
                              selected ? 'text-[#007AFF] dark:text-[#7ab8ff]' : 'text-zinc-900 dark:text-zinc-100'
                            }`}
                          >
                            {opt.label}
                          </span>
                          {selected ? (
                            <Check className="h-5 w-5 shrink-0 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.5} />
                          ) : (
                            <ChevronRight className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                          )}
                        </button>
                      </li>
                    );
                  })}

                  <li className="pt-1.5">
                    <button
                      type="button"
                      onClick={handleSelectItemNotInList}
                      className={`flex w-full items-center gap-3 rounded-xl border border-dashed px-3.5 py-3 text-left transition active:scale-[0.99] ${
                        manualProductName
                          ? 'border-[#007AFF]/50 bg-[#007AFF]/10 dark:border-[#007AFF]/40 dark:bg-[#007AFF]/18'
                          : 'border-zinc-300/90 bg-white/90 hover:border-zinc-400 dark:border-white/[0.14] dark:bg-zinc-950/50 dark:hover:border-white/[0.22]'
                      }`}
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300">
                        <Pencil className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[15px] font-semibold leading-snug ${
                            manualProductName ? 'text-[#007AFF] dark:text-[#7ab8ff]' : 'text-zinc-900 dark:text-zinc-100'
                          }`}
                        >
                          Item não está na lista
                        </span>
                        <span className="mt-0.5 block text-[12px] text-zinc-500 dark:text-zinc-400">
                          Digitar o nome manualmente
                        </span>
                      </span>
                      {manualProductName ? (
                        <Check className="h-5 w-5 shrink-0 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2.5} />
                      ) : (
                        <ChevronRight className="h-5 w-5 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                      )}
                    </button>
                  </li>
                </ul>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  const headerInner = (
    <>
      <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
        <div className={uiOsModalSectionAppIcon}>
          <img src="/icons/laboratorio-ios.png" alt="" className="h-full w-full object-cover" />
        </div>
        <div className="relative min-w-0">
          <p className={uiOsModalCardSectionTitle}>Serviços Laboratório</p>
          {/* No PC o badge fica só na barra de abas; aqui só tablet/mobile (collapsible). */}
          {collapsible ? (
            <IosNotificationBadge
              count={linkedCount}
              className="-right-4 -top-2"
              ariaLabel={`${linkedCount} peça${linkedCount === 1 ? '' : 's'} no laboratório`}
            />
          ) : null}
        </div>
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
          {/* 1. Serviços já enviados — logo abaixo do título (sem empty state) */}
          {sentLinksNewestFirst.length > 0 ? (
          <div className="space-y-2">
            {sentLinksNewestFirst.map((link) => {
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
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] ${statusStyle}`}
                      >
                        {statusLabel}
                      </span>
                      {onCopyPatioAttachmentsToLab && patioAttachments.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setAttachToLabOrderId(link.laboratoryOrderId);
                            setAttachToLabPaths([]);
                          }}
                          disabled={busy || copyingPatioAttachments}
                          title="Anexar fotos ou documentos desta OS do pátio"
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/90 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-zinc-700 dark:border-white/[0.12] dark:bg-zinc-950/70 dark:text-zinc-200 disabled:opacity-60"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          Anexar da OS
                        </button>
                      ) : null}
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
                        title="Remover vínculo e excluir OS do laboratório"
                        aria-label={`Excluir serviço ${link.serviceLabel} e a OS do laboratório`}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-300/70 bg-red-50 px-2.5 py-1.5 text-[12px] font-semibold text-red-700 dark:border-red-500/35 dark:bg-red-500/10 dark:text-red-300 disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
          ) : null}

          {/* 2+3. Item a enviar + Arquivos do pátio (PC: lado a lado e menores) */}
          <div className="space-y-2">
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Item a enviar
            </label>
            <div
              className={
                !collapsible
                  ? 'flex flex-row items-stretch gap-2'
                  : 'flex flex-col gap-2'
              }
            >
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setItemPickerOpen(true);
                }}
                disabled={busy}
                className={`${inputClass} relative z-[1] !flex min-w-0 flex-1 !cursor-pointer items-center justify-between gap-2 text-left disabled:opacity-55 ${
                  !collapsible
                    ? '!h-9 !rounded-lg !px-2.5 !py-0 text-[12px]'
                    : '!h-11 !py-0 text-[13px]'
                }`}
              >
                <span
                  className={`min-w-0 flex-1 truncate ${
                    selectedItemLabel
                      ? 'font-medium text-zinc-900 dark:text-zinc-100'
                      : 'text-zinc-400 dark:text-zinc-500'
                  }`}
                >
                  {selectedItemLabel || 'Selecione o item'}
                </span>
                <ChevronDown
                  className={`shrink-0 text-zinc-400 dark:text-zinc-500 ${!collapsible ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
                  aria-hidden
                />
              </button>

              {onSelectedPatioAttachmentPathsChange && patioAttachments.length > 0 ? (
                <button
                  type="button"
                  onClick={() => setPatioFilesPanelOpen((v) => !v)}
                  disabled={busy}
                  aria-expanded={patioFilesPanelOpen}
                  className={`inline-flex shrink-0 items-center justify-center gap-1.5 border-0 bg-[#007AFF] font-bold uppercase tracking-[0.05em] text-white transition-[filter] hover:brightness-110 disabled:opacity-55 dark:bg-[#0A84FF] ${
                    !collapsible
                      ? 'h-9 rounded-lg px-2.5 text-[10px]'
                      : 'h-11 w-full rounded-xl px-3 text-[12px]'
                  }`}
                >
                  <Plus className={!collapsible ? 'h-3.5 w-3.5' : 'h-4 w-4'} strokeWidth={2.5} aria-hidden />
                  Arquivos do Pátio
                  {selectedPatioAttachmentPaths.length > 0 ? (
                    <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white">
                      {selectedPatioAttachmentPaths.length}
                    </span>
                  ) : null}
                </button>
              ) : null}
            </div>

            {manualProductName ? (
              <input
                value={newLabProductOther}
                onChange={(e) => onLabProductOtherChange(e.target.value)}
                placeholder="Nome do item"
                className={`${inputClass} !h-11 !py-0 text-[13px]`}
                autoFocus
              />
            ) : null}

            {patioFilesPanelOpen &&
            onSelectedPatioAttachmentPathsChange &&
            patioAttachments.length > 0 ? (
              <div className="rounded-xl border border-zinc-200/80 bg-white/95 p-3 dark:border-white/[0.1] dark:bg-zinc-950/60">
                <PatioOriginAttachmentsPicker
                  attachments={patioAttachments}
                  selectedPaths={selectedPatioAttachmentPaths}
                  onChange={onSelectedPatioAttachmentPathsChange}
                  disabled={busy}
                />
              </div>
            ) : null}
          </div>

          {/* 4. Serviço (orçamento / manual) + Enviar */}
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
                placeholder="Descrição do serviço"
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

          {/* 5. Detalhes */}
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
              placeholder="Observações"
              rows={3}
              maxLength={2000}
              disabled={busy}
              className={`${inputClass} min-h-[88px] resize-y text-[13px] leading-relaxed disabled:opacity-55`}
            />
          </div>

          {/* 6. Envios rápidos → abre modal com lista */}
          {onQuickSendService && quickServices.length > 0 ? (
            <button
              type="button"
              onClick={() => setQuickSendModalOpen(true)}
              disabled={busy}
              className="group flex w-full items-center gap-3 rounded-xl border-0 bg-white px-3.5 py-3 text-left shadow-none transition-colors hover:bg-zinc-50 dark:bg-zinc-950/55 dark:hover:bg-zinc-900 disabled:opacity-55"
            >
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[0.65rem]">
                <img src="/icons/envio-rapido-ios.png" alt="" className="h-full w-full object-cover" />
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
        </div>
        ) : null}
      </div>
    </div>

    {itemPickerOverlay}

    {quickSendModalOpen && onQuickSendService ? (
      <ModalPortal manageBackLayer={false}>
        <div
          className="fixed inset-0 z-[350] flex items-center justify-center bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[20px] sm:p-6"
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
                <span className="h-11 w-11 shrink-0 overflow-hidden rounded-[0.7rem]">
                  <img src="/icons/envio-rapido-ios.png" alt="" className="h-full w-full object-cover" />
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

    {attachToLabOrderId && onCopyPatioAttachmentsToLab ? (
      <ModalPortal manageBackLayer={false}>
        <div
          className="fixed inset-0 z-[350] flex items-center justify-center bg-black/45 p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-[20px] sm:p-6"
          onClick={() => !copyingPatioAttachments && setAttachToLabOrderId(null)}
          role="presentation"
        >
          <div
            className={`relative flex max-h-[min(88dvh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-lg min-h-0 flex-col overflow-hidden ${iosModalShell}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-attach-patio-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setAttachToLabOrderId(null)}
              className={iosModalClose}
              aria-label="Fechar anexos da OS do pátio"
              disabled={copyingPatioAttachments}
            >
              <X className="h-5 w-5" />
            </button>
            <div className="shrink-0 border-b border-zinc-200/70 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
              <h2
                id="lab-attach-patio-title"
                className="pr-10 text-[22px] font-semibold leading-tight tracking-tight text-zinc-900 dark:text-white"
              >
                Anexar da OS do pátio
              </h2>
              <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                Selecione fotos ou documentos desta OS para copiar ao produto no laboratório.
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[#F2F2F7] px-4 py-4 dark:bg-black/25 custom-scrollbar sm:px-6">
              <PatioOriginAttachmentsPicker
                attachments={patioAttachments}
                selectedPaths={attachToLabPaths}
                onChange={setAttachToLabPaths}
                disabled={copyingPatioAttachments}
              />
            </div>
            <div className="shrink-0 border-t border-zinc-200/70 bg-white px-4 py-3 dark:border-white/[0.07] dark:bg-zinc-900 sm:px-6">
              <button
                type="button"
                disabled={copyingPatioAttachments || attachToLabPaths.length === 0}
                onClick={async () => {
                  const ok = await onCopyPatioAttachmentsToLab(attachToLabOrderId, attachToLabPaths);
                  if (ok !== false) {
                    setAttachToLabOrderId(null);
                    setAttachToLabPaths([]);
                  }
                }}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#007AFF] px-3 py-2.5 text-[14px] font-semibold text-white disabled:opacity-55"
              >
                {copyingPatioAttachments ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
                Copiar {attachToLabPaths.length > 0 ? `${attachToLabPaths.length} ` : ''}anexo{attachToLabPaths.length === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      </ModalPortal>
    ) : null}
  </div>
  );
};
