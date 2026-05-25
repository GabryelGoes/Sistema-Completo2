import React, { createContext, useContext } from 'react';
import { useDeviceType, type DeviceTypeState } from '../../hooks/useDeviceType';

const DeviceTypeContext = createContext<DeviceTypeState | null>(null);

export function DeviceTypeProvider({ children }: { children: React.ReactNode }) {
  const value = useDeviceType();
  return <DeviceTypeContext.Provider value={value}>{children}</DeviceTypeContext.Provider>;
}

/** Tipo de dispositivo (PC / tablet / smartphone). Requer `DeviceTypeProvider` na árvore. */
export function useDeviceTypeContext(): DeviceTypeState {
  const ctx = useContext(DeviceTypeContext);
  if (!ctx) {
    throw new Error('useDeviceTypeContext deve ser usado dentro de DeviceTypeProvider');
  }
  return ctx;
}

/** Igual ao contexto, mas funciona fora do provider (cria estado local). */
export function useDeviceTypeOptional(): DeviceTypeState {
  const ctx = useContext(DeviceTypeContext);
  return ctx ?? useDeviceType();
}
