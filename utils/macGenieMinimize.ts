/**
 * Animação estilo “Genie” do macOS: cards voam e se comprimem até um alvo (ex.: ícone da sidebar).
 */

export type MacGenieMinimizeOptions = {
  sources: HTMLElement[];
  target: HTMLElement;
  /** Duração base por card (ms). Default ~820. */
  durationMs?: number;
  /** Atraso entre cards empilhados (ms). */
  staggerMs?: number;
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

/**
 * Minimiza elementos de origem até o centro do alvo com efeito elástico / genie.
 * Resolve quando a última animação termina (e clones são removidos).
 */
export async function playMacGenieMinimize(opts: MacGenieMinimizeOptions): Promise<void> {
  const sources = opts.sources.filter((el) => el.isConnected);
  if (sources.length === 0 || !opts.target?.isConnected) return;

  if (prefersReducedMotion()) {
    await wait(120);
    return;
  }

  const duration = Math.max(420, opts.durationMs ?? 820);
  const stagger = Math.max(0, opts.staggerMs ?? 48);
  const targetRect = opts.target.getBoundingClientRect();
  const tx = targetRect.left + targetRect.width / 2;
  const ty = targetRect.top + targetRect.height / 2;

  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText =
    'position:fixed;inset:0;z-index:100120;pointer-events:none;overflow:visible;';
  document.body.appendChild(layer);

  const clones: HTMLElement[] = [];
  const animations: Animation[] = [];

  sources.forEach((src, i) => {
    const rect = src.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;

    const wrap = document.createElement('div');
    wrap.style.cssText = [
      'position:fixed',
      `left:${rect.left}px`,
      `top:${rect.top}px`,
      `width:${rect.width}px`,
      `height:${rect.height}px`,
      'margin:0',
      'transform-origin:50% 50%',
      'will-change:transform,opacity,filter,border-radius,clip-path',
      'overflow:hidden',
      'border-radius:18px',
      'box-shadow:0 18px 48px -10px rgba(0,0,0,0.45)',
    ].join(';');

    const clone = src.cloneNode(true) as HTMLElement;
    clone.style.cssText =
      'width:100%;height:100%;margin:0;transform:none;opacity:1;pointer-events:none;';
    clone.querySelectorAll('button, [tabindex]').forEach((node) => {
      (node as HTMLElement).removeAttribute('tabindex');
      if (node instanceof HTMLButtonElement) node.disabled = true;
    });
    wrap.appendChild(clone);
    layer.appendChild(wrap);
    clones.push(wrap);

    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = tx - cx;
    const dy = ty - cy;
    const skew = dx > 0 ? -8 : 8;
    const delay = i * stagger;

    const anim = wrap.animate(
      [
        {
          offset: 0,
          transform: 'translate(0px, 0px) scale(1, 1) skewX(0deg)',
          opacity: 1,
          borderRadius: '18px',
          filter: 'blur(0px) brightness(1)',
          clipPath: 'inset(0% 0% 0% 0% round 18px)',
        },
        {
          offset: 0.22,
          transform: `translate(${dx * 0.12}px, ${dy * 0.08}px) scale(0.94, 1.04) skewX(${skew * 0.25}deg)`,
          opacity: 1,
          borderRadius: '20px',
          filter: 'blur(0.2px) brightness(1.02)',
          clipPath: 'inset(1% 4% 1% 4% round 20px)',
        },
        {
          offset: 0.48,
          transform: `translate(${dx * 0.42}px, ${dy * 0.38}px) scale(0.55, 0.88) skewX(${skew * 0.7}deg)`,
          opacity: 0.97,
          borderRadius: '28px',
          filter: 'blur(0.6px) brightness(1.05)',
          clipPath: 'inset(4% 18% 4% 18% round 28px)',
        },
        {
          offset: 0.72,
          transform: `translate(${dx * 0.78}px, ${dy * 0.8}px) scale(0.22, 0.48) skewX(${skew}deg)`,
          opacity: 0.88,
          borderRadius: '40%',
          filter: 'blur(1.4px) brightness(1.08)',
          clipPath: 'inset(8% 32% 8% 32% round 40%)',
        },
        {
          offset: 0.9,
          transform: `translate(${dx * 0.96}px, ${dy * 0.97}px) scale(0.1, 0.14) skewX(${skew * 0.3}deg)`,
          opacity: 0.45,
          borderRadius: '50%',
          filter: 'blur(2.2px) brightness(1.12)',
          clipPath: 'inset(18% 38% 18% 38% round 50%)',
        },
        {
          offset: 1,
          transform: `translate(${dx}px, ${dy}px) scale(0.04, 0.04) skewX(0deg)`,
          opacity: 0,
          borderRadius: '50%',
          filter: 'blur(3px) brightness(1.15)',
          clipPath: 'inset(40% 40% 40% 40% round 50%)',
        },
      ],
      {
        duration,
        delay,
        easing: 'cubic-bezier(0.4, 0.02, 0.2, 1)',
        fill: 'forwards',
      }
    );
    animations.push(anim);
  });

  const total = duration + Math.max(0, sources.length - 1) * stagger;
  const pulse = opts.target.animate(
    [
      { transform: 'scale(1)', offset: 0 },
      { transform: 'scale(1)', offset: 0.55 },
      { transform: 'scale(1.22)', offset: 0.72 },
      { transform: 'scale(0.92)', offset: 0.86 },
      { transform: 'scale(1.06)', offset: 0.94 },
      { transform: 'scale(1)', offset: 1 },
    ],
    {
      duration: total + 80,
      easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)',
    }
  );
  animations.push(pulse);

  // Brilho no alvo no momento do “pouso”
  const glow = document.createElement('div');
  const gSize = Math.max(targetRect.width, targetRect.height) * 2.4;
  glow.style.cssText = [
    'position:fixed',
    `left:${tx - gSize / 2}px`,
    `top:${ty - gSize / 2}px`,
    `width:${gSize}px`,
    `height:${gSize}px`,
    'border-radius:50%',
    'pointer-events:none',
    'background:radial-gradient(circle, rgba(255,59,48,0.45) 0%, rgba(255,59,48,0.12) 40%, transparent 70%)',
    'opacity:0',
    'z-index:100121',
  ].join(';');
  layer.appendChild(glow);
  const glowAnim = glow.animate(
    [
      { opacity: 0, transform: 'scale(0.4)' },
      { opacity: 0, offset: 0.62 },
      { opacity: 0.9, transform: 'scale(1)', offset: 0.78 },
      { opacity: 0, transform: 'scale(1.35)', offset: 1 },
    ],
    { duration: total + 40, easing: 'ease-out', fill: 'forwards' }
  );
  animations.push(glowAnim);

  await Promise.all(animations.map((a) => a.finished.catch(() => undefined)));
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
