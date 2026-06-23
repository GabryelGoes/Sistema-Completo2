import type { TvSlide } from '../services/apiService';

export function normalizeMediaPlaylist(slide: {
  mediaUrl?: string | null;
  mediaPlaylist?: string[] | null;
}): string[] {
  const fromList = (slide.mediaPlaylist ?? []).map((u) => String(u).trim()).filter(Boolean);
  if (fromList.length > 0) return fromList;
  const single = slide.mediaUrl?.trim();
  return single ? [single] : [];
}

export function mediaPlaylistForSave(playlist: string[], fallbackUrl?: string | null): {
  mediaPlaylist: string[];
  mediaUrl: string | null;
} {
  const clean = playlist.map((u) => u.trim()).filter(Boolean);
  if (clean.length > 0) return { mediaPlaylist: clean, mediaUrl: clean[0] };
  const single = fallbackUrl?.trim();
  return single ? { mediaPlaylist: [single], mediaUrl: single } : { mediaPlaylist: [], mediaUrl: null };
}

export function resolveVideoSlideForVisit(slide: TvSlide, visitIndex: number): TvSlide {
  const sources = normalizeMediaPlaylist(slide);
  if (slide.slideType !== 'video' || sources.length <= 1) return slide;
  const idx = ((visitIndex % sources.length) + sources.length) % sources.length;
  return { ...slide, mediaUrl: sources[idx] };
}
