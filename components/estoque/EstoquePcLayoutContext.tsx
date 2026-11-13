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

/** Nested cadastro/ficha (E2) — portais filhos do hub Estoque. */
export const ESTOQUE_PC_NESTED_CLASS = 'estoque-pc-nested estoque-pc-form-v2';

/** Fluxos scan / entrada / saída (E3). */
export const ESTOQUE_PC_FLOW_CLASS = 'estoque-pc-flow estoque-pc-flow-v3';

export function estoquePcShellClass(pcLayout: boolean, extra = ''): string {
  if (!pcLayout) return extra;
  return extra ? `${ESTOQUE_PC_SHELL_CLASS} ${extra}` : ESTOQUE_PC_SHELL_CLASS;
}

export function estoquePcNestedClass(pcLayout: boolean, extra = ''): string {
  if (!pcLayout) return extra;
  return extra ? `${ESTOQUE_PC_NESTED_CLASS} ${extra}` : ESTOQUE_PC_NESTED_CLASS;
}

export function estoquePcFlowClass(pcLayout: boolean, kind: 'scan' | 'inbound' | 'outbound', extra = ''): string {
  if (!pcLayout) return extra;
  const kindClass = `estoque-pc-${kind}`;
  const joined = `${ESTOQUE_PC_FLOW_CLASS} ${kindClass}`;
  return extra ? `${joined} ${extra}` : joined;
}
