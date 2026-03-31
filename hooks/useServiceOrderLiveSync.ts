import { useEffect, useRef } from "react";

/**
 * Mantém o modal da OS alinhado ao servidor: EventSource em `/api/service-orders/:id/live`
 * (SSE + Supabase Realtime no backend). Debounce evita rajadas de refetch.
 */
export function useServiceOrderLiveSync(
  serviceOrderId: string | null,
  onSync: () => void | Promise<void>,
  options?: { debounceMs?: number; enabled?: boolean }
) {
  const debounceMs = options?.debounceMs ?? 400;
  const enabled = options?.enabled !== false;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  useEffect(() => {
    if (!enabled || !serviceOrderId) return;

    const url = `/api/service-orders/${encodeURIComponent(serviceOrderId)}/live`;
    const es = new EventSource(url);

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        void Promise.resolve(onSyncRef.current());
      }, debounceMs);
    };

    es.onmessage = () => schedule();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      es.close();
    };
  }, [serviceOrderId, enabled, debounceMs]);
}
