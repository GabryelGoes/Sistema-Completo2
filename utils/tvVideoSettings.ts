/** Modo de vídeos na paginação da TV (gestão). */

export type TvVideoLayoutMode = 'single_rotate' | 'multiple_slides';

export interface TvVideoSettings {
  layoutMode: TvVideoLayoutMode;
}

export const DEFAULT_TV_VIDEO_SETTINGS: TvVideoSettings = {
  layoutMode: 'single_rotate',
};

export function normalizeTvVideoLayoutMode(raw: unknown): TvVideoLayoutMode {
  return raw === 'multiple_slides' ? 'multiple_slides' : 'single_rotate';
}

export function normalizeTvVideoSettings(raw: unknown): TvVideoSettings {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_TV_VIDEO_SETTINGS };
  const o = raw as Record<string, unknown>;
  return {
    layoutMode: normalizeTvVideoLayoutMode(o.layoutMode ?? o.layout_mode),
  };
}
