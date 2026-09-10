/**
 * Evita “click-through” / ghost click ao abrir hubs a partir da Home.
 * No tablet/iOS o `click` sintético após o toque cai no conteúdo que acabou de montar
 * (linhas do hub de Configurações, botões do Estoque, etc.).
 */

type GuardOptions = {
  /** Atraso antes de montar o hub (ms). Dá tempo do click da Home ser engolido. */
  openDelayMs?: number;
  /** Quanto tempo bloquear interações após armar o guard (ms). */
  guardMs?: number;
};

const GUARD_ATTR = 'data-home-hub-open-guard';
const SWALLOW_EVENTS = [
  'click',
  'dblclick',
  'mouseup',
  'mousedown',
  'auxclick',
  'touchstart',
  'touchend',
  'pointerdown',
] as const;

let activeCleanup: (() => void) | null = null;

function swallowEvent(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  if (typeof e.stopImmediatePropagation === 'function') {
    e.stopImmediatePropagation();
  }
}

/**
 * Arma o bloqueio imediatamente (chame no `pointerup` do tile) e só então abre o hub.
 * Enquanto o guard estiver ativo, `html[data-home-hub-open-guard]` fica setado
 * para CSS poder desligar `pointer-events` nos overlays.
 */
export function openHomeHubSafely(open: () => void, options?: GuardOptions): void {
  const openDelayMs = options?.openDelayMs ?? 250;
  const guardMs = options?.guardMs ?? 800;

  activeCleanup?.();

  const startedAt = performance.now();
  let openTimer: number | null = null;
  let endTimer: number | null = null;

  const onSwallow = (e: Event) => {
    if (performance.now() - startedAt > guardMs) {
      cleanup();
      return;
    }
    swallowEvent(e);
  };

  const cleanup = () => {
    for (const type of SWALLOW_EVENTS) {
      document.removeEventListener(type, onSwallow, true);
    }
    if (typeof document !== 'undefined') {
      delete document.documentElement.dataset.homeHubOpenGuard;
    }
    if (openTimer != null) {
      window.clearTimeout(openTimer);
      openTimer = null;
    }
    if (endTimer != null) {
      window.clearTimeout(endTimer);
      endTimer = null;
    }
    activeCleanup = null;
  };

  for (const type of SWALLOW_EVENTS) {
    document.addEventListener(type, onSwallow, true);
  }
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.homeHubOpenGuard = '1';
  }

  openTimer = window.setTimeout(() => {
    openTimer = null;
    open();
  }, openDelayMs);

  endTimer = window.setTimeout(() => {
    cleanup();
  }, guardMs);

  activeCleanup = cleanup;
}

export function clearHomeHubOpenGuard(): void {
  activeCleanup?.();
}
