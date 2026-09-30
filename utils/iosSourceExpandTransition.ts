/**
 * Transição estilo iOS: superfície cresce a partir de um botão (FLIP)
 * e recolhe de volta nele — só `transform` / `opacity` / `border-radius`.
 */

export const IOS_SOURCE_EXPAND_MS = 450;
export const IOS_SOURCE_EXPAND_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export type SourceExpandRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Raio CSS do botão (ex.: "12px" ou "0.5rem"). */
  borderRadius: string;
};

export function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function measureSourceExpandRect(el: HTMLElement): SourceExpandRect | null {
  const rect = el.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width < 2 || rect.height < 2) return null;
  const cs = window.getComputedStyle(el);
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    borderRadius: cs.borderRadius || '12px',
  };
}

/**
 * Mede um elemento dentro de um painel com `hidden` (display:none),
 * forçando layout invisível só durante a medição.
 */
export function measureSourceExpandRectInHiddenPanel(
  panel: HTMLElement,
  el: HTMLElement
): SourceExpandRect | null {
  const wasHidden = panel.hasAttribute('hidden');
  const prev = {
    visibility: panel.style.visibility,
    pointerEvents: panel.style.pointerEvents,
    position: panel.style.position,
    inset: panel.style.inset,
    zIndex: panel.style.zIndex,
    opacity: panel.style.opacity,
  };
  try {
    if (wasHidden) panel.removeAttribute('hidden');
    panel.style.visibility = 'hidden';
    panel.style.pointerEvents = 'none';
    panel.style.position = 'fixed';
    panel.style.inset = '0';
    panel.style.zIndex = '-1';
    panel.style.opacity = '0';
    // Força reflow
    void panel.offsetWidth;
    return measureSourceExpandRect(el);
  } finally {
    panel.style.visibility = prev.visibility;
    panel.style.pointerEvents = prev.pointerEvents;
    panel.style.position = prev.position;
    panel.style.inset = prev.inset;
    panel.style.zIndex = prev.zIndex;
    panel.style.opacity = prev.opacity;
    if (wasHidden) panel.setAttribute('hidden', '');
  }
}

/** Invert FLIP: origem (botão) → caixa final do painel (top-left origin). */
export function computeSourceExpandInvert(
  from: SourceExpandRect,
  to: DOMRectReadOnly
): { transform: string; borderRadius: string } {
  const sx = from.width / Math.max(to.width, 1);
  const sy = from.height / Math.max(to.height, 1);
  const dx = from.left - to.left;
  const dy = from.top - to.top;
  // Compensa o scale no border-radius para o raio visual ≈ o do botão no 1º frame
  const avgScale = Math.max(0.001, (sx + sy) / 2);
  const rawRadius = parseFloat(from.borderRadius) || 12;
  const unit = /rem$/i.test(from.borderRadius) ? 'rem' : 'px';
  const compensated =
    unit === 'rem'
      ? `${(rawRadius / avgScale).toFixed(4)}rem`
      : `${(rawRadius / avgScale).toFixed(2)}px`;
  return {
    transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
    borderRadius: compensated,
  };
}
