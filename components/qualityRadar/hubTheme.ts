/** Tokens visuais do hub Radar de Qualidade (Apple/macOS — amarelo, preto, branco, neutros). */

export const hub = {
  page: 'relative flex min-h-full flex-col bg-[#F5F5F7] text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50',
  surface: 'rounded-2xl border border-zinc-200/90 bg-white dark:border-zinc-800 dark:bg-zinc-900',
  surfaceInset: 'rounded-xl border border-zinc-200 bg-[#FAFAFA] dark:border-zinc-800 dark:bg-zinc-950',
  accent: 'bg-[#FFD60A] text-zinc-900',
  accentSoft: 'bg-[#FFD60A]/25 text-zinc-900 dark:bg-[#FFD60A]/20 dark:text-[#FFD60A]',
  accentBar: 'bg-[#FFD60A]',
  ink: 'text-zinc-900 dark:text-zinc-50',
  muted: 'text-zinc-500 dark:text-zinc-400',
  hairline: 'border-zinc-200 dark:border-zinc-800',
  btnPrimary:
    'inline-flex items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100',
  btnSecondary:
    'inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-[13px] font-semibold text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
  btnGhost:
    'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800',
  input:
    'w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] text-zinc-900 outline-none transition placeholder:text-zinc-400 focus:border-zinc-400 focus:ring-2 focus:ring-[#FFD60A]/40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-zinc-500',
  select:
    'rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] text-zinc-900 outline-none focus:border-zinc-400 focus:ring-2 focus:ring-[#FFD60A]/40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white',
  navItem: (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition ${
      active
        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
        : 'text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800'
    }`,
  badge:
    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold tracking-wide',
  preparedBanner:
    'rounded-xl border border-dashed border-zinc-300 bg-[#FAFAFA] px-4 py-3 text-[13px] text-zinc-600 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-400',
} as const;

export type HubSectionId =
  | 'visao_geral'
  | 'funcionarios'
  | 'avaliacoes'
  | 'desempenho'
  | 'planos'
  | 'reunioes'
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
