/**
 * Tokens visuais do módulo Painéis de TV (admin).
 * Hierarquia, espaçamento e movimento alinhados à skill Apple Design.
 * Não altera o layout densamente tipografado do preview/board da TV.
 */

const press =
  'transition-[transform,background-color,opacity,box-shadow,color] duration-150 ease-out active:scale-[0.98]';

export type TvHubTokens = ReturnType<typeof tvHub>;

export function tvHub(isDesktopShell: boolean) {
  return {
    /** Entrada do shell / painéis (CSS em tv-panels-hub.css). */
    shellMotion: 'tv-hub-shell-in',
    panelMotion: 'tv-hub-panel-in',
    chrome: 'tv-hub-chrome',

    stack: isDesktopShell ? 'space-y-3' : 'space-y-5',
    stackTight: isDesktopShell ? 'space-y-2' : 'space-y-3',
    sectionPad: isDesktopShell ? 'p-3.5' : 'p-5 sm:p-6',

    eyebrow: isDesktopShell
      ? 'text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400'
      : 'text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400',
    accentEyebrow: 'text-[11px] font-semibold uppercase tracking-[0.06em] text-[#007AFF]',
    title:
      'text-[22px] font-semibold leading-tight tracking-[-0.02em] text-zinc-900 dark:text-zinc-100 sm:text-[26px]',
    meta: 'text-[13px] font-normal leading-snug text-zinc-500 dark:text-zinc-400',
    caption: isDesktopShell
      ? 'text-[10px] font-normal leading-snug text-zinc-500 dark:text-zinc-400'
      : 'text-[11px] font-normal leading-snug text-zinc-500 dark:text-zinc-400',

    card: isDesktopShell
      ? 'rounded-xl border border-zinc-200/70 bg-white/90 shadow-none dark:border-white/[0.1] dark:bg-zinc-900/90'
      : 'rounded-[22px] border-0 bg-white/75 backdrop-blur-2xl shadow-none dark:bg-zinc-900/80',

    label: isDesktopShell
      ? 'mb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400'
      : 'mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400',

    mediaLabel:
      'mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-zinc-500 dark:text-zinc-400',

    input: isDesktopShell
      ? 'w-full rounded-lg border border-zinc-200/90 bg-white px-2.5 py-1.5 text-[12px] leading-snug text-zinc-900 outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-zinc-400 focus:border-[#007AFF]/45 focus:ring-2 focus:ring-[#007AFF]/30 dark:border-white/[0.12] dark:bg-zinc-950/60 dark:text-zinc-100 dark:placeholder:text-zinc-500'
      : 'w-full rounded-2xl border border-zinc-200/90 bg-white/90 px-4 py-3 text-[15px] leading-snug text-zinc-900 outline-none transition-[box-shadow,border-color] duration-150 placeholder:text-zinc-400 focus:border-[#007AFF]/50 focus:ring-2 focus:ring-[#007AFF]/35 dark:border-white/[0.12] dark:bg-zinc-950/50 dark:text-zinc-100 dark:placeholder:text-zinc-500',

    segmentTrack:
      'flex gap-1 rounded-2xl bg-zinc-200/70 p-1 dark:bg-zinc-800/80',
    segmentItem: (active: boolean, tone: 'default' | 'lab' = 'default') => {
      if (active && tone === 'lab') {
        return `flex-1 rounded-xl py-2.5 text-[12px] font-semibold ${press} bg-white text-violet-900 shadow-sm ring-1 ring-violet-200 dark:bg-zinc-900 dark:text-violet-200 dark:ring-violet-500/40`;
      }
      if (active) {
        return `flex-1 rounded-xl py-2.5 text-[12px] font-semibold ${press} bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100`;
      }
      if (tone === 'lab') {
        return `flex-1 rounded-xl py-2.5 text-[12px] font-semibold ${press} text-zinc-600 hover:text-violet-900 dark:text-zinc-400 dark:hover:text-violet-200`;
      }
      return `flex-1 rounded-xl py-2.5 text-[12px] font-semibold ${press} text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200`;
    },
    previewSegmentItem: (active: boolean) =>
      `flex flex-1 items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-semibold sm:text-[11px] ${press} ${
        active
          ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
          : 'text-zinc-500 dark:text-zinc-400'
      }`,

    choiceChip: (active: boolean) =>
      `rounded-2xl px-2 py-3 text-center ${press} ${
        active
          ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/30'
          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80 dark:bg-zinc-800/90 dark:text-zinc-300 dark:hover:bg-white/[0.1]'
      }`,
    choiceChipCompact: (active: boolean) =>
      `rounded-2xl px-2 py-2.5 text-center ${press} ${
        active
          ? 'bg-[#007AFF] text-white shadow-md shadow-blue-500/30'
          : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200/80 dark:bg-zinc-800/90 dark:text-zinc-300 dark:hover:bg-white/[0.1]'
      }`,
    softChip: (active: boolean) =>
      `rounded-xl px-3 py-2 text-[12px] font-semibold shadow-sm ${press} ${
        active
          ? 'bg-[#007AFF] text-white shadow-blue-500/25'
          : 'border border-zinc-200/90 bg-white text-zinc-700 hover:border-[#007AFF]/35 dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-300'
      }`,
    weekdayChip: (active: boolean) =>
      `rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${press} ${
        active ? 'bg-[#007AFF] text-white shadow-sm' : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
      }`,
    layoutCard: (active: boolean) =>
      `rounded-2xl border px-3 py-3 text-left ${press} ${
        active
          ? 'border-[#007AFF] bg-blue-50 shadow-sm dark:bg-blue-950/30'
          : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 dark:border-white/[0.1] dark:bg-zinc-900/60'
      }`,

    btnPrimary: `inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-6 py-3 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/20 ${press} hover:opacity-95 disabled:opacity-45`,
    btnPrimaryBlock: `mt-5 w-full rounded-2xl bg-[#007AFF] py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/20 ${press} hover:opacity-95 disabled:opacity-45 sm:mt-5 sm:w-auto sm:px-10`,
    btnPrimaryCompact: `inline-flex min-h-11 min-w-[140px] flex-1 items-center justify-center gap-2 rounded-2xl bg-[#007AFF] px-5 py-3 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/20 ${press} hover:opacity-95 disabled:opacity-50`,
    btnSecondary: `inline-flex min-h-11 items-center justify-center rounded-2xl border border-zinc-300/90 px-5 py-3 text-[14px] font-semibold text-zinc-700 ${press} dark:border-zinc-600 dark:text-zinc-300`,
    btnGhostIcon: `inline-flex h-10 w-10 items-center justify-center rounded-full bg-black/5 text-zinc-600 ${press} hover:bg-black/10 dark:bg-white/10 dark:text-zinc-400 dark:hover:bg-white/15`,
    btnLink: `mt-4 text-[14px] font-semibold text-[#007AFF] ${press} hover:opacity-80 disabled:opacity-50`,
    btnTextLink: `mt-2 text-[11px] font-semibold text-[#007AFF] ${press} hover:underline`,
    btnSoft: `inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white px-3 py-2 text-[12px] font-semibold text-zinc-800 shadow-sm ${press} hover:border-[#007AFF]/40 dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-200`,
    btnSoftMuted: `rounded-xl border border-zinc-200/90 bg-zinc-100 px-3 py-2 text-[12px] font-semibold text-zinc-700 ${press} hover:bg-zinc-200/80 dark:border-white/[0.12] dark:bg-zinc-800/90 dark:text-zinc-300 dark:hover:bg-white/[0.1]`,
    btnDashed: `flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300/90 bg-zinc-50/80 py-8 text-[15px] font-medium text-zinc-600 ${press} hover:border-[#007AFF]/50 hover:bg-blue-50/50 disabled:opacity-50 dark:bg-zinc-900/60 dark:text-zinc-400`,
    btnDashedCompact: `flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300/90 bg-zinc-50/80 py-6 text-[14px] font-medium text-zinc-600 ${press} hover:border-[#007AFF]/50 disabled:opacity-50 dark:bg-zinc-900/60 dark:text-zinc-400`,
    btnDashedAdd: `mt-3 inline-flex items-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/80 px-4 py-3 text-[13px] font-semibold text-zinc-700 ${press} hover:border-[#007AFF]/45 hover:bg-blue-50/40 dark:bg-zinc-900/60 dark:text-zinc-300`,
    btnToolbar: `rounded-xl bg-zinc-200 p-2 text-zinc-700 ${press} disabled:opacity-35 dark:bg-zinc-700/80 dark:text-zinc-300`,
    btnToolbarLabel: `rounded-xl bg-zinc-200 px-3 py-2 text-[11px] font-semibold text-zinc-800 ${press} disabled:opacity-50 dark:bg-zinc-700/80 dark:text-zinc-200`,
    btnToolbarAccent: (active: boolean) =>
      `rounded-xl px-3 py-2 text-[11px] font-semibold ${press} ${
        active ? 'bg-[#007AFF] text-white' : 'bg-zinc-200 text-zinc-800 dark:bg-zinc-700/80 dark:text-zinc-200'
      }`,
    btnDangerIcon: `rounded-xl p-2 text-red-600 ${press} hover:bg-red-500/10`,
    btnNeutralDark: `flex flex-1 items-center justify-center gap-2 rounded-2xl bg-zinc-900 px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg ${press} disabled:opacity-50`,
    chipPress: press,

    shellBg:
      'bg-gradient-to-b from-zinc-100/90 via-white/95 to-zinc-50/90 dark:from-zinc-950 dark:via-zinc-950 dark:to-zinc-900',
  } as const;
}
