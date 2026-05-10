import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "../services/supabaseBrowser";

/**
 * Mantém o modal da OS alinhado ao servidor via **Supabase Realtime no browser**
 * (sem SSE na Vercel). Debounce evita rajadas de refetch.
 *
 * Se `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` não existirem, ou o canal falhar,
 * usa fallback: sync ao focar a aba + poll lento em segundo plano visível.
 *
 * Nota: o Postgres precisa entregar eventos ao role `anon` (RLS desativado ou políticas
 * de SELECT adequadas). Veja comentário em `supabase/migrations/20260510_anon_realtime_notes.sql`.
 */
export function useServiceOrderLiveSync(
  serviceOrderId: string | null,
  onSync: () => void | Promise<void>,
  options?: {
    debounceMs?: number;
    enabled?: boolean;
    realtimeCustomerId?: string | null;
    realtimeWorkshopId?: string | null;
  }
) {
  const debounceMs = options?.debounceMs ?? 400;
  const enabled = options?.enabled !== false;
  const realtimeCustomerId = options?.realtimeCustomerId ?? null;
  const realtimeWorkshopId = options?.realtimeWorkshopId ?? null;

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscribedRef = useRef(false);
  const fallbackBootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  const FALLBACK_POLL_MS = 120_000;

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
    subscribedRef.current = false;
    fallbackIntervalRef.current = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void Promise.resolve(onSyncRef.current());
    }, FALLBACK_POLL_MS);
  };

  useEffect(() => {
    if (!enabled || !serviceOrderId) return;

    const workshopId =
      realtimeWorkshopId?.trim() ||
      (import.meta.env.VITE_WORKSHOP_ID as string | undefined)?.trim() ||
      null;
    const customerId = realtimeCustomerId?.trim() || null;

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
    subscribedRef.current = false;

    const channelName = `os-live-${serviceOrderId}-${Math.random().toString(36).slice(2)}`;
    let channel = supabase.channel(channelName);

    channel = channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "service_orders", filter: `id=eq.${serviceOrderId}` },
      () => schedule()
    );
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "service_order_comments",
        filter: `service_order_id=eq.${serviceOrderId}`,
      },
      () => schedule()
    );
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "budgets",
        filter: `service_order_id=eq.${serviceOrderId}`,
      },
      () => schedule()
    );
    channel = channel.on(
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
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers", filter: `id=eq.${customerId}` },
        () => schedule()
      );
    }

    if (workshopId) {
      channel = channel.on(
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

    fallbackBootTimerRef.current = window.setTimeout(() => {
      if (!subscribedRef.current) {
        console.warn("[useServiceOrderLiveSync] Realtime não subscreveu a tempo — fallback lento.");
        startFallback();
      }
    }, 12_000);

    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        subscribedRef.current = true;
        if (fallbackBootTimerRef.current) {
          clearTimeout(fallbackBootTimerRef.current);
          fallbackBootTimerRef.current = null;
        }
        if (fallbackIntervalRef.current) {
          clearInterval(fallbackIntervalRef.current);
          fallbackIntervalRef.current = null;
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[useServiceOrderLiveSync] Canal Realtime falhou:", err);
        startFallback();
      }
    });

    const onVis = () => {
      if (document.visibilityState === "visible") schedule();
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      if (timerRef.current) clearTimeout(timerRef.current);
      clearFallback();
      void supabase.removeChannel(channel);
    };
  }, [
    serviceOrderId,
    enabled,
    debounceMs,
    realtimeCustomerId,
    realtimeWorkshopId,
  ]);
}
