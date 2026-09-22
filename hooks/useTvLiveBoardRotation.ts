import { useEffect, useMemo, useState } from 'react';
import type { TvSlide } from '../services/apiService';
import {
  TV_BOARD_CARS_PER_PAGE,
  TV_BOARD_PAGE_SECONDS,
  type TvBoardItem,
} from '../utils/tvBoardPreview';
import { buildTvLiveQueue } from './useTvLiveSlideRotation';

export type TvLiveBoardFrame =
  | { kind: 'board'; items: TvBoardItem[]; pageIndex: number; boardPageCount: number }
  | { kind: 'slide'; slide: TvSlide; slideIndex: number };

/**
 * Rotação igual à TV física: páginas do quadro (6 itens) + slides ativos,
 * com pinImmediate fixando o slide.
 */
export function useTvLiveBoardRotation(
  boardItems: TvBoardItem[],
  slides: TvSlide[],
  enabled: boolean,
  boardPageSeconds: number = TV_BOARD_PAGE_SECONDS
): {
  frame: TvLiveBoardFrame | null;
  page: number;
  totalPages: number;
  queueLength: number;
} {
  const liveSlides = useMemo(() => buildTvLiveQueue(slides), [slides]);
  const boardPageCount = Math.max(1, Math.ceil(boardItems.length / TV_BOARD_CARS_PER_PAGE) || 1);
  const slideCount = liveSlides.length;
  const totalPages = boardPageCount + slideCount;

  const pinnedSlideIndex = useMemo(
    () => liveSlides.findIndex((s) => s.pinImmediate === true),
    [liveSlides]
  );
  const isPinned = pinnedSlideIndex >= 0;

  const queueKey = useMemo(
    () =>
      [
        boardItems.map((b) => b.id).join(','),
        liveSlides.map((s) => `${s.id}:${s.durationSeconds}:${s.pinImmediate ? 1 : 0}`).join('|'),
      ].join('#'),
    [boardItems, liveSlides]
  );

  const [page, setPage] = useState(0);

  useEffect(() => {
    setPage(0);
  }, [queueKey, enabled]);

  useEffect(() => {
    if (!enabled || !isPinned) return;
    setPage(boardPageCount + pinnedSlideIndex);
  }, [enabled, isPinned, pinnedSlideIndex, boardPageCount, queueKey]);

  useEffect(() => {
    if (!enabled || isPinned) return;
    if (page >= totalPages) setPage(0);
  }, [enabled, isPinned, page, totalPages]);

  useEffect(() => {
    if (!enabled || isPinned || totalPages <= 1) return;

    let ms = Math.max(3000, boardPageSeconds * 1000);
    if (page >= boardPageCount && page < boardPageCount + slideCount) {
      const slide = liveSlides[page - boardPageCount];
      const slideSec = Number(slide?.durationSeconds);
      if (Number.isFinite(slideSec) && slideSec >= 3) {
        ms = Math.min(120_000, Math.max(3000, slideSec * 1000));
      }
    }

    const t = window.setTimeout(() => {
      setPage((prev) => (prev + 1) % totalPages);
    }, ms);
    return () => window.clearTimeout(t);
  }, [
    enabled,
    isPinned,
    page,
    totalPages,
    boardPageCount,
    slideCount,
    liveSlides,
    boardPageSeconds,
    queueKey,
  ]);

  if (!enabled) {
    return { frame: null, page: 0, totalPages: 0, queueLength: 0 };
  }

  const safePage = ((page % totalPages) + totalPages) % totalPages;

  if (slideCount > 0 && safePage >= boardPageCount) {
    const slideIndex = safePage - boardPageCount;
    const slide = liveSlides[slideIndex] ?? null;
    if (slide) {
      return {
        frame: { kind: 'slide', slide, slideIndex },
        page: safePage,
        totalPages,
        queueLength: totalPages,
      };
    }
  }

  const start = (safePage % boardPageCount) * TV_BOARD_CARS_PER_PAGE;
  const items = boardItems.slice(start, start + TV_BOARD_CARS_PER_PAGE);
  return {
    frame: {
      kind: 'board',
      items,
      pageIndex: safePage % boardPageCount,
      boardPageCount,
    },
    page: safePage,
    totalPages,
    queueLength: totalPages,
  };
}
