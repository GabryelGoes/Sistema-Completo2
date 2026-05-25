import { useOrientation } from '../components/views/useOrientation';
import { useDeviceTypeOptional } from '../components/ui/DeviceTypeContext';

/**
 * Layout em tela cheia no retrato — smartphone ou tablet em pé (não PC).
 * @deprecated Prefira `useDeviceTypeContext()` com `isSmartphone` / `isTablet` + orientação.
 */
export function useTabletPhonePortraitFullscreen(): boolean {
  const { isDesktop } = useDeviceTypeOptional();
  const orientation = useOrientation();
  if (isDesktop) return false;
  return orientation === 'portrait';
}
