import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  detectDeviceType,
  deviceTypeFlags,
  getDeviceTypeOverride,
  isCoarsePointer,
  resolveDeviceType,
  saveDeviceTypeOverride,
  type DeviceType,
  type DeviceTypeOverride,
} from '../utils/deviceType';

export type DeviceTypeState = ReturnType<typeof deviceTypeFlags> & {
  isTouch: boolean;
  viewportWidth: number;
  /** Resultado só da heurística (ignora preferência manual). */
  detectedDeviceType: DeviceType;
  /** Preferência salva: `auto` | smartphone | tablet | desktop. */
  deviceTypeOverride: DeviceTypeOverride;
  setDeviceTypeOverride: (value: DeviceTypeOverride) => void;
  refresh: () => void;
};

type CoreState = ReturnType<typeof deviceTypeFlags> & {
  isTouch: boolean;
  viewportWidth: number;
  detectedDeviceType: DeviceType;
  deviceTypeOverride: DeviceTypeOverride;
};

function computeCore(): CoreState {
  const width = typeof window !== 'undefined' ? window.innerWidth : 0;
  const override = getDeviceTypeOverride();
  const detected = detectDeviceType(width);
  const type = resolveDeviceType(width);
  return {
    ...deviceTypeFlags(type),
    isTouch: isCoarsePointer(),
    viewportWidth: width,
    detectedDeviceType: detected,
    deviceTypeOverride: override,
  };
}

function syncDocumentDataset(type: DeviceType, isTouch: boolean) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.device = type;
  root.dataset.deviceTouch = isTouch ? 'true' : 'false';
}

export function useDeviceType(): DeviceTypeState {
  const [core, setCore] = useState<CoreState>(() => {
    const c = computeCore();
    syncDocumentDataset(c.deviceType, c.isTouch);
    return c;
  });

  const refresh = useCallback(() => {
    const next = computeCore();
    syncDocumentDataset(next.deviceType, next.isTouch);
    setCore(next);
  }, []);

  const setDeviceTypeOverride = useCallback((value: DeviceTypeOverride) => {
    saveDeviceTypeOverride(value);
    const next = computeCore();
    syncDocumentDataset(next.deviceType, next.isTouch);
    setCore(next);
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener('resize', refresh);
    window.addEventListener('orientationchange', refresh);
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia('(pointer: coarse)');
      const onMq = () => refresh();
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', onMq);
      } else {
        mq.addListener(onMq);
      }
      return () => {
        window.removeEventListener('resize', refresh);
        window.removeEventListener('orientationchange', refresh);
        if (mq) {
          if (typeof mq.removeEventListener === 'function') {
            mq.removeEventListener('change', onMq);
          } else {
            mq.removeListener(onMq);
          }
        }
      };
    } catch {
      return () => {
        window.removeEventListener('resize', refresh);
        window.removeEventListener('orientationchange', refresh);
      };
    }
  }, [refresh]);

  return useMemo(
    () => ({ ...core, setDeviceTypeOverride, refresh }),
    [core, setDeviceTypeOverride, refresh]
  );
}
