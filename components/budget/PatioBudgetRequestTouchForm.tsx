import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Car,
  Loader2,
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
import { MercosulPlateMockup } from '../ui/MercosulPlateMockup';
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
  /**
   * `touch` = tablet/smartphone; `pc` = mesma composição visual, coluna mais larga.
   */
  variant?: 'touch' | 'pc';
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
  /** Número da OS (preview Ver OS). */
  osNumber?: number | null;
  vehicleColor?: string | null;
  mileageKm?: string | null;
  /** Técnico responsável pela solicitação (identificação discreta). */
  technicianName?: string | null;
  /** Queixa da OS — somente leitura, área Veículo e Cliente. */
  clientComplaint?: string | null;
  /** Diagnóstico do orçamento (editável). */
  initialDiagnosis: string;
  initialServices: PatioBudgetServiceDraft[];
  initialParts: PatioBudgetPartDraft[];
  initialObservations: string;
  workshopServices: WorkshopService[];
  workshopParts: WorkshopPart[];
  sending: boolean;
  onClose: () => void;
  /** Abre o modal real da OS em ~80% (sem sair da solicitação). */
  onViewOs: () => void;
  onSave: (draft: PatioBudgetEditDraft) => void | Promise<void>;
  backdropAnimClass: string;
};

/** ~10% menor que o tamanho base (tablet). */
const BUDGET_SERVICE_TEXTAREA_MIN_PX = 40;
const ADD_ROW_BTN =
  'inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#007AFF]/18 bg-[#E8F2FF] px-3 py-2.5 text-[13px] font-semibold text-[#007AFF] transition-colors hover:bg-[#DCEBFF] active:bg-[#D0E4FF]';

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
      className="block min-h-[40px] w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent py-2 text-[13.5px] leading-snug text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 [overflow-wrap:anywhere] [scrollbar-width:none] [&::-webkit-scrollbar]:w-0"
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
        className="flex h-9 w-8 items-center justify-center rounded-lg text-[12px] font-bold tabular-nums text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 active:bg-slate-100"
        aria-label={`${ariaLabelPrefix} ${position}: alterar ordem`}
        aria-expanded={open}
      >
        {position}
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
 * Solicitar / editar orçamento — composição do tablet; no PC (`variant="pc"`)
 * usa a mesma UI com coluna mais larga.
 */
export function PatioBudgetRequestTouchForm({
  exiting = false,
  variant = 'touch',
  blurPlates,
  isEditing,
  vehicleModel,
  vehicleBrand,
  vehicleEngineInfo,
  vehicleYear,
  plate,
  vehicleChassis,
  customerName,
  osNumber,
  vehicleColor,
  mileageKm,
  technicianName,
  clientComplaint,
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
  const isPc = variant === 'pc';
  const [budgetDiagnosis, setBudgetDiagnosis] = useState(initialDiagnosis);
  const [budgetServices, setBudgetServices] = useState(initialServices);
  const [budgetParts, setBudgetParts] = useState(initialParts);
  const [budgetObservations, setBudgetObservations] = useState(initialObservations);

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
  const nameDisplay = (customerName ?? '').trim() || 'Cliente';
  const techDisplay = (technicianName ?? '').trim();
  const complaintDisplay = (clientComplaint ?? '').trim();

  return (
    <ModalPortal forceBody>
      <div
        className={`fixed inset-0 z-[200] flex h-[100dvh] max-h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-[#F2F4F7] text-slate-900 ${backdropAnimClass}`}
        style={{ colorScheme: 'light' }}
      >
        <div
          className={`relative z-[1] flex min-h-0 flex-1 flex-col ${exiting ? 'animate-modal-sheet-out pointer-events-none' : ''}`}
        >
          {/* Header — mesma composição do tablet; no PC um pouco mais folgado */}
          <header
            className={`shrink-0 border-b border-slate-200/70 bg-white ${
              isPc
                ? 'px-6 pb-3.5 pt-4 sm:px-8 lg:px-10'
                : 'px-3 pb-2.5 pt-[max(0.55rem,env(safe-area-inset-top))] sm:px-5'
            }`}
          >
            <div
              className={`mx-auto grid grid-cols-[auto_minmax(0,1fr)_auto] items-center ${
                isPc ? 'max-w-5xl gap-3' : 'gap-2 sm:gap-3'
              }`}
            >
              <button
                type="button"
                onClick={onClose}
                className={`inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 active:bg-slate-300 ${
                  isPc ? 'h-9 w-9' : 'h-7 w-7'
                }`}
                aria-label="Fechar"
              >
                <X className={isPc ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={2.4} />
              </button>

              <div className="min-w-0 px-1 text-center">
                <h1
                  className={`truncate font-semibold leading-tight tracking-tight text-slate-900 ${
                    isPc ? 'text-[20px] sm:text-[22px]' : 'text-[17px] sm:text-[18px]'
                  }`}
                >
                  {isEditing ? 'Editar solicitação' : 'Solicitar Orçamento'}
                </h1>
              </div>

              <button
                type="button"
                onClick={handleSave}
                disabled={sending}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[#007AFF] font-semibold text-white shadow-sm shadow-blue-500/20 transition-[filter,transform] hover:brightness-105 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 ${
                  isPc ? 'h-10 px-4 text-[15px]' : 'h-9 px-3.5 text-[14px]'
                }`}
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                ) : (
                  <Send className="h-4 w-4" strokeWidth={2.2} />
                )}
                {sending ? '…' : isEditing ? 'Salvar' : 'Enviar'}
              </button>
            </div>
          </header>

          <div
            className={`min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[max(1rem,env(safe-area-inset-bottom))] ${
              isPc ? 'px-6 py-5 sm:px-8 lg:px-10 lg:py-6' : 'px-3 py-3 sm:px-4 sm:py-4'
            }`}
          >
            <div
              className={`mx-auto flex w-full flex-col ${
                isPc ? 'max-w-5xl gap-4' : 'max-w-3xl gap-3 sm:gap-3.5'
              }`}
            >
              {/* Veículo e Cliente */}
              <SectionCard
                iconTone="app"
                icon={
                  <img
                    src="/icons/veiculo-cliente-orcamento-ios.png"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                }
                title="Veículo e Cliente"
                action={
                  <button
                    type="button"
                    onClick={onViewOs}
                    className={`inline-flex items-center rounded-lg border border-[#007AFF]/20 bg-[#E8F2FF] font-semibold text-[#007AFF] transition-colors hover:bg-[#DCEBFF] ${
                      isPc ? 'px-3 py-1.5 text-[13px]' : 'px-2.5 py-1.5 text-[12px]'
                    }`}
                  >
                    Ver OS
                  </button>
                }
              >
                <div className={`flex flex-col ${isPc ? 'gap-3.5' : 'gap-3'}`}>
                  {/* Logo | nome+meta | placa Mercosul à direita */}
                  <div className={`flex min-w-0 items-start ${isPc ? 'gap-3.5' : 'gap-2.5'}`}>
                    <div
                      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-slate-100 ${
                        isPc ? 'h-16 w-[5rem]' : 'h-14 w-[4.25rem]'
                      }`}
                    >
                      {getVehicleBrandLogoUrl(brand || model) ? (
                        <VehicleBrandLogo brand={brand || model} size="modalPc" />
                      ) : (
                        <Car className="h-6 w-6 text-slate-400" strokeWidth={2} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5">
                      <p
                        className={`truncate font-semibold leading-tight tracking-tight text-slate-900 ${
                          isPc ? 'text-[17px]' : 'text-[15px]'
                        }`}
                      >
                        {vehicleTitle}
                      </p>
                      {vehicleMeta ? (
                        <p
                          className={`mt-1 leading-snug text-slate-500 ${
                            isPc ? 'text-[13.5px]' : 'text-[12.5px]'
                          }`}
                        >
                          {vehicleMeta}
                        </p>
                      ) : null}
                      {chassisDisplay ? (
                        <p
                          className={`mt-1 break-all text-slate-600 ${
                            isPc ? 'text-[12.5px]' : 'text-[11.5px]'
                          }`}
                        >
                          <span className="text-slate-500">Chassi </span>
                          <span className="font-semibold tabular-nums text-slate-800">
                            {chassisDisplay}
                          </span>
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 self-center">
                      <MercosulPlateMockup
                        plate={plateDisplay}
                        blurPlates={blurPlates}
                        size={isPc ? 'card' : 'cardCompact'}
                      />
                    </div>
                  </div>

                  {/* Cliente — só nome, sem clique */}
                  <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/90 px-2.5 py-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-slate-600">
                      <User className="h-3.5 w-3.5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-700">
                      {nameDisplay}
                    </span>
                  </div>

                  {/* Queixa da OS — somente leitura */}
                  <div>
                    <p className="mb-1.5 text-[14px] font-semibold tracking-tight text-slate-800">
                      Queixa do cliente
                    </p>
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5 text-[13px] leading-relaxed text-slate-700">
                      {complaintDisplay ? (
                        complaintDisplay
                      ) : (
                        <span className="text-slate-400">Nenhuma queixa registrada nesta OS.</span>
                      )}
                    </div>
                  </div>
                </div>
              </SectionCard>

              {/* Diagnóstico do orçamento — editável (PC e tablet) */}
              <SectionCard
                iconTone="app"
                icon={
                  <img
                    src="/icons/autorizacao-diagnostico-ios.png"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                }
                title="Diagnóstico"
              >
                <textarea
                  rows={isPc ? 5 : 4}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13.5px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                  placeholder="Descreva o diagnóstico do orçamento…"
                  value={budgetDiagnosis}
                  onChange={(e) => setBudgetDiagnosis(e.target.value)}
                />
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
                <div className="space-y-1.5">
                  {budgetServices.map((item, serviceIndex) => {
                    const isFocused = suggestionsForServiceId === item.id;
                    return (
                      <div
                        key={item.id}
                        className="relative flex items-start gap-0.5 rounded-lg border border-slate-200/90 bg-white px-1 py-0"
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
                            <p className="pb-1.5 text-[11px] font-medium tabular-nums text-[#007AFF]/80">
                              {formatLaborLabel(Number(item.laborHours))}
                            </p>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeServiceRow(item.id)}
                          className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 active:bg-red-100/70"
                          aria-label="Remover serviço"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                    );
                  })}
                  <button type="button" onClick={addServiceRow} className={ADD_ROW_BTN}>
                    <Plus className="h-4 w-4" strokeWidth={2.4} />
                    Adicionar serviço
                  </button>
                </div>
              </SectionCard>

              {/* Peças */}
              <SectionCard
                iconTone="app"
                icon={
                  <img
                    src="/icons/pecas-solicitadas-ios.png"
                    alt=""
                    className="h-full w-full object-cover"
                  />
                }
                title="Peças solicitadas"
              >
                <div className="space-y-1.5">
                  {budgetParts.map((item, partIndex) => {
                    const isFocusedPart = suggestionsForPartId === item.id;
                    return (
                      <div
                        key={item.id}
                        ref={isFocusedPart ? focusedPartInputRef : undefined}
                        className="flex items-center gap-0.5 rounded-lg border border-slate-200/90 bg-white px-1 py-0"
                      >
                        <GripMoveControl
                          position={partIndex + 1}
                          total={budgetParts.length}
                          onMoveTo={(toIndex) => movePartRowToIndex(item.id, toIndex)}
                          ariaLabelPrefix="Peça"
                        />
                        <div className="flex min-w-0 flex-1 items-center gap-1.5 py-0.5">
                          {item.fromStock ? (
                            <BudgetPartStockBadge className="scale-90" />
                          ) : null}
                          <input
                            type="text"
                            placeholder="Descreva a peça"
                            className="min-w-0 flex-1 border-0 bg-transparent py-2 text-[13.5px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0"
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
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 active:bg-red-100/70"
                          aria-label="Remover peça"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                    );
                  })}
                  <button type="button" onClick={addPartRow} className={ADD_ROW_BTN}>
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
                  rows={3}
                  className="w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13.5px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                  placeholder="Informações complementares para o setor de orçamentos…"
                  value={budgetObservations}
                  onChange={(e) => setBudgetObservations(e.target.value)}
                />
              </SectionCard>

              {techDisplay ? (
                <p className="px-1 text-center text-[11px] text-slate-400">
                  Técnico · <span className="font-medium text-slate-500">{techDisplay}</span>
                </p>
              ) : null}
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
          compactTouch
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
          compactTouch
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
