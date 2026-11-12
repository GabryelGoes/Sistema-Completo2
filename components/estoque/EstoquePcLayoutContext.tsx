import React, { createContext, useContext } from 'react';

/**
 * Indica que o hub Estoque está no layout desktop/PC.
 * Isola chrome visual (E0/E1) sem afetar tablet/mobile nem outros módulos.
 */
const EstoquePcLayoutContext = createContext(false);

export function EstoquePcLayoutProvider({
  value,
  children,
}: {
  value: boolean;
  children: React.ReactNode;
}) {
  return (
    <EstoquePcLayoutContext.Provider value={value}>{children}</EstoquePcLayoutContext.Provider>
  );
}

export function useEstoquePcLayout(): boolean {
  return useContext(EstoquePcLayoutContext);
}

/** Marcadores E0/E1 — estilos em `styles/estoque-desktop.css`. */
export const ESTOQUE_PC_SHELL_CLASS = 'estoque-modal estoque-modal--desktop estoque-pc-shell-v1';

export function estoquePcShellClass(pcLayout: boolean, extra = ''): string {
  if (!pcLayout) return extra;
  return extra ? `${ESTOQUE_PC_SHELL_CLASS} ${extra}` : ESTOQUE_PC_SHELL_CLASS;
}
