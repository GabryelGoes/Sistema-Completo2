/**
 * Metadados do hub de Ajustes — categorias e itens.
 * A visibilidade é resolvida em runtime (permissões / perfil); as chaves de
 * permissão persistidas não mudam aqui.
 */

export type AjustesCategoryId =
  | 'conta'
  | 'seguranca'
  | 'oficina'
  | 'patio'
  | 'laboratorio'
  | 'orcamentos'
  | 'notificacoes'
  | 'aparencia'
  | 'dispositivos';

export type AjustesItemId =
  | 'perfil'
  | 'usuarios'
  | 'sair'
  | 'senhas'
  | 'servicos_oficina'
  | 'checklists_patio'
  | 'painel_tv'
  | 'lab_tipos'
  | 'lab_rapidos'
  | 'orcamentos_prefs'
  | 'notificacoes_sistema'
  | 'tema'
  | 'dispositivo'
  | 'etiquetas';

export type AjustesItemKind = 'action' | 'external';

export type AjustesCategoryMeta = {
  id: AjustesCategoryId;
  label: string;
  hint: string;
};

export type AjustesItemMeta = {
  id: AjustesItemId;
  categoryId: AjustesCategoryId;
  title: string;
  subtitle: string;
  kind: AjustesItemKind;
  /** Ícone PNG em /icons, se houver. */
  iconSrc?: string;
  /** Lucide fallback quando não há iconSrc (resolvido no UI). */
  iconFallback?: 'user' | 'users' | 'logout' | 'key' | 'wrench' | 'package' | 'monitor' | 'tag' | 'external';
  externalHref?: string;
  danger?: boolean;
};

export const AJUSTES_CATEGORIES: AjustesCategoryMeta[] = [
  {
    id: 'conta',
    label: 'Conta e usuários',
    hint: 'Perfil, acessos e sessão',
  },
  {
    id: 'seguranca',
    label: 'Segurança',
    hint: 'Senhas operacionais da oficina',
  },
  {
    id: 'oficina',
    label: 'Oficina',
    hint: 'Catálogo e valores de serviços',
  },
  {
    id: 'patio',
    label: 'Pátio',
    hint: 'Checklists e painéis de TV',
  },
  {
    id: 'laboratorio',
    label: 'Laboratório',
    hint: 'Tipos de peça e serviços rápidos',
  },
  {
    id: 'orcamentos',
    label: 'Orçamentos',
    hint: 'Preferências do hub de orçamentos',
  },
  {
    id: 'notificacoes',
    label: 'Notificações',
    hint: 'Central, banners e avisos',
  },
  {
    id: 'aparencia',
    label: 'Aparência e privacidade',
    hint: 'Tema e proteção de placas',
  },
  {
    id: 'dispositivos',
    label: 'Dispositivos e impressão',
    hint: 'Layout do aparelho e etiquetas',
  },
];

export const AJUSTES_ITEMS: AjustesItemMeta[] = [
  {
    id: 'perfil',
    categoryId: 'conta',
    title: 'Perfil',
    subtitle: 'Nome, foto e preferências pessoais',
    kind: 'action',
    iconSrc: '/icons/perfil-ios.png',
    iconFallback: 'user',
  },
  {
    id: 'usuarios',
    categoryId: 'conta',
    title: 'Usuários do sistema',
    subtitle: 'Acessos e permissões',
    kind: 'action',
    iconSrc: '/icons/usuarios-ios.png',
    iconFallback: 'users',
  },
  {
    id: 'sair',
    categoryId: 'conta',
    title: 'Sair',
    subtitle: 'Encerrar sessão neste dispositivo',
    kind: 'action',
    iconFallback: 'logout',
    danger: true,
  },
  {
    id: 'senhas',
    categoryId: 'seguranca',
    title: 'Senhas operacionais',
    subtitle: 'Gerência/Pátio, exclusão de veículos e estoque',
    kind: 'action',
    iconSrc: '/icons/senhas-ios.png',
    iconFallback: 'key',
  },
  {
    id: 'servicos_oficina',
    categoryId: 'oficina',
    title: 'Serviços da oficina',
    subtitle: 'Catálogo e valores',
    kind: 'action',
    iconSrc: '/icons/servicos-oficina-ios.png',
    iconFallback: 'wrench',
  },
  {
    id: 'checklists_patio',
    categoryId: 'patio',
    title: 'Checklists do Pátio',
    subtitle: 'Modelos por etapa',
    kind: 'action',
    iconSrc: '/icons/checklist-patio-ios.png',
  },
  {
    id: 'painel_tv',
    categoryId: 'patio',
    title: 'Painel do Pátio (TV)',
    subtitle: 'Abrir em nova aba',
    kind: 'external',
    iconSrc: '/icons/painel-patio-tv-ios.png',
    iconFallback: 'external',
    externalHref: 'https://patio-view.vercel.app/',
  },
  {
    id: 'lab_tipos',
    categoryId: 'laboratorio',
    title: 'Tipos de peça do laboratório',
    subtitle: 'Nomes e fotos dos tipos de peça',
    kind: 'action',
    iconFallback: 'package',
  },
  {
    id: 'lab_rapidos',
    categoryId: 'laboratorio',
    title: 'Serviços rápidos do laboratório',
    subtitle: 'Botões da avaliação técnica (módulos ABS)',
    kind: 'action',
    iconFallback: 'wrench',
  },
  {
    id: 'orcamentos_prefs',
    categoryId: 'orcamentos',
    title: 'Ajustes de orçamentos',
    subtitle: 'Embaçar orçamentos sem verificação',
    kind: 'action',
    iconSrc: '/icons/orcamentos-ios.png',
  },
  {
    id: 'notificacoes_sistema',
    categoryId: 'notificacoes',
    title: 'Notificações do sistema',
    subtitle: 'Central, banners de orçamento e comentários',
    kind: 'action',
    iconSrc: '/icons/notificacoes-sistema-ios.png',
  },
  {
    id: 'tema',
    categoryId: 'aparencia',
    title: 'Tema do sistema',
    subtitle: 'Aparência escura e proteção de placas',
    kind: 'action',
    iconSrc: '/icons/tema-sistema-ios.png',
  },
  {
    id: 'dispositivo',
    categoryId: 'dispositivos',
    title: 'Dispositivo detectado',
    subtitle: 'Tipo de tela e layout automático ou manual',
    kind: 'action',
    iconFallback: 'monitor',
  },
  {
    id: 'etiquetas',
    categoryId: 'dispositivos',
    title: 'Editor de etiquetas',
    subtitle: 'Laboratório, estoque e chave',
    kind: 'action',
    iconFallback: 'tag',
  },
];

export function ajustesItemsForCategory(categoryId: AjustesCategoryId): AjustesItemMeta[] {
  return AJUSTES_ITEMS.filter((item) => item.categoryId === categoryId);
}
