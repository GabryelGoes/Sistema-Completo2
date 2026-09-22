import { useEffect, useMemo, useState } from 'react';
import type { TvSlide } from '../services/apiService';

/** Fila ativa como na TV: pin imediato tem prioridade; demais por sortOrder. */
export function buildTvLiveQueue(slides: TvSlide[]): TvSlide[] {
  const active = slides.filter((s) => s.isActive !== false);
  const pinned = active.find((s) => s.pinImmediate === true);
  if (pinned) return [pinned];
  return [...active].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

/**
 * Rotaciona os slides ativos com a mesma duração usada na TV.
 * Retorna `null` quando a fila está vazia (TV mostra o quadro de veículos).
 */
export function useTvLiveSlideRotation(slides: TvSlide[], enabled: boolean): {
  current: TvSlide | null;
  index: number;
  queueLength: number;
} {
  const queue = useMemo(() => buildTvLiveQueue(slides), [slides]);
  const queueKey = useMemo(() => queue.map((s) => `${s.id}:${s.durationSeconds}`).join('|'), [queue]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [queueKey, enabled]);

  useEffect(() => {
    if (!enabled || queue.length <= 1) return;
    const current = queue[Math.min(index, queue.length - 1)];
    const ms = Math.max(3, Math.min(300, Number(current?.durationSeconds) || 10)) * 1000;
    const t = window.setTimeout(() => {
      setIndex((i) => (i + 1) % queue.length);
    }, ms);
    return () => window.clearTimeout(t);
  }, [enabled, queue, index, queueKey]);

  if (!enabled || queue.length === 0) {
    return { current: null, index: 0, queueLength: 0 };
  }

  const safeIndex = ((index % queue.length) + queue.length) % queue.length;
  return {
    current: queue[safeIndex] ?? null,
    index: safeIndex,
    queueLength: queue.length,
  };
}
