import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Car,
  Check,
  Clock3,
  Loader2,
  Minus,
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
import {
  formatLaborLabel,
  laborHoursToParts,
  parseLaborDurationParts,
} from '../../utils/workshopLaborFormat';
import { moveItemInList } from '../../utils/moveItemInList';
import { ModalPortal } from '../ui/ModalPortal';
import { useBrowserBackLayer } from '../ui/BackNavigationContext';
import { VehicleBrandLogo } from '../ui/VehicleBrandLogo';
import { getVehicleBrandLogoUrl } from '../../utils/vehicleBrandLogo';
import { MercosulPlateMockup } from '../ui/MercosulPlateMockup';
import { BudgetPartStockBadge } from '../ui/BudgetPartStockBadge';
import { BudgetPartSuggestionDropdown } from './BudgetPartSuggestionDropdown';
import { BudgetServiceSuggestionDropdown } from './BudgetServiceSuggestionDropdown';
import { handleBudgetSuggestionKeyDown } from './budgetSuggestionKeyboard';
import { WorkshopPartQuickViewModal } from './WorkshopPartQuickViewModal';
import type {
  PatioBudgetEditDraft,
  PatioBudgetPartDraft,
  PatioBudgetServiceDraft,
} from './PatioBudgetEditForm';

function serializeBudgetDraft(
  diagnosis: string,
  services: PatioBudgetServiceDraft[],
  parts: PatioBudgetPartDraft[],
  observations: string
): string {
  return JSON.stringify({
    diagnosis: diagnosis.trim(),
    observations: observations.trim(),
    services: services.map((s) => ({
      description: s.description.trim(),
      laborHours: s.laborHours ?? null,
    })),
    parts: parts.map((p) => ({
      description: p.description.trim(),
      quantity: String(p.quantity ?? '1').trim(),
      fromStock: Boolean(p.fromStock),
      workshopPartId: p.workshopPartId ?? null,
    })),
  });
}

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

/** Altura mínima justa para 1 linha — evita “vão” grande acima do tempo de serviço. */
const BUDGET_SERVICE_TEXTAREA_MIN_PX = 28;
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
  onKeyDown,
  autoFocus,
  dataBudgetServiceId,
  compactBottom,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus: () => void;
  onBlur: () => void;
  onEnterAdd?: () => void;
  /** Se retornar true, o Enter para adicionar linha não roda. */
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => boolean;
  autoFocus?: boolean;
  dataBudgetServiceId?: string;
  /** Menos padding inferior quando o tempo de serviço vem logo abaixo. */
  compactBottom?: boolean;
}) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const syncHeight = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(BUDGET_SERVICE_TEXTAREA_MIN_PX, el.scrollHeight)}px`;
  }, []);

  useLayoutEffect(() => {
    syncHeight();
  }, [value, compactBottom, syncHeight]);

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
      className={`block min-h-[28px] w-full min-w-0 resize-none overflow-hidden border-0 bg-transparent pt-2 text-[13.5px] leading-snug text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-0 [overflow-wrap:anywhere] [scrollbar-width:none] [&::-webkit-scrollbar]:w-0 ${
        compactBottom ? 'pb-0' : 'pb-2'
      }`}
      value={value}
      onChange={(e) => {
        onChange(e.target.value);
        requestAnimationFrame(syncHeight);
      }}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={(e) => {
        if (onKeyDown?.(e)) return;
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
  /** Sem cabeçalho de ícone/título — só o corpo (ex.: Veículo e Cliente). */
  hideHeader = false,
}: {
  icon?: React.ReactNode;
  title?: string;
  titleExtra?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  iconTone?: 'tint' | 'app';
  hideHeader?: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {!hideHeader && title ? (
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon ? (
              <span
                className={
                  iconTone === 'app'
                    ? 'flex h-8 w-8 shrink-0 overflow-hidden rounded-[0.55rem] shadow-sm shadow-black/10'
                    : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#007AFF]/10 text-[#007AFF]'
                }
              >
                {icon}
              </span>
            ) : null}
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
              {title}
              {titleExtra}
            </h3>
          </div>
          {action}
        </div>
      ) : null}
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
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const updateMenuPosition = useCallback(() => {
    const el = rootRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const estimatedHeight = Math.min(200, 56 + Math.ceil(total / 4) * 36);
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - 160 - margin)
    );
    if (openAbove) {
      setMenuPos({
        bottom: window.innerHeight - rect.top + 6,
        left,
      });
    } else {
      setMenuPos({
        top: rect.bottom + 6,
        left,
      });
    }
  }, [total]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onReposition = () => updateMenuPosition();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updateMenuPosition]);

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
      {open && total > 1 && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[360] min-w-[9rem] rounded-xl border border-slate-200 bg-white p-2 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)]"
              style={{
                top: menuPos.top,
                bottom: menuPos.bottom,
                left: menuPos.left,
              }}
              role="listbox"
              aria-label={`Mover ${ariaLabelPrefix.toLowerCase()} para posição`}
            >
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
                      role="option"
                      aria-selected={isCurrent}
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
            </div>,
            document.body
          )
        : null}
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
  const [serviceSuggestionHighlight, setServiceSuggestionHighlight] = useState(-1);
  const [partSuggestionHighlight, setPartSuggestionHighlight] = useState(-1);
  /** Editor de horas (relógio) — independente do dropdown de sugestões. */
  const [laborEditorServiceId, setLaborEditorServiceId] = useState<string | null>(null);
  const laborEditorServiceIdRef = useRef<string | null>(null);
  laborEditorServiceIdRef.current = laborEditorServiceId;
  const [laborDraftHours, setLaborDraftHours] = useState('');
  const [laborDraftMinutes, setLaborDraftMinutes] = useState('');
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
  const [leaveConfirmOpen, setLeaveConfirmOpen] = useState(false);

  const focusedServiceInputRef = useRef<HTMLDivElement | null>(null);
  const focusedPartInputRef = useRef<HTMLDivElement | null>(null);
  const budgetScrollRef = useRef<HTMLDivElement | null>(null);
  const suggestionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const partSuggestionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocusServiceIdRef = useRef<string | null>(null);
  const pendingFocusPartIdRef = useRef<string | null>(null);
  const stockFlagsResolvedRef = useRef(false);
  const baselineSnapshotRef = useRef(
    serializeBudgetDraft(initialDiagnosis, initialServices, initialParts, initialObservations)
  );
  const baselineReadyRef = useRef(false);

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

  /** Baseline após resolver flags de estoque (não conta como edição do usuário). */
  useEffect(() => {
    if (baselineReadyRef.current) return;
    if (workshopParts.length > 0 && !stockFlagsResolvedRef.current) return;
    baselineSnapshotRef.current = serializeBudgetDraft(
      budgetDiagnosis,
      budgetServices,
      budgetParts,
      budgetObservations
    );
    baselineReadyRef.current = true;
  }, [budgetDiagnosis, budgetServices, budgetParts, budgetObservations, workshopParts.length]);

  const isDirty = useMemo(() => {
    if (!baselineReadyRef.current) return false;
    return (
      serializeBudgetDraft(
        budgetDiagnosis,
        budgetServices,
        budgetParts,
        budgetObservations
      ) !== baselineSnapshotRef.current
    );
  }, [budgetDiagnosis, budgetServices, budgetParts, budgetObservations]);

  const dismissLeaveConfirm = useCallback(() => {
    setLeaveConfirmOpen(false);
  }, []);

  const requestClose = useCallback(() => {
    if (sending) return;
    if (leaveConfirmOpen) {
      dismissLeaveConfirm();
      return;
    }
    if (!isDirty) {
      onClose();
      return;
    }
    setLeaveConfirmOpen(true);
  }, [sending, leaveConfirmOpen, dismissLeaveConfirm, isDirty, onClose]);

  const confirmLeaveWithoutSaving = useCallback(() => {
    setLeaveConfirmOpen(false);
    onClose();
  }, [onClose]);

  const saveAndLeaveLockRef = useRef(false);
  const confirmSaveAndLeave = useCallback(() => {
    if (sending || saveAndLeaveLockRef.current) return;
    saveAndLeaveLockRef.current = true;
    setLeaveConfirmOpen(false);
    void Promise.resolve(
      onSave({
        diagnosis: budgetDiagnosis,
        services: budgetServices,
        parts: budgetParts,
        observations: budgetObservations,
      })
    ).finally(() => {
      saveAndLeaveLockRef.current = false;
    });
  }, [sending, onSave, budgetDiagnosis, budgetServices, budgetParts, budgetObservations]);

  useBrowserBackLayer(leaveConfirmOpen, dismissLeaveConfirm);

  /**
   * Enter no diálogo de saída = Salvar e fechar.
   * Captura em window para valer mesmo se o foco ainda estiver no campo do orçamento.
   */
  useEffect(() => {
    if (!leaveConfirmOpen || sending) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.repeat) return;
      if (e.isComposing) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      confirmSaveAndLeave();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [leaveConfirmOpen, sending, confirmSaveAndLeave]);

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

  const updatePartQuantity = (id: string, delta: number) => {
    setBudgetParts((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const currentQty = parseInt(String(item.quantity), 10) || 0;
        return { ...item, quantity: String(Math.max(1, currentQty + delta)) };
      })
    );
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

  const activeServiceSuggestions = useMemo(
    () =>
      suggestionsForServiceId
        ? getServiceSuggestions(
            budgetServices.find((i) => i.id === suggestionsForServiceId)?.description ?? ''
          )
        : [],
    // getServiceSuggestions depende de workshopServices + descrição ativa
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suggestionsForServiceId, budgetServices, workshopServices]
  );

  const activePartSuggestions = useMemo(
    () =>
      suggestionsForPartId
        ? getPartSuggestions(
            budgetParts.find((i) => i.id === suggestionsForPartId)?.description ?? ''
          )
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suggestionsForPartId, budgetParts, workshopParts]
  );

  const activeServiceSuggestionIds = activeServiceSuggestions.map((s) => s.id).join('|');
  const activePartSuggestionIds = activePartSuggestions.map((p) => p.id).join('|');
  const serviceSuggestionsOpen =
    !!suggestionsForServiceId && activeServiceSuggestions.length > 0;
  const partSuggestionsOpen = !!suggestionsForPartId && activePartSuggestions.length > 0;

  useEffect(() => {
    setServiceSuggestionHighlight(-1);
  }, [suggestionsForServiceId, activeServiceSuggestionIds]);

  useEffect(() => {
    setPartSuggestionHighlight(-1);
  }, [suggestionsForPartId, activePartSuggestionIds]);

  /** Esc com sugestões abertas: fecha só a lista (camada acima do modal do orçamento). */
  useBrowserBackLayer(serviceSuggestionsOpen && !leaveConfirmOpen, () => {
    setSuggestionsForServiceId(null);
    setServiceSuggestionHighlight(-1);
  });
  useBrowserBackLayer(partSuggestionsOpen && !leaveConfirmOpen, () => {
    setSuggestionsForPartId(null);
    setPartSuggestionHighlight(-1);
  });

  /** Espaço mínimo abaixo do campo para a janela de sugestões ficar legível. */
  const SUGGESTION_MIN_SPACE_BELOW = 260;

  const ensureSuggestionSpaceBelow = useCallback((anchor: HTMLElement) => {
    if (typeof window === 'undefined') return;
    const margin = 12;
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    if (spaceBelow >= SUGGESTION_MIN_SPACE_BELOW) return;
    const delta = SUGGESTION_MIN_SPACE_BELOW - spaceBelow;
    const scroller =
      budgetScrollRef.current ??
      (anchor.closest('.budget-request-scroll') as HTMLElement | null);
    if (scroller) {
      scroller.scrollTop += delta;
    } else {
      window.scrollBy(0, delta);
    }
  }, []);

  const updateSuggestionBoxPosition = useCallback(
    (opts?: { ensureSpace?: boolean }) => {
      const el = focusedServiceInputRef.current;
      if (!el) return;
      if (opts?.ensureSpace) {
        ensureSuggestionSpaceBelow(el);
      }
      const rect = el.getBoundingClientRect();
      setSuggestionBoxPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    },
    [ensureSuggestionSpaceBelow]
  );

  const updatePartSuggestionBoxPosition = useCallback(
    (opts?: { ensureSpace?: boolean }) => {
      const el = focusedPartInputRef.current;
      if (!el) return;
      if (opts?.ensureSpace) {
        ensureSuggestionSpaceBelow(el);
      }
      const rect = el.getBoundingClientRect();
      setPartSuggestionBoxPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    },
    [ensureSuggestionSpaceBelow]
  );

  const handleServiceInputFocus = (id: string) => {
    if (suggestionCloseTimerRef.current) {
      clearTimeout(suggestionCloseTimerRef.current);
      suggestionCloseTimerRef.current = null;
    }
    setSuggestionsForServiceId(id);
    if (laborEditorServiceId && laborEditorServiceId !== id) {
      setLaborEditorServiceId(null);
    }
    requestAnimationFrame(() => updateSuggestionBoxPosition({ ensureSpace: true }));
  };

  const handleServiceInputBlur = () => {
    suggestionCloseTimerRef.current = setTimeout(() => {
      // No tablet o blur chega antes do toque no relógio; se o editor de horas
      // estiver aberto (ou for abrir), mantém a linha ativa.
      if (laborEditorServiceIdRef.current) {
        setSuggestionsForServiceId(laborEditorServiceIdRef.current);
        return;
      }
      setSuggestionsForServiceId(null);
    }, 220);
  };

  const openLaborEditor = (item: PatioBudgetServiceDraft) => {
    keepServiceSuggestionsOpen();
    setSuggestionsForServiceId(item.id);
    if (laborEditorServiceIdRef.current === item.id) {
      setLaborEditorServiceId(null);
      return;
    }
    const parts =
      item.laborHours != null && Number.isFinite(Number(item.laborHours))
        ? laborHoursToParts(Number(item.laborHours))
        : { h: 0, m: 0 };
    setLaborDraftHours(parts.h > 0 ? String(parts.h) : '');
    setLaborDraftMinutes(parts.m > 0 ? String(parts.m) : '');
    setLaborEditorServiceId(item.id);
  };

  const applyLaborEditor = (serviceId: string) => {
    keepServiceSuggestionsOpen();
    setSuggestionsForServiceId(serviceId);
    const decimal = parseLaborDurationParts(laborDraftHours, laborDraftMinutes);
    setBudgetServices((prev) =>
      prev.map((item) =>
        item.id === serviceId
          ? { ...item, laborHours: decimal > 0 ? decimal : null }
          : item
      )
    );
    setLaborEditorServiceId(null);
  };

  const clearLaborHours = (serviceId: string) => {
    keepServiceSuggestionsOpen();
    setSuggestionsForServiceId(serviceId);
    setBudgetServices((prev) =>
      prev.map((item) => (item.id === serviceId ? { ...item, laborHours: null } : item))
    );
    setLaborDraftHours('');
    setLaborDraftMinutes('');
    setLaborEditorServiceId(null);
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
    requestAnimationFrame(() => updatePartSuggestionBoxPosition({ ensureSpace: true }));
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
    setLaborEditorServiceId(null);
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
    const onScroll = () => updatePartSuggestionBoxPosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [suggestionsForPartId, updatePartSuggestionBoxPosition]);

  /** Com sugestões abertas: padding extra + scroll para a janela caber abaixo do campo. */
  useLayoutEffect(() => {
    if (!serviceSuggestionsOpen) return;
    updateSuggestionBoxPosition({ ensureSpace: true });
  }, [
    serviceSuggestionsOpen,
    suggestionsForServiceId,
    activeServiceSuggestionIds,
    updateSuggestionBoxPosition,
  ]);

  useLayoutEffect(() => {
    if (!partSuggestionsOpen) return;
    updatePartSuggestionBoxPosition({ ensureSpace: true });
  }, [
    partSuggestionsOpen,
    suggestionsForPartId,
    activePartSuggestionIds,
    updatePartSuggestionBoxPosition,
  ]);

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
    <ModalPortal
      forceBody
      manageBackLayer={!leaveConfirmOpen}
      onRequestClose={requestClose}
    >
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
                onClick={requestClose}
                className={`inline-flex shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 active:bg-slate-300 ${
                  isPc ? 'h-9 w-9' : 'h-7 w-7'
                }`}
                aria-label="Fechar"
              >
                <X className={isPc ? 'h-4 w-4' : 'h-3.5 w-3.5'} strokeWidth={2.4} />
              </button>

              <div className="min-w-0 px-1 text-center">
                <h1
                  className={`truncate font-display font-semibold leading-none tracking-[-0.02em] text-slate-900 ${
                    isPc
                      ? 'text-[24px] sm:text-[26px]'
                      : 'text-[20px] sm:text-[21px]'
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
            ref={budgetScrollRef}
            className={`budget-request-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain ${
              serviceSuggestionsOpen || partSuggestionsOpen
                ? 'pb-72'
                : 'pb-[max(1rem,env(safe-area-inset-bottom))]'
            } ${isPc ? 'px-6 py-5 sm:px-8 lg:px-10 lg:py-6' : 'px-3 py-3 sm:px-4 sm:py-4'}`}
          >
            <div
              className={`mx-auto flex w-full flex-col ${
                isPc ? 'max-w-5xl gap-4' : 'max-w-3xl gap-3 sm:gap-3.5'
              }`}
            >
              {/* Veículo e Cliente — sem ícone/título de seção */}
              <SectionCard hideHeader>
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

                  {/* Cliente + Ver OS na mesma linha */}
                  <div className="flex min-w-0 items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50/90 px-2.5 py-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-200/80 text-slate-600">
                      <User className="h-3.5 w-3.5" strokeWidth={2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-700">
                      {nameDisplay}
                    </span>
                    <button
                      type="button"
                      onClick={onViewOs}
                      className={`inline-flex shrink-0 items-center rounded-lg border border-[#007AFF]/20 bg-[#E8F2FF] font-semibold text-[#007AFF] transition-colors hover:bg-[#DCEBFF] ${
                        isPc ? 'px-3 py-1.5 text-[13px]' : 'px-2.5 py-1.5 text-[12px]'
                      }`}
                    >
                      Ver OS
                    </button>
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
                title="Serviços"
              >
                <div className="space-y-1.5">
                  {budgetServices.map((item, serviceIndex) => {
                    const isFocused =
                      suggestionsForServiceId === item.id || laborEditorServiceId === item.id;
                    const isLaborEditing = laborEditorServiceId === item.id;
                    const hasLabor =
                      item.laborHours != null && Number.isFinite(Number(item.laborHours));
                    const showLaborUnderText = isLaborEditing || hasLabor;
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
                            onKeyDown={(e) =>
                              handleBudgetSuggestionKeyDown({
                                e,
                                open: suggestionsForServiceId === item.id,
                                itemCount: activeServiceSuggestions.length,
                                highlightedIndex: serviceSuggestionHighlight,
                                setHighlightedIndex: setServiceSuggestionHighlight,
                                onSelectHighlighted: (index) => {
                                  const svc = activeServiceSuggestions[index];
                                  if (svc) applySuggestion(item.id, svc);
                                },
                                onCloseSuggestions: () => {
                                  setSuggestionsForServiceId(null);
                                  setServiceSuggestionHighlight(-1);
                                },
                              })
                            }
                            autoFocus={focusServiceId === item.id}
                            dataBudgetServiceId={item.id}
                            compactBottom={showLaborUnderText}
                          />
                          {isLaborEditing ? (
                            <div
                              data-labor-editor=""
                              className="mb-1.5 mt-0.5 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#007AFF]/25 bg-[#E8F2FF]/70 px-2 py-1"
                              onMouseDown={(e) => {
                                keepServiceSuggestionsOpen();
                                // Não preventDefault em input/botão — senão horas/minutos não recebem foco.
                                const el = e.target as HTMLElement | null;
                                if (el?.closest('input, textarea, select, button')) return;
                                e.preventDefault();
                              }}
                            >
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={2}
                                autoComplete="off"
                                placeholder="00"
                                aria-label="Horas"
                                value={laborDraftHours}
                                onChange={(e) =>
                                  setLaborDraftHours(e.target.value.replace(/[^\d]/g, '').slice(0, 2))
                                }
                                onFocus={() => {
                                  keepServiceSuggestionsOpen();
                                  setSuggestionsForServiceId(item.id);
                                }}
                                className="h-7 w-11 rounded-md border border-slate-200 bg-white px-1 text-center text-[12px] font-semibold tabular-nums text-slate-800 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                              />
                              <span className="text-[11px] font-semibold text-[#007AFF]/85">h</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                maxLength={2}
                                autoComplete="off"
                                placeholder="00"
                                aria-label="Minutos"
                                value={laborDraftMinutes}
                                onChange={(e) =>
                                  setLaborDraftMinutes(e.target.value.replace(/[^\d]/g, '').slice(0, 2))
                                }
                                onFocus={() => {
                                  keepServiceSuggestionsOpen();
                                  setSuggestionsForServiceId(item.id);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    applyLaborEditor(item.id);
                                  }
                                }}
                                className="h-7 w-11 rounded-md border border-slate-200 bg-white px-1 text-center text-[12px] font-semibold tabular-nums text-slate-800 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20"
                              />
                              <span className="text-[11px] font-semibold text-[#007AFF]/85">min</span>
                              <button
                                type="button"
                                onMouseDown={(e) => {
                                  e.preventDefault();
                                  keepServiceSuggestionsOpen();
                                }}
                                onClick={() => applyLaborEditor(item.id)}
                                className="inline-flex h-7 items-center justify-center gap-1 rounded-md bg-[#007AFF] px-2 text-[11px] font-semibold text-white"
                                aria-label="Confirmar horas"
                              >
                                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                              </button>
                              {hasLabor ? (
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    keepServiceSuggestionsOpen();
                                  }}
                                  onClick={() => clearLaborHours(item.id)}
                                  className="inline-flex h-7 items-center rounded-md px-1.5 text-[10px] font-semibold text-slate-500 hover:bg-white/80 hover:text-slate-700"
                                >
                                  Limpar
                                </button>
                              ) : null}
                            </div>
                          ) : hasLabor ? (
                            <p className="mt-0 pb-1.5 text-[11px] font-medium leading-tight tabular-nums text-[#007AFF]/80">
                              {formatLaborLabel(Number(item.laborHours))}
                            </p>
                          ) : null}
                        </div>
                        {isFocused ? (
                          <button
                            type="button"
                            onPointerDown={(e) => {
                              // Abre no pointerdown: no tablet o blur do textarea chega antes do click.
                              if (e.button != null && e.button !== 0) return;
                              e.preventDefault();
                              keepServiceSuggestionsOpen();
                              openLaborEditor(item);
                            }}
                            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                              isLaborEditing || hasLabor
                                ? 'bg-[#E8F2FF] text-[#007AFF] hover:bg-[#DCEBFF]'
                                : 'text-[#007AFF]/80 hover:bg-[#E8F2FF] hover:text-[#007AFF]'
                            }`}
                            aria-label={hasLabor ? 'Editar horas do serviço' : 'Adicionar horas do serviço'}
                            title={hasLabor ? 'Editar horas' : 'Adicionar horas'}
                          >
                            <Clock3 className="h-4 w-4" strokeWidth={2.2} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => removeServiceRow(item.id)}
                            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 active:bg-red-100/70"
                            aria-label="Remover serviço"
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={2} />
                          </button>
                        )}
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
                title="Peças"
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
                              if (
                                handleBudgetSuggestionKeyDown({
                                  e,
                                  open: suggestionsForPartId === item.id,
                                  itemCount: activePartSuggestions.length,
                                  highlightedIndex: partSuggestionHighlight,
                                  setHighlightedIndex: setPartSuggestionHighlight,
                                  onSelectHighlighted: (index) => {
                                    const part = activePartSuggestions[index];
                                    if (part) applyPartSuggestion(item.id, part);
                                  },
                                  onCloseSuggestions: () => {
                                    setSuggestionsForPartId(null);
                                    setPartSuggestionHighlight(-1);
                                  },
                                })
                              ) {
                                return;
                              }
                              if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
                              e.preventDefault();
                              addPartRow();
                            }}
                          />
                          {item.fromStock ? (
                            <BudgetPartStockBadge className="scale-90 shrink-0" />
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-0.5">
                          <div className="flex items-center overflow-hidden rounded-lg border border-[#007AFF]/22 bg-[#F5F9FF]">
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => updatePartQuantity(item.id, -1)}
                              className="flex h-8 w-7 items-center justify-center text-[#007AFF] transition-colors hover:bg-[#E8F2FF] active:bg-[#DCEBFF]"
                              aria-label="Diminuir quantidade"
                            >
                              <Minus className="h-3.5 w-3.5" strokeWidth={2.4} />
                            </button>
                            <span className="min-w-[1.35rem] px-0.5 text-center text-[12px] font-semibold tabular-nums text-slate-900">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => updatePartQuantity(item.id, 1)}
                              className="flex h-8 w-7 items-center justify-center text-[#007AFF] transition-colors hover:bg-[#E8F2FF] active:bg-[#DCEBFF]"
                              aria-label="Aumentar quantidade"
                            >
                              <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
                            </button>
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
                title="Observações"
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
          suggestions={activeServiceSuggestions}
          onClose={() => setSuggestionsForServiceId(null)}
          onKeepOpen={keepServiceSuggestionsOpen}
          compactTouch
          highlightedIndex={serviceSuggestionHighlight}
          onHighlightedIndexChange={setServiceSuggestionHighlight}
          onSelect={(svc) => {
            if (suggestionsForServiceId) applySuggestion(suggestionsForServiceId, svc);
          }}
        />

        <BudgetPartSuggestionDropdown
          open={!!suggestionsForPartId}
          position={partSuggestionBoxPosition}
          suggestions={activePartSuggestions}
          onClose={() => setSuggestionsForPartId(null)}
          onKeepOpen={keepPartSuggestionsOpen}
          compactTouch
          highlightedIndex={partSuggestionHighlight}
          onHighlightedIndexChange={setPartSuggestionHighlight}
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

        {leaveConfirmOpen ? (
          <div
            className="absolute inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px] animate-modal-backdrop"
            role="presentation"
            onClick={dismissLeaveConfirm}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="budget-leave-title"
              aria-describedby="budget-leave-desc"
              className="w-full max-w-[22rem] overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_64px_-16px_rgba(15,23,42,0.45)] animate-modal-sheet"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 pb-2 pt-5">
                <p
                  id="budget-leave-title"
                  className="text-[17px] font-semibold tracking-[-0.02em] text-slate-900"
                >
                  Alterações não salvas
                </p>
                <p
                  id="budget-leave-desc"
                  className="mt-2 text-[13.5px] leading-relaxed text-slate-600"
                >
                  Este orçamento tem edições que ainda não foram salvas. Salve para
                  manter o progresso ou feche para descartá-las.
                </p>
              </div>
              <div className="flex flex-col gap-2 px-5 pb-5 pt-3">
                <button
                  type="button"
                  onClick={confirmSaveAndLeave}
                  disabled={sending}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#007AFF] text-[15px] font-semibold text-white shadow-sm shadow-blue-500/25 transition-[filter,transform] hover:brightness-105 active:scale-[0.99] disabled:opacity-55"
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.2} />
                  ) : null}
                  Salvar e fechar
                </button>
                <button
                  type="button"
                  onClick={confirmLeaveWithoutSaving}
                  disabled={sending}
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-[15px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 active:bg-slate-100 disabled:opacity-55"
                >
                  Fechar sem salvar
                </button>
                <button
                  type="button"
                  onClick={dismissLeaveConfirm}
                  disabled={sending}
                  className="inline-flex h-10 w-full items-center justify-center rounded-xl text-[13.5px] font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700 disabled:opacity-55"
                >
                  Continuar editando
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </ModalPortal>
  );
}
