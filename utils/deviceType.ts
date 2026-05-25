/** Classificação do dispositivo em que o app está rodando (PWA / navegador). */

export type DeviceType = 'desktop' | 'tablet' | 'smartphone';

export const DEVICE_TYPE_LABELS: Record<DeviceType, string> = {
  desktop: 'PC',
  tablet: 'Tablet',
  smartphone: 'Smartphone',
};

/** Largura mínima (px) para tratar como tablet no fallback por viewport. */
export const TABLET_MIN_WIDTH = 768;
/** Largura mínima (px) para tratar como PC no fallback por viewport. */
export const DESKTOP_MIN_WIDTH = 1024;

function ua(): string {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgent || '';
}

/** iPhone, Android phone, etc. */
export function isPhoneUserAgent(): boolean {
  const u = ua();
  return /iPhone|iPod|Windows Phone|webOS|BlackBerry|Opera Mini|IEMobile/i.test(u)
    || (/Android/i.test(u) && /Mobile/i.test(u));
}

/** iPad, iPadOS (MacIntel + touch), Android tablet (sem "Mobile"). */
export function isTabletUserAgent(): boolean {
  if (typeof navigator === 'undefined') return false;
  const u = ua();
  if (/iPad/i.test(u)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  if (/Android/i.test(u) && !/Mobile/i.test(u)) return true;
  return false;
}

function classifyByViewportWidth(width: number): DeviceType {
  if (width >= DESKTOP_MIN_WIDTH) return 'desktop';
  if (width >= TABLET_MIN_WIDTH) return 'tablet';
  return 'smartphone';
}

/**
 * Detecta PC, tablet ou smartphone.
 * UA de telefone/tablet tem prioridade; senão usa a largura da janela.
 */
export function detectDeviceType(viewportWidth?: number): DeviceType {
  if (typeof window === 'undefined') return 'desktop';
  if (isPhoneUserAgent()) return 'smartphone';
  if (isTabletUserAgent()) return 'tablet';
  const w = viewportWidth ?? window.innerWidth;
  return classifyByViewportWidth(w);
}

export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

export function deviceTypeFlags(type: DeviceType) {
  return {
    deviceType: type,
    isDesktop: type === 'desktop',
    isTablet: type === 'tablet',
    isSmartphone: type === 'smartphone',
    label: DEVICE_TYPE_LABELS[type],
  };
}

/** Layout/modos exclusivos de PC (shell OnMotor, modal de veículo em tela cheia, etc.). */
export function isDesktopPcLayout(type: DeviceType, viewportWidth: number, minWidth = DESKTOP_MIN_WIDTH): boolean {
  return type === 'desktop' && viewportWidth >= minWidth;
}
