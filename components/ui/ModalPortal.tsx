import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useCallback, useContext, useEffect, useRef } from 'react';
import { useBrowserBackLayer } from './BackNavigationContext';
import { ModalLayerContext } from './ModalLayerContext';
import { useOptionalModalPortalHost } from './ModalPortalHostContext';

/**
 * Renderiza filhos em `document.body` (ou no host do {@link ModalPortalHostContext}
 * quando houver um — ex.: mini-tela do Ver OS) para não ficarem presos ao `main`.
 * Gesto “voltar” / Escape: via {@link useBrowserBackLayer}.
 * Prefira `onRequestClose`. Sem ele, tenta o botão Fechar e, por fim, Escape sintético.
 */
export function ModalPortal({
  children,
  manageBackLayer = true,
  onRequestClose,
  /** Força montar no body mesmo com host ativo (ex.: a própria solicitação de orçamento). */
  forceBody = false,
}: {
  children: ReactNode;
  /** false quando o pai já registra useBrowserBackLayer (evita pilha duplicada). */
  manageBackLayer?: boolean;
  /** Fecha o modal no gesto voltar / ESC (recomendado). */
  onRequestClose?: () => void;
  forceBody?: boolean;
}) {
  const ctx = useContext(ModalLayerContext);
  const portalHost = useOptionalModalPortalHost();
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
  const mountNode =
    !forceBody && portalHost?.host ? portalHost.host : document.body;
  const nestedInHost = mountNode !== document.body;
  return createPortal(
    <div
      ref={rootRef}
      data-modal-portal=""
      data-modal-portal-nested={nestedInHost ? 'true' : undefined}
      className={nestedInHost ? 'absolute inset-0 z-[60] pointer-events-none [&>*]:pointer-events-auto' : 'contents'}
    >
      {children}
    </div>,
    mountNode
  );
}
