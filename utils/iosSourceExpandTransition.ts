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

export function measureSourceExpandRect(el: HTMLElement | null | undefined): SourceExpandRect | null {
  if (!el || typeof el.getBoundingClientRect !== 'function') return null;
  // Botão desconectado do DOM (ex.: remount) — inválido
  if (!el.isConnected) return null;
  const rect = el.getBoundingClientRect();
  if (!Number.isFinite(rect.width) || rect.width < 2 || rect.height < 2) return null;
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) return null;
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
 * Mede o botão «Criar OS» depois que o painel do Pátio/Lab já está visível.
 * Prefere o elemento clicado; se falhar, tenta `[data-criar-os-source]` no painel.
 */
export function measureCreateOsSourceAfterUnderlayVisible(
  panelTabId: string,
  preferredEl: HTMLElement | null
): SourceExpandRect | null {
  const fromPreferred = measureSourceExpandRect(preferredEl);
  if (fromPreferred) return fromPreferred;

  const panel = document.querySelector(`[data-keepalive-tab="${panelTabId}"]`) as HTMLElement | null;
  if (!panel) return null;
  const fallback = panel.querySelector('[data-criar-os-source="1"]') as HTMLElement | null;
  return measureSourceExpandRect(fallback);
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
  const rawRadius = parseFloat(String(from.borderRadius)) || 12;
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
