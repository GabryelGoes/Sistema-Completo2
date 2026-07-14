/**
 * Protege a navegação de abas (Home←Pátio) quando o fechamento de modal
 * sincroniza `history` via `back()`/`go()`. No iOS o popstate pode chegar
 * depois do paint — a janela precisa ser larga o bastante.
 */

const DEFAULT_TTL_MS = 1600;

let suppressTabPopUntil = 0;

/** Marcar ANTES de history.back/go — o App não deve tratar como “voltar à Home”. */
export function markModalHistorySync(ttlMs: number = DEFAULT_TTL_MS): void {
  const until = Date.now() + ttlMs;
  if (until > suppressTabPopUntil) suppressTabPopUntil = until;
  if (typeof window !== "undefined") {
    const w = window as Window & { __rdaModalBackHandledAt?: number };
    w.__rdaModalBackHandledAt = Date.now();
  }
}

export function shouldIgnoreAppTabPopstate(): boolean {
  if (Date.now() < suppressTabPopUntil) return true;
  if (typeof window === "undefined") return false;
  const w = window as Window & { __rdaModalBackHandledAt?: number };
  return !!(w.__rdaModalBackHandledAt && Date.now() - w.__rdaModalBackHandledAt < DEFAULT_TTL_MS);
}
