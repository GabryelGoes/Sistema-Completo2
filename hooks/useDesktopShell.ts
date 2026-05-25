import { useEffect, useMemo } from 'react';
import { useDeviceType } from './useDeviceType';

/** Largura mínima para o shell estilo OnMotor (sidebar + top bar). */
export const DESKTOP_SHELL_MIN_WIDTH = 1024;

/**
 * Modo PC com layout OnMotor: sidebar, barra preta, fundo cinza, cards com borda amarela.
 * Ativo em viewport ≥1024px e não-smartphone (mesmo critério do modal de veículo).
 */
export function useDesktopShell(): boolean {
  const { isSmartphone, viewportWidth } = useDeviceType();
  const enabled = useMemo(
    () => !isSmartphone && viewportWidth >= DESKTOP_SHELL_MIN_WIDTH,
    [isSmartphone, viewportWidth]
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (enabled) {
      root.dataset.desktopShell = 'true';
    } else {
      delete root.dataset.desktopShell;
    }
    return () => {
      delete root.dataset.desktopShell;
    };
  }, [enabled]);

  return enabled;
}
