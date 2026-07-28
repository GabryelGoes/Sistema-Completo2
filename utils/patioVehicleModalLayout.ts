import { iosModalClose, iosVehicleModalInsetCard, iosVehicleModalInput } from '../components/ui/iosModalStyles';

export type PatioVehicleModalCompact = {
  grid: string;
  row: string;
  splitRow: string;
  deliveryDateStack: string;
  deliveryDateControlRow: string;
  deliveryDateBar: string;
  deliveryDateBarLabel: string;
  dateInputBar: string;
  iconSquircle: string;
  iconGlyph: string;
  titleText: string;
  bodyText: string;
  assignHint: string;
  chevron: string;
  numericInput: string;
  dateInput: string;
  dateFieldWrap: string;
  dateFieldLabel: string;
  dateFieldRow: string;
  saveBtn: string;
  saveIcon: string;
  salvo: string;
  mechanicWrap: string;
  mechanicWrench: string;
  emptyTech: string;
  fieldRow: string;
};

export type PatioVehicleModalMode = 'mobile' | 'tabletPortrait' | 'desktop';

export type PatioVehicleModalLayout = {
  mode: PatioVehicleModalMode;
  overlay: string;
  shell: string;
  scroll: string;
  header: string;
  headerInner: string;
  headerMeta: string;
  headerTitlePad: string;
  title: string;
  titlePlateRow: string;
  brandSubtitle: string;
  stagePill: string;
  brandLogoSize: 'modal' | 'modalTablet' | 'modalPc';
  plateMockupSize: 'modal' | 'modalTablet' | 'modalPc';
  body: string;
  mainCol: string;
  asideCol: string;
  insetCard: string;
  input: string;
  closeBtn: string;
  assignHintLabel: string;
  openHintLabel: string;
  sectionTitle: string;
  commentsList: string;
  customerMetaLabel: string;
  technicianMetaLabel: string;
  deliveryDateMetaLabel: string;
  hideOsBadge: boolean;
  showStageRing: boolean;
  isMetaPcLike: boolean;
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
    'text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 sm:text-[12px]',
  bodyText:
    'mt-0.5 truncate text-[12px] font-semibold leading-tight text-zinc-900 dark:text-white portrait:text-[9.4px]',
  assignHint: 'mt-0.5 text-[12px] font-semibold leading-tight text-[#007AFF] dark:text-[#7ab8ff]',
  chevron: 'relative z-[1] h-3.5 w-3.5 shrink-0',
  numericInput:
    'min-w-0 flex-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2.5 py-1.5 text-[13px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-zinc-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.12] dark:bg-zinc-950/50 dark:text-white dark:placeholder:text-zinc-500 sm:max-w-[180px] sm:flex-none',
  dateInput:
    'min-w-0 flex-1 rounded-lg border border-zinc-300/90 bg-zinc-50 px-2.5 py-1.5 text-[13px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-white sm:min-w-[11rem] sm:max-w-[min(100%,16rem)]',
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
  deliveryDateStack: '',
  deliveryDateControlRow: '',
  deliveryDateBar: '',
  deliveryDateBarLabel: '',
  dateInputBar: '',
  dateFieldWrap: '',
  dateFieldLabel: '',
  dateFieldRow: '',
};

/** PC: faixa meta simétrica — mesma altura, inputs compactos. */
const COMPACT_DESKTOP: PatioVehicleModalCompact = {
  grid: 'gap-2',
  row: 'patio-vm-meta-inner relative flex min-h-[3.25rem] items-center gap-2 px-2.5 py-2',
  splitRow:
    'patio-vm-meta-inner relative flex min-h-[3.25rem] w-full min-w-0 flex-row flex-nowrap items-center gap-1.5 px-2.5 py-2',
  deliveryDateStack: '',
  deliveryDateControlRow: '',
  deliveryDateBar: '',
  deliveryDateBarLabel: '',
  dateInputBar: '',
  iconSquircle:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]',
  iconGlyph: 'h-3.5 w-3.5 text-[#007AFF] dark:text-[#7ab8ff]',
  titleText:
    'truncate text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400',
  bodyText: 'mt-0.5 truncate text-[12px] font-semibold leading-tight text-zinc-900 dark:text-white',
  assignHint: 'mt-0.5 truncate text-[12px] font-semibold leading-tight text-[#007AFF] dark:text-[#7ab8ff]',
  chevron: 'relative z-[1] h-3.5 w-3.5 shrink-0',
  numericInput:
    'patio-vm-meta-input patio-vm-meta-input--km h-8 w-[4.75rem] min-w-0 shrink-0 rounded-md border border-zinc-300/90 bg-zinc-50 px-2 py-1 text-[13px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-zinc-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.12] dark:bg-zinc-950/50 dark:text-white dark:placeholder:text-zinc-500',
  dateInput:
    'patio-vm-meta-input patio-vm-meta-input--date h-8 w-[8.25rem] min-w-0 shrink-0 rounded-md border border-zinc-300/90 bg-zinc-50 px-2 py-1 text-[13px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-white',
  dateFieldWrap: '',
  dateFieldLabel: '',
  dateFieldRow: '',
  saveBtn:
    'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-white shadow-md transition-all hover:brightness-105 disabled:opacity-50',
  saveIcon: 'h-3.5 w-3.5',
  salvo: 'sr-only',
  mechanicWrap:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md shadow-md',
  mechanicWrench:
    'h-3.5 w-3.5 text-white opacity-95 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.35))]',
  emptyTech:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-[#007AFF]/35 bg-[#007AFF]/[0.08] dark:border-[#007AFF]/45 dark:bg-[#007AFF]/12',
  fieldRow: 'ml-auto flex shrink-0 items-center gap-1',
};

/** Tablet vertical (~653×1045): meta compacta em 2×2, tipografia calibrada. */
const COMPACT_TABLET_PORTRAIT: PatioVehicleModalCompact = {
  grid: 'gap-2',
  row: 'patio-vm-meta-inner relative flex min-h-[3rem] items-center gap-2 px-2.5 py-2',
  splitRow:
    'patio-vm-meta-inner relative flex min-h-[3rem] w-full min-w-0 flex-row flex-nowrap items-center gap-1.5 px-2.5 py-2',
  deliveryDateStack: '',
  deliveryDateControlRow: '',
  deliveryDateBar: '',
  deliveryDateBarLabel: '',
  dateInputBar: '',
  iconSquircle:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]',
  iconGlyph: 'h-3.5 w-3.5 text-[#007AFF] dark:text-[#7ab8ff]',
  titleText:
    'truncate text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400',
  bodyText: 'mt-0.5 truncate text-[12px] font-semibold leading-tight text-zinc-900 dark:text-white',
  assignHint: 'mt-0.5 truncate text-[12px] font-semibold leading-tight text-[#007AFF] dark:text-[#7ab8ff]',
  chevron: 'relative z-[1] h-3.5 w-3.5 shrink-0',
  numericInput:
    'patio-vm-meta-input patio-vm-meta-input--km h-8 w-[4.5rem] min-w-0 shrink-0 rounded-md border border-zinc-300/90 bg-zinc-50 px-2 py-1 text-[13px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] placeholder:text-zinc-400 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.12] dark:bg-zinc-950/50 dark:text-white dark:placeholder:text-zinc-500',
  dateInput:
    'patio-vm-meta-input patio-vm-meta-input--date h-8 w-[7.75rem] min-w-0 shrink-0 rounded-md border border-zinc-300/90 bg-zinc-50 px-2 py-1 text-[13px] tabular-nums text-zinc-950 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)] focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/25 dark:border-white/[0.1] dark:bg-zinc-950/50 dark:text-white',
  dateFieldWrap: '',
  dateFieldLabel: '',
  dateFieldRow: '',
  saveBtn:
    'inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-white shadow-md transition-all hover:brightness-105 disabled:opacity-50',
  saveIcon: 'h-3.5 w-3.5',
  salvo: 'sr-only',
  mechanicWrap: 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md shadow-md',
  mechanicWrench:
    'h-3.5 w-3.5 text-white opacity-95 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.35))]',
  emptyTech:
    'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-dashed border-[#007AFF]/35 bg-[#007AFF]/[0.08] dark:border-[#007AFF]/45 dark:bg-[#007AFF]/12',
  fieldRow: 'ml-auto flex shrink-0 items-center gap-1',
};

const STAGE_PILL_BASE =
  'inline-flex items-center gap-1.5 font-black uppercase shadow-xl border-2 transition-all hover:brightness-110 hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/45 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-[#0a0a0a]';

export function getPatioVehicleModalLayout(
  isPc: boolean,
  isTabletPortrait = false
): PatioVehicleModalLayout {
  if (!isPc && isTabletPortrait) {
    return {
      mode: 'tabletPortrait',
      overlay:
        'fixed inset-0 z-[100] flex flex-col overscroll-none touch-pan-y bg-[#F2F2F7] dark:bg-zinc-950 animate-in fade-in duration-200 p-0',
      shell:
        'relative flex h-[100dvh] max-h-[100dvh] w-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-[#F2F2F7] pb-[env(safe-area-inset-bottom)] shadow-none dark:bg-zinc-950',
      scroll:
        'patio-vm-scroll patio-vm-scroll--minimal min-h-0 flex-1 overflow-y-auto overscroll-none',
      header: 'border-b border-zinc-200/50 px-4 pb-4 pt-4 dark:border-white/[0.06]',
      headerInner: 'mb-4 flex flex-col gap-2.5',
      headerTitlePad: '',
      headerMeta:
        'patio-vm-header-meta patio-vm-header-meta--tablet mt-2 grid w-full min-w-0 grid-cols-2 gap-2',
      title:
        'font-vehicle min-w-0 flex-1 truncate text-[2.2rem] font-bold uppercase leading-none tracking-tight text-zinc-900 dark:text-white',
      titlePlateRow: 'mt-1 flex min-w-0 items-center gap-2.5',
      brandSubtitle: 'text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400',
      stagePill: `${STAGE_PILL_BASE} rounded-md px-3.5 py-2.5 text-[13px] tracking-[0.12em]`,
      brandLogoSize: 'modalTablet',
      plateMockupSize: 'modalTablet',
      body: 'grid grid-cols-1 gap-4 px-4 pb-5 pt-3',
      mainCol: 'min-w-0 space-y-4',
      asideCol: 'min-w-0 space-y-5',
      insetCard: iosVehicleModalInsetCard,
      input: iosVehicleModalInput,
      closeBtn:
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15',
      assignHintLabel: 'Toque para atribuir',
      openHintLabel: 'Toque para abrir',
      sectionTitle: '',
      commentsList:
        'patio-vm-scroll--minimal max-h-[min(380px,48vh)] space-y-4 overflow-y-auto bg-[#F2F2F7]/80 p-3.5 dark:bg-black/25 sm:space-y-4',
      customerMetaLabel: 'Dados da ficha',
      technicianMetaLabel: 'Técnico',
      deliveryDateMetaLabel: 'ENTREGA',
      hideOsBadge: true,
      showStageRing: false,
      isMetaPcLike: true,
      compact: COMPACT_TABLET_PORTRAIT,
    };
  }

  if (!isPc) {
    return {
      mode: 'mobile',
      overlay:
        'fixed inset-0 z-[100] flex flex-col overscroll-none touch-pan-y bg-[#F2F2F7] dark:bg-zinc-950 animate-in fade-in duration-200 p-0',
      shell:
        'relative flex h-[100dvh] max-h-[100dvh] w-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-[#F2F2F7] pb-[env(safe-area-inset-bottom)] shadow-none dark:bg-zinc-950',
      scroll:
        'patio-vm-scroll patio-vm-scroll--minimal min-h-0 flex-1 overflow-y-auto overscroll-none',
      header: 'border-b border-zinc-200/50 p-8 pb-8 dark:border-white/[0.06] md:px-12 md:pb-10',
      headerInner: 'mb-6 flex flex-col gap-3',
      headerTitlePad: '',
      headerMeta: 'flex flex-col gap-2',
      title:
        'font-vehicle min-w-0 flex-1 truncate text-[3.05rem] md:text-[4.4rem] portrait:text-[3rem] portrait:md:text-[4.3rem] font-bold text-zinc-900 dark:text-white tracking-tight uppercase leading-none',
      titlePlateRow: 'mt-0.5 flex min-w-0 items-center gap-3',
      brandSubtitle: 'text-[12px] font-bold uppercase tracking-[0.2em] text-zinc-500 dark:text-zinc-400',
      stagePill: `${STAGE_PILL_BASE} rounded-md px-3.5 py-2.5 text-[14px] sm:text-[15px] tracking-[0.12em]`,
      brandLogoSize: 'modal',
      plateMockupSize: 'modal',
      body: 'grid grid-cols-1 gap-6 p-8 pt-3 md:px-12 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)] lg:gap-7 lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(232px,288px)]',
      mainCol: 'min-w-0 space-y-6',
      asideCol: 'min-w-0 space-y-8',
      insetCard: iosVehicleModalInsetCard,
      input: iosVehicleModalInput,
      closeBtn:
        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15',
      assignHintLabel: 'Toque para atribuir',
      openHintLabel: 'Toque para abrir',
      sectionTitle: '',
      commentsList:
        'patio-vm-scroll--minimal max-h-[min(420px,52vh)] space-y-4 overflow-y-auto bg-[#F2F2F7]/80 p-4 dark:bg-black/25 sm:p-5 sm:space-y-5 lg:max-h-[min(220px,32vh)] lg:space-y-3 lg:p-3',
      customerMetaLabel: 'Dados da ficha',
      technicianMetaLabel: 'Técnico responsável',
      deliveryDateMetaLabel: 'ENTREGA',
      hideOsBadge: false,
      showStageRing: false,
      isMetaPcLike: false,
      compact: COMPACT_MOBILE,
    };
  }

  return {
    mode: 'desktop',
    overlay:
      'patio-vehicle-modal patio-vehicle-modal--desktop fixed inset-0 z-[100] flex flex-col overflow-hidden bg-[#F2F2F7] dark:bg-[#0a0a0a] animate-in fade-in duration-200',
    shell:
      'patio-vehicle-modal__shell relative flex h-[100dvh] max-h-[100dvh] w-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-[#F2F2F7] shadow-none dark:bg-[#0a0a0a] dark:shadow-none',
    scroll: 'patio-vm-scroll min-h-0 flex-1 overflow-y-auto overscroll-y-auto custom-scrollbar',
    header:
      'patio-vm-desktop-header shrink-0 border-b border-zinc-300/80 bg-white/95 px-6 py-4 dark:border-white/[0.08] dark:bg-zinc-900/95 xl:px-8 xl:py-4',
    headerInner: 'mx-auto flex w-full min-w-0 max-w-[1680px] flex-col gap-3',
    headerTitlePad: 'min-w-0 pr-20 xl:pr-24',
    headerMeta:
      'patio-vm-header-meta patio-vm-header-meta--pc mt-2 grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4',
    title:
      'patio-vehicle-modal__title font-vehicle min-w-0 flex-1 truncate text-[2rem] font-bold uppercase leading-none tracking-tight text-zinc-900 dark:text-white xl:text-[2.35rem]',
    titlePlateRow: 'mt-1 flex min-w-0 items-end gap-3',
    brandSubtitle: 'text-[12px] font-bold uppercase tracking-[0.18em] text-zinc-500 dark:text-zinc-400',
    stagePill: `${STAGE_PILL_BASE} rounded-full px-4 py-2 text-[15px] tracking-widest`,
    brandLogoSize: 'modalPc',
    plateMockupSize: 'modal',
    body:
      'patio-vm-desktop-body mx-auto grid w-full max-w-[1680px] grid-cols-1 gap-5 px-6 pb-6 pt-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,320px)] lg:items-start lg:gap-6 xl:px-8',
    mainCol: 'patio-vm-main-col min-w-0 space-y-5',
    asideCol:
      'patio-vm-aside-col min-w-0 space-y-5 border-t border-zinc-300/70 bg-[#F2F2F7]/80 pt-5 dark:border-white/[0.08] dark:bg-zinc-950/40 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0',
    insetCard:
      'patio-vm-card rounded-[6px] border border-zinc-300/70 bg-white shadow-[0_8px_28px_-8px_rgba(63,63,70,0.15),0_3px_14px_-6px_rgba(82,82,91,0.10)] dark:border-white/[0.07] dark:bg-zinc-900/40 dark:backdrop-blur-2xl dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]',
    input:
      'w-full rounded-md border border-zinc-300/85 bg-zinc-50 px-3.5 py-2.5 text-[15px] leading-relaxed text-zinc-950 placeholder:text-zinc-500 focus:border-[#007AFF]/50 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 transition-shadow dark:border-white/[0.08] dark:bg-zinc-950/50 dark:text-white dark:placeholder:text-zinc-500',
    closeBtn:
      'patio-vehicle-modal__icon-btn flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/5 text-zinc-600 transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15',
    assignHintLabel: 'Clique para atribuir',
    openHintLabel: 'Clique para abrir',
    sectionTitle:
      'text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2 flex items-center gap-1.5',
    commentsList:
      'custom-scrollbar max-h-none space-y-4 overflow-visible bg-[#F2F2F7]/80 p-3.5 dark:bg-black/25 sm:space-y-4',
    customerMetaLabel: 'Cliente',
    technicianMetaLabel: 'Técnico',
    deliveryDateMetaLabel: 'Entrega',
    hideOsBadge: false,
    showStageRing: true,
    isMetaPcLike: true,
    compact: COMPACT_DESKTOP,
  };
}

export function getPatioHistoryModalLayout(isPc: boolean): {
  overlay: string;
  shell: string;
  closeBtn: string;
} {
  if (!isPc) {
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
      'patio-vehicle-modal patio-vehicle-modal--desktop fixed inset-0 z-[100] flex flex-col overflow-hidden overscroll-none bg-[#E8E8ED] dark:bg-[#0a0a0a] animate-in fade-in duration-200',
    shell:
      'patio-vehicle-modal__shell relative flex h-[100dvh] max-h-[100dvh] w-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-[#E8E8ED] dark:bg-[#0a0a0a]',
    closeBtn:
      'patio-vehicle-modal__icon-btn absolute top-6 right-6 z-20 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-zinc-300/80 bg-white text-zinc-600 shadow-sm transition-colors hover:bg-zinc-100 dark:border-white/[0.12] dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700',
  };
}
