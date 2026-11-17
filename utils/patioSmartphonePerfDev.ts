/**
 * Instrumentação leve do Pátio (somente DEV).
 * Ativar: localStorage.setItem('patio_perf_dev', '1') e recarregar,
 * ou abrir o app com ?patioPerf=1.
 *
 * Não registra placas, nomes de clientes, tokens ou IDs de OS.
 * Medições em dispositivos reais ficam no doc de baseline (pendentes até coleta).
 */

export type PatioPerfMark =
  | 'enter'
  | 'board_commit'
  | 'open_os'
  | 'close_os'
  | 'scroll_sample'
  | 'auto_refresh';

type PatioPerfSnapshot = {
  t: number;
  mark: PatioPerfMark;
  cardCount?: number;
  detail?: string;
  longTaskMs?: number;
};

const STORAGE_FLAG = 'patio_perf_dev';
const MAX_EVENTS = 80;

let enabledCache: boolean | null = null;
let events: PatioPerfSnapshot[] = [];
let longTaskObserver: PerformanceObserver | null = null;
let commitCount = 0;

function readQueryFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return new URLSearchParams(window.location.search).get('patioPerf') === '1';
  } catch {
    return false;
  }
}

function readStorageFlag(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_FLAG) === '1';
  } catch {
    return false;
  }
}

/** true só em Vite DEV + flag explícita. */
export function isPatioSmartphonePerfDevEnabled(): boolean {
  // Optional chaining: tsx/selftests podem não ter import.meta.env.
  if (!import.meta.env?.DEV) return false;
  if (enabledCache != null) return enabledCache;
  enabledCache = readQueryFlag() || readStorageFlag();
  return enabledCache;
}

function pushEvent(ev: PatioPerfSnapshot): void {
  events.push(ev);
  if (events.length > MAX_EVENTS) events = events.slice(-MAX_EVENTS);
  if (typeof console !== 'undefined' && console.info) {
    console.info('[patio-perf]', ev.mark, {
      cardCount: ev.cardCount,
      detail: ev.detail,
      longTaskMs: ev.longTaskMs,
    });
  }
}

export function patioPerfMark(
  mark: PatioPerfMark,
  opts?: { cardCount?: number; detail?: string; longTaskMs?: number }
): void {
  if (!isPatioSmartphonePerfDevEnabled()) return;
  pushEvent({
    t: typeof performance !== 'undefined' ? performance.now() : Date.now(),
    mark,
    cardCount: opts?.cardCount,
    detail: opts?.detail,
    longTaskMs: opts?.longTaskMs,
  });
}

/** Conta um “commit” de board (chamado do efeito pós-render do quadro). */
export function patioPerfNoteBoardCommit(cardCount: number): void {
  if (!isPatioSmartphonePerfDevEnabled()) return;
  commitCount += 1;
  patioPerfMark('board_commit', {
    cardCount,
    detail: `n=${commitCount}`,
  });
}

export function patioPerfGetEvents(): readonly PatioPerfSnapshot[] {
  return events;
}

export function patioPerfResetForTests(): void {
  events = [];
  commitCount = 0;
  enabledCache = null;
  if (longTaskObserver) {
    try {
      longTaskObserver.disconnect();
    } catch {
      /* ignore */
    }
    longTaskObserver = null;
  }
}

/**
 * Observa long tasks (≥50ms). Sem PII.
 * No-op se PerformanceObserver/longtask indisponível (Safari costuma não expor).
 */
export function patioPerfEnsureLongTaskObserver(): void {
  if (!isPatioSmartphonePerfDevEnabled()) return;
  if (longTaskObserver) return;
  if (typeof PerformanceObserver === 'undefined') return;
  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const ms = Math.round(entry.duration);
        if (ms < 50) continue;
        patioPerfMark('auto_refresh', {
          detail: 'longtask',
          longTaskMs: ms,
        });
      }
    });
    longTaskObserver.observe({ entryTypes: ['longtask'] as string[] });
  } catch {
    longTaskObserver = null;
  }
}
