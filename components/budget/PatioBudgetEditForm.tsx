import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Loader2,
  Minus,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type { WorkshopPart, WorkshopService } from '../../services/apiService';
import {
  buildWorkshopPartNameIndex,
  resolveBudgetPartStockFlags,
  type BudgetPartFields,
} from '../../utils/budgetPartStock';
import { formatLaborLabel } from '../../utils/workshopLaborFormat';
import { moveItemInList } from '../../utils/moveItemInList';
import { ModalPortal } from '../ui/ModalPortal';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { BudgetLinePositionControl } from './BudgetLinePositionControl';
import { BudgetPartStockBadge } from '../ui/BudgetPartStockBadge';
import { BudgetPartSuggestionDropdown } from './BudgetPartSuggestionDropdown';
import { BudgetServiceSuggestionDropdown } from './BudgetServiceSuggestionDropdown';
import { WorkshopPartQuickViewModal } from './WorkshopPartQuickViewModal';

export type PatioBudgetServiceDraft = {
  id: string;
  description: string;
  laborHours: number | null;
};

export type PatioBudgetPartDraft = {
  id: string;
  description: string;
  quantity: string;
  fromStock?: boolean;
  workshopPartId?: string;
};

export type PatioBudgetEditDraft = {
  diagnosis: string;
  services: PatioBudgetServiceDraft[];
  parts: PatioBudgetPartDraft[];
  observations: string;
};

export type PatioBudgetEditFormProps = {
  exiting?: boolean;
  isPatioPcModal: boolean;
  blurPlates: boolean;
  cardName: string;
  vehicleBrand?: string | null;
  vehicleColor?: string | null;
  isEditing: boolean;
  initialDiagnosis: string;
  initialServices: PatioBudgetServiceDraft[];
  initialParts: PatioBudgetPartDraft[];
  initialObservations: string;
  workshopServices: WorkshopService[];
  workshopParts: WorkshopPart[];
  sending: boolean;
  onClose: () => void;
  onSave: (draft: PatioBudgetEditDraft) => void | Promise<void>;
  backdropAnimClass: string;
};

const budgetModalCanvasBg = 'bg-[#f8fcfe]';
const budgetModalPaperInset =
  'rounded-[16px] border border-sky-200/80 bg-white ' +
  'shadow-[0_6px_22px_-10px_rgba(14,116,144,0.18),0_2px_12px_-4px_rgba(15,23,42,0.08),0_1px_3px_rgba(14,116,144,0.06),inset_0_1px_0_rgba(255,255,255,1)]';
const budgetModalFieldLabel =
  'block text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700/85 mb-2';
const budgetModalInput =
  'w-full rounded-xl border border-sky-200/80 bg-white px-4 py-3 text-[15px] text-slate-800 shadow-sm placeholder:text-sky-400/80 transition-[box-shadow,border-color] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-300/35';
const budgetModalPaperShell =
  'border-0 ' + budgetModalCanvasBg + ' text-slate-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)]';
const budgetModalPaperFooter = 'border-t border-sky-200 ' + budgetModalCanvasBg;
const budgetModalCreateBudgetButton =
  'rounded-xl border border-sky-600/35 bg-sky-600 text-[15px] font-semibold text-white shadow-md transition-[transform,background-color,border-color,opacity] hover:bg-sky-700 hover:border-sky-700/50 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50';

const BUDGET_SERVICE_TEXTAREA_MIN_PX = 52;

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function BudgetServiceDescriptionTextarea({
  value,
  onChange,
  onFocus,
  onBlur,
  onEnterAdd,
  inputClassName,
  autoFocus,
  dataBudgetServiceId,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onEnterAdd?: () => void;
  inputClassName: string;
  autoFocus?: boolean;
  dataBudgetServiceId?: string;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const syncHeight = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(BUDGET_SERVICE_TEXTAREA_MIN_PX, el.scrollHeight + 2)}px`;
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, syncHeight]);

  useLayoutEffect(() => {
    if (!autoFocus) return;
    taRef.current?.focus();
  }, [autoFocus]);

  return (
    <textarea
      ref={taRef}
      rows={1}
      spellCheck={false}
      data-budget-service-id={dataBudgetServiceId}
      placeholder="Serviço"
      className={`${inputClassName} shadow-none block min-h-[52px] w-full min-w-0 resize-none overflow-hidden break-words leading-snug [overflow-wrap:anywhere] [scrollbar-width:none] [&::-webkit-scrollbar]:w-0 [&::-webkit-scrollbar]:bg-transparent`}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        requestAnimationFrame(syncHeight);
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
        if (!onEnterAdd) return;
        e.preventDefault();
        onEnterAdd();
      }}
    />
  );
}

/**
 * Formulário de criar/editar orçamento com estado próprio.
 * Isola a digitação do PatioView (quadro + modal do veículo) para não travar no PC.
 */
export function PatioBudgetEditForm({
  exiting = false,
  isPatioPcModal,
  blurPlates,
  cardName,
  vehicleBrand,
  vehicleColor,
  isEditing,
  initialDiagnosis,
  initialServices,
  initialParts,
  initialObservations,
  workshopServices,
  workshopParts,
  sending,
  onClose,
  onSave,
  backdropAnimClass,
}: PatioBudgetEditFormProps) {
  const [budgetDiagnosis, setBudgetDiagnosis] = useState(initialDiagnosis);
  const [budgetServices, setBudgetServices] = useState(initialServices);
  const [budgetParts, setBudgetParts] = useState(initialParts);
  const [budgetObservations, setBudgetObservations] = useState(initialObservations);

  const [isServiceListOpen, setIsServiceListOpen] = useState(false);
  const [suggestionsForServiceId, setSuggestionsForServiceId] = useState<string | null>(null);
  const [suggestionsForPartId, setSuggestionsForPartId] = useState<string | null>(null);
  const [suggestionBoxPosition, setSuggestionBoxPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [partSuggestionBoxPosition, setPartSuggestionBoxPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [budgetPartQuickView, setBudgetPartQuickView] = useState<WorkshopPart | null>(null);
  const [focusServiceId, setFocusServiceId] = useState<string | null>(null);
  const [focusPartId, setFocusPartId] = useState<string | null>(null);

  const focusedServiceInputRef = useRef<HTMLDivElement | null>(null);
  const focusedPartInputRef = useRef<HTMLDivElement | null>(null);
  const suggestionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partSuggestionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const budgetServicesAddRef = useRef<HTMLButtonElement>(null);
  const budgetPartsAddRef = useRef<HTMLButtonElement>(null);
  const scrollBudgetServicesAddRef = useRef(false);
  const scrollBudgetPartsAddRef = useRef(false);
  const pendingFocusServiceIdRef = useRef<string | null>(null);
  const pendingFocusPartIdRef = useRef<string | null>(null);
  const stockFlagsResolvedRef = useRef(false);

  const workshopPartsNameIndex = useMemo(
    () => buildWorkshopPartNameIndex(workshopParts),
    [workshopParts]
  );

  const workshopServicesSearchIndex = useMemo(
    () => workshopServices.map((s) => ({ service: s, key: normalizeText(s.name) })),
    [workshopServices]
  );

  const workshopServicesExactMap = useMemo(() => {
    const map = new Map<string, WorkshopService>();
    for (const s of workshopServices) {
      const key = s.name.trim();
      if (key && !map.has(key)) map.set(key, s);
    }
    return map;
  }, [workshopServices]);

  const workshopPartsSearchIndex = useMemo(
    () => workshopParts.map((p) => ({ part: p, key: normalizeText(p.name) })),
    [workshopParts]
  );

  // Quando o catálogo chega depois de abrir o modal, resolve flags de estoque uma vez.
  useEffect(() => {
    if (stockFlagsResolvedRef.current || workshopParts.length === 0) return;
    stockFlagsResolvedRef.current = true;
    setBudgetParts((prev) =>
      prev.map((p) => {
        if (!p.description.trim()) return p;
        const flags = resolveBudgetPartStockFlags(
          p.description,
          workshopParts,
          p,
          workshopPartsNameIndex
        );
        return { ...p, ...flags };
      })
    );
  }, [workshopParts, workshopPartsNameIndex]);

  const addServiceRow = () => {
    const newId = Date.now().toString();
    scrollBudgetServicesAddRef.current = true;
    pendingFocusServiceIdRef.current = newId;
    setSuggestionsForServiceId(null);
    setBudgetServices((prev) => [...prev, { id: newId, description: '', laborHours: null }]);
  };

  const addPartRow = () => {
    const newId = String(Date.now() + 1);
    scrollBudgetPartsAddRef.current = true;
    pendingFocusPartIdRef.current = newId;
    setSuggestionsForPartId(null);
    setBudgetParts((prev) => [...prev, { id: newId, description: '', quantity: '1' }]);
  };

  const removeServiceRow = (id: string) => {
    setBudgetServices((prev) => prev.filter((i) => i.id !== id));
  };

  const removePartRow = (id: string) => {
    setBudgetParts((prev) => prev.filter((i) => i.id !== id));
  };

  const moveServiceRowToIndex = (id: string, toIndex: number) => {
    setBudgetServices((prev) => {
      const from = prev.findIndex((item) => item.id === id);
      if (from < 0) return prev;
      return moveItemInList(prev, from, toIndex);
    });
  };

  const movePartRowToIndex = (id: string, toIndex: number) => {
    setBudgetParts((prev) => {
      const from = prev.findIndex((item) => item.id === id);
      if (from < 0) return prev;
      return moveItemInList(prev, from, toIndex);
    });
  };

  const updateServiceDescription = (id: string, value: string) => {
    setBudgetServices((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const match = workshopServicesExactMap.get(value.trim());
        return {
          ...item,
          description: value,
          laborHours: match ? (match.labor_hours ?? null) : null,
        };
      })
    );
  };

  /** Só atualiza o texto na digitação; flags de estoque no blur / sugestão. */
  const updatePartDescription = (id: string, value: string) => {
    setBudgetParts((prev) =>
      prev.map((item) => (item.id === id ? { ...item, description: value } : item))
    );
  };

  const resolvePartStockOnBlur = (id: string) => {
    setBudgetParts((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const flags = resolveBudgetPartStockFlags(
          item.description,
          workshopParts,
          item,
          workshopPartsNameIndex
        );
        if (flags.fromStock === item.fromStock && flags.workshopPartId === item.workshopPartId) {
          return item;
        }
        return { ...item, ...flags };
      })
    );
  };

  const updatePartQuantity = (id: string, delta: number) => {
    setBudgetParts((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentQty = parseInt(item.quantity, 10) || 0;
        return { ...item, quantity: String(Math.max(1, currentQty + delta)) };
      })
    );
  };

  const addServiceFromList = (svc: WorkshopService) => {
    scrollBudgetServicesAddRef.current = true;
    setBudgetServices((prev) => [
      ...prev,
      { id: Date.now().toString(), description: svc.name, laborHours: svc.labor_hours ?? null },
    ]);
    setIsServiceListOpen(false);
  };

  const getServiceSuggestions = (description: string) => {
    const q = normalizeText(description.trim());
    if (!q) return [];
    const out: WorkshopService[] = [];
    for (const entry of workshopServicesSearchIndex) {
      if (entry.key.includes(q)) {
        out.push(entry.service);
        if (out.length >= 12) break;
      }
    }
    return out;
  };

  const getPartSuggestions = (description: string) => {
    const q = normalizeText(description.trim());
    if (!q) return [];
    const out: WorkshopPart[] = [];
    for (const entry of workshopPartsSearchIndex) {
      if (entry.key.includes(q)) {
        out.push(entry.part);
        if (out.length >= 12) break;
      }
    }
    return out;
  };

  const focusedServiceDescription = suggestionsForServiceId
    ? budgetServices.find((s) => s.id === suggestionsForServiceId)?.description
    : undefined;

  useEffect(() => {
    const update = () => {
      if (suggestionsForServiceId && focusedServiceInputRef.current) {
        const rect = focusedServiceInputRef.current.getBoundingClientRect();
        const next = { top: rect.bottom + 4, left: rect.left, width: rect.width };
        setSuggestionBoxPosition((prev) =>
          prev && prev.top === next.top && prev.left === next.left && prev.width === next.width
            ? prev
            : next
        );
      } else {
        setSuggestionBoxPosition(null);
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [suggestionsForServiceId]);

  useLayoutEffect(() => {
    if (!suggestionsForServiceId || !focusedServiceInputRef.current) return;
    const rect = focusedServiceInputRef.current.getBoundingClientRect();
    const next = { top: rect.bottom + 4, left: rect.left, width: rect.width };
    setSuggestionBoxPosition((prev) =>
      prev && prev.top === next.top && prev.left === next.left && prev.width === next.width
        ? prev
        : next
    );
  }, [suggestionsForServiceId, focusedServiceDescription]);

  useEffect(() => {
    const update = () => {
      if (suggestionsForPartId && focusedPartInputRef.current) {
        const rect = focusedPartInputRef.current.getBoundingClientRect();
        const next = { top: rect.bottom + 4, left: rect.left, width: rect.width };
        setPartSuggestionBoxPosition((prev) =>
          prev && prev.top === next.top && prev.left === next.left && prev.width === next.width
            ? prev
            : next
        );
      } else {
        setPartSuggestionBoxPosition(null);
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [suggestionsForPartId]);

  useEffect(() => {
    if (!scrollBudgetServicesAddRef.current) return;
    scrollBudgetServicesAddRef.current = false;
    requestAnimationFrame(() => {
      budgetServicesAddRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [budgetServices.length]);

  useEffect(() => {
    if (!scrollBudgetPartsAddRef.current) return;
    scrollBudgetPartsAddRef.current = false;
    requestAnimationFrame(() => {
      budgetPartsAddRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, [budgetParts.length]);

  useEffect(() => {
    const focusId = pendingFocusServiceIdRef.current;
    if (!focusId) return;
    if (!budgetServices.some((s) => s.id === focusId)) return;
    pendingFocusServiceIdRef.current = null;
    setFocusServiceId(focusId);
  }, [budgetServices.length]);

  useEffect(() => {
    const focusId = pendingFocusPartIdRef.current;
    if (!focusId) return;
    if (!budgetParts.some((p) => p.id === focusId)) return;
    pendingFocusPartIdRef.current = null;
    setFocusPartId(focusId);
  }, [budgetParts.length]);

  useLayoutEffect(() => {
    if (!focusPartId) return;
    const el = document.querySelector(
      `[data-budget-part-id="${focusPartId}"]`
    ) as HTMLInputElement | null;
    el?.focus();
  }, [focusPartId]);

  useEffect(() => {
    if (!focusServiceId) return;
    const timer = window.setTimeout(() => setFocusServiceId(null), 400);
    return () => window.clearTimeout(timer);
  }, [focusServiceId]);

  useEffect(() => {
    if (!focusPartId) return;
    const timer = window.setTimeout(() => setFocusPartId(null), 400);
    return () => window.clearTimeout(timer);
  }, [focusPartId]);

  useEffect(() => {
    return () => {
      if (suggestionCloseTimerRef.current) clearTimeout(suggestionCloseTimerRef.current);
      if (partSuggestionCloseTimerRef.current) clearTimeout(partSuggestionCloseTimerRef.current);
    };
  }, []);

  const keepServiceSuggestionsOpen = () => {
    if (suggestionCloseTimerRef.current) {
      clearTimeout(suggestionCloseTimerRef.current);
      suggestionCloseTimerRef.current = null;
    }
  };

  const keepPartSuggestionsOpen = () => {
    if (partSuggestionCloseTimerRef.current) {
      clearTimeout(partSuggestionCloseTimerRef.current);
      partSuggestionCloseTimerRef.current = null;
    }
  };

  const handleServiceInputFocus = (id: string) => {
    keepServiceSuggestionsOpen();
    setSuggestionsForServiceId(id);
  };

  const handleServiceInputBlur = () => {
    suggestionCloseTimerRef.current = setTimeout(() => setSuggestionsForServiceId(null), 280);
  };

  const handlePartInputFocus = (id: string) => {
    keepPartSuggestionsOpen();
    setSuggestionsForPartId(id);
  };

  const handlePartInputBlur = (id: string) => {
    resolvePartStockOnBlur(id);
    partSuggestionCloseTimerRef.current = setTimeout(() => setSuggestionsForPartId(null), 280);
  };

  const applySuggestion = (itemId: string, svc: WorkshopService) => {
    setBudgetServices((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, description: svc.name, laborHours: svc.labor_hours ?? null }
          : item
      )
    );
    setSuggestionsForServiceId(null);
  };

  const applyPartSuggestion = (itemId: string, part: WorkshopPart) => {
    setBudgetParts((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? {
              ...item,
              description: part.name,
              fromStock: true,
              workshopPartId: part.id,
            }
          : item
      )
    );
    setSuggestionsForPartId(null);
  };

  const budgetPartQuickViewCatalogNumber = useMemo(() => {
    if (!budgetPartQuickView) return undefined;
    const idx = workshopParts.findIndex((p) => p.id === budgetPartQuickView.id);
    return idx >= 0 ? idx + 1 : undefined;
  }, [budgetPartQuickView, workshopParts]);

  const handleSave = () => {
    void onSave({
      diagnosis: budgetDiagnosis,
      services: budgetServices,
      parts: budgetParts,
      observations: budgetObservations,
    });
  };

  const brand = (vehicleBrand ?? '').trim();
  const color = (vehicleColor ?? '').trim();

  return (
    <ModalPortal>
      <div
        className={`budget-modal-light-chrome fixed inset-0 z-[200] flex h-[100dvh] max-h-[100dvh] w-full min-w-0 flex-col ${!isPatioPcModal ? 'budget-modal--compact overflow-y-hidden' : 'overflow-hidden'} ${budgetModalPaperShell} ${backdropAnimClass}`}
        style={{ colorScheme: 'light' }}
      >
        <div
          className={`relative z-[1] flex min-h-0 flex-1 flex-col ${exiting ? 'animate-modal-sheet-out pointer-events-none' : ''}`}
        >
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-[max(0.5rem,env(safe-area-inset-top))] z-20 flex h-9 w-9 items-center justify-center rounded-full bg-sky-900/10 text-sky-900 transition-colors hover:bg-sky-200/90 hover:text-sky-950 sm:right-4 sm:h-10 sm:w-10"
            aria-label="Fechar orçamento"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="budget-modal-compact-header shrink-0 border-b border-zinc-200/80 bg-zinc-200 px-6 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-8 sm:pt-8">
            <div className="flex items-start gap-3 pr-10">
              <IosAccentIconSquircle variant="modal" strokeWidth={2.2} lightChrome>
                <img src="/icons/novo-orcamento-ios.png" alt="" className="h-full w-full object-cover" />
              </IosAccentIconSquircle>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700/90">
                  Orçamento
                </p>
                <h2
                  className={`font-semibold leading-tight tracking-tight text-slate-900 ${!isPatioPcModal ? 'text-[18px]' : 'text-[22px] sm:text-[26px]'}`}
                >
                  {isEditing ? 'Editar orçamento' : 'Novo orçamento'}
                </h2>
                <p
                  className={`mt-1 flex flex-wrap items-center gap-1.5 text-sky-900/75 ${!isPatioPcModal ? 'text-[12px]' : 'text-[13px]'}`}
                >
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-sky-500" strokeWidth={2} />
                  <span className="min-w-0 break-words">
                    {brand ? (
                      <span className="text-sky-800/80">
                        {brand}
                        {' · '}
                      </span>
                    ) : null}
                    {color ? (
                      <span className="text-sky-800/80">
                        {color}
                        {' · '}
                      </span>
                    ) : null}
                    {blurPlates ? (
                      (() => {
                        const p = cardName.split(' - ');
                        return p.length >= 3 ? (
                          <>
                            {p[0]} <span className="blur-plate">{p[1]}</span> {p.slice(2).join(' - ')}
                          </>
                        ) : (
                          cardName
                        );
                      })()
                    ) : (
                      cardName
                    )}
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div
            className={`budget-modal-compact-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 text-slate-800 custom-scrollbar sm:px-8 ${budgetModalCanvasBg}`}
          >
            <div className={`budget-modal-compact-stack ${!isPatioPcModal ? 'space-y-3' : 'space-y-5'}`}>
              <div>
                <p className={budgetModalFieldLabel}>Descrição do diagnóstico</p>
                <div className={`${budgetModalPaperInset} overflow-hidden p-0`}>
                  <textarea
                    className={`${budgetModalInput} min-h-[120px] resize-y border-0 py-3.5 text-[15px] leading-relaxed shadow-none focus:ring-2`}
                    placeholder="Diagnóstico"
                    value={budgetDiagnosis}
                    onChange={(e) => setBudgetDiagnosis(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <p className={`${budgetModalFieldLabel} mb-0`}>Serviços</p>
                  {workshopServices.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsServiceListOpen(true)}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-sky-200/80 bg-white px-3 py-2 text-[13px] font-semibold text-slate-800 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50"
                    >
                      Inserir da lista
                      <ChevronDown className="h-4 w-4 opacity-80" />
                    </button>
                  )}
                </div>
                <div className={`${budgetModalPaperInset} p-3.5 sm:p-4`}>
                  <div className="space-y-2.5">
                    {budgetServices.map((item, serviceIndex) => {
                      const isFocused = suggestionsForServiceId === item.id;
                      return (
                        <div key={item.id} className="relative">
                          <div className="flex items-start gap-2 sm:gap-3">
                            <BudgetLinePositionControl
                              position={serviceIndex + 1}
                              total={budgetServices.length}
                              onMoveTo={(toIndex) => moveServiceRowToIndex(item.id, toIndex)}
                              ariaLabelPrefix="Serviço"
                            />
                            <div
                              className="min-w-0 flex-1 space-y-1"
                              ref={
                                isFocused
                                  ? (node: HTMLDivElement | null) => {
                                      focusedServiceInputRef.current = node;
                                    }
                                  : undefined
                              }
                            >
                              <BudgetServiceDescriptionTextarea
                                value={item.description}
                                onChange={(v) => updateServiceDescription(item.id, v)}
                                onFocus={() => handleServiceInputFocus(item.id)}
                                onBlur={handleServiceInputBlur}
                                onEnterAdd={addServiceRow}
                                autoFocus={focusServiceId === item.id}
                                dataBudgetServiceId={item.id}
                                inputClassName={budgetModalInput}
                              />
                              {item.laborHours != null && Number.isFinite(Number(item.laborHours)) ? (
                                <p className="text-[12px] font-semibold tabular-nums text-sky-700/75">
                                  Duração: {formatLaborLabel(Number(item.laborHours))}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeServiceRow(item.id)}
                              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-red-200/60 bg-red-50/40 text-red-500/85 transition-colors hover:border-red-400 hover:bg-red-100/80 hover:text-red-600"
                              aria-label="Remover serviço"
                            >
                              <Trash2 className="h-5 w-5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                    <button
                      ref={budgetServicesAddRef}
                      type="button"
                      onClick={addServiceRow}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-sky-300/90 bg-sky-50/50 px-3 py-2.5 text-[13px] font-semibold text-sky-800/90 transition-colors hover:border-sky-400 hover:bg-sky-50 hover:text-sky-950"
                    >
                      <Plus className="h-4 w-4" strokeWidth={2.2} />
                      Adicionar
                    </button>
                  </div>
                </div>
              </div>

              {isServiceListOpen && (
                <div
                  className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm"
                  onClick={() => setIsServiceListOpen(false)}
                >
                  <div
                    className={`flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-[1.5rem] border border-sky-200 text-slate-800 shadow-xl ${budgetModalCanvasBg}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center justify-between border-b border-sky-200 px-5 py-4">
                      <span className="text-[17px] font-semibold tracking-tight text-slate-900">
                        Serviços cadastrados
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsServiceListOpen(false)}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-200 text-sky-900 transition-colors hover:bg-sky-300"
                        aria-label="Fechar"
                      >
                        <X className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
                      {workshopServices.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => addServiceFromList(s)}
                          className="flex w-full items-start justify-between gap-3 border-b border-sky-200/60 px-5 py-3.5 text-left text-[15px] text-slate-800 transition-colors last:border-0 hover:bg-sky-100"
                        >
                          <span className="min-w-0 flex-1 leading-snug">{s.name}</span>
                          {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-sky-800/75">
                              {formatLaborLabel(Number(s.labor_hours))}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <BudgetServiceSuggestionDropdown
                open={!!suggestionsForServiceId}
                position={suggestionBoxPosition}
                suggestions={
                  suggestionsForServiceId
                    ? getServiceSuggestions(
                        budgetServices.find((i) => i.id === suggestionsForServiceId)?.description ??
                          ''
                      )
                    : []
                }
                onClose={() => setSuggestionsForServiceId(null)}
                onKeepOpen={keepServiceSuggestionsOpen}
                onSelect={(svc) => {
                  if (suggestionsForServiceId) applySuggestion(suggestionsForServiceId, svc);
                }}
              />

              <div>
                <div className="mb-2">
                  <p className={`${budgetModalFieldLabel} mb-0`}>Peças</p>
                </div>
                <div className="space-y-2.5">
                  {budgetParts.map((item, partIndex) => {
                    const isFocusedPart = suggestionsForPartId === item.id;
                    return (
                      <div
                        key={item.id}
                        ref={isFocusedPart ? focusedPartInputRef : undefined}
                        className={`${budgetModalPaperInset} flex flex-col gap-2.5 p-3.5 sm:flex-row sm:items-center sm:gap-3`}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-2 sm:items-center">
                          <BudgetLinePositionControl
                            position={partIndex + 1}
                            total={budgetParts.length}
                            onMoveTo={(toIndex) => movePartRowToIndex(item.id, toIndex)}
                            ariaLabelPrefix="Peça"
                          />
                          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                            {item.fromStock ? <BudgetPartStockBadge className="self-start" /> : null}
                            <input
                              type="text"
                              placeholder="Peça"
                              className={`${budgetModalInput} min-w-0 w-full shadow-none`}
                              value={item.description}
                              data-budget-part-id={item.id}
                              autoFocus={focusPartId === item.id}
                              onChange={(e) => updatePartDescription(item.id, e.target.value)}
                              onFocus={() => handlePartInputFocus(item.id)}
                              onBlur={() => handlePartInputBlur(item.id)}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing)
                                  return;
                                e.preventDefault();
                                addPartRow();
                              }}
                            />
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center justify-end gap-2 pl-12 sm:justify-start sm:pl-0">
                          <div className="flex items-center overflow-hidden rounded-lg border border-sky-200/80 bg-white">
                            <button
                              type="button"
                              onClick={() => updatePartQuantity(item.id, -1)}
                              className="flex h-8 w-7 items-center justify-center text-sky-800/80 transition-colors hover:bg-sky-100"
                              aria-label="Diminuir quantidade"
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="min-w-[1.5rem] px-0.5 text-center text-[12px] font-semibold tabular-nums text-slate-900">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => updatePartQuantity(item.id, 1)}
                              className="flex h-8 w-7 items-center justify-center text-sky-800/80 transition-colors hover:bg-sky-100"
                              aria-label="Aumentar quantidade"
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => removePartRow(item.id)}
                            className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200/60 bg-red-50/40 text-red-500/85 transition-colors hover:border-red-400 hover:bg-red-100/80 hover:text-red-600"
                            aria-label="Remover peça"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  <button
                    ref={budgetPartsAddRef}
                    type="button"
                    onClick={addPartRow}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-sky-300/90 bg-sky-50/50 px-3 py-2.5 text-[13px] font-semibold text-sky-800/90 transition-colors hover:border-sky-400 hover:bg-sky-50 hover:text-sky-950"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.2} />
                    Adicionar
                  </button>
                </div>
              </div>

              <BudgetPartSuggestionDropdown
                open={!!suggestionsForPartId}
                position={partSuggestionBoxPosition}
                suggestions={
                  suggestionsForPartId
                    ? getPartSuggestions(
                        budgetParts.find((i) => i.id === suggestionsForPartId)?.description ?? ''
                      )
                    : []
                }
                onClose={() => setSuggestionsForPartId(null)}
                onKeepOpen={keepPartSuggestionsOpen}
                onOpenPartDetails={(part) => {
                  keepPartSuggestionsOpen();
                  setBudgetPartQuickView(part);
                }}
                onSelect={(part) => {
                  if (suggestionsForPartId) applyPartSuggestion(suggestionsForPartId, part);
                }}
              />

              {budgetPartQuickView ? (
                <WorkshopPartQuickViewModal
                  part={budgetPartQuickView}
                  catalogNumber={budgetPartQuickViewCatalogNumber}
                  onClose={() => setBudgetPartQuickView(null)}
                  onUseInBudget={(part) => {
                    if (suggestionsForPartId) applyPartSuggestion(suggestionsForPartId, part);
                    setBudgetPartQuickView(null);
                  }}
                />
              ) : null}

              <div>
                <p className={budgetModalFieldLabel}>Observações</p>
                <div className={`${budgetModalPaperInset} overflow-hidden p-0`}>
                  <textarea
                    className={`${budgetModalInput} min-h-[88px] resize-y border-0 py-3.5 text-[15px] leading-relaxed shadow-none focus:ring-2`}
                    placeholder="Observações"
                    value={budgetObservations}
                    onChange={(e) => setBudgetObservations(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div
            className={`budget-modal-compact-footer shrink-0 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 sm:px-8 sm:pt-4 ${budgetModalPaperFooter}`}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={sending}
              className={`${budgetModalCreateBudgetButton} flex w-full items-center justify-center gap-2 px-5 ${!isPatioPcModal ? 'py-3 text-[14px]' : 'px-6 py-3.5'}`}
            >
              {sending ? (
                <Loader2 className="h-5 w-5 animate-spin" strokeWidth={2.2} />
              ) : (
                <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
              )}
              {sending ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar orçamento'}
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export function mapPatioBudgetPartToPayload(p: PatioBudgetPartDraft): BudgetPartFields {
  const row: BudgetPartFields = {
    description: p.description.trim(),
    quantity: (p.quantity || '1').trim(),
  };
  if (p.fromStock) {
    row.fromStock = true;
    if (p.workshopPartId) row.workshopPartId = p.workshopPartId;
  }
  return row;
}
