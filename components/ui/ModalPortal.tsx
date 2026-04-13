import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Renderiza filhos em `document.body` para não ficarem presos ao empilhamento do `main` (`z-10`).
 * Sem portal, `z-[100]` dentro do conteúdo perde para a TabBar irmã (`z-40` fora do `main`).
 * A TabBar usa `z-40`; modais em portal devem usar pelo menos `z-[100]`.
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
