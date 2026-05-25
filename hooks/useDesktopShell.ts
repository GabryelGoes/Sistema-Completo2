import { useEffect, useMemo } from 'react';
import { isDesktopPcLayout } from '../utils/deviceType';
import { useDeviceType } from './useDeviceType';

/** Largura mínima para o shell estilo OnMotor (sidebar + top bar). */
export const DESKTOP_SHELL_MIN_WIDTH = 1024;

/**
 * Modo PC com layout OnMotor: sidebar, top bar, fundo cinza, cards com borda amarela.
 * Apenas em dispositivo classificado como PC (não tablet em paisagem nem smartphone).
 */
export function useDesktopShell(): boolean {
  const { deviceType, viewportWidth } = useDeviceType();
  const enabled = useMemo(
    () => isDesktopPcLayout(deviceType, viewportWidth, DESKTOP_SHELL_MIN_WIDTH),
    [deviceType, viewportWidth]
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
