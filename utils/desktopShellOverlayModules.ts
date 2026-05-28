/** Módulos abertos por atalho da sidebar (fora das abas principais). */

export type DesktopShellSidebarModuleId = 'centro_atendimento' | 'estoque_pecas' | 'configuracoes';

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
  centro_atendimento: {
    title: 'Central de atendimento',
    accent: '#2563EB',
    tone: 'light',
  },
  estoque_pecas: {
    title: 'Estoque de peças',
    accent: '#16A34A',
    tone: 'light',
  },
  configuracoes: {
    title: 'Configurações',
    accent: '#6B7280',
    tone: 'light',
  },
};

export function resolveActiveDesktopSidebarAction(
  vehicleAccompanimentOpen: boolean,
  partsModalOpen: boolean,
  settingsModalOpen: boolean,
  settingsHubOpen: boolean
): DesktopShellSidebarModuleId | null {
  if (vehicleAccompanimentOpen) return 'centro_atendimento';
  if (partsModalOpen) return 'estoque_pecas';
  if (settingsModalOpen || settingsHubOpen) return 'configuracoes';
  return null;
}

export function resolveDesktopShellOverlayTopbar(
  vehicleAccompanimentOpen: boolean,
  partsModalOpen: boolean,
  settingsModalOpen: boolean,
  settingsHubOpen: boolean
): DesktopShellOverlayTopbar | null {
  const action = resolveActiveDesktopSidebarAction(
    vehicleAccompanimentOpen,
    partsModalOpen,
    settingsModalOpen,
    settingsHubOpen
  );
  if (!action) return null;
  return DESKTOP_SHELL_MODULE_TOPBARS[action];
}
