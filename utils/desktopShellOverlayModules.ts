/** Módulos abertos por atalho da sidebar (fora das abas principais). */

export type DesktopShellSidebarModuleId = 'estoque_pecas' | 'tvs_oficina' | 'configuracoes';

export type DesktopShellOverlayTopbar = {
  title: string;
  accent: string;
  /** Contraste do texto na barra superior. */
  tone: 'light' | 'dark';
};

export const DESKTOP_SHELL_MODULE_TOPBARS: Record<
  DesktopShellSidebarModuleId,
  DesktopShellOverlayTopbar
> = {
  estoque_pecas: {
    title: 'Estoque de peças',
    accent: '#16A34A',
    tone: 'light',
  },
  tvs_oficina: {
    title: 'TVs da oficina',
    accent: '#0EA5E9',
    tone: 'light',
  },
  configuracoes: {
    title: 'Configurações',
    accent: '#6B7280',
    tone: 'light',
  },
};

export function resolveActiveDesktopSidebarAction(
  partsModalOpen: boolean,
  tvPatioModalOpen: boolean,
  settingsModalOpen: boolean,
  settingsHubOpen: boolean
): DesktopShellSidebarModuleId | null {
  if (partsModalOpen) return 'estoque_pecas';
  if (tvPatioModalOpen) return 'tvs_oficina';
  if (settingsModalOpen || settingsHubOpen) return 'configuracoes';
  return null;
}

export function resolveDesktopShellOverlayTopbar(
  partsModalOpen: boolean,
  tvPatioModalOpen: boolean,
  settingsModalOpen: boolean,
  settingsHubOpen: boolean
): DesktopShellOverlayTopbar | null {
  const action = resolveActiveDesktopSidebarAction(
    partsModalOpen,
    tvPatioModalOpen,
    settingsModalOpen,
    settingsHubOpen
  );
  if (!action) return null;
  return DESKTOP_SHELL_MODULE_TOPBARS[action];
}
