import React from 'react';
import {
  CheckCircle2,
  Clock,
  Columns3,
  FileText,
  Hourglass,
  LayoutList,
  Sparkles,
  Wrench,
} from 'lucide-react';
import type { PatioVehicleBudgetAggregateItem } from '../../../services/apiService';
import { useDragScroll } from '../../../hooks/useDragScroll';
import { iosPageGlass } from '../../ui/iosModalStyles';
import {
  getPatioBoardColumnHeaderTopClass,
  getPatioBoardColumnShellClass,
} from '../../../utils/patioBoardGlassCard';
import type { BudgetsHubScope, BudgetsHubViewMode, StageKanbanColumn } from '../../../utils/budgetsHubViews';
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
      className={`inline-flex shrink-0 self-center rounded-lg border p-0.5 ${
        isLab
          ? 'border-violet-400/35 bg-violet-500/10 dark:border-violet-400/25 dark:bg-violet-500/15'
          : 'border-amber-400/35 bg-amber-500/10 dark:border-amber-400/25 dark:bg-amber-500/15'
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
            className={`rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-[0.06em] transition ${
              active
                ? tab.id === 'laboratory'
                  ? 'bg-violet-600 text-white shadow-sm'
                  : 'bg-amber-600 text-white shadow-sm'
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
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border font-bold uppercase tracking-[0.06em] ${
        compact ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
      } ${
        isLab
          ? 'border-violet-400/55 bg-violet-500/12 text-violet-800 dark:border-violet-400/40 dark:bg-violet-500/18 dark:text-violet-200'
          : 'border-[#007AFF]/40 bg-[#007AFF]/10 text-[#0058c7] dark:border-[#0A84FF]/45 dark:bg-[#0A84FF]/12 dark:text-[#8cc8ff]'
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
}: {
  mode: BudgetsHubViewMode;
  onModeChange: (m: BudgetsHubViewMode) => void;
  desktopShell?: boolean;
}) {
  const activeMeta = BUDGETS_HUB_VIEW_MODES.find((m) => m.id === mode);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const helpRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    if (!helpOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [helpOpen]);

  return (
    <div className={desktopShell ? 'mb-4' : 'mb-3'}>
      <div className="flex items-center gap-2">
        <div className="budgets-hub-no-scrollbar flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
          {BUDGETS_HUB_VIEW_MODES.map((m) => {
            const active = mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onModeChange(m.id)}
                title={m.description}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold uppercase tracking-[0.06em] transition-all ${
                  active
                    ? 'border-zinc-800 bg-zinc-900 text-white shadow-md dark:border-zinc-200 dark:bg-white dark:text-zinc-900'
                    : 'border-zinc-200/90 bg-white/90 text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-white/[0.12] dark:bg-zinc-900/80 dark:text-zinc-300 dark:hover:bg-zinc-800'
                }`}
              >
                {VIEW_ICONS[m.id]}
                <span className="hidden sm:inline">{m.label}</span>
                <span className="sm:hidden">{m.shortLabel}</span>
              </button>
            );
          })}
        </div>
        {activeMeta ? (
          <div ref={helpRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => setHelpOpen((o) => !o)}
              aria-label="O que é esta visualização?"
              aria-expanded={helpOpen}
              className="flex h-7 w-7 items-center justify-center rounded-full bg-[#007AFF] text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#0058c7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/45 focus-visible:ring-offset-1"
            >
              ?
            </button>
            {helpOpen ? (
              <div className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-zinc-200/90 bg-white p-3 text-left shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] dark:border-white/[0.12] dark:bg-zinc-900 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55)]">
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                  {activeMeta.label}
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {activeMeta.description}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function siblingsForOrder(
  allItems: PatioVehicleBudgetAggregateItem[],
  serviceOrderId: string
): Pick<PatioVehicleBudgetAggregateItem, 'budgetId' | 'createdAt'>[] {
  const oid = String(serviceOrderId).trim().toLowerCase();
  return allItems
    .filter((x) => String(x.serviceOrderId).trim().toLowerCase() === oid)
    .map((x) => ({ budgetId: x.budgetId, createdAt: x.createdAt }));
}

/** Grade de cards de orçamento (estilo Pátio). */
export function BudgetHubCardsGrid({
  items,
  allItems,
  pulseByBudgetId,
  pendingBudgetHighlightIds,
  onOpenBudget,
  blurPlates,
  desktopShell,
  compact,
}: {
  items: PatioVehicleBudgetAggregateItem[];
  /** Base completa do escopo (para numeração Orç. N por OS). */
  allItems: PatioVehicleBudgetAggregateItem[];
  pulseByBudgetId: Record<string, 'created' | 'edited'>;
  pendingBudgetHighlightIds: Set<string>;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
  blurPlates?: boolean;
  desktopShell?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`grid gap-3 ${
        desktopShell
          ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
          : 'grid-cols-1 sm:grid-cols-2'
      }`}
    >
      {items.map((row) => {
        const bid = String(row.budgetId).trim();
        return (
          <BudgetHubPatioStyleCard
            key={row.budgetId}
            row={row}
            siblings={siblingsForOrder(allItems, row.serviceOrderId)}
            pulse={pulseByBudgetId[bid]}
            needsAttention={pendingBudgetHighlightIds.has(bid)}
            blurPlates={blurPlates}
            desktopShell={desktopShell}
            compact={compact}
            onOpen={() => onOpenBudget(row.serviceOrderId, row.budgetId)}
          />
        );
      })}
    </div>
  );
}

export function BudgetHubStageBoard({
  columns,
  allItems,
  pendingBudgetHighlightIds,
  pulseByBudgetId,
  onOpenBudget,
  blurPlates,
  desktopShell,
}: {
  columns: StageKanbanColumn[];
  allItems: PatioVehicleBudgetAggregateItem[];
  pendingBudgetHighlightIds: Set<string>;
  pulseByBudgetId: Record<string, 'created' | 'edited'>;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
  blurPlates?: boolean;
  desktopShell?: boolean;
}) {
  const colMin = desktopShell ? 'min-w-[20rem] w-[20rem]' : 'min-w-[16.5rem] w-[16.5rem]';
  const dragRef = useDragScroll<HTMLDivElement>();
  const columnShell = getPatioBoardColumnShellClass(Boolean(desktopShell));
  const headerTop = getPatioBoardColumnHeaderTopClass(Boolean(desktopShell));

  return (
    <div
      ref={dragRef}
      className="budgets-hub-no-scrollbar flex h-full min-h-0 cursor-grab gap-3 overflow-x-auto overflow-y-hidden overscroll-x-contain px-1 pb-1 [-webkit-overflow-scrolling:touch]"
    >
      {columns.map((col) => (
        <div key={col.status} className={`${colMin} flex h-full min-h-0 shrink-0 flex-col ${columnShell}`}>
          <div className={`z-[1] shrink-0 border-b border-zinc-200/80 px-3 py-2.5 ${headerTop} ${col.style}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em]">{col.name}</p>
            <p className="mt-0.5 text-[10px] font-semibold opacity-90">
              {col.budgetCount} orçamento{col.budgetCount === 1 ? '' : 's'}
            </p>
          </div>
          <div className="budgets-hub-no-scrollbar flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain p-2 [-webkit-overflow-scrolling:touch]">
            {col.items.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12px] text-zinc-500 dark:text-zinc-400">
                Nenhum orçamento nesta etapa
              </p>
            ) : (
              col.items.map((row) => {
                const bid = String(row.budgetId).trim();
                return (
                  <BudgetHubPatioStyleCard
                    key={row.budgetId}
                    row={row}
                    siblings={siblingsForOrder(allItems, row.serviceOrderId)}
                    pulse={pulseByBudgetId[bid]}
                    needsAttention={pendingBudgetHighlightIds.has(bid)}
                    blurPlates={blurPlates}
                    desktopShell={desktopShell}
                    compact
                    onOpen={() => onOpenBudget(row.serviceOrderId, row.budgetId)}
                  />
                );
              })
            )}
          </div>
        </div>
      ))}
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
