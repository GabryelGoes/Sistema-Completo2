/**
 * Transição shared-element (FLIP) ícone da Home → card/app e o inverso.
 * A origem é sempre o ícone clicado; no fechamento a posição do ícone é
 * remedida ao vivo (funciona após reorganizar tiles).
 */

export type HomeLaunchRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Raio visual em px (média dos cantos). */
  radius: number;
};

export type HomeLaunchTarget =
  | { kind: 'tab'; tabId: string }
  | { kind: 'overlay'; overlayId: string };

export type HomeLaunchPhase = 'idle' | 'opening' | 'open' | 'closing';

export type HomeLaunchSession = {
  tileId: string;
  target: HomeLaunchTarget;
  /** Snapshot no clique — o fechamento re-mede o ícone ao vivo. */
  sourceRect: HomeLaunchRect;
  phase: HomeLaunchPhase;
};

export const HOME_LAUNCH_ICON_ATTR = 'data-home-launch-icon';
export const HOME_LAUNCH_OPEN_MS = 520;
export const HOME_LAUNCH_CLOSE_MS = 420;
/** Curva próxima das transições de app do iOS (não linear). */
export const HOME_LAUNCH_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const HOME_LAUNCH_CLOSE_EASING = 'cubic-bezier(0.4, 0.0, 0.2, 1)';

type Listener = () => void;

let session: HomeLaunchSession | null = null;
let closeFlush: (() => void) | null = null;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (_) {}
  });
}

export function subscribeHomeLaunch(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getHomeLaunchSession(): HomeLaunchSession | null {
  return session;
}

export function prefersHomeLaunchReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readRadius(el: Element): number {
  const style = window.getComputedStyle(el);
  const raw = style.borderTopLeftRadius || style.borderRadius || '0';
  const match = raw.match(/([\d.]+)px/);
  if (match) {
    const px = parseFloat(match[1]);
    if (px > 0) return px;
  }
  const rem = raw.match(/([\d.]+)rem/);
  if (rem) {
    const r = parseFloat(rem[1]) * 16;
    if (r > 0) return r;
  }
  const box = el.getBoundingClientRect();
  // Squircle iOS ~28% do menor lado
  return Math.min(box.width, box.height) * 0.28;
}

export function measureHomeLaunchRect(el: Element | null | undefined): HomeLaunchRect | null {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    left: r.left,
    top: r.top,
    width: r.width,
    height: r.height,
    radius: readRadius(el),
  };
}

export function queryHomeLaunchIcon(tileId: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(`[${HOME_LAUNCH_ICON_ATTR}="${CSS.escape(tileId)}"]`);
}

/** Mede o ícone na posição atual do DOM (após drag/reorder). */
export function measureLiveHomeLaunchIcon(tileId: string): HomeLaunchRect | null {
  return measureHomeLaunchRect(queryHomeLaunchIcon(tileId));
}

export function armHomeLaunch(opts: {
  tileId: string;
  target: HomeLaunchTarget;
  sourceEl?: Element | null;
}): HomeLaunchSession | null {
  const el = opts.sourceEl ?? queryHomeLaunchIcon(opts.tileId);
  const sourceRect = measureHomeLaunchRect(el);
  if (!sourceRect) {
    session = null;
    closeFlush = null;
    emit();
    return null;
  }
  session = {
    tileId: opts.tileId,
    target: opts.target,
    sourceRect,
    phase: 'opening',
  };
  closeFlush = null;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.homeLaunchPhase = 'opening';
    document.documentElement.dataset.homeLaunchTile = opts.tileId;
  }
  emit();
  return session;
}

export function markHomeLaunchOpen(): void {
  if (!session) return;
  session = { ...session, phase: 'open' };
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.homeLaunchPhase = 'open';
  }
  emit();
}

/**
 * Inicia o fechamento animado. `flush` só roda depois da animação (ou na hora se não houver sessão).
 * Retorna true se o caller deve esperar o painel animar (não navegar ainda).
 */
export function beginHomeLaunchClose(flush: () => void): boolean {
  if (!session || session.phase === 'idle') {
    clearHomeLaunch();
    flush();
    return false;
  }
  if (session.phase === 'closing') {
    closeFlush = flush;
    return true;
  }
  closeFlush = flush;
  session = { ...session, phase: 'closing' };
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.homeLaunchPhase = 'closing';
  }
  emit();
  return true;
}

export function completeHomeLaunchClose(): void {
  const flush = closeFlush;
  closeFlush = null;
  clearHomeLaunch();
  flush?.();
}

export function clearHomeLaunch(): void {
  session = null;
  closeFlush = null;
  if (typeof document !== 'undefined') {
    delete document.documentElement.dataset.homeLaunchPhase;
    delete document.documentElement.dataset.homeLaunchTile;
  }
  emit();
}

export function homeLaunchMatchesTab(tabId: string): boolean {
  return !!session && session.target.kind === 'tab' && session.target.tabId === tabId;
}

export function homeLaunchMatchesOverlay(overlayId: string): boolean {
  return !!session && session.target.kind === 'overlay' && session.target.overlayId === overlayId;
}

export function isHomeLaunchTransitioning(): boolean {
  return !!session && (session.phase === 'opening' || session.phase === 'closing');
}

type FlipOpts = {
  surface: HTMLElement;
  content?: HTMLElement | null;
  from: HomeLaunchRect;
  to: HomeLaunchRect;
  durationMs: number;
  easing: string;
  /** opening: conteúdo nasce; closing: conteúdo some */
  direction: 'open' | 'close';
};

function applyWillChange(el: HTMLElement, on: boolean) {
  if (on) {
    el.style.willChange = 'transform, border-radius, opacity';
  } else {
    el.style.willChange = '';
  }
}

/**
 * FLIP contínuo: o surface ocupa o destino (`to`) no layout; o transform
 * o coloca visualmente em `from` e anima até a identidade (ou o inverso).
 */
export function playHomeLaunchFlip(opts: FlipOpts): Promise<void> {
  const { surface, content, from, to, durationMs, easing, direction } = opts;

  if (prefersHomeLaunchReducedMotion()) {
    surface.style.transform = '';
    surface.style.borderRadius = '';
    surface.style.opacity = '';
    surface.style.overflow = '';
    surface.style.transformOrigin = '';
    surface.style.clipPath = '';
    if (content) {
      content.style.opacity = '';
      content.style.transform = '';
      content.style.filter = '';
    }
    return Promise.resolve();
  }

  const sx = from.width / Math.max(to.width, 1);
  const sy = from.height / Math.max(to.height, 1);
  const dx = from.left - to.left;
  const dy = from.top - to.top;

  // Compensa o scale: border-radius CSS é escalado pelo transform.
  const fromRadiusX = from.radius / Math.max(sx, 0.001);
  const fromRadiusY = from.radius / Math.max(sy, 0.001);
  const toRadius = to.radius;

  const startTransform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  const endTransform = 'translate(0px, 0px) scale(1, 1)';

  const start =
    direction === 'open'
      ? {
          transform: startTransform,
          borderRadius: `${fromRadiusX}px / ${fromRadiusY}px`,
          opacity: 1,
        }
      : {
          transform: endTransform,
          borderRadius: `${toRadius}px`,
          opacity: 1,
        };
  const end =
    direction === 'open'
      ? {
          transform: endTransform,
          borderRadius: `${toRadius}px`,
          opacity: 1,
        }
      : {
          transform: startTransform,
          borderRadius: `${fromRadiusX}px / ${fromRadiusY}px`,
          opacity: 1,
        };

  surface.style.transformOrigin = 'top left';
  surface.style.overflow = 'hidden';
  applyWillChange(surface, true);

  const surfaceAnim = surface.animate([start, end], {
    duration: durationMs,
    easing,
    fill: 'forwards',
  });

  let contentAnim: Animation | null = null;
  if (content) {
    applyWillChange(content, true);
    const cStart =
      direction === 'open'
        ? { opacity: 0, transform: 'scale(1.04)', filter: 'blur(6px)' }
        : { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' };
    const cEnd =
      direction === 'open'
        ? { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }
        : { opacity: 0, transform: 'scale(1.02)', filter: 'blur(4px)' };
    contentAnim = content.animate([cStart, cEnd], {
      duration: Math.round(durationMs * (direction === 'open' ? 0.72 : 0.55)),
      delay: direction === 'open' ? Math.round(durationMs * 0.18) : 0,
      easing,
      fill: 'forwards',
    });
  }

  return new Promise((resolve) => {
    const finish = () => {
      surfaceAnim.cancel();
      contentAnim?.cancel();
      surface.style.transform = '';
      surface.style.borderRadius = '';
      surface.style.opacity = '';
      surface.style.overflow = '';
      surface.style.transformOrigin = '';
      applyWillChange(surface, false);
      if (content) {
        content.style.opacity = '';
        content.style.transform = '';
        content.style.filter = '';
        applyWillChange(content, false);
      }
      resolve();
    };
    surfaceAnim.onfinish = finish;
    surfaceAnim.oncancel = finish;
  });
}

export function resolveHomeLaunchSurfaceRect(el: HTMLElement): HomeLaunchRect {
  const measured = measureHomeLaunchRect(el);
  if (measured) return { ...measured, radius: 0 };
  return {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    radius: 0,
  };
}
