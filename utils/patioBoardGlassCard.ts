/** Cards do quadro (Pátio / Laboratório): sombra vidro estática — sem hover para evitar artefatos internos. */
export const patioBoardGlassCardShadow =
  'shadow-[0_10px_36px_-8px_rgba(63,63,70,0.20),0_4px_20px_-6px_rgba(82,82,91,0.12),0_1px_3px_rgba(63,63,70,0.08)] ' +
  'dark:shadow-[0_14px_40px_-10px_rgba(0,0,0,0.44),0_6px_26px_-8px_rgba(0,0,0,0.30),0_2px_10px_-4px_rgba(0,0,0,0.22)]';

/** Sombra nos glifos do nome do veículo (só tema escuro). */
export const vehicleCardTitleShadow =
  'dark:[text-shadow:0_1px_2px_rgba(0,0,0,0.58),0_2px_10px_rgba(0,0,0,0.32),0_0_26px_rgba(0,0,0,0.2)]';

export const BOARD_PANORAMIC_ZOOM = 0.72;

/**
 * Retrato + quadro em colunas horizontais (Trello / por mecânico): multiplica o zoom do wrapper
 * para aproximar a densidade do modo compacto da grade (cartões mais estreitos por coluna).
 */
export const BOARD_PORTRAIT_HSCROLL_ZOOM_MULT = 0.835;

export const DESKTOP_LANDSCAPE_CARD_ZOOM = 0.65025;

/** Cantos dos cards do quadro — PC: suave, entre Orçamentos e o estilo mobile. */
export function getPatioBoardCardRadiusClass(isPcLayout: boolean, boardPanoramic: boolean): string {
  if (isPcLayout) {
    return boardPanoramic ? 'rounded-[1.35rem]' : 'rounded-2xl';
  }
  return boardPanoramic
    ? 'rounded-[1.85rem] sm:rounded-[2.1rem]'
    : 'rounded-[2rem] sm:rounded-[2.25rem]';
}

/** Shell das colunas Trello / por mecânico — PC com cantos um pouco mais suaves. */
export function getPatioBoardColumnShellClass(isPcLayout: boolean): string {
  if (isPcLayout) {
    return 'rounded-[1.35rem] border border-zinc-200/90 bg-zinc-100/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] transition-[box-shadow,transform,border-color] duration-300 ease-out dark:border-white/[0.08] dark:bg-zinc-900/40 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
  }
  return 'rounded-[1.35rem] border border-zinc-200/70 bg-zinc-100/50 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-md transition-[box-shadow,transform,border-color] duration-300 ease-out dark:border-white/[0.08] dark:bg-zinc-900/45 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]';
}

export function getPatioBoardColumnHeaderTopClass(_isPcLayout: boolean): string {
  return 'rounded-t-[1.35rem]';
}
