import { useEffect, useRef } from "react";
import { API_BASE } from "../services/apiConfig";

/**
 * SSE + Supabase Realtime (via API): recarrega o hub de orçamentos quando qualquer
 * orçamento ou OS da oficina muda. Debounce evita rajadas.
 */
export function usePatioBudgetsHubLiveSync(
  onSync: () => void | Promise<void>,
  options?: { debounceMs?: number; enabled?: boolean }
) {
  const debounceMs = options?.debounceMs ?? 350;
  const enabled = options?.enabled !== false;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;

  useEffect(() => {
    if (!enabled) return;

    const url = `${API_BASE}/patio-budgets-hub/live`;
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
  }, [enabled, debounceMs]);
}
