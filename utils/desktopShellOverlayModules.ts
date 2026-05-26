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

export function resolveDesktopShellOverlayTopbar(
  vehicleAccompanimentOpen: boolean,
  partsModalOpen: boolean,
  settingsModalOpen: boolean,
  settingsHubOpen: boolean
): DesktopShellOverlayTopbar | null {
  if (vehicleAccompanimentOpen) return DESKTOP_SHELL_MODULE_TOPBARS.centro_atendimento;
  if (partsModalOpen) return DESKTOP_SHELL_MODULE_TOPBARS.estoque_pecas;
  if (settingsModalOpen || settingsHubOpen) return DESKTOP_SHELL_MODULE_TOPBARS.configuracoes;
  return null;
}
