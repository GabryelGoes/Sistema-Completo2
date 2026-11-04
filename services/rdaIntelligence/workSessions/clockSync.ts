/**
 * Sincroniza o relógio do cliente com o `serverNow` da API.
 *
 * Bug antigo: recalcular `skew = serverNow - Date.now()` a cada tick
 * fazia `serverNowMs` ficar congelado no instante do último fetch.
 * Aqui o skew é fixado no momento do sync e o tempo avança com o tick local.
 */

export type ServerClockSync = {
  /** Instante do servidor no momento do sync (ms epoch). */
  serverAtSyncMs: number;
  /** Instante do cliente no momento do sync (ms epoch). */
  clientAtSyncMs: number;
  /** Estima o "agora" do servidor a partir do relógio local. */
  serverNowMsAt: (clientNowMs: number) => number;
};

export function createServerClockSync(
  serverNowIso: string,
  clientNowMs: number = Date.now()
): ServerClockSync {
  const parsed = Date.parse(serverNowIso);
  const serverAtSyncMs = Number.isFinite(parsed) ? parsed : clientNowMs;
  const clientAtSyncMs = clientNowMs;
  return {
    serverAtSyncMs,
    clientAtSyncMs,
    serverNowMsAt(nowMs: number) {
      return serverAtSyncMs + (nowMs - clientAtSyncMs);
    },
  };
}
