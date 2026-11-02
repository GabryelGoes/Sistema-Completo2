/**
 * GenieNotificationDismiss — efeito Gênio (Dock macOS) para notificações.
 *
 * Versão estável: poucas faixas, só transform/opacity (sem blur), clones leves
 * e trava global para evitar animações sobrepostas que travam a UI.
 */

export type GeniePoint = { x: number; y: number };

/** Destino da “sucção” — configurável (ícone, canto, barra, etc.). */
export type GenieOrigin =
  | { type: 'element'; element: HTMLElement }
  | { type: 'point'; point: GeniePoint }
  | { type: 'selector'; selector: string };

export type GenieNotificationDismissOptions = {
  source: HTMLElement;
  /** Ponto/elemento para onde a notificação será sugada. */
  genieOrigin: GenieOrigin;
  /** Duração em ms (padrão ~420). */
  durationMs?: number;
  /** Faixas horizontais da malha (padrão 16; máx. 24). */
  stripCount?: number;
  /** Mantém o original invisível ao terminar (evita flash antes do unmount). */
  leaveSourceHidden?: boolean;
};

export type GenieNotificationDismissManyOptions = {
  sources: HTMLElement[];
  genieOrigin: GenieOrigin;
  durationMs?: number;
  staggerMs?: number;
  stripCount?: number;
  leaveSourcesHidden?: boolean;
};

/** Evita várias genies ao mesmo tempo (principal causa de freeze). */
let genieChain: Promise<void> = Promise.resolve();

function enqueueGenie(task: () => Promise<void>): Promise<void> {
  const next = genieChain.then(task, task);
  // Não deixa rejeição quebrar a fila.
  genieChain = next.catch(() => undefined);
  return next;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(t: number): number {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function appleEase(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

function quadBezier(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

export function resolveGenieOrigin(origin: GenieOrigin): GeniePoint | null {
  if (typeof document === 'undefined') return null;
  if (origin.type === 'point') {
    const { x, y } = origin.point;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }
  let el: HTMLElement | null = null;
  if (origin.type === 'element') {
    el = origin.element?.isConnected ? origin.element : null;
  } else {
    el = document.querySelector(origin.selector);
  }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

type StripNode = {
  wrap: HTMLDivElement;
  yNorm: number;
  originCenterX: number;
  originCenterY: number;
};

function stripLocalProgress(globalT: number, yNorm: number, leadFromTop: boolean): number {
  const lead = leadFromTop ? yNorm : 1 - yNorm;
  const lag = lead * 0.36;
  return smoothstep((globalT - lag) / Math.max(0.001, 1 - lag * 0.8));
}

function funnelWidthFactor(localT: number): number {
  const e = appleEase(localT);
  return Math.max(0.02, Math.pow(1 - e, 1.55));
}

function funnelStretchY(localT: number): number {
  if (localT < 0.35) return 1 + localT * 0.55;
  if (localT < 0.7) return 1.2 - (localT - 0.35) * 0.45;
  return Math.max(0.08, 1.05 - appleEase(localT) * 0.98);
}

/** Remove efeitos caros nos clones (blur/sombra) — evita travar o compositor. */
function lightenClone(root: HTMLElement): void {
  root.style.boxShadow = 'none';
  root.style.filter = 'none';
  root.style.backdropFilter = 'none';
  (root.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'none';
  root.querySelectorAll<HTMLElement>('*').forEach((el) => {
    el.style.boxShadow = 'none';
    el.style.filter = 'none';
    el.style.backdropFilter = 'none';
    (el.style as CSSStyleDeclaration & { webkitBackdropFilter?: string }).webkitBackdropFilter = 'none';
    el.style.transition = 'none';
    el.style.animation = 'none';
  });
  root.querySelectorAll('button, [tabindex], a, video, canvas, iframe').forEach((node) => {
    const el = node as HTMLElement;
    el.removeAttribute('tabindex');
    if (el instanceof HTMLButtonElement) el.disabled = true;
    el.style.pointerEvents = 'none';
  });
}

function buildStrips(
  layer: HTMLElement,
  source: HTMLElement,
  rect: DOMRect,
  stripCount: number
): StripNode[] {
  const strips = Math.max(10, Math.min(24, stripCount));
  const stripH = rect.height / strips;
  const nodes: StripNode[] = [];

  for (let i = 0; i < strips; i++) {
    const top = rect.top + i * stripH;
    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed',
      `left:${rect.left}px`,
      `top:${top}px`,
      `width:${rect.width}px`,
      `height:${stripH + 0.75}px`,
      'margin:0',
      'overflow:hidden',
      'pointer-events:none',
      'will-change:transform,opacity',
      'backface-visibility:hidden',
      'transform:translateZ(0)',
      'transform-origin:50% 50%',
      'contain:layout paint',
    ].join(';');

    const inner = source.cloneNode(true) as HTMLElement;
    lightenClone(inner);
    inner.style.cssText = [
      'position:absolute',
      'left:0',
      `top:${-i * stripH}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      'margin:0',
      'transform:translateZ(0)',
      'opacity:1',
      'pointer-events:none',
      'box-shadow:none',
      'filter:none',
      'backdrop-filter:none',
    ].join(';');

    wrap.appendChild(inner);
    layer.appendChild(wrap);

    nodes.push({
      wrap,
      yNorm: strips <= 1 ? 0.5 : i / (strips - 1),
      originCenterX: rect.left + rect.width / 2,
      originCenterY: top + stripH / 2,
    });
  }

  return nodes;
}

function applyStripFrame(
  node: StripNode,
  globalT: number,
  target: GeniePoint,
  leadFromTop: boolean
): void {
  const localT = stripLocalProgress(globalT, node.yNorm, leadFromTop);
  const moveT = appleEase(localT);

  const ctrlX = lerp(node.originCenterX, target.x, 0.28);
  const ctrlY = lerp(node.originCenterY, target.y, 0.12) + (leadFromTop ? -14 : 14);
  const cx = quadBezier(node.originCenterX, ctrlX, target.x, moveT);
  const cy = quadBezier(node.originCenterY, ctrlY, target.y, moveT);

  const widthF = funnelWidthFactor(localT);
  const stretchY = funnelStretchY(localT);
  const dx = cx - node.originCenterX;
  const dy = cy - node.originCenterY;
  const skew = (1 - widthF) * (target.x >= node.originCenterX ? -5 : 5) * (1 - moveT);
  const opacity = localT < 0.9 ? 1 : 1 - (localT - 0.9) / 0.1;

  node.wrap.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${widthF}, ${stretchY}) skewX(${skew}deg)`;
  node.wrap.style.opacity = String(clamp(opacity, 0, 1));
}

function pulseTarget(targetEl: HTMLElement | null, durationMs: number): void {
  if (!targetEl?.isConnected) return;
  try {
    targetEl.animate(
      [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(1)', offset: 0.58 },
        { transform: 'scale(1.12)', offset: 0.74 },
        { transform: 'scale(0.96)', offset: 0.88 },
        { transform: 'scale(1)', offset: 1 },
      ],
      { duration: durationMs + 60, easing: 'cubic-bezier(0.33, 1.1, 0.4, 1)' }
    );
  } catch {
    /* ignore */
  }
}

async function runGenieOnce(opts: GenieNotificationDismissOptions): Promise<void> {
  const source = opts.source;
  if (!source?.isConnected) return;

  const target = resolveGenieOrigin(opts.genieOrigin);
  if (!target) return;

  if (prefersReducedMotion()) {
    if (opts.leaveSourceHidden) source.style.opacity = '0';
    await new Promise<void>((r) => window.setTimeout(r, 60));
    return;
  }

  const durationMs = clamp(opts.durationMs ?? 420, 280, 700);
  const stripCount = clamp(opts.stripCount ?? 16, 10, 24);
  const rect = source.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;

  const leadFromTop = target.y < rect.top + rect.height * 0.5;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.setAttribute('data-genie-notification-dismiss', 'true');
  layer.style.cssText =
    'position:fixed;inset:0;z-index:100200;pointer-events:none;overflow:visible;contain:strict;';
  document.body.appendChild(layer);

  const prevOpacity = source.style.opacity;
  source.style.opacity = '0';

  let strips: StripNode[] = [];
  try {
    strips = buildStrips(layer, source, rect, stripCount);
    for (const s of strips) applyStripFrame(s, 0, target, leadFromTop);

    const targetEl =
      opts.genieOrigin.type === 'element'
        ? opts.genieOrigin.element
        : opts.genieOrigin.type === 'selector'
          ? document.querySelector<HTMLElement>(opts.genieOrigin.selector)
          : null;
    pulseTarget(targetEl, durationMs + 60);

    await new Promise<void>((resolve) => {
      const t0 = performance.now();
      let raf = 0;
      const tick = (now: number) => {
        const globalT = clamp((now - t0) / durationMs, 0, 1);
        for (const s of strips) applyStripFrame(s, globalT, target, leadFromTop);
        if (globalT < 1) {
          raf = requestAnimationFrame(tick);
        } else {
          cancelAnimationFrame(raf);
          resolve();
        }
      };
      raf = requestAnimationFrame(tick);
    });
  } finally {
    if (!opts.leaveSourceHidden && source.isConnected) {
      source.style.opacity = prevOpacity;
    }
    layer.remove();
  }
}

/**
 * Anima uma notificação com efeito Genie até `genieOrigin`.
 * Resolve quando a animação termina.
 */
export async function GenieNotificationDismiss(
  opts: GenieNotificationDismissOptions
): Promise<void> {
  return enqueueGenie(() => runGenieOnce(opts));
}

/** Várias notificações em sequência (minimize / limpar visual). */
export async function GenieNotificationDismissMany(
  opts: GenieNotificationDismissManyOptions
): Promise<void> {
  const sources = opts.sources.filter((el) => el?.isConnected);
  if (sources.length === 0) return;
  const stagger = Math.max(0, Math.min(40, opts.staggerMs ?? 36));

  // Sequencial (não paralelo): evita dezenas de clones DOM ao mesmo tempo.
  for (let i = 0; i < sources.length; i++) {
    if (i > 0 && stagger > 0) {
      await new Promise<void>((r) => window.setTimeout(r, stagger));
    }
    await GenieNotificationDismiss({
      source: sources[i],
      genieOrigin: opts.genieOrigin,
      durationMs: opts.durationMs,
      stripCount: opts.stripCount,
      leaveSourceHidden: opts.leaveSourcesHidden,
    });
  }
}

/** Atalhos de origem comuns no shell PC. */
export function genieOriginFromElement(el: HTMLElement | null | undefined): GenieOrigin | null {
  if (!el?.isConnected) return null;
  return { type: 'element', element: el };
}

export function genieOriginFromSelector(selector: string): GenieOrigin {
  return { type: 'selector', selector };
}

export function genieOriginFromPoint(x: number, y: number): GenieOrigin {
  return { type: 'point', point: { x, y } };
}
