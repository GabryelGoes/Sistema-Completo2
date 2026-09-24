/**
 * Preferências de densidade do quadro: zoom de cards, largura de colunas (Trello)
 * e quantidade de colunas na grade — por escopo + modo, em localStorage.
 */

export const BOARD_CARD_ZOOM_STEPS = [0.55, 0.65, 0.72, 0.82, 0.92, 1.0, 1.12] as const;

/** Largura das colunas Trello (rem). */
export const BOARD_TRELLO_COLUMN_WIDTH_REMS = [12.25, 13.5, 15.5, 17, 18.5] as const;

/** Quantidade de colunas na grade (modos que não são Trello). */
export const BOARD_GRID_COLUMN_COUNTS = [3, 4, 5, 6] as const;

export type BoardCardZoomScope = 'budgets' | 'patio-vehicle' | 'patio-module';

const STORAGE_KEY = 'rda_board_card_zoom_v1';
const LAYOUT_STORAGE_KEY = 'rda_board_layout_density_v1';

type ZoomStore = Record<string, number>;
type LayoutStore = Record<
  string,
  {
    trelloColStep?: number;
    gridColsStep?: number;
  }
>;

function prefKey(scope: BoardCardZoomScope, mode: string): string {
  return `${scope}::${mode}`;
}

function readZoomStore(): ZoomStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as ZoomStore;
  } catch {
    return {};
  }
}

function writeZoomStore(store: ZoomStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

function readLayoutStore(): LayoutStore {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as LayoutStore;
  } catch {
    return {};
  }
}

function writeLayoutStore(store: LayoutStore): void {
  try {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Índice padrão: Trello/colunas um pouco menores; grades um pouco maiores. */
export function getDefaultBoardCardZoomStepIndex(_scope: BoardCardZoomScope, mode: string): number {
  if (mode === 'by_stage' || mode === 'trello' || mode === 'by_mechanic') {
    return 2; // 0.72
  }
  return 3; // 0.82
}

export function clampBoardCardZoomStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 3;
  return Math.max(0, Math.min(BOARD_CARD_ZOOM_STEPS.length - 1, Math.round(index)));
}

export function boardCardZoomValueFromStep(index: number): number {
  const i = clampBoardCardZoomStepIndex(index);
  return BOARD_CARD_ZOOM_STEPS[i] ?? 1;
}

export function readBoardCardZoomStepIndex(scope: BoardCardZoomScope, mode: string): number {
  const store = readZoomStore();
  const key = prefKey(scope, mode);
  const raw = store[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clampBoardCardZoomStepIndex(raw);
  }
  return getDefaultBoardCardZoomStepIndex(scope, mode);
}

export function readBoardCardZoom(scope: BoardCardZoomScope, mode: string): number {
  return boardCardZoomValueFromStep(readBoardCardZoomStepIndex(scope, mode));
}

export function storeBoardCardZoomStepIndex(
  scope: BoardCardZoomScope,
  mode: string,
  index: number
): number {
  const next = clampBoardCardZoomStepIndex(index);
  const store = readZoomStore();
  store[prefKey(scope, mode)] = next;
  writeZoomStore(store);
  return next;
}

export function bumpBoardCardZoomStep(
  scope: BoardCardZoomScope,
  mode: string,
  delta: -1 | 1
): number {
  const cur = readBoardCardZoomStepIndex(scope, mode);
  return storeBoardCardZoomStepIndex(scope, mode, cur + delta);
}

export function formatBoardCardZoomPercent(zoom: number): string {
  return `${Math.round(zoom * 100)}%`;
}

/** Grade mais densa (estilo compacto) quando o zoom está baixo. */
export function boardCardZoomPrefersDenseGrid(zoom: number): boolean {
  return zoom <= 0.78;
}

/* —— Colunas Trello —— */

export function getDefaultTrelloColumnWidthStepIndex(): number {
  return 2; // 15.5rem
}

export function clampTrelloColumnWidthStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 2;
  return Math.max(0, Math.min(BOARD_TRELLO_COLUMN_WIDTH_REMS.length - 1, Math.round(index)));
}

export function trelloColumnWidthRemFromStep(index: number): number {
  const i = clampTrelloColumnWidthStepIndex(index);
  return BOARD_TRELLO_COLUMN_WIDTH_REMS[i] ?? 15.5;
}

export function readTrelloColumnWidthStepIndex(scope: BoardCardZoomScope, mode: string): number {
  const store = readLayoutStore();
  const raw = store[prefKey(scope, mode)]?.trelloColStep;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clampTrelloColumnWidthStepIndex(raw);
  }
  return getDefaultTrelloColumnWidthStepIndex();
}

export function storeTrelloColumnWidthStepIndex(
  scope: BoardCardZoomScope,
  mode: string,
  index: number
): number {
  const next = clampTrelloColumnWidthStepIndex(index);
  const store = readLayoutStore();
  const key = prefKey(scope, mode);
  store[key] = { ...store[key], trelloColStep: next };
  writeLayoutStore(store);
  return next;
}

/* —— Colunas da grade —— */

export function getDefaultGridColumnCountStepIndex(): number {
  return 1; // 4 colunas
}

export function clampGridColumnCountStepIndex(index: number): number {
  if (!Number.isFinite(index)) return 1;
  return Math.max(0, Math.min(BOARD_GRID_COLUMN_COUNTS.length - 1, Math.round(index)));
}

export function gridColumnCountFromStep(index: number): number {
  const i = clampGridColumnCountStepIndex(index);
  return BOARD_GRID_COLUMN_COUNTS[i] ?? 4;
}

export function readGridColumnCountStepIndex(scope: BoardCardZoomScope, mode: string): number {
  const store = readLayoutStore();
  const raw = store[prefKey(scope, mode)]?.gridColsStep;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return clampGridColumnCountStepIndex(raw);
  }
  return getDefaultGridColumnCountStepIndex();
}

export function storeGridColumnCountStepIndex(
  scope: BoardCardZoomScope,
  mode: string,
  index: number
): number {
  const next = clampGridColumnCountStepIndex(index);
  const store = readLayoutStore();
  const key = prefKey(scope, mode);
  store[key] = { ...store[key], gridColsStep: next };
  writeLayoutStore(store);
  return next;
}

export function isTrelloLikeBoardMode(mode: string): boolean {
  return mode === 'by_stage' || mode === 'trello' || mode === 'by_mechanic';
}
