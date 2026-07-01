import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Sparkles } from 'lucide-react';
import {
  getPatioVehicleBudgetsAggregate,
  type PatioVehicleBudgetAggregateItem,
} from '../../services/apiService';
import { iosPageGlass } from '../ui/iosModalStyles';
import { IosAccentIconSquircle } from '../ui/IosAccentIconSquircle';
import { usePatioBudgetsHubLiveSync } from '../../hooks/usePatioBudgetsHubLiveSync';
import { useDesktopShellLayout } from '../ui/DesktopShellContext';
import {
  BUDGETS_HUB_VIEW_MODES,
  buildStageKanbanColumns,
  buildVehicleGroups,
  buildVehicleGroupsForView,
  computeBudgetsHubStats,
  filterBudgetsByHubScope,
  readStoredBudgetsHubScope,
  readStoredBudgetsHubView,
  storeBudgetsHubScope,
  storeBudgetsHubView,
  type BudgetsHubScope,
  type BudgetsHubViewMode,
} from '../../utils/budgetsHubViews';
import {
  BudgetHubStageBoard,
  BudgetHubVehicleGroup,
  BudgetsHubEmptyState,
  BudgetsHubScopeToggle,
  BudgetsHubStatsStrip,
  BudgetsHubViewSwitcher,
} from './budgets/BudgetsHubUi';

const BUDGETS_CHANGED = 'rda-patio-budgets-changed';

function normalizeAggregateItem(raw: PatioVehicleBudgetAggregateItem): PatioVehicleBudgetAggregateItem {
  return {
    ...raw,
    orderType: raw.orderType === 'module' ? 'module' : 'vehicle',
    moduleIdentification: raw.moduleIdentification ?? null,
    hasApprovedItems: raw.hasApprovedItems ?? false,
    hasExplicitApprovalDecisions: raw.hasExplicitApprovalDecisions ?? false,
    approvedItemsCount: raw.approvedItemsCount ?? 0,
    rejectedItemsCount: raw.rejectedItemsCount ?? 0,
    pendingItemsCount: raw.pendingItemsCount ?? 0,
    isVerified: raw.isVerified ?? false,
    verifiedAt: raw.verifiedAt ?? null,
    verifiedByName: raw.verifiedByName ?? null,
  };
}

export interface BudgetsHubViewProps {
  blurPlates?: boolean;
  isHubTabActive?: boolean;
  onOpenBudgetInPatio: (serviceOrderId: string, budgetId: string) => void;
  onIngestNotifierBaseline: (items: Pick<PatioVehicleBudgetAggregateItem, 'budgetId' | 'contentSignature'>[]) => void;
  onClearHubBadge: () => void;
  consumePendingHubBudgetHighlights?: () => { budgetId: string; kind: 'created' | 'edited' }[];
}

export const BudgetsHubView: React.FC<BudgetsHubViewProps> = ({
  blurPlates = false,
  isHubTabActive = true,
  onOpenBudgetInPatio,
  onIngestNotifierBaseline,
  onClearHubBadge,
  consumePendingHubBudgetHighlights,
}) => {
  const desktopShell = useDesktopShellLayout();
  const [items, setItems] = useState<PatioVehicleBudgetAggregateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewMode, setViewMode] = useState<BudgetsHubViewMode>(() => readStoredBudgetsHubView());
  const [hubScope, setHubScope] = useState<BudgetsHubScope>(() => readStoredBudgetsHubScope());
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pendingBudgetHighlightIds, setPendingBudgetHighlightIds] = useState<Set<string>>(() => new Set());
  const [pulseByBudgetId, setPulseByBudgetId] = useState<Record<string, 'created' | 'edited'>>({});
  const prevSigByBudgetRef = useRef<Map<string, string>>(new Map());
  const isFirstFetchRef = useRef(true);
  const loadRequestGenRef = useRef(0);
  const baselineIngestRef = useRef(onIngestNotifierBaseline);
  baselineIngestRef.current = onIngestNotifierBaseline;
  const isHubTabActiveRef = useRef(isHubTabActive);
  isHubTabActiveRef.current = isHubTabActive;
  const consumeHighlightsRef = useRef(consumePendingHubBudgetHighlights);
  consumeHighlightsRef.current = consumePendingHubBudgetHighlights;
  const focusHighlightBatchRef = useRef<{ budgetId: string; kind: 'created' | 'edited' }[] | null>(null);

  const handleViewModeChange = useCallback((mode: BudgetsHubViewMode) => {
    setViewMode(mode);
    storeBudgetsHubView(mode);
  }, []);

  const handleHubScopeChange = useCallback((scope: BudgetsHubScope) => {
    setHubScope(scope);
    storeBudgetsHubScope(scope);
  }, []);

  const scopedItems = useMemo(() => filterBudgetsByHubScope(items, hubScope), [items, hubScope]);

  const load = useCallback(async (opts?: { silent?: boolean; skipNotifierIngest?: boolean }) => {
    const reqId = ++loadRequestGenRef.current;
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = (await getPatioVehicleBudgetsAggregate()).map(normalizeAggregateItem);
      if (reqId !== loadRequestGenRef.current) return;

      setItems(data);

      let pulsesFromDiff: Record<string, 'created' | 'edited'> = {};

      if (isFirstFetchRef.current) {
        isFirstFetchRef.current = false;
        const m = new Map<string, string>();
        data.forEach((d) => m.set(String(d.budgetId).trim(), d.contentSignature));
        prevSigByBudgetRef.current = m;
        baselineIngestRef.current(data);
      } else {
        const prev = prevSigByBudgetRef.current;
        for (const d of data) {
          const bid = String(d.budgetId).trim();
          const old = prev.get(bid);
          if (old === undefined) pulsesFromDiff[bid] = 'created';
          else if (old !== d.contentSignature) pulsesFromDiff[bid] = 'edited';
        }
        const nextMap = new Map<string, string>();
        data.forEach((d) => nextMap.set(String(d.budgetId).trim(), d.contentSignature));
        prevSigByBudgetRef.current = nextMap;
        if (!opts?.skipNotifierIngest) {
          baselineIngestRef.current(data);
        }
      }

      const fromFocus = focusHighlightBatchRef.current;
      focusHighlightBatchRef.current = null;

      const merged: Record<string, 'created' | 'edited'> = { ...pulsesFromDiff };
      for (const row of fromFocus ?? []) {
        merged[String(row.budgetId).trim()] = row.kind;
      }

      if (Object.keys(merged).length > 0) {
        setPulseByBudgetId((p) => ({ ...p, ...merged }));
        setPendingBudgetHighlightIds((prev) => {
          const next = new Set(prev);
          for (const k of Object.keys(merged)) next.add(k);
          return next;
        });
      }
    } catch (e: unknown) {
      if (reqId !== loadRequestGenRef.current) return;
      setError((e as Error)?.message ?? 'Não foi possível carregar os orçamentos.');
    } finally {
      if (reqId === loadRequestGenRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const syncFromRealtime = useCallback(() => {
    void load({
      silent: true,
      skipNotifierIngest: !isHubTabActiveRef.current,
    });
  }, [load]);

  usePatioBudgetsHubLiveSync(syncFromRealtime, { enabled: true });

  useEffect(() => {
    if (!isHubTabActive) return;
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      void load({
        silent: true,
        skipNotifierIngest: !isHubTabActiveRef.current,
      });
    }, 90000);
    return () => window.clearInterval(id);
  }, [load, isHubTabActive]);

  useEffect(() => {
    if (!isHubTabActive) return;
    onClearHubBadge();
    focusHighlightBatchRef.current = consumeHighlightsRef.current ? consumeHighlightsRef.current() : null;
    void load({ silent: true, skipNotifierIngest: false });
  }, [isHubTabActive, onClearHubBadge, load]);

  useEffect(() => {
    const onEvt = () =>
      void load({
        silent: true,
        skipNotifierIngest: !isHubTabActiveRef.current,
      });
    window.addEventListener(BUDGETS_CHANGED, onEvt);
    return () => window.removeEventListener(BUDGETS_CHANGED, onEvt);
  }, [load]);

  useEffect(() => {
    if (Object.keys(pulseByBudgetId).length === 0) return;
    const t = window.setTimeout(() => setPulseByBudgetId({}), 50000);
    return () => window.clearTimeout(t);
  }, [pulseByBudgetId]);

  const stats = useMemo(() => computeBudgetsHubStats(scopedItems), [scopedItems]);
  const allGroups = useMemo(() => buildVehicleGroups(scopedItems), [scopedItems]);
  const groupsForView = useMemo(() => buildVehicleGroupsForView(scopedItems, viewMode), [scopedItems, viewMode]);

  const kanbanColumns = useMemo(() => buildStageKanbanColumns(allGroups), [allGroups]);

  const activeViewMeta = BUDGETS_HUB_VIEW_MODES.find((m) => m.id === viewMode);

  const toggleExpand = (orderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const openBudgetFromHub = (serviceOrderId: string, budgetId: string) => {
    const bid = String(budgetId).trim();
    setPendingBudgetHighlightIds((prev) => {
      const next = new Set(prev);
      next.delete(bid);
      return next;
    });
    setPulseByBudgetId((prev) => {
      if (!(bid in prev)) return prev;
      const { [bid]: _, ...rest } = prev;
      return rest;
    });
    onOpenBudgetInPatio(serviceOrderId, budgetId);
  };

  const plateDisplay = (plate: string | null) => {
    const p = (plate ?? '').trim();
    if (!p) return '—';
    if (blurPlates) {
      return (
        <span className="blur-plate" aria-hidden>
          {p}
        </span>
      );
    }
    return p.toUpperCase();
  };

  const mainMaxW = desktopShell ? 'max-w-none' : 'max-w-3xl';
  const mainPad = desktopShell ? 'px-6 py-5 pb-8' : 'px-4 py-5 pb-[max(5.5rem,env(safe-area-inset-bottom)+3rem)]';

  const renderContent = () => {
    if (loading) {
      return (
        <div className={`${iosPageGlass} p-10 text-center text-[15px] text-zinc-600 dark:text-zinc-300`}>
          Carregando orçamentos…
        </div>
      );
    }
    if (error) {
      return <div className={`${iosPageGlass} p-6 text-[15px] text-red-600 dark:text-red-400`}>{error}</div>;
    }
    if (scopedItems.length === 0) {
      return (
        <BudgetsHubEmptyState
          message={hubScope === 'laboratory' ? 'Nenhum orçamento no laboratório' : 'Nenhum orçamento no pátio'}
          hint={
            hubScope === 'laboratory'
              ? 'Orçamentos de módulos em etapas ativas aparecerão aqui — inclusive os vindos da avaliação técnica.'
              : 'Orçamentos de veículos em etapas ativas aparecerão aqui automaticamente.'
          }
        />
      );
    }

    if (viewMode === 'by_stage') {
      return (
        <BudgetHubStageBoard
          columns={kanbanColumns}
          plateDisplay={plateDisplay}
          pendingBudgetHighlightIds={pendingBudgetHighlightIds}
          pulseByBudgetId={pulseByBudgetId}
          onOpenBudget={openBudgetFromHub}
          expanded={expanded}
          onToggleExpand={toggleExpand}
          desktopShell={desktopShell}
        />
      );
    }

    const groupsToShow = viewMode === 'by_stage' ? [] : groupsForView;
    if (groupsToShow.length === 0) {
      return (
        <BudgetsHubEmptyState
          message="Nada nesta visualização"
          hint={activeViewMeta?.description ?? 'Tente outro modo de organização.'}
        />
      );
    }

    return (
      <div className="space-y-4">
        {groupsToShow.map((group) => {
          const vehicleNeedsAttention = group.items.some((row) =>
            pendingBudgetHighlightIds.has(String(row.budgetId).trim())
          );
          return (
            <BudgetHubVehicleGroup
              key={group.orderId}
              group={group}
              expanded={expanded.has(group.orderId)}
              onToggle={() => toggleExpand(group.orderId)}
              plateDisplay={plateDisplay}
              vehicleNeedsAttention={vehicleNeedsAttention}
              pulseByBudgetId={pulseByBudgetId}
              onOpenBudget={openBudgetFromHub}
              desktopShell={desktopShell}
            />
          );
        })}
      </div>
    );
  };

  const isLabScope = hubScope === 'laboratory';
  const headerTheme = isLabScope
    ? 'border-violet-500/25 bg-violet-500/[0.06] dark:border-violet-400/20 dark:bg-violet-500/10'
    : 'border-amber-500/25 bg-amber-500/[0.06] dark:border-amber-400/20 dark:bg-amber-500/10';
  const scopeAccent = isLabScope ? 'text-violet-800 dark:text-violet-200' : 'text-amber-900 dark:text-amber-200';

  return (
    <div className={`flex min-h-min flex-col bg-light-page dark:bg-black ${desktopShell ? 'min-h-full' : ''}`}>
      <header className={`budgets-hub-page-header shrink-0 border-b px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl lg:px-6 ${headerTheme} ${isLabScope ? 'border-violet-500/20 dark:border-violet-400/15' : 'border-amber-500/20 dark:border-amber-400/15'}`}>
        <div className={`mx-auto flex w-full ${mainMaxW} items-start gap-3 lg:mx-0`}>
          <div className="app-view-page-chrome ml-[6.5%] flex min-w-0 flex-1 items-start gap-3 pt-0.5 lg:ml-0">
            <IosAccentIconSquircle variant="page" strokeWidth={2.2}>
              <img src="/icons/orcamentos-ios.png" alt="" className="h-full w-full object-cover" />
            </IosAccentIconSquircle>
            <div className="min-w-0 flex-1">
              <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${scopeAccent}`}>
                {isLabScope ? 'Laboratório' : 'Pátio'}
              </p>
              <h1 className="text-[1.35rem] font-semibold tracking-tight text-zinc-900 dark:text-white">Orçamentos</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
                <Sparkles className={`h-3.5 w-3.5 shrink-0 ${isLabScope ? 'text-violet-500' : 'text-amber-500'}`} strokeWidth={2} />
                <span className="truncate">
                  {isLabScope ? 'Módulos e avaliações técnicas' : 'Veículos da oficina'}
                </span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            disabled={refreshing || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <main className={mainPad}>
        <div className={`mx-auto w-full ${mainMaxW} space-y-3 lg:mx-0`}>
          {!loading && !error && scopedItems.length > 0 ? (
            <BudgetsHubStatsStrip
              stats={stats}
              desktopShell={desktopShell}
              hubScope={hubScope}
              onHubScopeChange={handleHubScopeChange}
            />
          ) : (
            <div className="mb-4 flex justify-end">
              <BudgetsHubScopeToggle scope={hubScope} onChange={handleHubScopeChange} />
            </div>
          )}
          <BudgetsHubViewSwitcher mode={viewMode} onModeChange={handleViewModeChange} desktopShell={desktopShell} />
          {renderContent()}
        </div>
      </main>
    </div>
  );
};
