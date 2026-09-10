/** Cards do quadro (Pátio / Laboratório): chapados — sem aro e sem sombra marcada. */
export const patioBoardGlassCardShadow = 'shadow-none';

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

/** Shell das colunas Trello / por mecânico — chapado, sem contorno marcado. */
export function getPatioBoardColumnShellClass(isPcLayout: boolean): string {
  if (isPcLayout) {
    return 'rounded-[1.35rem] border-0 bg-zinc-100/90 transition-[box-shadow,transform,background-color] duration-300 ease-out dark:bg-zinc-900/40';
  }
  return 'rounded-[1.35rem] border-0 bg-zinc-100/50 backdrop-blur-md transition-[box-shadow,transform,background-color] duration-300 ease-out dark:bg-zinc-900/45';
}

export function getPatioBoardColumnHeaderTopClass(_isPcLayout: boolean): string {
  return 'rounded-t-[1.35rem]';
}
