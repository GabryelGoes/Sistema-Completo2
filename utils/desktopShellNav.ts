import type { TabId } from '../components/TabBar';

export type DesktopNavItem = {
  id: TabId;
  label: string;
  shortLabel?: string;
  iconSrc?: string;
  /** Ocultar da sidebar (ex.: módulo só via Home). Padrão: visível. */
  sidebar?: boolean;
};

/** Navegação do modo PC (estilo OnMotor) — todos os módulos principais na sidebar. */
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

export function filterDesktopNav(items: DesktopNavItem[], allowedTabs: TabId[] | undefined): DesktopNavItem[] {
  if (!allowedTabs?.length) return items;
  const set = new Set(allowedTabs);
  return items.filter((item) => set.has(item.id));
}

export function desktopNavLabel(tab: TabId, items: DesktopNavItem[]): string {
  return items.find((i) => i.id === tab)?.label ?? tab;
}
