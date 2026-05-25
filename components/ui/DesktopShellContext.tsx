import React, { createContext, useContext } from 'react';
import { useDesktopShell } from '../../hooks/useDesktopShell';

const DesktopShellContext = createContext(false);

export function DesktopShellProvider({ children }: { children: React.ReactNode }) {
  const enabled = useDesktopShell();
  return <DesktopShellContext.Provider value={enabled}>{children}</DesktopShellContext.Provider>;
}

/** Modo PC com shell OnMotor (sidebar + barra superior). */
export function useDesktopShellLayout(): boolean {
  return useContext(DesktopShellContext);
}
