import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Car,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  User,
  X,
} from 'lucide-react';
import type { WorkshopPart, WorkshopService } from '../../services/apiService';
import {
  buildWorkshopPartNameIndex,
  resolveBudgetPartStockFlags,
} from '../../utils/budgetPartStock';
import { formatLaborLabel } from '../../utils/workshopLaborFormat';
import { moveItemInList } from '../../utils/moveItemInList';
import { ModalPortal } from '../ui/ModalPortal';
import { VehicleBrandLogo } from '../ui/VehicleBrandLogo';
import { getVehicleBrandLogoUrl } from '../../utils/vehicleBrandLogo';
import { BudgetPartStockBadge } from '../ui/BudgetPartStockBadge';
import { BudgetPartSuggestionDropdown } from './BudgetPartSuggestionDropdown';
import { BudgetServiceSuggestionDropdown } from './BudgetServiceSuggestionDropdown';
import { WorkshopPartQuickViewModal } from './WorkshopPartQuickViewModal';
import type {
  PatioBudgetEditDraft,
  PatioBudgetPartDraft,
  PatioBudgetServiceDraft,
} from './PatioBudgetEditForm';

export type PatioBudgetRequestTouchFormProps = {
  exiting?: boolean;
  blurPlates: boolean;
  isEditing: boolean;
  /** Modelo do veículo (ex.: Gol). */
  vehicleModel: string;
  vehicleBrand?: string | null;
  vehicleEngineInfo?: string | null;
  vehicleYear?: string | null;
  plate: string;
  vehicleChassis?: string | null;
  customerName: string;
  customerPhone?: string | null;
  initialDiagnosis: string;
  initialServices: PatioBudgetServiceDraft[];
  initialParts: PatioBudgetPartDraft[];
  initialObservations: string;
  workshopServices: WorkshopService[];
  workshopParts: WorkshopPart[];
  sending: boolean;
  onClose: () => void;
  /** Volta para a ficha da OS (mesmo que fechar neste fluxo). */
  onViewOs: () => void;
  onSave: (draft: PatioBudgetEditDraft) => void | Promise<void>;
  backdropAnimClass: string;
};

const BUDGET_SERVICE_TEXTAREA_MIN_PX = 44;

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function TouchServiceTextarea({
  value,
  onChange,
  onFocus,
  onBlur,
  onEnterAdd,
  autoFocus,
  dataBudgetServiceId,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onEnterAdd?: () => void;
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
      placeholder="Descreva o serviço"
      className="block min-h-[44px] w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent py-2.5 text-[15px] leading-snug text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 [overflow-wrap:anywhere] [scrollbar-width:none] [&::-webkit-scrollbar]:w-0"
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

function SectionCard({
  icon,
  title,
  titleExtra,
  action,
  children,
  /** `app` = ícone iOS completo (sem fundo azul claro atrás). */
  iconTone = 'tint',
}: {
  icon: React.ReactNode;
  title: string;
  titleExtra?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  iconTone?: 'tint' | 'app';
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={
              iconTone === 'app'
                ? 'flex h-8 w-8 shrink-0 overflow-hidden rounded-[0.55rem] shadow-sm shadow-black/10'
                : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]'
            }
          >
            {icon}
          </span>
          <h3 className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
            {title}
            {titleExtra}
          </h3>
        </div>
        {action}
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

function GripMoveControl({
  position,
  total,
  onMoveTo,
  ariaLabelPrefix,
}: {
  position: number;
  total: number;
  onMoveTo: (toIndex: number) => void;
  ariaLabelPrefix: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="relative shrink-0 self-center" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 active:bg-slate-100"
        aria-label={`${ariaLabelPrefix} ${position}: alterar ordem`}
        aria-expanded={open}
      >
        <GripVertical className="h-5 w-5" strokeWidth={2} />
      </button>
      {open && total > 1 ? (
        <div className="absolute left-0 top-[calc(100%+0.25rem)] z-40 min-w-[9rem] rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Mover para
          </p>
          <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
            {Array.from({ length: total }, (_, index) => {
              const isCurrent = index === position - 1;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={isCurrent}
                  onClick={() => {
                    onMoveTo(index);
                    setOpen(false);
                  }}
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums ${
                    isCurrent
                      ? 'bg-[#007AFF] text-white'
                      : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                  } disabled:opacity-100`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Layout exclusivo tablet/smartphone para solicitar (criar/editar) orçamento.
 * Separado do formulário PC (`PatioBudgetEditForm`).
 */
export function PatioBudgetRequestTouchForm({
  exiting = false,
  blurPlates,
  isEditing,
  vehicleModel,
  vehicleBrand,
  vehicleEngineInfo,
  vehicleYear,
  plate,
  vehicleChassis,
  customerName,
  customerPhone,
  initialDiagnosis,
  initialServices,
  initialParts,
  initialObservations,
  workshopServices,
  workshopParts,
  sending,
  onClose,
  onViewOs,
  onSave,
  backdropAnimClass,
}: PatioBudgetRequestTouchFormProps) {
  const [budgetDiagnosis, setBudgetDiagnosis] = useState(initialDiagnosis);
  const [budgetServices, setBudgetServices] = useState(initialServices);
  const [budgetParts, setBudgetParts] = useState(initialParts);
  const [budgetObservations, setBudgetObservations] = useState(initialObservations);
  const [complaintEditing, setComplaintEditing] = useState(false);

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
  const pendingFocusServiceIdRef = useRef<string | null>(null);
  const pendingFocusPartIdRef = useRef<string | null>(null);
  const stockFlagsResolvedRef = useRef(false);
  const complaintRef = useRef<HTMLTextAreaElement | null>(null);

  const workshopPartsNameIndex = useMemo(
    () => buildWorkshopPartNameIndex(workshopParts),
    [workshopParts]
  );

  const workshopServicesExactMap = useMemo(() => {
    const map = new Map<string, WorkshopService>();
    for (const s of workshopServices) {
      const key = s.name.trim();
      if (key && !map.has(key)) map.set(key, s);
    }
    return map;
  }, [workshopServices]);

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

  useEffect(() => {
    if (!complaintEditing) return;
    const id = window.requestAnimationFrame(() => complaintRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [complaintEditing]);

  useLayoutEffect(() => {
    const id = pendingFocusServiceIdRef.current;
    if (!id) return;
    pendingFocusServiceIdRef.current = null;
    setFocusServiceId(id);
  }, [budgetServices]);

  useLayoutEffect(() => {
    const id = pendingFocusPartIdRef.current;
    if (!id) return;
    pendingFocusPartIdRef.current = null;
    setFocusPartId(id);
  }, [budgetParts]);

  useEffect(() => {
    if (!focusServiceId) return;
    const t = window.setTimeout(() => setFocusServiceId(null), 80);
    return () => window.clearTimeout(t);
  }, [focusServiceId]);

  useEffect(() => {
    if (!focusPartId) return;
    const t = window.setTimeout(() => setFocusPartId(null), 80);
    return () => window.clearTimeout(t);
  }, [focusPartId]);

  const addServiceRow = () => {
    const newId = Date.now().toString();
    pendingFocusServiceIdRef.current = newId;
    setSuggestionsForServiceId(null);
    setBudgetServices((prev) => [...prev, { id: newId, description: '', laborHours: null }]);
  };

  const addPartRow = () => {
    const newId = String(Date.now() + 1);
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

  const getServiceSuggestions = (description: string) => {
    const q = normalizeText(description.trim());
    if (!q) return [];
    return workshopServices
      .filter((s) => normalizeText(s.name).includes(q))
      .slice(0, 8);
  };

  const getPartSuggestions = (description: string) => {
    const q = normalizeText(description.trim());
    if (!q) return [];
    return workshopParts.filter((p) => normalizeText(p.name).includes(q)).slice(0, 8);
  };

  const updateSuggestionBoxPosition = useCallback(() => {
    const el = focusedServiceInputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setSuggestionBoxPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, []);

  const updatePartSuggestionBoxPosition = useCallback(() => {
    const el = focusedPartInputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPartSuggestionBoxPosition({
      top: rect.bottom + 4,
      left: rect.left,
      width: Math.max(rect.width, 220),
    });
  }, []);

  const handleServiceInputFocus = (id: string) => {
    if (suggestionCloseTimerRef.current) {
      clearTimeout(suggestionCloseTimerRef.current);
      suggestionCloseTimerRef.current = null;
    }
    setSuggestionsForServiceId(id);
    requestAnimationFrame(updateSuggestionBoxPosition);
  };

  const handleServiceInputBlur = () => {
    suggestionCloseTimerRef.current = setTimeout(() => {
      setSuggestionsForServiceId(null);
    }, 180);
  };

  const keepServiceSuggestionsOpen = () => {
    if (suggestionCloseTimerRef.current) {
      clearTimeout(suggestionCloseTimerRef.current);
      suggestionCloseTimerRef.current = null;
    }
  };

  const handlePartInputFocus = (id: string) => {
    if (partSuggestionCloseTimerRef.current) {
      clearTimeout(partSuggestionCloseTimerRef.current);
      partSuggestionCloseTimerRef.current = null;
    }
    setSuggestionsForPartId(id);
    requestAnimationFrame(updatePartSuggestionBoxPosition);
  };

  const handlePartInputBlur = (id: string) => {
    resolvePartStockOnBlur(id);
    partSuggestionCloseTimerRef.current = setTimeout(() => {
      setSuggestionsForPartId(null);
    }, 180);
  };

  const keepPartSuggestionsOpen = () => {
    if (partSuggestionCloseTimerRef.current) {
      clearTimeout(partSuggestionCloseTimerRef.current);
      partSuggestionCloseTimerRef.current = null;
    }
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
      prev.map((item) => {
        if (item.id !== itemId) return item;
        const flags = resolveBudgetPartStockFlags(part.name, workshopParts, {
          fromStock: true,
          workshopPartId: part.id,
        });
        return { ...item, description: part.name, ...flags };
      })
    );
    setSuggestionsForPartId(null);
  };

  useEffect(() => {
    if (!suggestionsForServiceId) return;
    updateSuggestionBoxPosition();
    const onScroll = () => updateSuggestionBoxPosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [suggestionsForServiceId, updateSuggestionBoxPosition]);

  useEffect(() => {
    if (!suggestionsForPartId) return;
    updatePartSuggestionBoxPosition();
    const onScroll = () => updatePartSuggestionBoxPosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [suggestionsForPartId, updatePartSuggestionBoxPosition]);

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
  const model = (vehicleModel ?? '').trim();
  const vehicleTitle = [brand, model].filter(Boolean).join(' ') || model || brand || 'Veículo';
  const engine = (vehicleEngineInfo ?? '').trim();
  const year = (vehicleYear ?? '').trim();
  const vehicleMeta = [engine, year].filter(Boolean).join(' · ');
  const plateDisplay = (plate || '—').trim() || '—';
  const chassisDisplay = (vehicleChassis ?? '').trim();
  const phoneDisplay = (customerPhone ?? '').trim();
  const nameDisplay = (customerName ?? '').trim() || 'Cliente';

  return (
    <ModalPortal>
      <div
        className={`fixed inset-0 z-[200] flex h-[100dvh] max-h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-[#F2F4F7] text-slate-900 ${backdropAnimClass}`}
        style={{ colorScheme: 'light' }}
      >
        <div
          className={`relative z-[1] flex min-h-0 flex-1 flex-col ${exiting ? 'animate-modal-sheet-out pointer-events-none' : ''}`}
        >
          {/* Header */}
          <header className="shrink-0 border-b border-slate-200/80 bg-white/95 px-3 pb-3 pt-[max(0.65rem,env(safe-area-inset-top))] backdrop-blur-md sm:px-4">
            <div className="flex items-start gap-2 sm:items-center sm:gap-3">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex shrink-0 items-center gap-0.5 rounded-xl px-1.5 py-2 text-[15px] font-medium text-[#007AFF] transition-colors hover:bg-[#007AFF]/8 active:bg-[#007AFF]/12"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.25} />
                Voltar
              </button>

              <div className="min-w-0 flex-1 text-center sm:px-2">
                <h1 className="text-[17px] font-semibold tracking-tight text-slate-900 sm:text-[18px]">
                  {isEditing ? 'Editar solicitação' : 'Solicitar Orçamento'}
                </h1>
                <p className="mt-0.5 hidden text-[12px] leading-snug text-slate-500 sm:block">
                  Envie para o setor de orçamentos os serviços e peças necessários.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={sending}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#007AFF] px-3 py-2.5 text-[13px] font-semibold text-white shadow-sm shadow-blue-500/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 sm:gap-2 sm:px-3.5 sm:text-[14px]"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                ) : (
                  <Send className="h-4 w-4" strokeWidth={2.2} />
                )}
                <span className="hidden min-[380px]:inline">
                  {sending ? 'Enviando…' : isEditing ? 'Salvar' : 'Enviar para Orçamentos'}
                </span>
                <span className="min-[380px]:hidden">{sending ? '…' : isEditing ? 'Salvar' : 'Enviar'}</span>
              </button>
            </div>
            <p className="mt-1.5 text-center text-[12px] leading-snug text-slate-500 sm:hidden">
              Envie para o setor de orçamentos os serviços e peças necessários.
            </p>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-4 sm:py-4">
            <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:gap-3.5">
              {/* Veículo e Cliente */}
              <SectionCard
                icon={<Car className="h-4 w-4" strokeWidth={2.2} />}
                title="Veículo e Cliente"
                action={
                  <button
                    type="button"
                    onClick={onViewOs}
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Ver OS
                  </button>
                }
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-0">
                  <div className="flex min-w-0 flex-1 gap-3">
                    <div className="flex h-11 w-14 shrink-0 items-center justify-center self-start overflow-hidden rounded-xl bg-slate-100">
                      {getVehicleBrandLogoUrl(brand || model) ? (
                        <VehicleBrandLogo brand={brand || model} size="modal" />
                      ) : (
                        <Car className="h-5 w-5 text-slate-400" strokeWidth={2} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[16px] font-semibold leading-tight tracking-tight text-slate-900">
                        {vehicleTitle}
                      </p>
                      {vehicleMeta ? (
                        <p className="mt-0.5 text-[13px] text-slate-500">{vehicleMeta}</p>
                      ) : null}
                      <div className="mt-2.5 space-y-1 text-[13px]">
                        <p className="text-slate-600">
                          <span className="font-medium text-slate-500">Placa </span>
                          <span className={`font-semibold tracking-wide text-slate-900 ${blurPlates ? 'blur-plate' : ''}`}>
                            {plateDisplay}
                          </span>
                        </p>
                        {chassisDisplay ? (
                          <p className="break-all text-slate-600">
                            <span className="font-medium text-slate-500">Chassi </span>
                            <span className="font-semibold tabular-nums text-slate-900">
                              {chassisDisplay}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="hidden w-px self-stretch bg-slate-200 sm:mx-4 sm:block" aria-hidden />

                  <button
                    type="button"
                    onClick={onViewOs}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5 text-left transition-colors hover:bg-slate-100 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:hover:bg-transparent"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-slate-600">
                      <User className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-slate-900">
                        {nameDisplay}
                      </span>
                      {phoneDisplay ? (
                        <span className="mt-0.5 block truncate text-[13px] text-slate-500">
                          {phoneDisplay}
                        </span>
                      ) : null}
                    </span>
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2} />
                  </button>
                </div>
              </SectionCard>

              {/* Queixa */}
              <SectionCard
                iconTone="app"
                icon={
                  <img
                    src="/icons/queixa-ios.png"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                }
                title="Queixa do cliente"
                action={
                  <button
                    type="button"
                    onClick={() => setComplaintEditing((v) => !v)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
                    aria-label={complaintEditing ? 'Concluir edição da queixa' : 'Editar queixa'}
                  >
                    {complaintEditing ? (
                      <X className="h-4 w-4" strokeWidth={2.2} />
                    ) : (
                      <Pencil className="h-4 w-4" strokeWidth={2.2} />
                    )}
                  </button>
                }
              >
                {complaintEditing ? (
                  <textarea
                    ref={complaintRef}
                    rows={4}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                    placeholder="Descreva a queixa do cliente…"
                    value={budgetDiagnosis}
                    onChange={(e) => setBudgetDiagnosis(e.target.value)}
                    onBlur={() => setComplaintEditing(false)}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setComplaintEditing(true)}
                    className="w-full rounded-xl bg-slate-50 px-3.5 py-3 text-left text-[15px] leading-relaxed text-slate-700 transition-colors hover:bg-slate-100/80"
                  >
                    {budgetDiagnosis.trim() ? (
                      budgetDiagnosis
                    ) : (
                      <span className="text-slate-400">Toque para informar a queixa do cliente…</span>
                    )}
                  </button>
                )}
              </SectionCard>

              {/* Serviços */}
              <SectionCard
                iconTone="app"
                icon={
                  <img
                    src="/icons/servicos-solicitados-ios.png"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                }
                title="Serviços solicitados"
              >
                <div className="space-y-2">
                  {budgetServices.map((item, serviceIndex) => {
                    const isFocused = suggestionsForServiceId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="relative flex items-start gap-1 rounded-xl border border-slate-200/90 bg-slate-50/60 px-1.5 py-0.5"
                      >
                        <GripMoveControl
                          position={serviceIndex + 1}
                          total={budgetServices.length}
                          onMoveTo={(toIndex) => moveServiceRowToIndex(item.id, toIndex)}
                          ariaLabelPrefix="Serviço"
                        />
                        <div
                          className="min-w-0 flex-1"
                          ref={
                            isFocused
                              ? (node: HTMLDivElement | null) => {
                                  focusedServiceInputRef.current = node;
                                }
                              : undefined
                          }
                        >
                          <TouchServiceTextarea
                            value={item.description}
                            onChange={(v) => updateServiceDescription(item.id, v)}
                            onFocus={() => handleServiceInputFocus(item.id)}
                            onBlur={handleServiceInputBlur}
                            onEnterAdd={addServiceRow}
                            autoFocus={focusServiceId === item.id}
                            dataBudgetServiceId={item.id}
                          />
                          {item.laborHours != null && Number.isFinite(Number(item.laborHours)) ? (
                            <p className="pb-2 text-[12px] font-medium tabular-nums text-[#007AFF]/80">
                              {formatLaborLabel(Number(item.laborHours))}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeServiceRow(item.id)}
                          className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-red-500 transition-colors hover:bg-red-50 active:bg-red-100/70"
                          aria-label="Remover serviço"
                        >
                          <Trash2 className="h-4.5 w-4.5 h-[18px] w-[18px]" strokeWidth={2} />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={addServiceRow}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#007AFF]/20 bg-[#007AFF]/8 px-3 py-3 text-[14px] font-semibold text-[#007AFF] transition-colors hover:bg-[#007AFF]/12 active:bg-[#007AFF]/16"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.4} />
                    Adicionar serviço
                  </button>
                </div>
              </SectionCard>

              {/* Peças */}
              <SectionCard
                icon={<Box className="h-4 w-4" strokeWidth={2.2} />}
                title="Peças solicitadas"
              >
                <div className="space-y-2">
                  {budgetParts.map((item, partIndex) => {
                    const isFocusedPart = suggestionsForPartId === item.id;
                    return (
                      <div
                        key={item.id}
                        ref={isFocusedPart ? focusedPartInputRef : undefined}
                        className="flex items-center gap-1 rounded-xl border border-slate-200/90 bg-slate-50/60 px-1.5 py-0.5"
                      >
                        <GripMoveControl
                          position={partIndex + 1}
                          total={budgetParts.length}
                          onMoveTo={(toIndex) => movePartRowToIndex(item.id, toIndex)}
                          ariaLabelPrefix="Peça"
                        />
                        <div className="min-w-0 flex-1 py-1">
                          {item.fromStock ? (
                            <BudgetPartStockBadge className="mb-1 self-start" />
                          ) : null}
                          <input
                            type="text"
                            placeholder="Descreva a peça"
                            className="w-full border-0 bg-transparent py-2 text-[15px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
                            value={item.description}
                            data-budget-part-id={item.id}
                            autoFocus={focusPartId === item.id}
                            onChange={(e) => updatePartDescription(item.id, e.target.value)}
                            onFocus={() => handlePartInputFocus(item.id)}
                            onBlur={() => handlePartInputBlur(item.id)}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                              e.preventDefault();
                              addPartRow();
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removePartRow(item.id)}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-red-500 transition-colors hover:bg-red-50 active:bg-red-100/70"
                          aria-label="Remover peça"
                        >
                          <Trash2 className="h-[18px] w-[18px]" strokeWidth={2} />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={addPartRow}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#007AFF]/20 bg-[#007AFF]/8 px-3 py-3 text-[14px] font-semibold text-[#007AFF] transition-colors hover:bg-[#007AFF]/12 active:bg-[#007AFF]/16"
                  >
                    <Plus className="h-4 w-4" strokeWidth={2.4} />
                    Adicionar peça
                  </button>
                </div>
              </SectionCard>

              {/* Observações */}
              <SectionCard
                iconTone="app"
                icon={
                  <img
                    src="/icons/observacoes-orcamento-ios.png"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                }
                title="Observações adicionais"
                titleExtra={<span className="font-normal text-slate-400"> (opcional)</span>}
              >
                <textarea
                  rows={4}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                  placeholder="Informações complementares para o setor de orçamentos…"
                  value={budgetObservations}
                  onChange={(e) => setBudgetObservations(e.target.value)}
                />
              </SectionCard>
            </div>
          </div>
        </div>

        <BudgetServiceSuggestionDropdown
          open={!!suggestionsForServiceId}
          position={suggestionBoxPosition}
          suggestions={
            suggestionsForServiceId
              ? getServiceSuggestions(
                  budgetServices.find((i) => i.id === suggestionsForServiceId)?.description ?? ''
                )
              : []
          }
          onClose={() => setSuggestionsForServiceId(null)}
          onKeepOpen={keepServiceSuggestionsOpen}
          onSelect={(svc) => {
            if (suggestionsForServiceId) applySuggestion(suggestionsForServiceId, svc);
          }}
        />

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
      </div>
    </ModalPortal>
  );
}
