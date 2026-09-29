/**
 * Efeito Gênio da Dock do macOS: o card é fatiado em faixas horizontais que
 * convergem (funil) até o alvo, com atraso progressivo — o lado mais perto
 * do destino “entra” primeiro.
 */

export type MacGenieMinimizeOptions = {
  sources: HTMLElement[];
  target: HTMLElement;
  /** Duração base por card (ms). Default ~980. */
  durationMs?: number;
  /** Atraso entre cards empilhados (ms). */
  staggerMs?: number;
  /** Quantidade de faixas horizontais (mais = mais suave). */
  stripCount?: number;
  /** Se true, deixa os originais com opacity 0 ao terminar (evita flash antes do unmount). */
  leaveSourcesHidden?: boolean;
};

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function clamp(n: number, a: number, b: number): number {
  return Math.max(a, Math.min(b, n));
}

/** Ease in-out suave (estilo macOS). */
function macEase(t: number): number {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** Curva de funil: começa lento, depois acelera a compressão. */
function funnelEase(t: number): number {
  const x = clamp(t, 0, 1);
  // combinação de ease-in forte no final (sugado)
  return 1 - Math.pow(1 - x, 2.6);
}

function animateStrips(opts: {
  layer: HTMLElement;
  source: HTMLElement;
  rect: DOMRect;
  tx: number;
  ty: number;
  duration: number;
  delay: number;
  stripCount: number;
}): Animation[] {
  const { layer, source, rect, tx, ty, duration, delay, stripCount } = opts;
  const strips = Math.max(12, Math.min(48, stripCount));
  const stripH = rect.height / strips;
  const animations: Animation[] = [];

  // Direção do funil: o canto do card mais próximo do alvo comprime primeiro.
  const targetIsAbove = ty < rect.top + rect.height * 0.45;
  // Se o alvo está acima (sino no topo), as faixas de cima saem primeiro.
  const fromTop = targetIsAbove;

  for (let i = 0; i < strips; i++) {
    const stripIndex = fromTop ? i : strips - 1 - i;
    const top = rect.top + stripIndex * stripH;

    const strip = document.createElement('div');
    strip.style.cssText = [
      'position:fixed',
      `left:${rect.left}px`,
      `top:${top}px`,
      `width:${rect.width}px`,
      `height:${stripH + 0.75}px`,
      'margin:0',
      'overflow:hidden',
      'pointer-events:none',
      'will-change:transform,opacity,filter',
      `transform-origin:${((tx - rect.left) / Math.max(1, rect.width)) * 100}% 50%`,
      'backface-visibility:hidden',
    ].join(';');

    const inner = source.cloneNode(true) as HTMLElement;
    inner.style.cssText = [
      'position:absolute',
      'left:0',
      `top:${-stripIndex * stripH}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      'margin:0',
      'transform:none',
      'opacity:1',
      'pointer-events:none',
      'box-shadow:none',
    ].join(';');
    inner.querySelectorAll('button, [tabindex]').forEach((node) => {
      (node as HTMLElement).removeAttribute('tabindex');
      if (node instanceof HTMLButtonElement) node.disabled = true;
    });
    strip.appendChild(inner);
    layer.appendChild(strip);

    const cx = rect.left + rect.width / 2;
    const cy = top + stripH / 2;
    const dx = tx - cx;
    const dy = ty - cy;

    // Faixas mais perto do destino começam/convergem antes.
    const proximity = fromTop ? stripIndex / (strips - 1) : (strips - 1 - stripIndex) / (strips - 1);
    const stripDelay = delay + proximity * duration * 0.18;

    const keyframes: Keyframe[] = [];
    const steps = 8;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const move = macEase(t);
      const funnel = funnelEase(t);
      // scaleX: permanece largo no início e afunila forte (efeito “genie”)
      const scaleX = Math.max(0.018, 1 - funnel * 0.985);
      // scaleY: alonga levemente no meio do trajeto (esticada da Dock)
      const scaleY = t < 0.45 ? 1 + t * 0.55 : Math.max(0.04, 1.25 - funnel * 1.22);
      const skew = (1 - scaleX) * (dx >= 0 ? -10 : 10) * (1 - t);
      const opacity = t < 0.82 ? 1 : 1 - ((t - 0.82) / 0.18);
      const blur = funnel * 2.4;
      keyframes.push({
        offset: t,
        transform: `translate(${dx * move}px, ${dy * move}px) scale(${scaleX}, ${scaleY}) skewX(${skew}deg)`,
        opacity,
        filter: `blur(${blur}px) brightness(${1 + funnel * 0.12})`,
      });
    }

    const anim = strip.animate(keyframes, {
      duration,
      delay: stripDelay,
      easing: 'linear',
      fill: 'forwards',
    });
    animations.push(anim);
  }

  return animations;
}

/**
 * Minimiza elementos até o centro do alvo com efeito Gênio (Dock).
 * Resolve quando a última animação termina (e clones são removidos).
 */
export async function playMacGenieMinimize(opts: MacGenieMinimizeOptions): Promise<void> {
  const sources = opts.sources.filter((el) => el && el.isConnected);
  if (sources.length === 0 || !opts.target?.isConnected) return;

  if (prefersReducedMotion()) {
    await wait(100);
    return;
  }

  const duration = Math.max(520, opts.durationMs ?? 980);
  const stagger = Math.max(0, opts.staggerMs ?? 70);
  const stripCount = opts.stripCount ?? 32;
  const targetRect = opts.target.getBoundingClientRect();
  const tx = targetRect.left + targetRect.width / 2;
  const ty = targetRect.top + targetRect.height / 2;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    'position:fixed;inset:0;z-index:100180;pointer-events:none;overflow:visible;';
  document.body.appendChild(layer);

  const animations: Animation[] = [];
  const originalOpacity: Array<{ el: HTMLElement; opacity: string }> = [];

  sources.forEach((src, i) => {
    const rect = src.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    originalOpacity.push({ el: src, opacity: src.style.opacity });
    src.style.opacity = '0';

    animations.push(
      ...animateStrips({
        layer,
        source: src,
        rect,
        tx,
        ty,
        duration,
        delay: i * stagger,
        stripCount,
      })
    );
  });

  if (animations.length === 0) {
    originalOpacity.forEach(({ el, opacity }) => {
      el.style.opacity = opacity;
    });
    layer.remove();
    return;
  }

  const total = duration + Math.max(0, sources.length - 1) * stagger + duration * 0.18;

  // Pulso no alvo (Dock bounce)
  const pulse = opts.target.animate(
    [
      { transform: 'scale(1)', offset: 0 },
      { transform: 'scale(1)', offset: 0.58 },
      { transform: 'scale(1.28)', offset: 0.72 },
      { transform: 'scale(0.9)', offset: 0.84 },
      { transform: 'scale(1.08)', offset: 0.92 },
      { transform: 'scale(1)', offset: 1 },
    ],
    {
      duration: total + 60,
      easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    }
  );
  animations.push(pulse);

  // Brilho no pouso
  const glow = document.createElement('div');
  const gSize = Math.max(36, Math.max(targetRect.width, targetRect.height) * 2.8);
  glow.style.cssText = [
    'position:fixed',
    `left:${tx - gSize / 2}px`,
    `top:${ty - gSize / 2}px`,
    `width:${gSize}px`,
    `height:${gSize}px`,
    'border-radius:50%',
    'pointer-events:none',
    'background:radial-gradient(circle, rgba(255,69,58,0.55) 0%, rgba(255,69,58,0.18) 38%, transparent 68%)',
    'opacity:0',
    'z-index:100181',
  ].join(';');
  layer.appendChild(glow);
  animations.push(
    glow.animate(
      [
        { opacity: 0, transform: 'scale(0.35)' },
        { opacity: 0, offset: 0.6 },
        { opacity: 1, transform: 'scale(1)', offset: 0.76 },
        { opacity: 0, transform: 'scale(1.45)', offset: 1 },
      ],
      { duration: total + 40, easing: 'ease-out', fill: 'forwards' }
    )
  );

  await Promise.all(animations.map((a) => a.finished.catch(() => undefined)));

  if (!opts.leaveSourcesHidden) {
    originalOpacity.forEach(({ el, opacity }) => {
      if (el.isConnected) el.style.opacity = opacity;
    });
  }
  layer.remove();
}

/** Localiza o item Orçamentos na sidebar do modo PC. */
export function findDesktopOrcamentosNavTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const badge = document.querySelector<HTMLElement>('[data-desktop-nav-badge="orcamentos"]');
  if (badge) return badge;
  const item = document.querySelector<HTMLElement>('[data-desktop-nav-id="orcamentos"]');
  if (!item) return null;
  const icon = item.querySelector<HTMLElement>('.desktop-shell-nav-icon');
  return icon ?? item;
}

/** Sino da central de notificações no cabeçalho (modo PC). */
export function findDesktopNotificationsBellTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const bell = document.querySelector<HTMLElement>('[data-desktop-notif-bell]');
  if (!bell) return null;
  const badge = bell.querySelector<HTMLElement>('[data-desktop-notif-badge]');
  return badge ?? bell;
}
