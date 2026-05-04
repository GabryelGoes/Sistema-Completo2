import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, FileText, RefreshCw, Sparkles } from "lucide-react";
import {
  budgetChronologicalNumber,
  getPatioVehicleBudgetsAggregate,
  type PatioVehicleBudgetAggregateItem,
} from "../../services/apiService";
import { getStageConfig, getStageStyle } from "../../constants/serviceOrderStages";
import { iosPageGlass, iosPageGlassOrcamentosVehicleCard, iosLabel } from "../ui/iosModalStyles";
import { IosAccentIconSquircle } from "../ui/IosAccentIconSquircle";
import { usePatioBudgetsHubLiveSync } from "../../hooks/usePatioBudgetsHubLiveSync";

const BUDGETS_CHANGED = "rda-patio-budgets-changed";

/** Evita falha no match OS ↔ destaque (UUID com casing diferente entre linhas). */
function normOrderId(id: string): string {
  return String(id ?? "").trim().toLowerCase();
}

function groupByOrderId(items: PatioVehicleBudgetAggregateItem[]): Map<string, PatioVehicleBudgetAggregateItem[]> {
  const m = new Map<string, PatioVehicleBudgetAggregateItem[]>();
  for (const it of items) {
    const oid = normOrderId(it.serviceOrderId);
    const list = m.get(oid) ?? [];
    list.push(it);
    m.set(oid, list);
  }
  for (const [, list] of m) {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
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
  /** Quando a aba Orçamentos está visível, refreshes em tempo real atualizam também o baseline do badge (evita contagem duplicada). */
  isHubTabActive?: boolean;
  onOpenBudgetInPatio: (serviceOrderId: string, budgetId: string) => void;
  /** Alinha o detector de mudanças (badge/som) com o que o usuário já viu aqui. */
  onIngestNotifierBaseline: (items: Pick<PatioVehicleBudgetAggregateItem, "budgetId" | "contentSignature">[]) => void;
  /** Zera o badge vermelho ao abrir o hub. */
  onClearHubBadge: () => void;
  /** Enfileira “novo/editado” da Home — ao focar a aba, o hub aplica o aro âmbar até abrir o orçamento no pátio. */
  consumePendingHubBudgetHighlights?: () => { budgetId: string; kind: "created" | "edited" }[];
}

export const BudgetsHubView: React.FC<BudgetsHubViewProps> = ({
  blurPlates = false,
  isHubTabActive = true,
  onOpenBudgetInPatio,
  onIngestNotifierBaseline,
  onClearHubBadge,
  consumePendingHubBudgetHighlights,
}) => {
  const [items, setItems] = useState<PatioVehicleBudgetAggregateItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  /** IDs de orçamento com aro âmbar até o usuário abrir esse orçamento no pátio (inclui fila vinda da Home). */
  const [pendingBudgetHighlightIds, setPendingBudgetHighlightIds] = useState<Set<string>>(() => new Set());
  const [pulseByBudgetId, setPulseByBudgetId] = useState<Record<string, "created" | "edited">>({});
  const prevSigByBudgetRef = useRef<Map<string, string>>(new Map());
  const isFirstFetchRef = useRef(true);
  /** Só a última resposta de GET altera estado (evita corrida SSE + poll + mount sobrescrever assinaturas). */
  const loadRequestGenRef = useRef(0);
  const baselineIngestRef = useRef(onIngestNotifierBaseline);
  baselineIngestRef.current = onIngestNotifierBaseline;
  const isHubTabActiveRef = useRef(isHubTabActive);
  isHubTabActiveRef.current = isHubTabActive;
  const consumeHighlightsRef = useRef(consumePendingHubBudgetHighlights);
  consumeHighlightsRef.current = consumePendingHubBudgetHighlights;
  /** Lote vindo da Home ao focar a aba — aplicado no próximo load bem-sucedido (um consume só). */
  const focusHighlightBatchRef = useRef<{ budgetId: string; kind: "created" | "edited" }[] | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean; skipNotifierIngest?: boolean }) => {
    const reqId = ++loadRequestGenRef.current;
    if (opts?.silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await getPatioVehicleBudgetsAggregate();
      if (reqId !== loadRequestGenRef.current) return;

      setItems(data);

      let pulsesFromDiff: Record<string, "created" | "edited"> = {};

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
          if (old === undefined) pulsesFromDiff[bid] = "created";
          else if (old !== d.contentSignature) pulsesFromDiff[bid] = "edited";
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

      const merged: Record<string, "created" | "edited"> = { ...pulsesFromDiff };
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
      setError((e as Error)?.message ?? "Não foi possível carregar os orçamentos.");
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
    const id = window.setInterval(() => {
      void load({
        silent: true,
        skipNotifierIngest: !isHubTabActiveRef.current,
      });
    }, 3000);
    return () => window.clearInterval(id);
  }, [load]);

  /** Ao focar a aba: zera o badge, guarda o lote do notifier e recarrega (aro âmbar para o que notificou na Home). */
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

  const grouped = useMemo(() => groupByOrderId(items), [items]);
  const orderIdsSorted = useMemo(() => {
    const ids = [...grouped.keys()];
    const earliestCreatedMs = (oid: string) => {
      const list = grouped.get(oid);
      if (!list?.length) return 0;
      return Math.min(...list.map((row) => new Date(row.createdAt).getTime()));
    };
    ids.sort((a, b) => earliestCreatedMs(a) - earliestCreatedMs(b));
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
          <div className="ml-[10%] flex min-w-0 flex-1 items-start gap-3 pt-0.5">
            <IosAccentIconSquircle variant="page" strokeWidth={2.2}>
              <img src="/icons/orcamentos-ios.png" alt="" className="h-full w-full object-cover" />
            </IosAccentIconSquircle>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Pátio
              </p>
              <h1 className="text-[1.35rem] font-semibold tracking-tight text-zinc-900 dark:text-white">Orçamentos</h1>
              <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-brand-yellow" strokeWidth={2} />
                <span className="truncate">Veículos em andamento no pátio</span>
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
              const vehicleNeedsAttention = list.some((row) => pendingBudgetHighlightIds.has(String(row.budgetId).trim()));
              return (
                <section
                  key={orderId}
                  className={`${iosPageGlassOrcamentosVehicleCard} overflow-hidden transition-[box-shadow,background-color,border-color] duration-300 ${
                    vehicleNeedsAttention
                      ? "!border-2 !border-amber-500/85 !bg-amber-50/85 !shadow-[0_12px_36px_-10px_rgba(217,119,6,0.32)] dark:!border-amber-400/75 dark:!bg-amber-950/[0.42] dark:!shadow-[0_12px_40px_-12px_rgba(251,191,36,0.22)]"
                      : ""
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpand(orderId)}
                    aria-expanded={open}
                    className={`flex w-full items-start gap-3 border-b px-4 py-4 text-left transition-colors sm:px-5 ${
                      vehicleNeedsAttention
                        ? "border-amber-200/80 hover:!bg-amber-50/90 dark:border-amber-500/25 dark:hover:!bg-amber-950/40"
                        : "border-zinc-200/70 hover:bg-zinc-50/80 dark:border-white/[0.06] dark:hover:bg-white/[0.04]"
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        vehicleNeedsAttention
                          ? "!bg-amber-100/90 dark:!bg-amber-500/15"
                          : "bg-zinc-100 dark:bg-white/[0.08]"
                      }`}
                    >
                      <FileText
                        className={vehicleNeedsAttention ? "h-5 w-5 text-amber-700 dark:text-amber-300" : "h-5 w-5 text-[#007AFF] dark:text-[#7ab8ff]"}
                        strokeWidth={2}
                      />
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
                  {open
                    ? (() => {
                        const chrono = list.map((x) => ({ id: x.budgetId, createdAt: x.createdAt }));
                        return (
                          <ul className="divide-y divide-zinc-200/60 dark:divide-white/[0.06]">
                            {list.map((row) => {
                              const pulse = pulseByBudgetId[String(row.budgetId).trim()];
                              const budgetNum = budgetChronologicalNumber(chrono, row.budgetId);
                              return (
                                <li key={row.budgetId}>
                                  <button
                                    type="button"
                                    onClick={() => openBudgetFromHub(row.serviceOrderId, row.budgetId)}
                                    className="flex w-full flex-col gap-2 px-4 py-4 text-left transition-colors hover:bg-zinc-50/90 sm:px-5 dark:hover:bg-white/[0.04]"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className={`${iosLabel} mb-0 text-[10px]`}>
                                        Orçamento {budgetNum}
                                      </span>
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
                        );
                      })()
                    : null}
                </section>
              );
            })
          )}
        </div>
      </main>
    </div>
  );
};
