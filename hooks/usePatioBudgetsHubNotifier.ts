import { useCallback, useEffect, useRef, useState } from "react";
import type { TabId } from "../components/TabBar";
import { getPatioVehicleBudgetsAggregate, type PatioVehicleBudgetAggregateItem } from "../services/apiService";
import { playBudgetCreatedOrEditedSound } from "../utils/notificationSound";

function stableAggregateKey(items: Pick<PatioVehicleBudgetAggregateItem, "budgetId" | "contentSignature">[]): string {
  return JSON.stringify(
    [...items]
      .map((i) => ({ id: i.budgetId, sig: i.contentSignature }))
      .sort((a, b) => a.id.localeCompare(b.id))
  );
}

function countDiffEvents(
  prev: { id: string; sig: string }[],
  next: { id: string; sig: string }[]
): { created: number; edited: number } {
  const prevMap = new Map(prev.map((x) => [x.id, x.sig]));
  let created = 0;
  let edited = 0;
  for (const row of next) {
    if (!prevMap.has(row.id)) created++;
    else if (prevMap.get(row.id) !== row.sig) edited++;
  }
  return { created, edited };
}

export type PatioBudgetHubEvent = {
  kind: "created" | "edited";
  item: PatioVehicleBudgetAggregateItem;
  /** Nº cronológico do orçamento nesta OS (1 = primeiro). */
  budgetNumber: number;
};

export function usePatioBudgetsHubNotifier(opts: {
  enabled: boolean;
  activeTab: TabId;
  pollMs?: number;
  /** Chamado quando detecta orçamento novo/editado (após o baseline inicial). */
  onBudgetEvents?: (events: PatioBudgetHubEvent[]) => void;
}) {
  const { enabled, activeTab, pollMs = 60000, onBudgetEvents } = opts;
  const [badgeCount, setBadgeCount] = useState(0);
  const snapshotRef = useRef<string | null>(null);
  /** Orçamentos que geraram notificação na Home — consumidos pelo hub ao focar a aba (aro âmbar até abrir no pátio). */
  const pendingHubBudgetMetaRef = useRef<Map<string, "created" | "edited">>(new Map());
  const onBudgetEventsRef = useRef(onBudgetEvents);
  onBudgetEventsRef.current = onBudgetEvents;
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const pollFn = useCallback(async () => {
    if (!enabled) return;
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    try {
      const items = await getPatioVehicleBudgetsAggregate();
      const compact = items.map((i) => ({ id: i.budgetId, sig: i.contentSignature }));
      const stable = stableAggregateKey(items);
      if (snapshotRef.current === null) {
        snapshotRef.current = stable;
        return;
      }
      if (snapshotRef.current === stable) return;
      const prevRows = JSON.parse(snapshotRef.current) as { id: string; sig: string }[];
      const prevMap = new Map(prevRows.map((x) => [x.id, x.sig]));
      const bySo = new Map<string, PatioVehicleBudgetAggregateItem[]>();
      for (const it of items) {
        const list = bySo.get(it.serviceOrderId) ?? [];
        list.push(it);
        bySo.set(it.serviceOrderId, list);
      }
      const events: PatioBudgetHubEvent[] = [];
      for (const row of compact) {
        const o = prevMap.get(row.id);
        const item = items.find((i) => i.budgetId === row.id);
        if (!item) continue;
        const soBudgets = [...(bySo.get(item.serviceOrderId) ?? [])].sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        const budgetNumber = Math.max(1, soBudgets.findIndex((b) => b.budgetId === item.budgetId) + 1);
        if (o === undefined) {
          pendingHubBudgetMetaRef.current.set(row.id, "created");
          events.push({ kind: "created", item, budgetNumber });
        } else if (o !== row.sig) {
          pendingHubBudgetMetaRef.current.set(row.id, "edited");
          events.push({ kind: "edited", item, budgetNumber });
        }
      }
      snapshotRef.current = stable;
      const { created, edited } = countDiffEvents(prevRows, compact);
      const n = created + edited;
      if (n > 0) {
        if (activeTabRef.current !== "orcamentos") {
          playBudgetCreatedOrEditedSound();
        }
        setBadgeCount((c) => Math.min(999, c + n));
        if (events.length > 0) {
          onBudgetEventsRef.current?.(events);
        }
      }
    } catch {
      // falha de rede — próximo poll
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void pollFn();
    const id = setInterval(() => void pollFn(), pollMs);
    const onEvt = () => void pollFn();
    window.addEventListener("rda-patio-budgets-changed", onEvt);
    return () => {
      clearInterval(id);
      window.removeEventListener("rda-patio-budgets-changed", onEvt);
    };
  }, [enabled, pollFn, pollMs]);

  const ingestBaselineFromItems = useCallback((items: Pick<PatioVehicleBudgetAggregateItem, "budgetId" | "contentSignature">[]) => {
    snapshotRef.current = stableAggregateKey(items);
  }, []);

  /** Só zera o contador — mantém `snapshotRef` para não “perder” o baseline num poll antes do load do hub (evita não notificar novos orçamentos). */
  const clearBadge = useCallback(() => {
    setBadgeCount(0);
  }, []);

  /** Chamado pelo hub com a aba Orçamentos visível — esvazia a fila e devolve os ids para o aro âmbar. */
  const consumePendingHubBudgetHighlights = useCallback((): { budgetId: string; kind: "created" | "edited" }[] => {
    const out: { budgetId: string; kind: "created" | "edited" }[] = [];
    pendingHubBudgetMetaRef.current.forEach((kind, budgetId) => {
      out.push({ budgetId, kind });
    });
    pendingHubBudgetMetaRef.current.clear();
    return out;
  }, []);

  return {
    badgeCount,
    clearBadge,
    ingestBaselineFromItems,
    refreshAggregateNow: pollFn,
    consumePendingHubBudgetHighlights,
  };
}
