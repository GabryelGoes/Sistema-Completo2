import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useContext, useEffect } from 'react';
import { ModalLayerContext } from './ModalLayerContext';

/**
 * Renderiza filhos em `document.body` (z-index acima da TabBar).
 * Registra a camada de UI para ocultar a barra inferior.
 *
 * Histórico / gesto voltar: NÃO fica aqui — use `useBrowserBackLayer` no pai do modal
 * (ou no próprio modal). Assim o X não dispara `history.back()` duplicado (lento no iPhone).
 */
export function ModalPortal({
  children,
  /** @deprecated Ignorado — histórico fica no useBrowserBackLayer. Mantido por compatibilidade. */
  manageBackLayer: _manageBackLayer = true,
}: {
  children: ReactNode;
  manageBackLayer?: boolean;
}) {
  const ctx = useContext(ModalLayerContext);

  useEffect(() => {
    if (!ctx) return;
    ctx.register();
    return () => ctx.unregister();
  }, [ctx]);

  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
