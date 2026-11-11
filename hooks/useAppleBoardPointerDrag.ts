import { useCallback, useEffect, useRef, useState } from 'react';

/** Projeção de momentum (Apple Designing Fluid Interfaces). */
export function projectMomentum(initialVelocityPxPerSec: number, decelerationRate = 0.998): number {
  return ((initialVelocityPxPerSec / 1000) * decelerationRate) / (1 - decelerationRate);
}

type VelocitySample = { x: number; y: number; t: number };

export type AppleBoardDragState = {
  cardId: string;
  originListId: string;
  overListId: string | null;
  ghost: {
    left: number;
    top: number;
    width: number;
    height: number;
    html: string;
  } | null;
};

type StartArgs = {
  cardId: string;
  originListId: string;
  cardEl: HTMLElement;
  clientX: number;
  clientY: number;
  pointerId: number;
};

type Options = {
  enabled: boolean;
  /** Seletor dos containers de coluna que têm data-stage-id */
  columnSelector?: string;
  onHoverList?: (listId: string | null) => void;
  onDrop: (cardId: string, targetListId: string) => void;
  onCancel?: () => void;
};

const HISTERESIS_PX = 10;

/**
 * Drag 1:1 com pointer capture para cartões de quadro (Pátio / Lab).
 * Substitui HTML5 DnD: ghost segue o dedo, drop por elementFromPoint, settle com mola CSS.
 */
export function useAppleBoardPointerDrag(options: Options) {
  const { enabled, columnSelector = '[data-stage-id]', onHoverList, onDrop, onCancel } = options;
  const [drag, setDrag] = useState<AppleBoardDragState | null>(null);
  const dragRef = useRef<AppleBoardDragState | null>(null);
  const grabOffsetRef = useRef({ x: 0, y: 0 });
  const samplesRef = useRef<VelocitySample[]>([]);
  const pointerIdRef = useRef<number | null>(null);
  const startedRef = useRef(false);
  const pendingRef = useRef<StartArgs | null>(null);
  const cardElRef = useRef<HTMLElement | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearHover = useCallback(() => {
    optionsRef.current.onHoverList?.(null);
  }, []);

  const findListIdAtPoint = useCallback(
    (x: number, y: number): string | null => {
      const els = document.elementsFromPoint(x, y);
      for (const el of els) {
        if (!(el instanceof Element)) continue;
        const col = el.closest(columnSelector);
        if (col instanceof HTMLElement) {
          const id = col.dataset.stageId || col.getAttribute('data-stage-id');
          if (id) return id;
        }
      }
      return null;
    },
    [columnSelector]
  );

  const endDrag = useCallback(
    (clientX: number, clientY: number, commit: boolean) => {
      const current = dragRef.current;
      if (!current) return;

      const samples = samplesRef.current;
      let vx = 0;
      let vy = 0;
      if (samples.length >= 2) {
        const a = samples[samples.length - 2];
        const b = samples[samples.length - 1];
        const dt = Math.max(1, b.t - a.t);
        vx = ((b.x - a.x) / dt) * 1000;
        vy = ((b.y - a.y) / dt) * 1000;
      }

      const projectedX = clientX + projectMomentum(vx);
      const projectedY = clientY + projectMomentum(vy);
      const targetList = commit ? findListIdAtPoint(projectedX, projectedY) : null;

      const cardEl = cardElRef.current;
      if (cardEl) {
        cardEl.style.opacity = '';
        cardEl.style.pointerEvents = '';
      }

      if (commit && targetList && targetList !== current.originListId) {
        optionsRef.current.onDrop(current.cardId, targetList);
      } else {
        optionsRef.current.onCancel?.();
      }

      dragRef.current = null;
      setDrag(null);
      clearHover();
      startedRef.current = false;
      pendingRef.current = null;
      pointerIdRef.current = null;
      samplesRef.current = [];
      cardElRef.current = null;
    },
    [clearHover, findListIdAtPoint]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const pending = pendingRef.current;
      if (pending && !startedRef.current) {
        const dx = e.clientX - pending.clientX;
        const dy = e.clientY - pending.clientY;
        if (Math.hypot(dx, dy) < HISTERESIS_PX) return;

        const rect = pending.cardEl.getBoundingClientRect();
        grabOffsetRef.current = {
          x: pending.clientX - rect.left,
          y: pending.clientY - rect.top,
        };
        const html = pending.cardEl.cloneNode(true) as HTMLElement;
        html.querySelectorAll('button, a, input, textarea, select').forEach((n) => {
          n.setAttribute('tabindex', '-1');
        });
        const ghostHtml = html.innerHTML;
        const next: AppleBoardDragState = {
          cardId: pending.cardId,
          originListId: pending.originListId,
          overListId: pending.originListId,
          ghost: {
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            html: ghostHtml,
          },
        };
        dragRef.current = next;
        setDrag(next);
        startedRef.current = true;
        pending.cardEl.style.opacity = '0.35';
        cardElRef.current = pending.cardEl;
        try {
          pending.cardEl.setPointerCapture(pending.pointerId);
        } catch {
          /* ignore */
        }
        optionsRef.current.onHoverList?.(pending.originListId);
      }

      const current = dragRef.current;
      if (!current?.ghost) return;

      const left = e.clientX - grabOffsetRef.current.x;
      const top = e.clientY - grabOffsetRef.current.y;
      const over = findListIdAtPoint(e.clientX, e.clientY);
      const next = {
        ...current,
        overListId: over,
        ghost: { ...current.ghost, left, top },
      };
      dragRef.current = next;
      setDrag(next);
      optionsRef.current.onHoverList?.(over);

      const now = performance.now();
      samplesRef.current.push({ x: e.clientX, y: e.clientY, t: now });
      if (samplesRef.current.length > 5) samplesRef.current.shift();
    },
    [findListIdAtPoint]
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
      if (!startedRef.current) {
        pendingRef.current = null;
        pointerIdRef.current = null;
        return;
      }
      endDrag(e.clientX, e.clientY, true);
    },
    [endDrag]
  );

  const onPointerCancel = useCallback(
    (e: PointerEvent) => {
      if (pointerIdRef.current != null && e.pointerId !== pointerIdRef.current) return;
      endDrag(e.clientX, e.clientY, false);
    },
    [endDrag]
  );

  useEffect(() => {
    if (!enabled) return;
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [enabled, onPointerMove, onPointerUp, onPointerCancel]);

  const beginCardPointerDown = useCallback(
    (
      e: React.PointerEvent,
      args: { cardId: string; originListId: string }
    ) => {
      if (!enabled) return;
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (
        target?.closest?.(
          'button, a, input, textarea, select, [role="button"], [contenteditable="true"]'
        )
      ) {
        return;
      }
      const cardEl = (e.currentTarget as HTMLElement).closest(
        '[data-apple-board-card]'
      ) as HTMLElement | null;
      if (!cardEl) return;

      pointerIdRef.current = e.pointerId;
      startedRef.current = false;
      pendingRef.current = {
        cardId: args.cardId,
        originListId: args.originListId,
        cardEl,
        clientX: e.clientX,
        clientY: e.clientY,
        pointerId: e.pointerId,
      };
      samplesRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
    },
    [enabled]
  );

  return {
    drag,
    beginCardPointerDown,
    isDraggingCard: (id: string) => drag?.cardId === id,
    overListId: drag?.overListId ?? null,
  };
}
