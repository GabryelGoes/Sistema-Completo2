import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Long press para entrar no modo de reorganização (faixa iOS ~500–700 ms). */
export const IOS_HOME_LONG_PRESS_MS = 560;
const TAP_MOVE_CANCEL_PX = 10;
const REORDER_MIN_INTERVAL_MS = 48;
const FLIP_MS = 300;
const FLIP_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

export type IosHomeDragGhost = {
  id: string;
  width: number;
  height: number;
  label: string;
};

type PointerSession = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
};

function moveIdInOrder<T extends string>(order: T[], sourceId: T, targetId: T): T[] | null {
  if (sourceId === targetId) return null;
  const next = [...order];
  const from = next.indexOf(sourceId);
  const to = next.indexOf(targetId);
  if (from < 0 || to < 0) return null;
  next.splice(from, 1);
  next.splice(to, 0, sourceId);
  return next;
}

/**
 * Reorganização estilo Home Screen iOS/iPadOS:
 * long-press → edit mode + lift, arrasto com translate3d (baixa latência),
 * demais ícones abrem espaço com FLIP, snap ao soltar.
 */
export function useIosHomeAppReorder<T extends string>(opts: {
  order: T[];
  onReorder: (next: T[]) => void;
  /** Toque curto (sem long-press / sem arrasto) — abrir o app. */
  onActivate: (id: T) => void;
}) {
  const { order, onReorder, onActivate } = opts;
  const orderRef = useRef(order);
  orderRef.current = order;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const [isEditMode, setIsEditMode] = useState(false);
  const [draggingId, setDraggingId] = useState<T | null>(null);
  const [ghostMeta, setGhostMeta] = useState<IosHomeDragGhost | null>(null);

  const gridRef = useRef<HTMLDivElement | null>(null);
  const ghostElRef = useRef<HTMLDivElement | null>(null);
  const tileElsRef = useRef(new Map<string, HTMLElement>());
  const flipFromRef = useRef<Map<string, DOMRect> | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const dragOriginRef = useRef({ x: 0, y: 0 });
  const lastPointerRef = useRef({ x: 0, y: 0 });
  const lastReorderAtRef = useRef(0);
  const lastTargetRef = useRef<T | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const sessionRef = useRef<PointerSession | null>(null);
  const draggingIdRef = useRef<T | null>(null);
  const editModeRef = useRef(false);
  const reorderRafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);

  draggingIdRef.current = draggingId;
  editModeRef.current = isEditMode;

  const setGhostTransform = useCallback((x: number, y: number) => {
    const el = ghostElRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  useLayoutEffect(() => {
    if (!ghostMeta) return;
    setGhostTransform(dragOriginRef.current.x, dragOriginRef.current.y);
  }, [ghostMeta, setGhostTransform]);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const captureFlipFrom = useCallback(() => {
    const map = new Map<string, DOMRect>();
    tileElsRef.current.forEach((el, id) => {
      map.set(id, el.getBoundingClientRect());
    });
    flipFromRef.current = map;
  }, []);

  const registerTileEl = useCallback((id: string, el: HTMLElement | null) => {
    if (el) tileElsRef.current.set(id, el);
    else tileElsRef.current.delete(id);
  }, []);

  useLayoutEffect(() => {
    const from = flipFromRef.current;
    if (!from) return;
    flipFromRef.current = null;
    const dragId = draggingIdRef.current;

    tileElsRef.current.forEach((el, id) => {
      if (id === dragId) return;
      const prev = from.get(id);
      if (!prev) return;
      const next = el.getBoundingClientRect();
      const dx = prev.left - next.left;
      const dy = prev.top - next.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      el.style.transition = 'none';
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      // Force reflow then animate to rest.
      void el.offsetWidth;
      el.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASING}`;
      el.style.transform = 'translate3d(0,0,0)';
    });
  }, [order, draggingId]);

  const endDrag = useCallback(() => {
    clearLongPress();
    if (reorderRafRef.current != null) {
      cancelAnimationFrame(reorderRafRef.current);
      reorderRafRef.current = null;
    }
    pendingPointerRef.current = null;
    lastTargetRef.current = null;
    setDraggingId(null);
    setGhostMeta(null);
    draggingIdRef.current = null;
    // Clear residual transforms after snap settles.
    window.setTimeout(() => {
      tileElsRef.current.forEach((el) => {
        el.style.transition = '';
        el.style.transform = '';
      });
    }, FLIP_MS + 40);
  }, [clearLongPress]);

  const finishEditMode = useCallback(() => {
    endDrag();
    setIsEditMode(false);
    editModeRef.current = false;
  }, [endDrag]);

  const beginDrag = useCallback(
    (id: T, rect: DOMRect, clientX: number, clientY: number, label: string) => {
      longPressFiredRef.current = true;
      editModeRef.current = true;
      setIsEditMode(true);
      draggingIdRef.current = id;
      setDraggingId(id);
      dragOffsetRef.current = { x: clientX - rect.left, y: clientY - rect.top };
      dragOriginRef.current = { x: rect.left, y: rect.top };
      lastPointerRef.current = { x: clientX, y: clientY };
      lastTargetRef.current = null;
      lastReorderAtRef.current = 0;
      setGhostMeta({ id, width: rect.width, height: rect.height, label });
    },
    []
  );

  const tryReorderAtPoint = useCallback(
    (clientX: number, clientY: number) => {
      const dragId = draggingIdRef.current;
      const grid = gridRef.current;
      if (!dragId || !grid) return;

      const now = performance.now();
      if (now - lastReorderAtRef.current < REORDER_MIN_INTERVAL_MS) return;

      let bestId: T | null = null;
      let bestDist = Number.POSITIVE_INFINITY;
      let nearestId: T | null = null;
      let nearestDist = Number.POSITIVE_INFINITY;

      tileElsRef.current.forEach((el, id) => {
        if (id === dragId) return;
        const rect = el.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const d = (cx - clientX) ** 2 + (cy - clientY) ** 2;
        if (d < nearestDist) {
          nearestDist = d;
          nearestId = id as T;
        }
        // Célula ativa: ponteiro dentro da área (com margem interna leve).
        const padX = rect.width * 0.08;
        const padY = rect.height * 0.08;
        if (
          clientX < rect.left + padX ||
          clientX > rect.right - padX ||
          clientY < rect.top + padY ||
          clientY > rect.bottom - padY
        ) {
          return;
        }
        if (d < bestDist) {
          bestDist = d;
          bestId = id as T;
        }
      });

      // Fora de qualquer célula: permite reordenar pela célula mais próxima
      // só se o ponteiro estiver perto o suficiente (evita thrash fora do grid).
      let targetId = bestId;
      if (!targetId && nearestId != null) {
        const nearEl = tileElsRef.current.get(nearestId);
        if (nearEl) {
          const r = nearEl.getBoundingClientRect();
          const reach = Math.max(r.width, r.height) * 0.65;
          if (Math.sqrt(nearestDist) <= reach) targetId = nearestId;
        }
      }
      if (!targetId || targetId === lastTargetRef.current) return;

      const next = moveIdInOrder(orderRef.current, dragId, targetId);
      if (!next) return;

      captureFlipFrom();
      lastTargetRef.current = targetId;
      lastReorderAtRef.current = now;
      onReorderRef.current(next);
    },
    [captureFlipFrom]
  );

  // Window listeners while dragging — pointermove imediato no ghost; reorder em rAF.
  useEffect(() => {
    if (!draggingId) return;

    const onMove = (event: PointerEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      const x = event.clientX - dragOffsetRef.current.x;
      const y = event.clientY - dragOffsetRef.current.y;
      setGhostTransform(x, y);

      pendingPointerRef.current = { x: event.clientX, y: event.clientY };
      if (reorderRafRef.current != null) return;
      reorderRafRef.current = requestAnimationFrame(() => {
        reorderRafRef.current = null;
        const p = pendingPointerRef.current;
        if (!p) return;
        tryReorderAtPoint(p.x, p.y);
      });
    };

    const onUp = () => {
      // Snap: ghost some; tile real já está na célula correta via order.
      endDrag();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (draggingIdRef.current) event.preventDefault();
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [draggingId, endDrag, setGhostTransform, tryReorderAtPoint]);

  const bindTile = useCallback(
    (id: T, label: string) => {
      const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        longPressFiredRef.current = false;
        clearLongPress();
        const rect = event.currentTarget.getBoundingClientRect();
        sessionRef.current = {
          id,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        };
        lastPointerRef.current = { x: event.clientX, y: event.clientY };

        if (editModeRef.current) {
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            /* ignore */
          }
          beginDrag(id, rect, event.clientX, event.clientY, label);
          return;
        }

        const pointerId = event.pointerId;
        const startX = event.clientX;
        const startY = event.clientY;

        const onEarlyMove = (ev: PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          lastPointerRef.current = { x: ev.clientX, y: ev.clientY };
          const session = sessionRef.current;
          if (!session || session.moved) return;
          if (
            Math.abs(ev.clientX - startX) > TAP_MOVE_CANCEL_PX ||
            Math.abs(ev.clientY - startY) > TAP_MOVE_CANCEL_PX
          ) {
            session.moved = true;
            clearLongPress();
          }
        };

        window.addEventListener('pointermove', onEarlyMove, { passive: true });
        const cleanupEarly = () => {
          window.removeEventListener('pointermove', onEarlyMove);
        };
        window.addEventListener('pointerup', cleanupEarly, { once: true });
        window.addEventListener('pointercancel', cleanupEarly, { once: true });

        longPressTimerRef.current = window.setTimeout(() => {
          cleanupEarly();
          const session = sessionRef.current;
          if (!session || session.moved || session.id !== id) return;
          try {
            navigator.vibrate?.(12);
          } catch {
            /* ignore */
          }
          const px = lastPointerRef.current.x || startX;
          const py = lastPointerRef.current.y || startY;
          beginDrag(id, rect, px, py, label);
        }, IOS_HOME_LONG_PRESS_MS);
      };

      const onPointerUp = () => {
        clearLongPress();
        const session = sessionRef.current;
        const shouldOpen =
          !editModeRef.current &&
          !longPressFiredRef.current &&
          !draggingIdRef.current &&
          session?.id === id &&
          !session.moved;

        if (shouldOpen) {
          onActivateRef.current(id);
        }
        sessionRef.current = null;
        // Se long-press acabou de disparar, o window pointerup fecha o drag.
        longPressFiredRef.current = false;
      };

      const onPointerCancel = () => {
        clearLongPress();
        sessionRef.current = null;
        longPressFiredRef.current = false;
        if (!draggingIdRef.current) endDrag();
      };

      const onContextMenu = (event: React.MouseEvent) => {
        event.preventDefault();
        const el = tileElsRef.current.get(id);
        if (!el) {
          setIsEditMode(true);
          editModeRef.current = true;
          return;
        }
        const rect = el.getBoundingClientRect();
        beginDrag(id, rect, rect.left + rect.width / 2, rect.top + rect.height / 2, label);
      };

      return {
        ref: (el: HTMLButtonElement | null) => registerTileEl(id, el),
        onPointerDown,
        onPointerUp,
        onPointerCancel,
        onContextMenu,
        'data-quick-app-id': id,
      } as const;
    },
    [beginDrag, clearLongPress, endDrag, registerTileEl]
  );

  return {
    isEditMode,
    draggingId,
    ghostMeta,
    gridRef,
    ghostElRef,
    bindTile,
    finishEditMode,
    setIsEditMode,
  };
}
