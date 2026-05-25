import type { TabId } from '../components/TabBar';

export type DesktopNavItem = {
  id: TabId;
  label: string;
  shortLabel?: string;
  iconSrc?: string;
  /** Item só na barra superior (atalho rápido). */
  topBar?: boolean;
  /** Item só na sidebar. */
  sidebar?: boolean;
};

/** Navegação do modo PC (estilo OnMotor). */
export const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  { id: 'home', label: 'Resumo', shortLabel: 'Resumo', sidebar: true },
  { id: 'reception', label: 'Recepção', shortLabel: 'Recepção', iconSrc: '/icons/recepcao-ios.png', topBar: true, sidebar: false },
  { id: 'agenda', label: 'Agenda', shortLabel: 'Agenda', iconSrc: '/icons/agenda-ios.png', topBar: true, sidebar: true },
  { id: 'patio', label: 'Pátio', shortLabel: 'Pátio', iconSrc: '/icons/patio-ios.png', topBar: true, sidebar: true },
  { id: 'laboratorio', label: 'Laboratório', shortLabel: 'Lab.', iconSrc: '/icons/laboratorio-ios.png', topBar: true, sidebar: true },
  { id: 'orcamentos', label: 'Orçamentos', shortLabel: 'Orçamentos', iconSrc: '/icons/orcamentos-ios.png', topBar: true, sidebar: true },
  { id: 'relatorios', label: 'Relatórios', shortLabel: 'Relatórios', iconSrc: '/icons/relatorios-ios.svg', sidebar: true },
  { id: 'boletim_erros', label: 'Boletim de erros', shortLabel: 'Boletim', iconSrc: '/icons/boletim-erros-ios.png', sidebar: true },
  { id: 'radar_qualidade', label: 'Radar de qualidade', shortLabel: 'Radar', iconSrc: '/icons/radar-qualidade-ios.png', sidebar: true },
];

export function filterDesktopNav(items: DesktopNavItem[], allowedTabs: TabId[] | undefined): DesktopNavItem[] {
  if (!allowedTabs?.length) return items;
  const set = new Set(allowedTabs);
  return items.filter((item) => set.has(item.id));
}

export function desktopNavLabel(tab: TabId, items: DesktopNavItem[]): string {
  return items.find((i) => i.id === tab)?.label ?? tab;
}
