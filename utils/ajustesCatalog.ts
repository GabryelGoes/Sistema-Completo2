/**
 * Metadados do hub de Ajustes — categorias e itens.
 * A visibilidade é resolvida em runtime (permissões / perfil); as chaves de
 * permissão persistidas não mudam aqui.
 *
 * A1: categorias reorganizadas por finalidade (desktop). Itens e ids estáveis.
 */

export type AjustesCategoryId =
  | 'conta'
  | 'seguranca'
  | 'operacao'
  | 'notificacoes'
  | 'aparencia'
  | 'dispositivos'
  | 'inteligencia';

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
  | 'dispositivos_conectados'
  | 'etiquetas'
  | 'memoria_rda'
  | 'inteligencia_operacional'
  | 'gestao_patio_rda'
  | 'lab_estoque_rda'
  | 'monitoramento_proativo_rda'
  | 'produtividade_rda';

export type AjustesItemKind = 'action' | 'external';

export type AjustesCategoryMeta = {
  id: AjustesCategoryId;
  label: string;
  hint: string;
  /** Ícone PNG em /icons. */
  iconSrc: string;
};

export type AjustesItemMeta = {
  id: AjustesItemId;
  categoryId: AjustesCategoryId;
  title: string;
  subtitle: string;
  kind: AjustesItemKind;
  /**
   * Subseção dentro da categoria (ex.: Operação por módulo).
   * Só afeta agrupamento visual; não muda ids nem permissões.
   */
  section?: string;
  /** Ícone PNG em /icons, se houver. */
  iconSrc?: string;
  /** Lucide fallback quando não há iconSrc (resolvido no UI). */
  iconFallback?:
    | 'user'
    | 'users'
    | 'logout'
    | 'key'
    | 'wrench'
    | 'package'
    | 'monitor'
    | 'devices'
    | 'tag'
    | 'external';
  externalHref?: string;
  danger?: boolean;
};

export const AJUSTES_CATEGORIES: AjustesCategoryMeta[] = [
  {
    id: 'conta',
    label: 'Conta e equipe',
    hint: 'Perfil, usuários e sessão',
    iconSrc: '/icons/usuarios-ios.png',
  },
  {
    id: 'seguranca',
    label: 'Segurança e sessão',
    hint: 'Senhas, PIN e dispositivos conectados',
    iconSrc: '/icons/senhas-ios.png',
  },
  {
    id: 'operacao',
    label: 'Operação por módulo',
    hint: 'Oficina, Pátio, Lab e Orçamentos',
    iconSrc: '/icons/servicos-oficina-ios.png',
  },
  {
    id: 'notificacoes',
    label: 'Notificações',
    hint: 'Central, banners e agenda',
    iconSrc: '/icons/notificacoes-sistema-ios.png',
  },
  {
    id: 'aparencia',
    label: 'Aparência',
    hint: 'Tema e proteção de placas',
    iconSrc: '/icons/tema-sistema-ios.png',
  },
  {
    id: 'dispositivos',
    label: 'Dispositivos e impressão',
    hint: 'Layout e etiquetas',
    iconSrc: '/icons/configuracoes-ios.png',
  },
  {
    id: 'inteligencia',
    label: 'RDA Intelligence',
    hint: 'Memória e insights operacionais',
    iconSrc: '/icons/configuracoes-ios.png',
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
    subtitle: 'Acessos e permissões por módulo',
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
    subtitle: 'Gerência, PIN do Pátio, exclusão e estoque',
    kind: 'action',
    iconSrc: '/icons/senhas-ios.png',
    iconFallback: 'key',
  },
  {
    id: 'dispositivos_conectados',
    categoryId: 'seguranca',
    title: 'Dispositivos conectados',
    subtitle: 'Online, último acesso, deslogar ou bloquear',
    kind: 'action',
    iconFallback: 'devices',
  },
  {
    id: 'servicos_oficina',
    categoryId: 'operacao',
    section: 'Oficina',
    title: 'Serviços da oficina',
    subtitle: 'Catálogo e valores',
    kind: 'action',
    iconSrc: '/icons/servicos-oficina-ios.png',
    iconFallback: 'wrench',
  },
  {
    id: 'checklists_patio',
    categoryId: 'operacao',
    section: 'Pátio',
    title: 'Checklists do Pátio',
    subtitle: 'Modelos por etapa',
    kind: 'action',
    iconSrc: '/icons/checklist-patio-ios.png',
  },
  {
    id: 'painel_tv',
    categoryId: 'operacao',
    section: 'Pátio',
    title: 'Painel do Pátio (TV)',
    subtitle: 'Abrir painel externo em nova aba (link)',
    kind: 'external',
    iconSrc: '/icons/painel-patio-tv-ios.png',
    iconFallback: 'external',
    externalHref: 'https://patio-view.vercel.app/',
  },
  {
    id: 'lab_tipos',
    categoryId: 'operacao',
    section: 'Laboratório',
    title: 'Tipos de peça do laboratório',
    subtitle: 'Nomes e fotos dos tipos de peça',
    kind: 'action',
    iconFallback: 'package',
  },
  {
    id: 'lab_rapidos',
    categoryId: 'operacao',
    section: 'Laboratório',
    title: 'Serviços rápidos do laboratório',
    subtitle: 'Botões da avaliação técnica (módulos ABS)',
    kind: 'action',
    iconFallback: 'wrench',
  },
  {
    id: 'orcamentos_prefs',
    categoryId: 'operacao',
    section: 'Orçamentos',
    title: 'Preferências de orçamentos',
    subtitle: 'Embaçar sem verificação e nível da melhoria de texto',
    kind: 'action',
    iconSrc: '/icons/orcamentos-ios.png',
  },
  {
    id: 'notificacoes_sistema',
    categoryId: 'notificacoes',
    title: 'Notificações do sistema',
    subtitle: 'Central, banners, agenda e comentários',
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
    section: 'Layout',
    title: 'Dispositivo detectado',
    subtitle: 'Tipo de tela e layout automático ou manual',
    kind: 'action',
    iconFallback: 'monitor',
  },
  {
    id: 'etiquetas',
    categoryId: 'dispositivos',
    section: 'Impressão',
    title: 'Editor de etiquetas',
    subtitle: 'Laboratório, estoque e chave',
    kind: 'action',
    iconFallback: 'tag',
  },
  {
    id: 'memoria_rda',
    categoryId: 'inteligencia',
    title: 'Memória do RDA',
    subtitle: 'Regras, procedimentos e orientações aprovadas',
    kind: 'action',
    iconFallback: 'wrench',
  },
  {
    id: 'inteligencia_operacional',
    categoryId: 'inteligencia',
    title: 'Inteligência Operacional',
    subtitle: 'Tempos, padrões históricos e recomendações',
    kind: 'action',
    iconFallback: 'wrench',
  },
  {
    id: 'gestao_patio_rda',
    categoryId: 'inteligencia',
    title: 'Gestão Inteligente do Pátio',
    subtitle: 'Gargalos, prioridades e riscos de entrega',
    kind: 'action',
    iconFallback: 'wrench',
  },
  {
    id: 'lab_estoque_rda',
    categoryId: 'inteligencia',
    title: 'Inteligência do Laboratório e Estoque',
    subtitle: 'Bancada, gargalos do lab e disponibilidade ABS',
    kind: 'action',
    iconFallback: 'wrench',
  },
  {
    id: 'monitoramento_proativo_rda',
    categoryId: 'inteligencia',
    title: 'Monitoramento Proativo',
    subtitle: 'Alertas, recomendações e situações críticas',
    kind: 'action',
    iconFallback: 'wrench',
  },
  {
    id: 'produtividade_rda',
    categoryId: 'inteligencia',
    title: 'Assistente de Produtividade',
    subtitle: 'Tarefas, prazos, delegação e pendências',
    kind: 'action',
    iconFallback: 'wrench',
  },
];

export function ajustesItemsForCategory(categoryId: AjustesCategoryId): AjustesItemMeta[] {
  return AJUSTES_ITEMS.filter((item) => item.categoryId === categoryId);
}

/** Agrupa itens pela seção visual (ordem de primeira aparição). */
export function groupAjustesItemsBySection(
  items: AjustesItemMeta[]
): { section: string | null; items: AjustesItemMeta[] }[] {
  const groups: { section: string | null; items: AjustesItemMeta[] }[] = [];
  const indexBySection = new Map<string | null, number>();
  for (const item of items) {
    const section = item.section ?? null;
    const existing = indexBySection.get(section);
    if (existing === undefined) {
      indexBySection.set(section, groups.length);
      groups.push({ section, items: [item] });
    } else {
      groups[existing].items.push(item);
    }
  }
  return groups;
}
