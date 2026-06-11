import React from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Columns3,
  FileText,
  Hourglass,
  LayoutList,
  Sparkles,
  Wrench,
} from 'lucide-react';
import {
  budgetChronologicalNumber,
  type PatioVehicleBudgetAggregateItem,
} from '../../../services/apiService';
import { getStageConfig, getStageStyle } from '../../../constants/serviceOrderStages';
import { useDragScroll } from '../../../hooks/useDragScroll';
import { iosLabel, iosPageGlass, iosPageGlassOrcamentosVehicleCard } from '../../ui/iosModalStyles';
import { desktopOnmotorCard, desktopStatChip } from '../../ui/desktopCardStyles';
import type { BudgetsHubViewMode, StageKanbanColumn, VehicleBudgetGroup } from '../../../utils/budgetsHubViews';
import { BUDGETS_HUB_VIEW_MODES, budgetOrderFlow } from '../../../utils/budgetsHubViews';

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
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 [scrollbar-width:thin] [-webkit-overflow-scrolling:touch]">
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

export function BudgetsHubStatsStrip({
  stats,
  desktopShell,
}: {
  stats: {
    totalBudgets: number;
    totalVehicles: number;
    patioBudgets: number;
    laboratoryBudgets: number;
    recentCount: number;
    approvedCount: number;
    inServiceCount: number;
    awaitingCount: number;
    unverifiedCount: number;
  };
  desktopShell?: boolean;
}) {
  const chip = (label: string, value: number, accent?: string) => (
    <div
      className={`flex min-w-[5.5rem] flex-col px-3 py-2 ${
        desktopShell
          ? desktopStatChip
          : 'rounded-xl border border-zinc-200/80 bg-white/80 dark:border-white/[0.08] dark:bg-zinc-950/50'
      }`}
    >
      <span className={`text-[18px] font-bold tabular-nums leading-none ${accent ?? 'text-zinc-900 dark:text-white'}`}>
        {value}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        {label}
      </span>
    </div>
  );
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
      {chip('Orçamentos', stats.totalBudgets)}
      {chip('OS ativas', stats.totalVehicles)}
      {chip('Pátio', stats.patioBudgets, 'text-[#0058c7] dark:text-[#8cc8ff]')}
      {chip('Laboratório', stats.laboratoryBudgets, 'text-violet-700 dark:text-violet-300')}
      {chip('Novos', stats.recentCount, 'text-emerald-600 dark:text-emerald-400')}
      {chip('Aprovados', stats.approvedCount, 'text-sky-700 dark:text-sky-300')}
      {chip('Em serviço', stats.inServiceCount, 'text-blue-700 dark:text-blue-300')}
      {chip('Pendentes', stats.awaitingCount, 'text-amber-700 dark:text-amber-300')}
      {chip('Sem verificação', stats.unverifiedCount, 'text-orange-700 dark:text-orange-300')}
    </div>
  );
}

type BudgetRowProps = {
  row: PatioVehicleBudgetAggregateItem;
  budgetNum: number;
  pulse?: 'created' | 'edited';
  onOpen: () => void;
  compact?: boolean;
};

export function BudgetHubBudgetRow({ row, budgetNum, pulse, onOpen, compact }: BudgetRowProps) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={`flex w-full flex-col gap-2 text-left transition-colors hover:bg-zinc-50/90 dark:hover:bg-white/[0.04] ${
          compact ? 'px-3 py-3' : 'px-4 py-4 sm:px-5'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <BudgetOrderOriginBadge orderType={row.orderType} />
          <span className={`${iosLabel} mb-0 text-[10px]`}>Orçamento {budgetNum}</span>
          {pulse === 'created' ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
              Novo
            </span>
          ) : null}
          {pulse === 'edited' ? (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
              Editado
            </span>
          ) : null}
          {row.isVerified ? (
            <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
              Verificado
            </span>
          ) : (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-800/90 dark:bg-amber-500/15 dark:text-amber-200/90">
              Aguardando verificação
            </span>
          )}
          {row.hasApprovedItems ? (
            <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-800 dark:bg-sky-500/20 dark:text-sky-200">
              {row.approvedItemsCount} aprovado{row.approvedItemsCount === 1 ? '' : 's'}
            </span>
          ) : null}
          <span className="ml-auto text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
            {formatBudgetWhen(row.updatedAt)}
          </span>
        </div>
        <p className={`line-clamp-2 leading-snug text-zinc-900 dark:text-zinc-100 ${compact ? 'text-[13px]' : 'text-[15px]'}`}>
          {row.diagnosisPreview.trim() || row.cardName?.trim() || 'Sem descrição de diagnóstico'}
        </p>
        <p className="text-[12px] text-zinc-500 dark:text-zinc-500">
          {row.servicesCount} serviço{row.servicesCount === 1 ? '' : 's'} · {row.partsCount} peça
          {row.partsCount === 1 ? '' : 's'}
        </p>
      </button>
    </li>
  );
}

type VehicleGroupProps = {
  group: VehicleBudgetGroup;
  expanded: boolean;
  onToggle: () => void;
  plateDisplay: (plate: string | null) => React.ReactNode;
  vehicleNeedsAttention: boolean;
  pulseByBudgetId: Record<string, 'created' | 'edited'>;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
  defaultOpen?: boolean;
  desktopShell?: boolean;
  /** Modo enxuto (visualização "por etapa"): card minimizado com poucas infos. */
  compact?: boolean;
};

export function BudgetHubVehicleGroup({
  group,
  expanded,
  onToggle,
  plateDisplay,
  vehicleNeedsAttention,
  pulseByBudgetId,
  onOpenBudget,
  defaultOpen,
  desktopShell,
  compact,
}: VehicleGroupProps) {
  const { head, items } = group;
  const flow = budgetOrderFlow(head.orderType);
  const stage = getStageConfig(head.orderStatus, flow);
  const isLab = head.orderType === 'module';
  // No modo compacto o clique sempre alterna (não força aberto).
  const open = compact ? expanded : (defaultOpen ?? expanded);
  const cardShell = desktopShell ? desktopOnmotorCard : iosPageGlassOrcamentosVehicleCard;
  const chrono = items.map((x) => ({ id: x.budgetId, createdAt: x.createdAt }));

  if (compact) {
    return (
      <section
        className={`${cardShell} overflow-hidden transition-[box-shadow,background-color,border-color] duration-300 ${
          vehicleNeedsAttention
            ? '!border-2 !border-red-400/65 !bg-red-50/88 dark:!border-red-400/50 dark:!bg-red-950/[0.34]'
            : ''
        }`}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`flex w-full items-center gap-2.5 px-3 py-[1.4rem] text-left transition-colors ${
            vehicleNeedsAttention
              ? 'hover:!bg-red-50/92 dark:hover:!bg-red-950/40'
              : 'hover:bg-zinc-50/80 dark:hover:bg-white/[0.04]'
          }`}
        >
          <div
            className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl ring-1 ${
              vehicleNeedsAttention
                ? '!bg-red-100/88 ring-red-300/50 dark:!bg-red-500/12'
                : isLab
                  ? 'bg-violet-500/10 ring-violet-400/35'
                  : 'bg-[#007AFF]/10 ring-[#007AFF]/25'
            }`}
          >
            <img
              src={isLab ? '/icons/laboratorio-ios.png' : '/icons/patio-ios.png'}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">
                {[head.vehicleBrand, head.vehicleModel].filter(Boolean).join(' ') || (isLab ? 'Módulo' : 'Veículo')}
              </span>
              <span className="ml-auto flex h-5 min-w-[1.4rem] shrink-0 items-center justify-center rounded-full bg-zinc-200/90 px-1.5 text-[11px] font-bold text-zinc-700 dark:bg-white/[0.12] dark:text-zinc-200">
                {items.length}
              </span>
            </div>
            <p
              className={`truncate text-[12px] font-semibold text-zinc-500 dark:text-zinc-400 ${
                isLab ? '' : 'font-mono tracking-wide'
              }`}
            >
              {budgetOrderTitle(head, plateDisplay)}
            </p>
          </div>
          <ChevronRight className={`h-[18px] w-[18px] shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        {open ? (
          <ul className="border-t border-zinc-200/60 divide-y divide-zinc-200/60 dark:border-white/[0.06] dark:divide-white/[0.06]">
            {items.map((row) => (
              <BudgetHubBudgetRow
                key={row.budgetId}
                row={row}
                budgetNum={budgetChronologicalNumber(chrono, row.budgetId)}
                pulse={pulseByBudgetId[String(row.budgetId).trim()]}
                onOpen={() => onOpenBudget(row.serviceOrderId, row.budgetId)}
                compact
              />
            ))}
          </ul>
        ) : null}
      </section>
    );
  }

  return (
    <section
      className={`${cardShell} overflow-hidden transition-[box-shadow,background-color,border-color] duration-300 ${
        vehicleNeedsAttention
          ? '!border-2 !border-red-400/65 !bg-red-50/88 !shadow-[0_12px_36px_-10px_rgba(239,68,68,0.16)] dark:!border-red-400/50 dark:!bg-red-950/[0.34]'
          : ''
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`flex w-full items-start gap-3 border-b px-4 py-4 text-left transition-colors sm:px-5 ${
          vehicleNeedsAttention
            ? 'border-red-200/75 hover:!bg-red-50/92 dark:border-red-500/22'
            : 'border-zinc-200/70 hover:bg-zinc-50/80 dark:border-white/[0.06] dark:hover:bg-white/[0.04]'
        }`}
      >
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-2xl ring-1 ${
            vehicleNeedsAttention
              ? '!bg-red-100/88 ring-red-300/50 dark:!bg-red-500/12'
              : isLab
                ? 'bg-violet-500/10 ring-violet-400/35'
                : 'bg-[#007AFF]/10 ring-[#007AFF]/25'
          }`}
        >
          <img
            src={isLab ? '/icons/laboratorio-ios.png' : '/icons/patio-ios.png'}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <BudgetOrderOriginBadge orderType={head.orderType} />
            <span
              className={`font-bold tracking-wide text-zinc-900 dark:text-white ${
                isLab ? 'text-[14px]' : 'font-mono text-[14px]'
              }`}
            >
              {budgetOrderTitle(head, plateDisplay)}
            </span>
            {head.osNumber != null ? (
              <span className="rounded-full bg-zinc-200/90 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-white/[0.1] dark:text-zinc-300">
                OS #{head.osNumber}
              </span>
            ) : null}
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStageStyle(head.orderStatus, flow)}`}>
              {stage?.name ?? head.orderStatus}
            </span>
          </div>
          <p className="mt-1 truncate text-[15px] font-semibold text-zinc-900 dark:text-white">
            {[head.vehicleBrand, head.vehicleModel].filter(Boolean).join(' ') || 'Veículo'}
          </p>
          {head.customerName ? (
            <p className="mt-0.5 truncate text-[13px] text-zinc-600 dark:text-zinc-400">{head.customerName}</p>
          ) : null}
          <p className="mt-2 text-[12px] font-medium text-zinc-500">
            {items.length} orçamento{items.length === 1 ? '' : 's'}
          </p>
        </div>
        <ChevronRight className={`mt-1 h-5 w-5 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open ? (
        <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
          {items.map((row) => (
            <BudgetHubBudgetRow
              key={row.budgetId}
              row={row}
              budgetNum={budgetChronologicalNumber(chrono, row.budgetId)}
              pulse={pulseByBudgetId[String(row.budgetId).trim()]}
              onOpen={() => onOpenBudget(row.serviceOrderId, row.budgetId)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function BudgetHubFlatBudgetList({
  items,
  pulseByBudgetId,
  onOpenBudget,
  desktopShell,
}: {
  items: PatioVehicleBudgetAggregateItem[];
  pulseByBudgetId: Record<string, 'created' | 'edited'>;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
  desktopShell?: boolean;
}) {
  const chronoByOrder = new Map<string, { id: string; createdAt: string }[]>();
  for (const row of items) {
    const oid = row.serviceOrderId;
    const list = chronoByOrder.get(oid) ?? [];
    list.push({ id: row.budgetId, createdAt: row.createdAt });
    chronoByOrder.set(oid, list);
  }

  const shell = desktopShell ? desktopOnmotorCard : iosPageGlass;

  return (
    <div className={`${shell} overflow-hidden`}>
      <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
        {items.map((row) => {
          const chrono = chronoByOrder.get(row.serviceOrderId) ?? [];
          const flow = budgetOrderFlow(row.orderType);
          const stage = getStageConfig(row.orderStatus, flow);
          return (
            <li key={row.budgetId}>
              <button
                type="button"
                onClick={() => onOpenBudget(row.serviceOrderId, row.budgetId)}
                className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-zinc-50/90 sm:px-5 dark:hover:bg-white/[0.04]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <BudgetOrderOriginBadge orderType={row.orderType} compact />
                  <span
                    className={`font-bold text-zinc-900 dark:text-white ${
                      row.orderType === 'module' ? 'text-[13px]' : 'font-mono text-[13px]'
                    }`}
                  >
                    {budgetOrderTitle(row)}
                  </span>
                  {row.osNumber != null ? (
                    <span className="text-[11px] font-semibold text-zinc-500">OS #{row.osNumber}</span>
                  ) : null}
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${getStageStyle(row.orderStatus, flow)}`}>
                    {stage?.name ?? row.orderStatus}
                  </span>
                  <span className={`${iosLabel} mb-0 text-[10px]`}>
                    Orç. {budgetChronologicalNumber(chrono, row.budgetId)}
                  </span>
                  {pulseByBudgetId[String(row.budgetId).trim()] === 'created' ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Novo
                    </span>
                  ) : null}
                  {pulseByBudgetId[String(row.budgetId).trim()] === 'edited' ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Editado
                    </span>
                  ) : null}
                </div>
                <p className="line-clamp-2 text-[15px] leading-snug text-zinc-900 dark:text-zinc-100">
                  {row.diagnosisPreview.trim() || row.cardName?.trim() || 'Sem descrição'}
                </p>
                <p className="text-[12px] text-zinc-500">
                  {row.servicesCount} serv. · {row.partsCount} peças
                  {row.hasApprovedItems ? ` · ${row.approvedItemsCount} aprovado(s)` : ''}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function BudgetHubStageBoard({
  columns,
  plateDisplay,
  pendingBudgetHighlightIds,
  pulseByBudgetId,
  onOpenBudget,
  expanded,
  onToggleExpand,
  desktopShell,
}: {
  columns: StageKanbanColumn[];
  plateDisplay: (plate: string | null) => React.ReactNode;
  pendingBudgetHighlightIds: Set<string>;
  pulseByBudgetId: Record<string, 'created' | 'edited'>;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
  expanded: Set<string>;
  onToggleExpand: (orderId: string) => void;
  desktopShell?: boolean;
}) {
  const colMin = desktopShell ? 'min-w-[20rem] w-[20rem]' : 'min-w-[16.5rem] w-[16.5rem]';
  const dragRef = useDragScroll<HTMLDivElement>();

  return (
    <div
      ref={dragRef}
      className="-mx-1 flex cursor-grab gap-3 overflow-x-auto pb-2 px-1 [scrollbar-width:thin] lg:mx-0"
    >
      {columns.map((col) => (
        <div
          key={col.status}
          className={`${colMin} flex shrink-0 flex-col rounded-xl border border-zinc-200/90 bg-zinc-100/90 dark:border-white/[0.08] dark:bg-zinc-900/40`}
        >
          <div className={`sticky top-0 z-[1] rounded-t-xl border-b border-zinc-200/80 px-3 py-2.5 ${col.style}`}>
            <p className="text-[11px] font-bold uppercase tracking-[0.06em]">{col.name}</p>
            <p className="mt-0.5 text-[10px] font-semibold opacity-90">
              {col.groups.length} veíc. · {col.budgetCount} orç.
            </p>
          </div>
          <div className="flex max-h-[min(70vh,720px)] flex-col gap-2 overflow-y-auto p-2 [scrollbar-width:thin]">
            {col.groups.length === 0 ? (
              <p className="px-2 py-6 text-center text-[12px] text-zinc-500 dark:text-zinc-400">Nenhum veículo nesta etapa</p>
            ) : (
              col.groups.map((group) => {
                const vehicleNeedsAttention = group.items.some((row) =>
                  pendingBudgetHighlightIds.has(String(row.budgetId).trim())
                );
                return (
                  <BudgetHubVehicleGroup
                    key={group.orderId}
                    group={group}
                    expanded={expanded.has(group.orderId)}
                    onToggle={() => onToggleExpand(group.orderId)}
                    plateDisplay={plateDisplay}
                    vehicleNeedsAttention={vehicleNeedsAttention}
                    pulseByBudgetId={pulseByBudgetId}
                    onOpenBudget={onOpenBudget}
                    compact
                    desktopShell={desktopShell}
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
