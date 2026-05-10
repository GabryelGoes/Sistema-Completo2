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
  const { enabled, activeTab, pollMs = 60000 } = opts;
  const [badgeCount, setBadgeCount] = useState(0);
  const snapshotRef = useRef<string | null>(null);
  /** Orçamentos que geraram notificação na Home — consumidos pelo hub ao focar a aba (aro âmbar até abrir no pátio). */
  const pendingHubBudgetMetaRef = useRef<Map<string, "created" | "edited">>(new Map());

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
      for (const row of compact) {
        const o = prevMap.get(row.id);
        if (o === undefined) pendingHubBudgetMetaRef.current.set(row.id, "created");
        else if (o !== row.sig) pendingHubBudgetMetaRef.current.set(row.id, "edited");
      }
      snapshotRef.current = stable;
      const { created, edited } = countDiffEvents(prevRows, compact);
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
