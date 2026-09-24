import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  ChevronDown,
  Clock,
  Columns3,
  FileText,
  Hourglass,
  LayoutList,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { PatioVehicleBudgetAggregateItem } from '../../../services/apiService';
import { iosPageGlass } from '../../ui/iosModalStyles';
import {
  getPatioBoardColumnHeaderTopClass,
  getPatioBoardColumnShellClass,
} from '../../../utils/patioBoardGlassCard';
import type { BudgetsHubScope, BudgetsHubViewMode, StageKanbanColumn, VehicleBudgetGroup } from '../../../utils/budgetsHubViews';
import { BUDGETS_HUB_VIEW_MODES } from '../../../utils/budgetsHubViews';
import { BudgetHubPatioStyleCard } from './BudgetHubPatioStyleCard';

/** Toggle compacto Pátio / Laboratório (ao lado dos chips de estatísticas). */
export function BudgetsHubScopeToggle({
  scope,
  onChange,
}: {
  scope: BudgetsHubScope;
  onChange: (scope: BudgetsHubScope) => void;
}) {
  const isLab = scope === 'laboratory';
  return (
    <div
      className={`inline-flex shrink-0 self-center rounded-lg border-0 p-0.5 shadow-none ${
        isLab
          ? 'bg-violet-500/10 dark:bg-violet-500/15'
          : 'bg-amber-500/10 dark:bg-amber-500/15'
      }`}
      role="tablist"
      aria-label="Origem dos orçamentos"
    >
      {(
        [
          { id: 'patio' as const, label: 'Pátio' },
          { id: 'laboratory' as const, label: 'Lab.' },
        ] as const
      ).map((tab) => {
        const active = scope === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`rounded-md px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.06em] transition ${
              active
                ? tab.id === 'laboratory'
                  ? 'bg-violet-600 text-white shadow-none'
                  : 'bg-amber-600 text-white shadow-none'
                : 'text-zinc-600 hover:bg-white/60 dark:text-zinc-300 dark:hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Etiqueta Pátio ou Laboratório no orçamento / veículo. */
export function BudgetOrderOriginBadge({
  orderType,
  compact,
}: {
  orderType: 'vehicle' | 'module';
  compact?: boolean;
}) {
  const isLab = orderType === 'module';
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border-0 font-bold uppercase tracking-[0.06em] shadow-none ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      } ${
        isLab
          ? 'bg-violet-500/12 text-violet-800 dark:bg-violet-500/18 dark:text-violet-200'
          : 'bg-[#007AFF]/10 text-[#0058c7] dark:bg-[#0A84FF]/12 dark:text-[#8cc8ff]'
      }`}
      title={isLab ? 'Orçamento do Laboratório' : 'Orçamento do Pátio'}
    >
      <img
        src={isLab ? '/icons/laboratorio-ios.png' : '/icons/patio-ios.png'}
        alt=""
        className={`rounded-[4px] object-cover ${compact ? 'h-3 w-3' : 'h-3.5 w-3.5'}`}
      />
      {isLab ? 'Laboratório' : 'Pátio'}
    </span>
  );
}

export function budgetOrderTitle(
  row: Pick<PatioVehicleBudgetAggregateItem, 'orderType' | 'plate' | 'moduleIdentification' | 'vehicleModel' | 'vehicleBrand'>,
  plateDisplay?: (plate: string | null) => React.ReactNode
): React.ReactNode {
  if (row.orderType === 'module') {
    const id = (row.moduleIdentification ?? row.vehicleModel ?? '').trim();
    return id || 'Módulo';
  }
  const p = (row.plate ?? '').trim();
  if (plateDisplay) return plateDisplay(row.plate);
  return p ? p.toUpperCase() : '—';
}

const VIEW_ICONS: Record<BudgetsHubViewMode, React.ReactNode> = {
  vehicles: <LayoutList className="h-3.5 w-3.5" strokeWidth={2.2} />,
  recent: <Sparkles className="h-3.5 w-3.5" strokeWidth={2.2} />,
  activity: <Clock className="h-3.5 w-3.5" strokeWidth={2.2} />,
  approved: <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.2} />,
  awaiting_approval: <Hourglass className="h-3.5 w-3.5" strokeWidth={2.2} />,
  in_service: <Wrench className="h-3.5 w-3.5" strokeWidth={2.2} />,
  by_stage: <Columns3 className="h-3.5 w-3.5" strokeWidth={2.2} />,
};

export function formatBudgetWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export function BudgetsHubViewSwitcher({
  mode,
  onModeChange,
  desktopShell,
  startSlot,
  endSlot,
}: {
  mode: BudgetsHubViewMode;
  onModeChange: (m: BudgetsHubViewMode) => void;
  desktopShell?: boolean;
  /** Conteúdo à esquerda dos atalhos (ex.: toggle Pátio/Lab). */
  startSlot?: React.ReactNode;
  /** Conteúdo à direita (ex.: botão atualizar / ⋯). */
  endSlot?: React.ReactNode;
}) {
  const activeMeta = BUDGETS_HUB_VIEW_MODES.find((m) => m.id === mode);
  const [menuOpen, setMenuOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const updateMenuPos = React.useCallback(() => {
    const btn = triggerRef.current;
    if (!btn || typeof window === 'undefined') return;
    const rect = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(Math.max(rect.width, 16 * 16), vw - 24);
    let left = rect.left;
    left = Math.max(12, Math.min(left, vw - width - 12));
    setMenuPos({ top: rect.bottom + 8, left, width });
  }, []);

  React.useEffect(() => {
    if (!menuOpen) return;
    updateMenuPos();
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuPanelRef.current?.contains(t)) return;
      setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    const onReposition = () => updateMenuPos();
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [menuOpen, updateMenuPos]);

  return (
    <div className={desktopShell ? '' : ''}>
      <div className="flex items-center gap-2">
        {startSlot ? <div className="shrink-0 self-center">{startSlot}</div> : null}
        <div className="relative min-w-0 flex-1">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-expanded={menuOpen}
            aria-haspopup="listbox"
            title={activeMeta?.description}
            className="inline-flex h-9 max-w-full items-center gap-1.5 rounded-full border-0 bg-zinc-900 px-3 text-[11px] font-bold uppercase tracking-[0.06em] text-white shadow-none transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
          >
            {activeMeta ? VIEW_ICONS[activeMeta.id] : <Columns3 className="h-3.5 w-3.5" strokeWidth={2.2} />}
            <span className="truncate">{activeMeta?.label ?? 'Visualização'}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 opacity-80 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
              strokeWidth={2.4}
              aria-hidden
            />
          </button>
          {menuOpen && menuPos && typeof document !== 'undefined'
            ? createPortal(
                <div
                  ref={menuPanelRef}
                  role="listbox"
                  aria-label="Modos de visualização"
                  style={{
                    position: 'fixed',
                    top: menuPos.top,
                    left: menuPos.left,
                    width: menuPos.width,
                    zIndex: 99999,
                  }}
                  className="max-h-[min(70vh,24rem)] overflow-y-auto overscroll-contain rounded-xl border border-zinc-200/90 bg-white py-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)] dark:border-white/[0.12] dark:bg-zinc-900 dark:shadow-[0_16px_40px_-12px_rgba(0,0,0,0.65)]"
                >
                  {BUDGETS_HUB_VIEW_MODES.map((m) => {
                    const active = mode === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onModeChange(m.id);
                          setMenuOpen(false);
                        }}
                        className={`flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors ${
                          active
                            ? 'bg-[#007AFF]/10 text-[#0058c7] dark:bg-[#0A84FF]/15 dark:text-[#8cc8ff]'
                            : 'text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="mt-0.5 shrink-0">{VIEW_ICONS[m.id]}</span>
                        <span className="min-w-0">
                          <span className="block text-[12px] font-bold uppercase tracking-[0.05em]">{m.label}</span>
                          <span className="mt-0.5 block text-[11px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">
                            {m.description}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>,
                document.body
              )
            : null}
        </div>
        {endSlot ? <div className="shrink-0 self-center">{endSlot}</div> : null}
      </div>
    </div>
  );
}

/** Grade de cards — um card por veículo/OS. */
export function BudgetHubCardsGrid({
  groups,
  pulseByBudgetId,
  pendingBudgetHighlightIds,
  onOpenBudget,
  blurPlates,
  desktopShell,
  compact,
  userZoomScale = 1,
}: {
  groups: VehicleBudgetGroup[];
  pulseByBudgetId: Record<string, 'created' | 'edited'>;
  pendingBudgetHighlightIds: Set<string>;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
  blurPlates?: boolean;
  desktopShell?: boolean;
  compact?: boolean;
  userZoomScale?: number;
}) {
  return (
    <div
      className={`grid gap-3 ${
        desktopShell
          ? 'grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2'
      }`}
    >
      {groups.map((group) => {
        const pendingNew = new Set(
          group.items
            .map((row) => String(row.budgetId).trim())
            .filter((id) => pendingBudgetHighlightIds.has(id))
        );
        return (
          <BudgetHubPatioStyleCard
            key={group.orderId}
            group={group}
            pulseByBudgetId={pulseByBudgetId}
            pendingNewBudgetIds={pendingNew}
            blurPlates={blurPlates}
            desktopShell={desktopShell}
            compact={compact}
            gridScale
            userZoomScale={userZoomScale}
            onOpenBudget={onOpenBudget}
          />
        );
      })}
    </div>
  );
}

/**
 * Quadro Trello do hub: rolagem horizontal nativa + vertical por coluna.
 * Cards menores (zoom) e sem <button> para o toque não travar a rolagem no iOS.
 */
export function BudgetHubStageBoard({
  columns,
  pendingBudgetHighlightIds,
  pulseByBudgetId,
  onOpenBudget,
  blurPlates,
  desktopShell,
  userZoomScale = 1,
}: {
  columns: StageKanbanColumn[];
  pendingBudgetHighlightIds: Set<string>;
  pulseByBudgetId: Record<string, 'created' | 'edited'>;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
  blurPlates?: boolean;
  desktopShell?: boolean;
  userZoomScale?: number;
}) {
  const colMin = desktopShell ? 'min-w-[15.5rem] w-[15.5rem]' : 'min-w-[13.25rem] w-[13.25rem]';
  const boardRef = useRef<HTMLDivElement | null>(null);
  const boardWrapRef = useRef<HTMLDivElement | null>(null);
  const [boardHeight, setBoardHeight] = useState<number>(0);
  const columnShell = getPatioBoardColumnShellClass(Boolean(desktopShell));
  const headerTop = getPatioBoardColumnHeaderTopClass(Boolean(desktopShell));
  const dragState = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    axis: 'none' | 'x' | 'y';
    colEl: HTMLElement | null;
    colScrollTop: number;
  } | null>(null);

  useLayoutEffect(() => {
    const el = boardWrapRef.current;
    if (!el || typeof window === 'undefined') return;

    const measure = () => {
      const top = el.getBoundingClientRect().top;
      const bottomGap = desktopShell ? 20 : 96;
      const vh = window.visualViewport?.height ?? window.innerHeight;
      const next = Math.max(240, Math.floor(vh - top - bottomGap));
      setBoardHeight((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    ro?.observe(document.documentElement);
    window.addEventListener('resize', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, [desktopShell]);

  /** Arraste (mouse/touch) com trava de eixo: X = quadro, Y = coluna. */
  useLayoutEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      const colScroll = target?.closest?.('.budgets-hub-col-scroll') as HTMLElement | null;
      dragState.current = {
        active: true,
        moved: false,
        startX: e.clientX,
        startY: e.clientY,
        scrollLeft: board.scrollLeft,
        axis: 'none',
        colEl: colScroll,
        colScrollTop: colScroll?.scrollTop ?? 0,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      const st = dragState.current;
      if (!st?.active) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;

      if (st.axis === 'none') {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        st.axis = Math.abs(dx) >= Math.abs(dy) ? 'x' : 'y';
        st.moved = true;
        try {
          board.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      }

      if (st.axis === 'x') {
        e.preventDefault();
        board.scrollLeft = st.scrollLeft - dx;
      } else if (st.axis === 'y' && st.colEl) {
        e.preventDefault();
        st.colEl.scrollTop = st.colScrollTop - dy;
      }
    };

    const endPointer = (e: PointerEvent) => {
      const st = dragState.current;
      if (!st) return;
      if (st.moved && st.axis !== 'none') {
        const cancelClick = (ev: MouseEvent) => {
          ev.preventDefault();
          ev.stopPropagation();
          window.removeEventListener('click', cancelClick, true);
        };
        window.addEventListener('click', cancelClick, true);
        window.setTimeout(() => window.removeEventListener('click', cancelClick, true), 120);
      }
      try {
        board.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      dragState.current = null;
    };

    /** PC: hover na coluna + wheel → sobe/desce só aquela coluna. */
    const onWheel = (e: WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || !board.contains(target)) return;

      let colScroll = target.closest('.budgets-hub-col-scroll') as HTMLElement | null;
      if (!colScroll) {
        const col = target.closest('[data-budgets-hub-col]') as HTMLElement | null;
        colScroll = col?.querySelector('.budgets-hub-col-scroll') as HTMLElement | null;
      }
      if (!colScroll) return;

      const dx = e.deltaX;
      const dy = e.deltaY;
      const mostlyHorizontal = Math.abs(dx) > Math.abs(dy);

      if (mostlyHorizontal) {
        if (dx === 0) return;
        e.preventDefault();
        board.scrollLeft += dx;
        return;
      }

      if (dy === 0) return;
      e.preventDefault();
      colScroll.scrollTop += dy;
    };

    board.addEventListener('pointerdown', onPointerDown, { passive: true });
    board.addEventListener('pointermove', onPointerMove, { passive: false });
    board.addEventListener('pointerup', endPointer);
    board.addEventListener('pointercancel', endPointer);
    board.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      board.removeEventListener('pointerdown', onPointerDown);
      board.removeEventListener('pointermove', onPointerMove);
      board.removeEventListener('pointerup', endPointer);
      board.removeEventListener('pointercancel', endPointer);
      board.removeEventListener('wheel', onWheel);
    };
  }, [boardHeight]);

  return (
    <div
      ref={boardWrapRef}
      className="w-full min-w-0"
      style={boardHeight > 0 ? { height: boardHeight } : { height: '55vh' }}
    >
      <div
        ref={boardRef}
        className="budgets-hub-trello-board budgets-hub-no-scrollbar flex h-full min-h-0 gap-2.5 overflow-x-auto overflow-y-hidden overscroll-x-contain px-0.5 [-webkit-overflow-scrolling:touch]"
      >
        {columns.map((col) => (
          <div
            key={col.status}
            data-budgets-hub-col
            className={`${colMin} flex h-full min-h-0 shrink-0 flex-col overflow-hidden ${columnShell}`}
          >
            <div className={`z-[1] shrink-0 border-b border-zinc-200/80 px-2.5 py-2.5 ${headerTop} ${col.style}`}>
              <p className="text-[10px] font-bold uppercase tracking-[0.06em]">{col.name}</p>
            </div>
            <div className="budgets-hub-col-scroll budgets-hub-no-scrollbar min-h-0 flex-1 space-y-1.5 p-1.5">
              {col.groups.length === 0 ? (
                <p className="px-2 py-6 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
                  Nenhum veículo nesta etapa
                </p>
              ) : (
                col.groups.map((group) => {
                  const pendingNew = new Set(
                    group.items
                      .map((row) => String(row.budgetId).trim())
                      .filter((id) => pendingBudgetHighlightIds.has(id))
                  );
                  return (
                    <BudgetHubPatioStyleCard
                      key={group.orderId}
                      group={group}
                      pulseByBudgetId={pulseByBudgetId}
                      pendingNewBudgetIds={pendingNew}
                      blurPlates={blurPlates}
                      desktopShell={desktopShell}
                      compact
                      trelloScale
                      hideStageFooter
                      userZoomScale={userZoomScale}
                      onOpenBudget={onOpenBudget}
                    />
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BudgetsHubEmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className={`${iosPageGlass} p-8 text-center`}>
      <FileText className="mx-auto mb-3 h-10 w-10 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
      <p className="text-[16px] font-semibold text-zinc-900 dark:text-white">{message}</p>
      {hint ? <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">{hint}</p> : null}
    </div>
  );
}
