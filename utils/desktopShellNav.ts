import type { TabId } from '../components/TabBar';
import type { SystemUserPermissions } from '../services/apiService';

export type DesktopNavItem = {
  id: TabId;
  label: string;
  shortLabel?: string;
  iconSrc?: string;
  /** Ocultar da sidebar (ex.: módulo só via Home). Padrão: visível. */
  sidebar?: boolean;
};

export type DesktopSidebarActionId = 'centro_atendimento' | 'estoque_pecas' | 'configuracoes';

export type DesktopSidebarActionItem = {
  id: DesktopSidebarActionId;
  label: string;
  shortLabel?: string;
  iconSrc: string;
};

/** Navegação do modo PC (estilo OnMotor) — módulos com aba dedicada. */
export const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  { id: 'home', label: 'Resumo', shortLabel: 'Resumo' },
  { id: 'reception', label: 'Recepção', shortLabel: 'Recepção', iconSrc: '/icons/recepcao-ios.png' },
  { id: 'agenda', label: 'Agenda', shortLabel: 'Agenda', iconSrc: '/icons/agenda-ios.png' },
  { id: 'patio', label: 'Pátio', shortLabel: 'Pátio', iconSrc: '/icons/patio-ios.png' },
  { id: 'laboratorio', label: 'Laboratório', shortLabel: 'Lab.', iconSrc: '/icons/laboratorio-ios.png' },
  { id: 'orcamentos', label: 'Orçamentos', shortLabel: 'Orçamentos', iconSrc: '/icons/orcamentos-ios.png' },
  { id: 'relatorios', label: 'Relatórios', shortLabel: 'Relatórios', iconSrc: '/icons/relatorios-ios.svg' },
  { id: 'boletim_erros', label: 'Boletim de erros', shortLabel: 'Boletim', iconSrc: '/icons/boletim-erros-ios.png' },
  { id: 'radar_qualidade', label: 'Radar de qualidade', shortLabel: 'Radar', iconSrc: '/icons/radar-qualidade-ios.png' },
];

/** Atalhos da sidebar que abrem modais / hubs (sem aba própria). */
export const DESKTOP_SIDEBAR_ACTIONS: DesktopSidebarActionItem[] = [
  {
    id: 'centro_atendimento',
    label: 'Central do atendimento',
    shortLabel: 'Central',
    iconSrc: '/icons/recepcao-ios.png',
  },
  {
    id: 'estoque_pecas',
    label: 'Estoque de peças',
    shortLabel: 'Estoque',
    iconSrc: '/icons/estoque-ios.png',
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    shortLabel: 'Config.',
    iconSrc: '/icons/configuracoes-ios.png',
  },
];

export type DesktopSidebarAccess = {
  centroAtendimento: boolean;
  estoquePecas: boolean;
  configuracoes: boolean;
};

export function resolveDesktopSidebarAccess(
  role: 'admin' | 'user' | undefined,
  perms: SystemUserPermissions | undefined
): DesktopSidebarAccess {
  if (role === 'admin') {
    return { centroAtendimento: true, estoquePecas: true, configuracoes: true };
  }
  if (role !== 'user' || !perms) {
    return { centroAtendimento: false, estoquePecas: false, configuracoes: false };
  }
  if (perms.full_access) {
    return { centroAtendimento: true, estoquePecas: true, configuracoes: true };
  }
  return {
    centroAtendimento: !!perms.access_centro_atendimento,
    estoquePecas: !!perms.access_estoque_pecas,
    configuracoes: !!(
      perms.access_settings ||
      perms.access_change_passwords ||
      perms.access_technicians
    ),
  };
}

export function filterDesktopNav(items: DesktopNavItem[], allowedTabs: TabId[] | undefined): DesktopNavItem[] {
  if (!allowedTabs?.length) return items;
  const set = new Set(allowedTabs);
  return items.filter((item) => set.has(item.id));
}

export function filterDesktopSidebarActions(access: DesktopSidebarAccess): DesktopSidebarActionItem[] {
  return DESKTOP_SIDEBAR_ACTIONS.filter((item) => {
    if (item.id === 'centro_atendimento') return access.centroAtendimento;
    if (item.id === 'estoque_pecas') return access.estoquePecas;
    if (item.id === 'configuracoes') return access.configuracoes;
    return false;
  });
}

export function desktopNavLabel(tab: TabId, items: DesktopNavItem[]): string {
  return items.find((i) => i.id === tab)?.label ?? tab;
}
