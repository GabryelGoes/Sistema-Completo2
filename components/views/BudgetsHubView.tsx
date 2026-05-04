import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FileText, RefreshCw, Sparkles } from "lucide-react";
import {
  budgetLastActivityMs,
  getPatioVehicleBudgetsAggregate,
  type PatioVehicleBudgetAggregateItem,
} from "../../services/apiService";
import { getStageConfig, getStageStyle } from "../../constants/serviceOrderStages";
import { iosPageGlass, iosLabel } from "../ui/iosModalStyles";
const BUDGETS_CHANGED = "rda-patio-budgets-changed";

function groupByOrderId(items: PatioVehicleBudgetAggregateItem[]): Map<string, PatioVehicleBudgetAggregateItem[]> {
  const m = new Map<string, PatioVehicleBudgetAggregateItem[]>();
  for (const it of items) {
    const list = m.get(it.serviceOrderId) ?? [];
    list.push(it);
    m.set(it.serviceOrderId, list);
  }
  for (const [, list] of m) {
    list.sort((a, b) => budgetLastActivityMs(b) - budgetLastActivityMs(a));
  }
  return m;
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export interface BudgetsHubViewProps {
  blurPlates?: boolean;
  onOpenBudgetInPatio: (serviceOrderId: string, budgetId: string) => void;
  /** Alinha o detector de mudanças (badge/som) com o que o usuário já viu aqui. */
  onIngestNotifierBaseline: (items: Pick<PatioVehicleBudgetAggregateItem, "budgetId" | "contentSignature">[]) => void;
  /** Zera o badge vermelho ao abrir o hub. */
  onClearHubBadge: () => void;
}

export const BudgetsHubView: React.FC<BudgetsHubViewProps> = ({
  blurPlates = false,
  onOpenBudgetInPatio,
  onIngestNotifierBaseline,
  onClearHubBadge,
}) => {
  const [items, setItems] = useState<PatioVehicleBudgetAggregateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pulseByBudgetId, setPulseByBudgetId] = useState<Record<string, "created" | "edited">>({});
  const prevSigByBudgetRef = useRef<Map<string, string>>(new Map());
  const isFirstFetchRef = useRef(true);
  const baselineIngestRef = useRef(onIngestNotifierBaseline);
  baselineIngestRef.current = onIngestNotifierBaseline;

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getPatioVehicleBudgetsAggregate();
      setItems(data);

      if (isFirstFetchRef.current) {
        isFirstFetchRef.current = false;
        const m = new Map<string, string>();
        data.forEach((d) => m.set(d.budgetId, d.contentSignature));
        prevSigByBudgetRef.current = m;
        baselineIngestRef.current(data);
      } else {
        const prev = prevSigByBudgetRef.current;
        const pulses: Record<string, "created" | "edited"> = {};
        for (const d of data) {
          const old = prev.get(d.budgetId);
          if (old === undefined) pulses[d.budgetId] = "created";
          else if (old !== d.contentSignature) pulses[d.budgetId] = "edited";
        }
        const nextMap = new Map<string, string>();
        data.forEach((d) => nextMap.set(d.budgetId, d.contentSignature));
        prevSigByBudgetRef.current = nextMap;
        baselineIngestRef.current(data);
        if (Object.keys(pulses).length > 0) {
          setPulseByBudgetId((p) => ({ ...p, ...pulses }));
        }
      }
    } catch (e: unknown) {
      setError((e as Error)?.message ?? "Não foi possível carregar os orçamentos.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    onClearHubBadge();
    void load();
    // montagem inicial apenas
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseline e badge vêm do pai na abertura
  }, []);

  useEffect(() => {
    const onEvt = () => void load({ silent: true });
    window.addEventListener(BUDGETS_CHANGED, onEvt);
    return () => window.removeEventListener(BUDGETS_CHANGED, onEvt);
  }, [load]);

  useEffect(() => {
    if (Object.keys(pulseByBudgetId).length === 0) return;
    const t = window.setTimeout(() => setPulseByBudgetId({}), 50000);
    return () => window.clearTimeout(t);
  }, [pulseByBudgetId]);

  const grouped = useMemo(() => groupByOrderId(items), [items]);
  const orderIdsSorted = useMemo(() => {
    const ids = [...grouped.keys()];
    const latest = (oid: string) => {
      const list = grouped.get(oid);
      if (!list?.length) return 0;
      return Math.max(...list.map((row) => budgetLastActivityMs(row)));
    };
    ids.sort((a, b) => latest(b) - latest(a));
    return ids;
  }, [grouped]);

  const toggleExpand = (orderId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const plateDisplay = (plate: string | null) => {
    const p = (plate ?? "").trim();
    if (!p) return "—";
    if (blurPlates) {
      return (
        <span className="blur-plate" aria-hidden>
          {p}
        </span>
      );
    }
    return p.toUpperCase();
  };

  return (
    <div className="flex min-h-min flex-col bg-light-page dark:bg-black">
      <header className="shrink-0 border-b border-zinc-200/80 bg-white/80 px-4 pb-4 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl dark:border-white/[0.08] dark:bg-zinc-950/80">
        <div className="mx-auto flex max-w-3xl items-start gap-3">
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Pátio</p>
            <h1 className="text-[1.35rem] font-semibold tracking-tight text-zinc-900 dark:text-white">Orçamentos</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
              <span className="truncate">Veículos em andamento no pátio</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load({ silent: true })}
            disabled={refreshing || loading}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-zinc-200/90 bg-white text-zinc-700 shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      <main className="px-4 py-5 pb-[max(5.5rem,env(safe-area-inset-bottom)+3rem)]">
        <div className="mx-auto max-w-3xl space-y-4">
          {loading ? (
            <div className={`${iosPageGlass} p-10 text-center text-[15px] text-zinc-600 dark:text-zinc-300`}>
              Carregando orçamentos…
            </div>
          ) : error ? (
            <div className={`${iosPageGlass} p-6 text-[15px] text-red-600 dark:text-red-400`}>{error}</div>
          ) : items.length === 0 ? (
            <div className={`${iosPageGlass} p-8 text-center`}>
              <FileText className="mx-auto mb-3 h-10 w-10 text-zinc-400 dark:text-zinc-500" strokeWidth={1.5} />
              <p className="text-[16px] font-semibold text-zinc-900 dark:text-white">Nenhum orçamento no pátio</p>
              <p className="mt-2 text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                Os orçamentos dos veículos em etapas ativas aparecerão aqui automaticamente.
              </p>
            </div>
          ) : (
            orderIdsSorted.map((orderId) => {
              const list = grouped.get(orderId) ?? [];
              const head = list[0];
              if (!head) return null;
              const stage = getStageConfig(head.orderStatus);
              const open = expanded.has(orderId);
              return (
                <section key={orderId} className={`${iosPageGlass} overflow-hidden`}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(orderId)}
                    aria-expanded={open}
                    className="flex w-full items-start gap-3 border-b border-zinc-200/70 px-4 py-4 text-left transition-colors hover:bg-zinc-50/80 dark:border-white/[0.06] dark:hover:bg-white/[0.04] sm:px-5"
                  >
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-white/[0.08]">
                      <FileText className="h-5 w-5 text-[#007AFF] dark:text-[#7ab8ff]" strokeWidth={2} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[14px] font-bold tracking-wide text-zinc-900 dark:text-white">
                          {plateDisplay(head.plate)}
                        </span>
                        {head.osNumber != null ? (
                          <span className="rounded-full bg-zinc-200/90 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-white/[0.1] dark:text-zinc-300">
                            OS #{head.osNumber}
                          </span>
                        ) : null}
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${getStageStyle(head.orderStatus)}`}
                        >
                          {stage?.name ?? head.orderStatus}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[15px] font-semibold text-zinc-900 dark:text-white">
                        {[head.vehicleBrand, head.vehicleModel].filter(Boolean).join(" ") || "Veículo"}
                      </p>
                      {head.customerName ? (
                        <p className="mt-0.5 truncate text-[13px] text-zinc-600 dark:text-zinc-400">{head.customerName}</p>
                      ) : null}
                      <p className="mt-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-500">
                        {list.length} orçamento{list.length === 1 ? "" : "s"}
                      </p>
                    </div>
                    <ChevronRight
                      className={`mt-1 h-5 w-5 shrink-0 text-zinc-400 transition-transform ${open ? "rotate-90" : ""}`}
                    />
                  </button>
                  {open ? (
                    <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
                      {list.map((row) => {
                        const pulse = pulseByBudgetId[row.budgetId];
                        return (
                          <li key={row.budgetId}>
                            <button
                              type="button"
                              onClick={() => onOpenBudgetInPatio(row.serviceOrderId, row.budgetId)}
                              className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-zinc-50/90 sm:px-5 dark:hover:bg-white/[0.04]"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`${iosLabel} mb-0 text-[10px]`}>Orçamento</span>
                                {pulse === "created" ? (
                                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                                    Novo
                                  </span>
                                ) : null}
                                {pulse === "edited" ? (
                                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-200">
                                    Editado
                                  </span>
                                ) : null}
                                <span className="ml-auto text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                                  {formatWhen(row.updatedAt)}
                                </span>
                              </div>
                              <p className="line-clamp-2 text-[15px] leading-snug text-zinc-900 dark:text-zinc-100">
                                {row.diagnosisPreview.trim() || row.cardName?.trim() || "Sem descrição de diagnóstico"}
                              </p>
                              <p className="text-[12px] text-zinc-500 dark:text-zinc-500">
                                {row.servicesCount} serviço{row.servicesCount === 1 ? "" : "s"} · {row.partsCount}{" "}
                                peça{row.partsCount === 1 ? "" : "s"}
                              </p>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </section>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
};
