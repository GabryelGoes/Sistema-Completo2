import { useContext, useEffect } from 'react';
import { BackNavigationContext } from './BackNavigationContext';
import type { TabId } from '../TabBar';

const POINTER_FINE = '(pointer: fine)';

function isDesktopShellActive(): boolean {
  try {
    return document.documentElement.dataset.desktopShell === 'true';
  } catch {
    return false;
  }
}

/**
 * Em modo PC (shell desktop ou ponteiro fino), Escape equivale ao gesto “voltar” da pilha
 * e, sem camadas, ao botão “Voltar” fora da Home.
 *
 * - Capture: fecha a camada do topo (modais) e impede listeners que engolem Escape sem fechar.
 * - Bubble: se ninguém tratou e não há camada, volta à Home.
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
    const desktopOk = () => mq.matches || isDesktopShellActive();

    const onKeyCapture = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!e.isTrusted) return;
      if (e.repeat) return;
      if (!desktopOk()) return;

      const closedLayer = ctx?.tryCloseTopLayer?.() ?? false;
      if (closedLayer) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    };

    const onKeyBubble = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (!e.isTrusted) return;
      if (e.repeat) return;
      if (!desktopOk()) return;
      if (e.defaultPrevented) return;
      if (activeAppTab !== 'home') {
        e.preventDefault();
        onCloseOverlayPage();
      }
    };

    window.addEventListener('keydown', onKeyCapture, true);
    window.addEventListener('keydown', onKeyBubble, false);
    return () => {
      window.removeEventListener('keydown', onKeyCapture, true);
      window.removeEventListener('keydown', onKeyBubble, false);
    };
  }, [ctx, activeAppTab, onCloseOverlayPage]);

  return null;
}
