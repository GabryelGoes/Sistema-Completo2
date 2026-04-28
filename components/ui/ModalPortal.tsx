import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useContext, useEffect } from 'react';
import { ModalLayerContext } from './ModalLayerContext';

/**
 * Renderiza filhos em `document.body` para não ficarem presos ao empilhamento do `main` (`z-10`).
 * Sem portal, `z-[100]` dentro do conteúdo perde para a TabBar irmã (`z-40` fora do `main`).
 * A TabBar usa `z-40`; modais em portal devem usar pelo menos `z-[100]`.
 * Ao montar, registra na camada global para ocultar a barra inferior de navegação.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  const ctx = useContext(ModalLayerContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.register();
    return () => ctx.unregister();
  }, [ctx]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.history.pushState({ rdaModalLayer: true }, '');
    const onPopState = () => {
      const w = window as Window & { __rdaModalBackHandledAt?: number };
      const now = Date.now();
      // Evita múltiplos fechamentos quando vários listeners de modal disparam juntos.
      if (w.__rdaModalBackHandledAt && now - w.__rdaModalBackHandledAt < 80) return;
      w.__rdaModalBackHandledAt = now;
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
