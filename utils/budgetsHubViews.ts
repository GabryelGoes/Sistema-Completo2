import {
  SERVICE_ORDER_STAGES,
  getStageConfig,
  type ServiceOrderStatus,
} from '../constants/serviceOrderStages';
import type { PatioVehicleBudgetAggregateItem } from '../services/apiService';

export type BudgetsHubViewMode =
  | 'vehicles'
  | 'recent'
  | 'approved'
  | 'in_service'
  | 'awaiting_approval'
  | 'activity'
  | 'by_stage';

export const BUDGETS_HUB_VIEW_STORAGE_KEY = 'rda_budgets_hub_view_v1';

export const BUDGETS_HUB_VIEW_MODES: {
  id: BudgetsHubViewMode;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    id: 'vehicles',
    label: 'Por veículo',
    shortLabel: 'Veículos',
    description: 'Agrupa todos os orçamentos de cada veículo no pátio',
  },
  {
    id: 'recent',
    label: 'Recém-criados',
    shortLabel: 'Novos',
    description: 'Orçamentos criados nos últimos 14 dias, do mais novo ao mais antigo',
  },
  {
    id: 'activity',
    label: 'Última atividade',
    shortLabel: 'Atividade',
    description: 'Orçamentos com alteração recente (edição, itens ou diagnóstico)',
  },
  {
    id: 'approved',
    label: 'Com itens aprovados',
    shortLabel: 'Aprovados',
    description: 'Orçamentos em que o cliente já aprovou pelo menos um serviço ou peça',
  },
  {
    id: 'awaiting_approval',
    label: 'Aguardando aprovação',
    shortLabel: 'Pendente',
    description: 'Veículos na etapa de aprovação ou orçamentos com itens ainda sem decisão',
  },
  {
    id: 'in_service',
    label: 'Em execução',
    shortLabel: 'Em serviço',
    description: 'Veículos na etapa Em serviço — trabalho em andamento na oficina',
  },
  {
    id: 'by_stage',
    label: 'Por etapa',
    shortLabel: 'Etapas',
    description: 'Quadro estilo Trello: colunas por etapa do veículo no pátio',
  },
];

/** Etapas exibidas no quadro (fluxo operacional, sem garantia). */
export const BUDGET_HUB_KANBAN_STAGES = SERVICE_ORDER_STAGES.filter((s) => s.id !== 'GARANTIA').sort(
  (a, b) => a.pos - b.pos
);

const RECENT_CREATED_MS = 14 * 24 * 60 * 60 * 1000;

export function budgetActivityMs(item: Pick<PatioVehicleBudgetAggregateItem, 'createdAt' | 'updatedAt'>): number {
  const createdMs = new Date(item.createdAt).getTime();
  const updatedMs = new Date(item.updatedAt).getTime();
  const safeCreated = Number.isFinite(createdMs) ? createdMs : 0;
  const safeUpdated = Number.isFinite(updatedMs) ? updatedMs : safeCreated;
  return Math.max(safeCreated, safeUpdated);
}

export function normOrderId(id: string): string {
  return String(id ?? '').trim().toLowerCase();
}

export function groupBudgetsByOrderId(items: PatioVehicleBudgetAggregateItem[]): Map<string, PatioVehicleBudgetAggregateItem[]> {
  const m = new Map<string, PatioVehicleBudgetAggregateItem[]>();
  for (const it of items) {
    const oid = normOrderId(it.serviceOrderId);
    const list = m.get(oid) ?? [];
    list.push(it);
    m.set(oid, list);
  }
  for (const [, list] of m) {
    list.sort((a, b) => budgetActivityMs(b) - budgetActivityMs(a));
  }
  return m;
}

export type VehicleBudgetGroup = {
  orderId: string;
  items: PatioVehicleBudgetAggregateItem[];
  head: PatioVehicleBudgetAggregateItem;
  latestActivityMs: number;
};

export function buildVehicleGroups(items: PatioVehicleBudgetAggregateItem[]): VehicleBudgetGroup[] {
  const grouped = groupBudgetsByOrderId(items);
  const groups: VehicleBudgetGroup[] = [];
  for (const [orderId, list] of grouped) {
    const head = list[0];
    if (!head) continue;
    groups.push({
      orderId,
      items: list,
      head,
      latestActivityMs: Math.max(...list.map((r) => budgetActivityMs(r))),
    });
  }
  groups.sort((a, b) => b.latestActivityMs - a.latestActivityMs);
  return groups;
}

export function isBudgetRecentlyCreated(item: PatioVehicleBudgetAggregateItem, now = Date.now()): boolean {
  const t = new Date(item.createdAt).getTime();
  return Number.isFinite(t) && now - t <= RECENT_CREATED_MS;
}

export function filterBudgetsForView(
  items: PatioVehicleBudgetAggregateItem[],
  mode: BudgetsHubViewMode
): PatioVehicleBudgetAggregateItem[] {
  switch (mode) {
    case 'recent':
      return [...items]
        .filter((i) => isBudgetRecentlyCreated(i))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case 'approved':
      return [...items]
        .filter((i) => i.hasApprovedItems)
        .sort((a, b) => budgetActivityMs(b) - budgetActivityMs(a));
    case 'activity':
      return [...items].sort((a, b) => budgetActivityMs(b) - budgetActivityMs(a));
    case 'awaiting_approval':
      return [...items].filter(
        (i) =>
          i.orderStatus === 'AGUARDANDO_APROVACAO' ||
          (i.hasExplicitApprovalDecisions && i.pendingItemsCount > 0 && !i.hasApprovedItems)
      );
    case 'in_service':
      return [...items].filter((i) => i.orderStatus === 'EM_SERVICO');
    case 'vehicles':
    case 'by_stage':
    default:
      return items;
  }
}

export function filterVehicleGroupsForView(
  groups: VehicleBudgetGroup[],
  mode: BudgetsHubViewMode
): VehicleBudgetGroup[] {
  switch (mode) {
    case 'in_service':
      return groups.filter((g) => g.head.orderStatus === 'EM_SERVICO');
    case 'awaiting_approval':
      return groups.filter(
        (g) =>
          g.head.orderStatus === 'AGUARDANDO_APROVACAO' ||
          g.items.some(
            (i) => i.hasExplicitApprovalDecisions && i.pendingItemsCount > 0 && !i.hasApprovedItems
          )
      );
    case 'approved':
      return groups.filter((g) => g.items.some((i) => i.hasApprovedItems));
    case 'recent':
      return groups
        .filter((g) => g.items.some((i) => isBudgetRecentlyCreated(i)))
        .sort((a, b) => {
          const maxA = Math.max(...a.items.map((i) => new Date(i.createdAt).getTime()));
          const maxB = Math.max(...b.items.map((i) => new Date(i.createdAt).getTime()));
          return maxB - maxA;
        });
    case 'by_stage':
    case 'vehicles':
    case 'activity':
    default:
      return groups;
  }
}

export type BudgetsHubStats = {
  totalBudgets: number;
  totalVehicles: number;
  recentCount: number;
  approvedCount: number;
  inServiceCount: number;
  awaitingCount: number;
};

export function computeBudgetsHubStats(items: PatioVehicleBudgetAggregateItem[]): BudgetsHubStats {
  const groups = buildVehicleGroups(items);
  return {
    totalBudgets: items.length,
    totalVehicles: groups.length,
    recentCount: items.filter((i) => isBudgetRecentlyCreated(i)).length,
    approvedCount: items.filter((i) => i.hasApprovedItems).length,
    inServiceCount: items.filter((i) => i.orderStatus === 'EM_SERVICO').length,
    awaitingCount: items.filter(
      (i) =>
        i.orderStatus === 'AGUARDANDO_APROVACAO' ||
        (i.hasExplicitApprovalDecisions && i.pendingItemsCount > 0 && !i.hasApprovedItems)
    ).length,
  };
}

export type StageKanbanColumn = {
  status: ServiceOrderStatus;
  name: string;
  style: string;
  groups: VehicleBudgetGroup[];
  budgetCount: number;
};

export function buildStageKanbanColumns(allGroups: VehicleBudgetGroup[]): StageKanbanColumn[] {
  const byStatus = new Map<string, VehicleBudgetGroup[]>();
  for (const g of allGroups) {
    const st = g.head.orderStatus || 'AGUARDANDO_AVALIACAO';
    const list = byStatus.get(st) ?? [];
    list.push(g);
    byStatus.set(st, list);
  }
  for (const [, list] of byStatus) {
    list.sort((a, b) => b.latestActivityMs - a.latestActivityMs);
  }

  const columns: StageKanbanColumn[] = [];
  for (const stage of BUDGET_HUB_KANBAN_STAGES) {
    const groups = byStatus.get(stage.id) ?? [];
    columns.push({
      status: stage.id,
      name: stage.name,
      style: stage.style,
      groups,
      budgetCount: groups.reduce((n, g) => n + g.items.length, 0),
    });
  }
  const known = new Set(BUDGET_HUB_KANBAN_STAGES.map((s) => s.id));
  for (const [status, groups] of byStatus) {
    if (known.has(status as ServiceOrderStatus)) continue;
    const cfg = getStageConfig(status);
    columns.push({
      status: status as ServiceOrderStatus,
      name: cfg?.name ?? status,
      style: cfg?.style ?? 'bg-zinc-500 text-white border-zinc-600',
      groups,
      budgetCount: groups.reduce((n, g) => n + g.items.length, 0),
    });
  }
  return columns;
}

export function readStoredBudgetsHubView(): BudgetsHubViewMode {
  try {
    const v = localStorage.getItem(BUDGETS_HUB_VIEW_STORAGE_KEY);
    if (BUDGETS_HUB_VIEW_MODES.some((m) => m.id === v)) return v as BudgetsHubViewMode;
  } catch {
    /* ignore */
  }
  return 'vehicles';
}

export function storeBudgetsHubView(mode: BudgetsHubViewMode): void {
  try {
    localStorage.setItem(BUDGETS_HUB_VIEW_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}
