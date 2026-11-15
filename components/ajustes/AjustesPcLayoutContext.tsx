import React, { createContext, useContext } from 'react';

/**
 * Indica que o hub de Ajustes está no layout desktop/PC (A1).
 * Isola chrome visual sem afetar tablet/mobile nem outros módulos.
 */
const AjustesPcLayoutContext = createContext(false);

export function AjustesPcLayoutProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return (
    <AjustesPcLayoutContext.Provider value={value}>{children}</AjustesPcLayoutContext.Provider>
  );
}

export function useAjustesPcLayout(): boolean {
  return useContext(AjustesPcLayoutContext);
}

/** Marcadores A1 — estilos em `styles/ajustes-desktop.css`. */
export const AJUSTES_PC_SHELL_CLASS = 'ajustes-hub ajustes-hub--desktop ajustes-pc-shell-v1';

/** Filhos A2 (perfis, usuários, senhas) — só chrome visual desktop. */
export const AJUSTES_PC_CHILD_CLASS = 'ajustes-pc-child ajustes-pc-people-v2';

/** Filhos A3 (modais operacionais do hub) — só chrome visual desktop. */
export const AJUSTES_PC_OPS_CLASS = 'ajustes-pc-child ajustes-pc-ops-v3';

export function ajustesPcShellClass(pcLayout: boolean, extra = ''): string {
  if (!pcLayout) return extra;
  return extra ? `${AJUSTES_PC_SHELL_CLASS} ${extra}` : AJUSTES_PC_SHELL_CLASS;
}

export function ajustesPcChildClass(pcLayout: boolean, extra = ''): string {
  if (!pcLayout) return extra;
  return extra ? `${AJUSTES_PC_CHILD_CLASS} ${extra}` : AJUSTES_PC_CHILD_CLASS;
}

export function ajustesPcOpsClass(pcLayout: boolean, extra = ''): string {
  if (!pcLayout) return extra;
  return extra ? `${AJUSTES_PC_OPS_CLASS} ${extra}` : AJUSTES_PC_OPS_CLASS;
}
