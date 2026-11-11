/**
 * Tokens visuais do hub Radar de Qualidade.
 * Hierarquia, espaçamento e movimento alinhados à skill Apple Design
 * e ao amarelo de marca da oficina (--app-accent / brand-yellow).
 */

/** Amarelo oficial da oficina (não usar #FFD60A solto). */
export const HUB_ACCENT_HEX = '#f5d00b';

const press =
  'transition-[transform,background-color,opacity,box-shadow,color] duration-150 ease-out active:scale-[0.98]';

export const hub = {
  page: 'relative flex min-h-full flex-col bg-[#F5F5F7] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50',

  /** Cartão de conteúdo (material leve). */
  surface:
    'rounded-2xl border border-zinc-200/90 bg-white shadow-none dark:border-zinc-800 dark:bg-zinc-900',

  /** Inset / agrupamento interno. */
  surfaceInset:
    'rounded-xl border border-zinc-200/90 bg-[#F5F5F7] dark:border-zinc-800 dark:bg-zinc-950',

  /** Chrome flutuante (header sticky) — classes em quality-radar-hub.css. */
  chrome: 'qr-hub-chrome rounded-2xl',

  /** Sidebar / nav estrutural (material um pouco mais pesado). */
  aside: 'qr-hub-aside rounded-2xl',

  /** Entrada de painel (mola CSS; reduced-motion = fade). */
  panelMotion: 'qr-hub-panel-in',

  /** Ritmo vertical entre blocos da seção. */
  stack: 'space-y-5',
  stackTight: 'space-y-3',
  cardPad: 'p-5',
  cardPadCompact: 'p-4',

  /** Tipografia: tracking por tamanho (labels +; títulos −). */
  eyebrow:
    'text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400',
  sectionLabel:
    'text-[12px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400',
  title:
    'text-[18px] font-semibold leading-tight tracking-[-0.02em] text-zinc-900 dark:text-white',
  display:
    'text-[22px] font-semibold leading-tight tracking-[-0.02em] text-zinc-900 dark:text-white md:text-[1.65rem]',
  body: 'text-[14px] font-normal leading-relaxed text-zinc-900 dark:text-zinc-100',
  meta: 'text-[13px] font-normal leading-snug text-zinc-500 dark:text-zinc-400',
  caption: 'text-[12px] font-normal leading-snug text-zinc-500 dark:text-zinc-400',

  accent: 'bg-brand-yellow text-zinc-950',
  accentSoft:
    'bg-brand-yellow/25 text-zinc-950 dark:bg-brand-yellow/20 dark:text-brand-yellow',
  accentBar: 'bg-brand-yellow',
  accentRing: 'ring-2 ring-brand-yellow/80',
  accentText: 'text-brand-yellow',

  ink: 'text-zinc-900 dark:text-zinc-50',
  muted: 'text-zinc-500 dark:text-zinc-400',
  hairline: 'border-zinc-200 dark:border-zinc-800',

  btnPrimary: `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-[13px] font-semibold text-white ${press} hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100`,
  btnAccent: `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-brand-yellow px-4 py-2.5 text-[13px] font-semibold text-zinc-950 ${press} hover:brightness-105 disabled:opacity-50`,
  btnSecondary: `inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-zinc-900 ${press} hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800`,
  btnGhost: `inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold text-zinc-700 ${press} hover:bg-zinc-100/90 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800`,
  btnCompact: `inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white ${press} hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900`,

  input:
    'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] leading-snug text-zinc-900 outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-brand-yellow/40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-500',
  select:
    'rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] leading-snug text-zinc-900 outline-none transition-[box-shadow,border-color] duration-150 focus:border-zinc-400 focus:ring-2 focus:ring-brand-yellow/40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white',

  segmentTrack:
    'flex flex-wrap gap-1 rounded-xl border border-zinc-200/90 bg-[#F5F5F7] p-1 dark:border-zinc-800 dark:bg-zinc-950',
  segmentItem: (active: boolean) =>
    `rounded-lg px-3 py-1.5 text-[12px] font-semibold ${press} ${
      active
        ? 'bg-brand-yellow text-zinc-950 shadow-none'
        : 'text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-900'
    }`,

  navItem: (active: boolean) =>
    `flex w-full min-h-11 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold ${press} ${
      active
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
        : 'text-zinc-700 hover:bg-white/80 dark:text-zinc-300 dark:hover:bg-zinc-800/80'
    }`,

  listRow: (active: boolean) =>
    `flex w-full items-center justify-between rounded-xl px-3 py-3 text-left ${press} ${
      active
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
        : 'hover:bg-zinc-100/90 dark:hover:bg-zinc-800/80'
    }`,

  badge:
    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold tracking-[0.04em]',
  preparedBanner:
    'rounded-xl border border-dashed border-zinc-300 bg-[#F5F5F7] px-4 py-3 text-[13px] leading-snug text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400',
} as const;

export type HubSectionId =
  | 'visao_geral'
  | 'funcionarios'
  | 'avaliacoes'
  | 'desempenho'
  | 'planos'
  | 'reunioes'
  | 'revisao_semanal'
  | 'relatorios'
  | 'ocorrencias';

export const HUB_SECTIONS: {
  id: HubSectionId;
  label: string;
  shortLabel: string;
  description: string;
}[] = [
  {
    id: 'visao_geral',
    label: 'Visão Geral',
    shortLabel: 'Geral',
    description: 'Indicadores e pendências da equipe',
  },
  {
    id: 'funcionarios',
    label: 'Funcionários',
    shortLabel: 'Equipe',
    description: 'Cadastro e perfis individuais',
  },
  {
    id: 'avaliacoes',
    label: 'Avaliações',
    shortLabel: 'Avaliações',
    description: 'Central de avaliações gerenciais',
  },
  {
    id: 'desempenho',
    label: 'Desempenho',
    shortLabel: 'Desempenho',
    description: 'Produtividade e qualidade',
  },
  {
    id: 'planos',
    label: 'Planos de Carreira',
    shortLabel: 'Planos',
    description: 'Competências, metas e evolução',
  },
  {
    id: 'reunioes',
    label: 'Reuniões e Feedbacks',
    shortLabel: 'Reuniões',
    description: 'Pautas, feedbacks e compromissos',
  },
  {
    id: 'revisao_semanal',
    label: 'Revisão Semanal com RDA',
    shortLabel: 'RDA',
    description: 'Entrevista gerencial e memória profissional',
  },
  {
    id: 'relatorios',
    label: 'Relatórios',
    shortLabel: 'Relatórios',
    description: 'Consolidados e preparo para diretoria',
  },
  {
    id: 'ocorrencias',
    label: 'Ocorrências',
    shortLabel: 'Ocorrências',
    description: 'Histórico operacional (Radar legado)',
  },
];
