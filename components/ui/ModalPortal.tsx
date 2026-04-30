import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useCallback, useContext, useEffect } from 'react';
import { useBrowserBackLayer } from './BackNavigationContext';
import { ModalLayerContext } from './ModalLayerContext';

const escapeAsBack = () => {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};

/**
 * Renderiza filhos em `document.body` para não ficarem presos ao empilhamento do `main` (`z-10`).
 * Sem portal, `z-[100]` dentro do conteúdo perde para a TabBar irmã (`z-40` fora do `main`).
 * A TabBar usa `z-40`; modais em portal devem usar pelo menos `z-[100]`.
 * Ao montar, registra na camada global para ocultar a barra inferior de navegação.
 * Gesto “voltar” do sistema: via {@link useBrowserBackLayer} (pilha central no app).
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const ctx = useContext(ModalLayerContext);
  const onBack = useCallback(() => {
    escapeAsBack();
  }, []);

  useEffect(() => {
    if (!ctx) return;
    ctx.register();
    return () => ctx.unregister();
  }, [ctx]);

  useBrowserBackLayer(true, onBack);

  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
