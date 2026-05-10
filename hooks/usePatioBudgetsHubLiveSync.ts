import { useEffect, useRef } from "react";
import { getSupabaseBrowser } from "../services/supabaseBrowser";

const FALLBACK_POLL_MS = 120_000;
/** Timeout do join Realtime (evita TIMED_OUT sem mensagem). */
const SUBSCRIBE_TIMEOUT_MS = 90_000;

/**
 * Hub de orçamentos: **Realtime direto no browser** (budgets + OS da oficina),
 * sem SSE em `/api/patio-budgets-hub/live` na Vercel.
 *
 * Requer `VITE_WORKSHOP_ID` + credenciais Supabase no front (`VITE_SUPABASE_*`).
 * Sem isso: fallback com poll lento só com aba visível.
 */
export function usePatioBudgetsHubLiveSync(
  onSync: () => void | Promise<void>,
  options?: { debounceMs?: number; enabled?: boolean }
) {
  const debounceMs = options?.debounceMs ?? 350;
  const enabled = options?.enabled !== false;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscribedRef = useRef(false);
  const fallbackBootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

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
    if (!enabled) return;

    const workshopId = (import.meta.env.VITE_WORKSHOP_ID as string | undefined)?.trim();
    const supabase = getSupabaseBrowser();

    if (!supabase || !workshopId) {
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

    const channelName = `patio-budgets-hub-${workshopId}-${Math.random().toString(36).slice(2)}`;
    let channel = supabase.channel(channelName);

    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "budgets",
        filter: `workshop_id=eq.${workshopId}`,
      },
      () => schedule()
    );
    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "service_orders",
        filter: `workshop_id=eq.${workshopId}`,
      },
      () => schedule()
    );

    fallbackBootTimerRef.current = window.setTimeout(() => {
      if (!subscribedRef.current) {
        console.warn("[usePatioBudgetsHubLiveSync] Realtime não subscreveu a tempo — fallback lento.");
        startFallback();
      }
    }, SUBSCRIBE_TIMEOUT_MS + 15_000);

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
        const detail =
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : err && typeof err === "object"
              ? JSON.stringify(err)
              : String(err ?? "(sem detalhe do servidor)");
        console.warn(
          `[usePatioBudgetsHubLiveSync] Realtime ${status}: ${detail}. ` +
            "Causa frequente: RLS sem SELECT para `anon` em `budgets` / `service_orders`. " +
            "Ver migration `20260511120000_realtime_anon_select_policies.sql`."
        );
        startFallback();
      }
    }, SUBSCRIBE_TIMEOUT_MS);

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
  }, [enabled, debounceMs]);
}
