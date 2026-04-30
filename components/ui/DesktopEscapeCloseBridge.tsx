import { useContext, useEffect } from 'react';
import { BackNavigationContext } from './BackNavigationContext';
import type { TabId } from '../TabBar';

const POINTER_FINE = '(pointer: fine)';

/**
 * Em ambientes com ponteiro fino (desktop), Escape equivale ao gesto “voltar” da pilha
 * e, sem camadas, ao botão “Fechar página” (X) fora da Home.
 * Deve ser o último filho da árvore autenticada para não sobrepor listeners mais específicos.
 */
export function DesktopEscapeCloseBridge({
  activeAppTab,
  onCloseOverlayPage,
}: {
  activeAppTab: TabId;
  onCloseOverlayPage: () => void;
}) {
  const ctx = useContext(BackNavigationContext);

  useEffect(() => {
    const mq = window.matchMedia(POINTER_FINE);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!mq.matches) return;
      if (e.repeat) return;

      const closedLayer = ctx?.tryCloseTopLayer?.() ?? false;
      if (closedLayer) {
        e.preventDefault();
        return;
      }
      if (activeAppTab !== 'home') {
        e.preventDefault();
        onCloseOverlayPage();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctx, activeAppTab, onCloseOverlayPage]);

  return null;
}
