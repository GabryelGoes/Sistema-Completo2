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

export type DesktopSidebarActionId = 'estoque_pecas' | 'tvs_oficina' | 'configuracoes';

export type DesktopSidebarActionItem = {
  id: DesktopSidebarActionId;
  label: string;
  shortLabel?: string;
  iconSrc: string;
};

/** Entrada unificada da sidebar PC (abas + atalhos). */
export type DesktopSidebarEntry =
  | { kind: 'tab'; id: TabId }
  | { kind: 'action'; id: DesktopSidebarActionId };

/**
 * Ordem dos ícones da barra lateral no modo PC:
 * Início → Agenda → Pátio → Laboratório → Inventário → Orçamentos → Painéis → Boletins → Relatórios → Radar → Configurações
 */
export const DESKTOP_SIDEBAR_ORDER: DesktopSidebarEntry[] = [
  { kind: 'tab', id: 'home' },
  { kind: 'tab', id: 'agenda' },
  { kind: 'tab', id: 'patio' },
  { kind: 'tab', id: 'laboratorio' },
  { kind: 'action', id: 'estoque_pecas' },
  { kind: 'tab', id: 'orcamentos' },
  { kind: 'action', id: 'tvs_oficina' },
  { kind: 'tab', id: 'boletim_erros' },
  { kind: 'tab', id: 'relatorios' },
  { kind: 'tab', id: 'radar_qualidade' },
  { kind: 'action', id: 'configuracoes' },
];

/** Navegação do modo PC (estilo OnMotor) — módulos com aba dedicada. */
export const DESKTOP_NAV_ITEMS: DesktopNavItem[] = [
  { id: 'home', label: 'Início', shortLabel: 'Início' },
  {
    id: 'reception',
    label: 'Recepção',
    shortLabel: 'Recepção',
    iconSrc: '/icons/recepcao-ios.png',
    sidebar: false,
  },
  { id: 'agenda', label: 'Agenda', shortLabel: 'Agenda', iconSrc: '/icons/agenda-ios.png' },
  { id: 'patio', label: 'Pátio', shortLabel: 'Pátio', iconSrc: '/icons/patio-ios.png' },
  { id: 'laboratorio', label: 'Laboratório', shortLabel: 'Lab.', iconSrc: '/icons/laboratorio-ios.png' },
  { id: 'orcamentos', label: 'Orçamentos', shortLabel: 'Orçamentos', iconSrc: '/icons/orcamentos-ios.png' },
  { id: 'boletim_erros', label: 'Boletins Técnicos', shortLabel: 'Boletins', iconSrc: '/icons/boletins-tecnicos-ios.png' },
  { id: 'relatorios', label: 'Relatórios', shortLabel: 'Relatórios', iconSrc: '/icons/relatorios-ios.svg' },
  { id: 'radar_qualidade', label: 'Radar de qualidade', shortLabel: 'Radar', iconSrc: '/icons/radar-qualidade-ios.png' },
];

/** Atalhos da sidebar que abrem modais / hubs (sem aba própria). */
export const DESKTOP_SIDEBAR_ACTIONS: DesktopSidebarActionItem[] = [
  {
    id: 'estoque_pecas',
    label: 'Inventário de Peças',
    shortLabel: 'Inventário',
    iconSrc: '/icons/estoque-ios.png',
  },
  {
    id: 'tvs_oficina',
    label: 'Painéis de TV',
    shortLabel: 'Painéis',
    iconSrc: '/icons/tv-patio-ios.png',
  },
  {
    id: 'configuracoes',
    label: 'Configurações',
    shortLabel: 'Config.',
    iconSrc: '/icons/configuracoes-ios.png',
  },
];

export type DesktopSidebarAccess = {
  estoquePecas: boolean;
  tvsOficina: boolean;
  configuracoes: boolean;
};

export function resolveDesktopSidebarAccess(
  role: 'admin' | 'user' | undefined,
  perms: SystemUserPermissions | undefined
): DesktopSidebarAccess {
  if (role === 'admin') {
    return { estoquePecas: true, tvsOficina: true, configuracoes: true };
  }
  if (role !== 'user' || !perms) {
    return { estoquePecas: false, tvsOficina: false, configuracoes: false };
  }
  if (perms.full_access) {
    return { estoquePecas: true, tvsOficina: true, configuracoes: true };
  }
  return {
    estoquePecas: !!perms.access_estoque_pecas,
    tvsOficina: !!perms.access_tv_patio,
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
    if (item.id === 'estoque_pecas') return access.estoquePecas;
    if (item.id === 'tvs_oficina') return access.tvsOficina;
    if (item.id === 'configuracoes') return access.configuracoes;
    return false;
  });
}

/**
 * Monta a lista final da sidebar na ordem fixa do modo PC,
 * respeitando permissões de abas e atalhos.
 */
export function buildDesktopSidebarEntries(
  allowedTabs: TabId[] | undefined,
  access: DesktopSidebarAccess | undefined
): Array<
  | { kind: 'tab'; item: DesktopNavItem }
  | { kind: 'action'; item: DesktopSidebarActionItem }
> {
  const navById = new Map(
    filterDesktopNav(DESKTOP_NAV_ITEMS, allowedTabs)
      .filter((i) => i.sidebar !== false)
      .map((i) => [i.id, i])
  );
  const actionsById = new Map(
    (access ? filterDesktopSidebarActions(access) : []).map((i) => [i.id, i])
  );

  const out: Array<
    | { kind: 'tab'; item: DesktopNavItem }
    | { kind: 'action'; item: DesktopSidebarActionItem }
  > = [];

  for (const entry of DESKTOP_SIDEBAR_ORDER) {
    if (entry.kind === 'tab') {
      const item = navById.get(entry.id);
      if (item) out.push({ kind: 'tab', item });
      continue;
    }
    const item = actionsById.get(entry.id);
    if (item) out.push({ kind: 'action', item });
  }

  return out;
}

export function desktopNavLabel(tab: TabId, items: DesktopNavItem[]): string {
  return items.find((i) => i.id === tab)?.label ?? tab;
}
