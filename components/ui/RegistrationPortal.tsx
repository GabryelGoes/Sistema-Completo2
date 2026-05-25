import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/** Portal para overlays de cadastro (evita stacking/overflow do pai no mobile). */
export function RegistrationPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
