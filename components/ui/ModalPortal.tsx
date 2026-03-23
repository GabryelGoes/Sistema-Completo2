import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Renderiza filhos em `document.body` para não ficarem presos no empilhamento do `main`.
 * A TabBar usa `z-40`; modais devem usar pelo menos `z-[100]` (ver comentário em TabBar).
 */
export function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
