import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../services/supabaseBrowser";

/** ID sintético do placeholder do modal (PatioView) — não subscrever `customers` com isto. */
const PLACEHOLDER_CUSTOMER_ID = "00000000-0000-4000-8000-000000000001";

/**
 * Mantém o modal da OS alinhado ao servidor via **Supabase Realtime no browser**.
 *
 * Dois canais: **core** (OS + comentários + orçamentos) e **extra** (checklist + cliente + lembretes).
 * Se o servidor rejeitar muitos `postgres_changes` de uma vez, o canal único falhava com
 * CHANNEL_ERROR / timeout; separar isola falhas parciais.
 *
 * `subscribe(callback, timeout)` — timeout longo evita TIMED_OUT (o callback vem sem 2.º arg).
 */
export function useServiceOrderLiveSync(
  serviceOrderId: string | null,
  onSync: () => void | Promise<void>,
  options?: {
    debounceMs?: number;
    /** Se Realtime falhar, intervalo do poll de segurança (ms). Default 25s — etapas/chat/anexos não ficam “presos”. */
    fallbackPollMs?: number;
    enabled?: boolean;
    realtimeCustomerId?: string | null;
    realtimeWorkshopId?: string | null;
  }
) {
  const debounceMs = options?.debounceMs ?? 200;
  const fallbackPollMs = options?.fallbackPollMs ?? 25_000;
  const enabled = options?.enabled !== false;
  const rawCustomerId = options?.realtimeCustomerId ?? null;
  const realtimeCustomerId =
    rawCustomerId?.trim() && rawCustomerId.trim() !== PLACEHOLDER_CUSTOMER_ID
      ? rawCustomerId.trim()
      : null;
  const realtimeWorkshopId = options?.realtimeWorkshopId ?? null;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackBootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const syncedOnceAfterBothChannelsRef = useRef(false);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  /** Join Realtime pode demorar com vários bindings; default da lib é curto → TIMED_OUT sem mensagem. */
  const SUBSCRIBE_TIMEOUT_MS = 90_000;

  const schedule = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void Promise.resolve(onSyncRef.current());
    }, debounceMs);
  };

  const clearFallback = () => {
    if (fallbackIntervalRef.current) {
      clearInterval(fallbackIntervalRef.current);
      fallbackIntervalRef.current = null;
    }
    if (fallbackBootTimerRef.current) {
      clearTimeout(fallbackBootTimerRef.current);
      fallbackBootTimerRef.current = null;
    }
  };

  const startFallback = () => {
    clearFallback();
    fallbackIntervalRef.current = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void Promise.resolve(onSyncRef.current());
    }, fallbackPollMs);
  };

  const logSubscribeProblem = (which: string, status: string, err: unknown) => {
    const detail =
      err instanceof Error
        ? `${err.name}: ${err.message}`
        : err && typeof err === "object"
          ? JSON.stringify(err)
          : status === "TIMED_OUT"
            ? "(timeout ao subscrever — rede ou servidor Realtime lento)"
            : String(err ?? "(sem detalhe)");
    console.warn(`[useServiceOrderLiveSync ${which}] ${status}: ${detail}`);
    if (status === "CHANNEL_ERROR" && err instanceof Error && err.message.includes("mismatch")) {
      console.warn(
        "[useServiceOrderLiveSync] Bindings postgres_changes rejeitados pelo servidor. Confirme publicação Realtime nas tabelas e filtros."
      );
    }
  };

  useEffect(() => {
    if (!enabled || !serviceOrderId) return;

    syncedOnceAfterBothChannelsRef.current = false;

    const workshopId =
      realtimeWorkshopId?.trim() ||
      (import.meta.env.VITE_WORKSHOP_ID as string | undefined)?.trim() ||
      null;
    const customerId = realtimeCustomerId;

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      startFallback();
      const onVis = () => {
        if (document.visibilityState === "visible") schedule();
      };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        document.removeEventListener("visibilitychange", onVis);
        clearFallback();
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }

    clearFallback();

    const rng = Math.random().toString(36).slice(2);

    let coreChannel: RealtimeChannel = supabase
      .channel(`os-live-core-${serviceOrderId}-${rng}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "service_orders", filter: `id=eq.${serviceOrderId}` },
        () => schedule()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_order_comments",
          filter: `service_order_id=eq.${serviceOrderId}`,
        },
        () => schedule()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "budgets",
          filter: `service_order_id=eq.${serviceOrderId}`,
        },
        () => schedule()
      );

    let extraChannel: RealtimeChannel = supabase
      .channel(`os-live-extra-${serviceOrderId}-${rng}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "service_order_checklist_checks",
          filter: `service_order_id=eq.${serviceOrderId}`,
        },
        () => schedule()
      );

    if (customerId) {
      extraChannel = extraChannel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers", filter: `id=eq.${customerId}` },
        () => schedule()
      );
    }

    if (workshopId) {
      extraChannel = extraChannel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workshop_reminders",
          filter: `workshop_id=eq.${workshopId}`,
        },
        () => schedule()
      );
    }

    let coreOk = false;
    let extraOk = false;

    const considerBootResolved = () => {
      if (coreOk && extraOk) {
        if (fallbackBootTimerRef.current) {
          clearTimeout(fallbackBootTimerRef.current);
          fallbackBootTimerRef.current = null;
        }
        if (fallbackIntervalRef.current) {
          clearInterval(fallbackIntervalRef.current);
          fallbackIntervalRef.current = null;
        }
        if (!syncedOnceAfterBothChannelsRef.current) {
          syncedOnceAfterBothChannelsRef.current = true;
          queueMicrotask(() => {
            if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
            void Promise.resolve(onSyncRef.current());
          });
        }
      }
    };

    const makeHandler =
      (which: "core" | "extra") =>
      (status: string, err?: unknown) => {
        if (status === "SUBSCRIBED") {
          if (which === "core") coreOk = true;
          else extraOk = true;
          considerBootResolved();
          return;
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          logSubscribeProblem(which, status, err);
          if (which === "core") {
            startFallback();
          } else {
            console.warn(
              "[useServiceOrderLiveSync extra] Canal opcional falhou — dados principais (core) podem continuar em Realtime."
            );
            extraOk = true;
            considerBootResolved();
          }
        }
      };

    fallbackBootTimerRef.current = window.setTimeout(() => {
      if (!(coreOk && extraOk)) {
        console.warn(
          `[useServiceOrderLiveSync] Realtime não subscreveu a tempo — poll de segurança a cada ${fallbackPollMs / 1000}s.`
        );
        startFallback();
      }
    }, SUBSCRIBE_TIMEOUT_MS + 15_000);

    coreChannel.subscribe(makeHandler("core"), SUBSCRIBE_TIMEOUT_MS);
    extraChannel.subscribe(makeHandler("extra"), SUBSCRIBE_TIMEOUT_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (timerRef.current) clearTimeout(timerRef.current);
      clearFallback();
      void supabase.removeChannel(coreChannel);
      void supabase.removeChannel(extraChannel);
    };
  }, [
    serviceOrderId,
    enabled,
    debounceMs,
    fallbackPollMs,
    realtimeCustomerId,
    realtimeWorkshopId,
  ]);
}
