import React, { createContext, useContext } from 'react';

/**
 * Indica que a OS de veículo do Pátio está no layout desktop/PC.
 * Usado pelos modais secundários (portais) para aplicar chrome visual
 * isolado sem afetar tablet/mobile nem outras páginas.
 */
const PatioOsPcLayoutContext = createContext(false);

export function PatioOsPcLayoutProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return (
    <PatioOsPcLayoutContext.Provider value={value}>{children}</PatioOsPcLayoutContext.Provider>
  );
}

export function usePatioOsPcLayout(): boolean {
  return useContext(PatioOsPcLayoutContext);
}

/** Classes marcadoras da Fase 7 — estilos em `patio-vehicle-modal-desktop.css`. */
export const PATIO_OS_SEC_MODAL_PC_CLASS = 'patio-os-sec-modal--pc patio-os-sec-v7';

export function patioOsSecModalPcClass(pcLayout: boolean, extra = ''): string {
  if (!pcLayout) return extra;
  return extra ? `${PATIO_OS_SEC_MODAL_PC_CLASS} ${extra}` : PATIO_OS_SEC_MODAL_PC_CLASS;
}
