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

export function usePatioBudgetsHubNotifier(opts: {
  enabled: boolean;
  activeTab: TabId;
  pollMs?: number;
}) {
  const { enabled, activeTab, pollMs = 22000 } = opts;
  const [badgeCount, setBadgeCount] = useState(0);
  const snapshotRef = useRef<string | null>(null);

  const pollFn = useCallback(async () => {
    if (!enabled) return;
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
      const { created, edited } = countDiffEvents(prevRows, compact);
      snapshotRef.current = stable;
      const n = created + edited;
      if (n > 0) {
        if (activeTab !== "orcamentos") {
          playBudgetCreatedOrEditedSound();
        }
        setBadgeCount((c) => Math.min(999, c + n));
      }
    } catch {
      // falha de rede — próximo poll
    }
  }, [enabled, activeTab]);

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

  const clearBadge = useCallback(() => {
    setBadgeCount(0);
    snapshotRef.current = null;
  }, []);

  return { badgeCount, clearBadge, ingestBaselineFromItems, refreshAggregateNow: pollFn };
}
