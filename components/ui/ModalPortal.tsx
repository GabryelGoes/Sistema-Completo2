import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { useBrowserBackLayer } from './BackNavigationContext';
import { ModalLayerContext } from './ModalLayerContext';

/**
 * Renderiza filhos em `document.body` para não ficarem presos ao empilhamento do `main` (`z-10`).
 * Gesto “voltar” / Escape: via {@link useBrowserBackLayer}.
 * Prefira `onRequestClose`. Sem ele, tenta o botão Fechar e, por fim, Escape sintético.
 */
export function ModalPortal({
  children,
  manageBackLayer = true,
  onRequestClose,
}: {
  children: ReactNode;
  /** false quando o pai já registra useBrowserBackLayer (evita pilha duplicada). */
  manageBackLayer?: boolean;
  /** Fecha o modal no gesto voltar / ESC (recomendado). */
  onRequestClose?: () => void;
}) {
  const ctx = useContext(ModalLayerContext);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;

  const onBack = useCallback(() => {
    if (onRequestCloseRef.current) {
      onRequestCloseRef.current();
      return;
    }
    const root = rootRef.current;
    const closeBtn = root?.querySelector<HTMLElement>(
      'button[aria-label="Fechar"], button[aria-label="Close"], button[aria-label="fechar"]'
    );
    if (closeBtn) {
      closeBtn.click();
      return;
    }
    // Fallback legado (isTrusted=false — o bridge de ESC ignora).
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }, []);

  useEffect(() => {
    if (!ctx) return;
    ctx.register();
    return () => ctx.unregister();
  }, [ctx]);

  useBrowserBackLayer(manageBackLayer, onBack);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div ref={rootRef} data-modal-portal="" className="contents">
      {children}
    </div>,
    document.body
  );
}
