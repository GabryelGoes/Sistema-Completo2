import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseBrowser } from "../services/supabaseBrowser";
import type { ServiceOrderType } from "../services/apiService";

const DEBOUNCE_BOARD_MS = 350;
const DEBOUNCE_REMINDERS_MS = 250;
const SUBSCRIBE_TIMEOUT_MS = 90_000;
/** Sem cliente Supabase ou WORKSHOP_ID: poll para não ficar estático. */
const FALLBACK_POLL_NO_REALTIME_MS = 18_000;
/** Canal Realtime falhou: poll médio (menos que antes da otimização, aceitável como fallback). */
const FALLBACK_POLL_FAILED_MS = 90_000;

/**
 * Mantém o **quadro** do Pátio/Laboratório alinhado ao servidor via Supabase Realtime.
 * Usa `workshop_id=eq.{id}` em `service_orders` e `workshop_reminders` (igual ao hub de orçamentos):
 * filtros só por `order_type`/`scope` costumam falhar ou não receber eventos com RLS/replicação.
 * O `getServiceOrders` no refresh continua a filtrar veículo vs módulo na API.
 */
export function usePatioBoardLiveSync(opts: {
  orderType: ServiceOrderType;
  enabled: boolean;
  onBoardRefresh: () => void | Promise<void>;
  onRemindersRefresh: () => void | Promise<void>;
}) {
  const { orderType, enabled } = opts;
  const boardRef = useRef(opts.onBoardRefresh);
  const remindersRef = useRef(opts.onRemindersRefresh);
  boardRef.current = opts.onBoardRefresh;
  remindersRef.current = opts.onRemindersRefresh;

  const boardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remindersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackBootTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subscribedRef = useRef(false);

  const scheduleBoard = () => {
    if (boardTimerRef.current) clearTimeout(boardTimerRef.current);
    boardTimerRef.current = setTimeout(() => {
      boardTimerRef.current = null;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void Promise.resolve(boardRef.current());
    }, DEBOUNCE_BOARD_MS);
  };

  const scheduleReminders = () => {
    if (remindersTimerRef.current) clearTimeout(remindersTimerRef.current);
    remindersTimerRef.current = setTimeout(() => {
      remindersTimerRef.current = null;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void Promise.resolve(remindersRef.current());
    }, DEBOUNCE_REMINDERS_MS);
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

  const startFallback = (intervalMs: number) => {
    clearFallback();
    subscribedRef.current = false;
    fallbackIntervalRef.current = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void Promise.resolve(boardRef.current());
      void Promise.resolve(remindersRef.current());
    }, intervalMs);
  };

  useEffect(() => {
    if (!enabled) {
      clearFallback();
      if (boardTimerRef.current) clearTimeout(boardTimerRef.current);
      if (remindersTimerRef.current) clearTimeout(remindersTimerRef.current);
      return;
    }

    const workshopId = (import.meta.env.VITE_WORKSHOP_ID as string | undefined)?.trim();
    const supabase = getSupabaseBrowser();
    const scopeTag = orderType === "module" ? "module" : "vehicle";

    const clearTimers = () => {
      if (boardTimerRef.current) clearTimeout(boardTimerRef.current);
      if (remindersTimerRef.current) clearTimeout(remindersTimerRef.current);
    };

    if (!supabase || !workshopId) {
      startFallback(FALLBACK_POLL_NO_REALTIME_MS);
      const onVis = () => {
        if (document.visibilityState === "visible") {
          scheduleBoard();
          scheduleReminders();
        }
      };
      document.addEventListener("visibilitychange", onVis);
      return () => {
        document.removeEventListener("visibilitychange", onVis);
        clearTimers();
        clearFallback();
      };
    }

    clearFallback();
    subscribedRef.current = false;

    const rng = Math.random().toString(36).slice(2);
    const channelName = `patio-board-${scopeTag}-${rng}`;

    let channel: RealtimeChannel = supabase.channel(channelName);

    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "service_orders",
        filter: `workshop_id=eq.${workshopId}`,
      },
      () => scheduleBoard()
    );

    channel = channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "workshop_reminders",
        filter: `workshop_id=eq.${workshopId}`,
      },
      () => scheduleReminders()
    );

    fallbackBootTimerRef.current = window.setTimeout(() => {
      if (!subscribedRef.current) {
        console.warn(
          "[usePatioBoardLiveSync] Realtime não subscreveu a tempo — usando poll de fallback."
        );
        startFallback(FALLBACK_POLL_FAILED_MS);
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
        // Alinha com o servidor logo após o join (evita gap até o primeiro evento).
        scheduleBoard();
        scheduleReminders();
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        const detail =
          err instanceof Error
            ? `${err.name}: ${err.message}`
            : err && typeof err === "object"
              ? JSON.stringify(err)
              : String(err ?? "");
        console.warn(`[usePatioBoardLiveSync] ${status}: ${detail}`);
        startFallback(FALLBACK_POLL_FAILED_MS);
      }
    }, SUBSCRIBE_TIMEOUT_MS);

    const onVis = () => {
      if (document.visibilityState === "visible") {
        scheduleBoard();
        scheduleReminders();
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearTimers();
      clearFallback();
      void supabase.removeChannel(channel);
    };
  }, [enabled, orderType]);
}
