/**
 * Preferência de zoom dos cards por escopo + modo de visualização.
 * Persistida em localStorage (por dispositivo/usuário do browser).
 */

export const BOARD_CARD_ZOOM_STEPS = [0.55, 0.65, 0.72, 0.82, 0.92, 1.0, 1.12] as const;

export type BoardCardZoomScope = 'budgets' | 'patio-vehicle' | 'patio-module';

const STORAGE_KEY = 'rda_board_card_zoom_v1';

type ZoomStore = Record<string, number>;

function prefKey(scope: BoardCardZoomScope, mode: string): string {
  return `${scope}::${mode}`;
}

function readStore(): ZoomStore {
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

function writeStore(store: ZoomStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* ignore */
  }
}

/** Índice padrão: Trello/colunas um pouco menores; grades um pouco maiores. */
export function getDefaultBoardCardZoomStepIndex(_scope: BoardCardZoomScope, mode: string): number {
  if (
    mode === 'by_stage' ||
    mode === 'trello' ||
    mode === 'by_mechanic'
  ) {
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
  const store = readStore();
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
  const store = readStore();
  store[prefKey(scope, mode)] = next;
  writeStore(store);
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

/** Grade mais densa (mais colunas) quando o zoom está baixo. */
export function boardCardZoomPrefersDenseGrid(zoom: number): boolean {
  return zoom <= 0.78;
}
