import {
  iosModalClose,
  iosVehicleModalInsetCard,
  iosVehicleModalInput,
  iosVehicleModalShell,
} from '../components/ui/iosModalStyles';

export type PatioVehicleModalCompact = {
  grid: string;
  row: string;
  splitRow: string;
  iconSquircle: string;
  iconGlyph: string;
  titleText: string;
  bodyText: string;
  assignHint: string;
  chevron: string;
  numericInput: string;
  dateInput: string;
  saveBtn: string;
  saveIcon: string;
  salvo: string;
  mechanicWrap: string;
  mechanicWrench: string;
  emptyTech: string;
  fieldRow: string;
};

export type PatioVehicleModalLayout = {
  rootClass: string;
  overlay: string;
  shell: string;
  insetCard: string;
  input: string;
  headerPad: string;
  headerInner: string;
  title: string;
  brandSubtitle: string;
  mainGrid: string;
  closeBtn: string;
  assignHintLabel: string;
  openHintLabel: string;
  compact: PatioVehicleModalCompact;
};

const COMPACT_MOBILE: PatioVehicleModalCompact = {
  grid: 'gap-2 sm:gap-2.5',
  row: 'relative flex items-center gap-2 px-2.5 py-2 sm:gap-2.5 sm:px-3 sm:py-2.5',
  splitRow:
    'relative flex flex-col gap-[clamp(0.35rem,1.8vw,0.7rem)] px-2.5 py-2 sm:flex-row sm:items-center sm:gap-[clamp(0.5rem,1.2vw,1rem)] sm:px-3 sm:py-2.5',
  iconSquircle:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]',
  iconGlyph: 'h-4 w-4 text-[#007AFF] dark:text-[#7ab8ff]',
  titleText:
    'bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[12px] font-bold leading-tight tracking-[-0.02em] text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400 sm:text-[13px]',
  bodyText:
    'mt-0.5 truncate text-[12px] font-semibold leading-tight text-zinc-900 dark:text-white portrait:text-[9.4px]',
  assignHint: 'mt-0.5 text-[12px] font-semibold leading-tight text-[#007AFF] dark:text-[#7ab8ff]',
  chevron: 'relative z-[1] h-3.5 w-3.5 shrink-0',
  numericInput:
    'min-w-0 flex-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2.5 py-1.5 text-[13px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-zinc-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.12] dark:bg-zinc-950/50 dark:text-white dark:placeholder:text-zinc-500 sm:max-w-[180px] sm:flex-none',
  dateInput:
    'min-w-0 flex-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2.5 py-1.5 text-[13px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-white sm:max-w-[180px] sm:flex-none',
  saveBtn:
    'inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-md transition-all disabled:opacity-50',
  saveIcon: 'h-3.5 w-3.5',
  salvo: 'text-[11px] font-semibold text-green-600 dark:text-green-400',
  mechanicWrap:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-md portrait:scale-[0.78] portrait:origin-center',
  mechanicWrench:
    'h-4 w-4 text-white opacity-95 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.35))] portrait:scale-[0.78]',
  emptyTech:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-dashed border-[#007AFF]/35 bg-[#007AFF]/[0.08] dark:border-[#007AFF]/45 dark:bg-[#007AFF]/12',
  fieldRow: 'flex min-w-0 flex-1 flex-wrap items-center gap-1.5 sm:ml-auto sm:justify-end',
};

const COMPACT_DESKTOP: PatioVehicleModalCompact = {
  grid: 'gap-3 sm:gap-4',
  row: 'relative flex items-center gap-3 px-4 py-3.5',
  splitRow: 'relative flex flex-row flex-wrap items-center gap-3 px-4 py-3.5',
  iconSquircle:
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]',
  iconGlyph: 'h-5 w-5 text-[#007AFF] dark:text-[#7ab8ff]',
  titleText:
    'bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-600 bg-clip-text text-[13px] font-bold leading-tight tracking-[-0.02em] text-transparent dark:from-white dark:via-zinc-100 dark:to-zinc-400 xl:text-[14px]',
  bodyText: 'mt-0.5 truncate text-[14px] font-semibold leading-snug text-zinc-900 dark:text-white',
  assignHint: 'mt-0.5 text-[14px] font-semibold leading-snug text-[#007AFF] dark:text-[#7ab8ff]',
  chevron: 'relative z-[1] h-4 w-4 shrink-0',
  numericInput:
    'min-w-0 flex-1 rounded-xl border border-zinc-300/90 bg-zinc-50 px-3 py-2 text-[15px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-zinc-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.12] dark:bg-zinc-950/50 dark:text-white dark:placeholder:text-zinc-500 max-w-[220px]',
  dateInput:
    'min-w-0 flex-1 rounded-xl border border-zinc-300/90 bg-zinc-50 px-3 py-2 text-[15px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-white max-w-[220px]',
  saveBtn:
    'inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-[13px] font-semibold text-white shadow-md transition-all hover:brightness-105 disabled:opacity-50 disabled:hover:brightness-100',
  saveIcon: 'h-4 w-4',
  salvo: 'text-[12px] font-semibold text-green-600 dark:text-green-400',
  mechanicWrap:
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-md',
  mechanicWrench:
    'h-5 w-5 text-white opacity-95 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.35))]',
  emptyTech:
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-dashed border-[#007AFF]/35 bg-[#007AFF]/[0.08] dark:border-[#007AFF]/45 dark:bg-[#007AFF]/12',
  fieldRow: 'flex min-w-0 flex-1 flex-wrap items-center gap-2 ml-auto justify-end',
};

const MOBILE_OVERLAY =
  'fixed inset-0 z-[100] flex items-center justify-center overscroll-none touch-pan-y bg-black/35 dark:bg-black/45 backdrop-blur-[20px] animate-in fade-in duration-200 p-1.5 pt-[max(0.45rem,env(safe-area-inset-top))] pb-[max(0.45rem,env(safe-area-inset-bottom))] sm:p-3';

const MOBILE_SHELL =
  'relative flex h-[min(97vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-0.35rem))] w-full max-w-[99vw] xl:max-w-[98vw] 2xl:max-w-[97vw] min-h-0 flex-col';

const DESKTOP_OVERLAY =
  'patio-vehicle-modal patio-vehicle-modal--desktop fixed inset-0 z-[100] flex flex-col overscroll-none bg-[#F2F2F7] dark:bg-[#0a0a0a] animate-in fade-in duration-200 p-0';

const DESKTOP_SHELL =
  'patio-vehicle-modal__shell relative flex h-full min-h-0 w-full max-h-[100dvh] max-w-none flex-col overflow-hidden rounded-none border-0 shadow-none dark:shadow-none';

const DESKTOP_INSET_CARD =
  'patio-vm-card rounded-[18px] border border-zinc-300/70 bg-white ' +
  'shadow-[0_10px_32px_-10px_rgba(63,63,70,0.16),0_4px_16px_-6px_rgba(82,82,91,0.10)] ' +
  'dark:border-white/[0.07] dark:bg-zinc-900/40 dark:backdrop-blur-2xl dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

const DESKTOP_INPUT =
  'w-full rounded-xl border border-zinc-300/85 bg-zinc-50 px-4 py-3.5 text-[16px] leading-relaxed text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 focus:border-[#007AFF]/50 transition-shadow dark:border-white/[0.08] dark:bg-zinc-950/50 dark:text-white dark:placeholder:text-zinc-500';

export function getPatioVehicleModalLayout(isDesktop: boolean): PatioVehicleModalLayout {
  if (!isDesktop) {
    return {
      rootClass: '',
      overlay: MOBILE_OVERLAY,
      shell: `${MOBILE_SHELL} ${iosVehicleModalShell}`,
      insetCard: iosVehicleModalInsetCard,
      input: iosVehicleModalInput,
      headerPad: 'border-b border-zinc-200/50 p-8 pb-8 dark:border-white/[0.06] md:px-12 md:pb-10',
      headerInner: 'mb-6 flex flex-col gap-3',
      title:
        'font-vehicle min-w-0 flex-1 truncate text-[2.79rem] md:text-[4.185rem] portrait:text-[2.74rem] portrait:md:text-[4.11rem] font-bold text-zinc-900 dark:text-white tracking-tight uppercase leading-none',
      brandSubtitle: 'text-[12px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400',
      mainGrid:
        'grid grid-cols-1 gap-6 p-8 pt-3 md:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] lg:gap-7 lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(232px,288px)]',
      closeBtn:
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15',
      assignHintLabel: 'Toque para atribuir',
      openHintLabel: 'Toque para abrir',
      compact: COMPACT_MOBILE,
    };
  }

  return {
    rootClass: 'patio-vehicle-modal patio-vehicle-modal--desktop',
    overlay: DESKTOP_OVERLAY,
    shell: `${DESKTOP_SHELL} ${iosVehicleModalShell}`,
    insetCard: DESKTOP_INSET_CARD,
    input: DESKTOP_INPUT,
    headerPad: 'border-b border-zinc-200/50 px-10 py-8 dark:border-white/[0.06] xl:px-14 xl:py-10',
    headerInner: 'mb-8 flex flex-col gap-4 max-w-[1680px] mx-auto w-full',
    title:
      'patio-vehicle-modal__title font-vehicle min-w-0 flex-1 truncate text-[2.35rem] xl:text-[3rem] 2xl:text-[3.35rem] font-bold text-zinc-900 dark:text-white tracking-tight uppercase leading-none',
    brandSubtitle: 'text-[13px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400',
    mainGrid:
      'patio-vehicle-modal__main-grid grid grid-cols-1 gap-8 px-10 pt-4 pb-10 xl:px-14 xl:gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)] lg:items-start max-w-[1800px] mx-auto w-full',
    closeBtn:
      'patio-vehicle-modal__icon-btn flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-black/12 dark:bg-white/10 dark:hover:bg-white/18',
    assignHintLabel: 'Clique para atribuir',
    openHintLabel: 'Clique para abrir',
    compact: COMPACT_DESKTOP,
  };
}

/** Overlay/shell para modais de histórico arquivado (lista e detalhe). */
export function getPatioHistoryModalLayout(isDesktop: boolean): {
  overlay: string;
  shell: string;
  closeBtn: string;
} {
  if (!isDesktop) {
    return {
      overlay:
        'fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-[12px] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 sm:p-6 animate-in fade-in duration-200',
      shell:
        'relative flex h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-[90rem] min-h-0 flex-col overflow-hidden',
      closeBtn: iosModalClose,
    };
  }
  return {
    overlay:
      'patio-vehicle-modal patio-vehicle-modal--desktop fixed inset-0 z-[100] flex flex-col overscroll-none bg-[#F2F2F7] dark:bg-[#0a0a0a] animate-in fade-in duration-200 p-0',
    shell:
      'patio-vehicle-modal__shell relative flex h-full min-h-0 w-full max-h-[100dvh] max-w-none flex-col overflow-hidden rounded-none',
    closeBtn:
      'patio-vehicle-modal__icon-btn absolute top-5 right-5 z-20 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-black/12 dark:bg-white/10 dark:hover:bg-white/18',
  };
}
