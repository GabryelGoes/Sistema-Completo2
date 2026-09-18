import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Long press para entrar no modo de reorganização (faixa iOS ~500–700 ms). */
export const IOS_HOME_LONG_PRESS_MS = 560;
const TAP_MOVE_CANCEL_PX = 10;
const REORDER_MIN_INTERVAL_MS = 32;
const FLIP_MS = 280;
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

type GridMetrics = {
  left: number;
  top: number;
  width: number;
  height: number;
  cols: number;
  gapX: number;
  gapY: number;
  cellW: number;
  cellH: number;
};

/**
 * Move o item de `from` para o índice `to` (após remoção).
 * Única fonte de verdade: a lista ordenada.
 */
function moveIndexInOrder<T>(order: T[], from: number, to: number): T[] | null {
  if (from < 0 || from >= order.length) return null;
  const clampedTo = Math.max(0, Math.min(order.length - 1, to));
  if (from === clampedTo) return null;
  const next = [...order];
  const [item] = next.splice(from, 1);
  next.splice(clampedTo, 0, item);
  return next;
}

function readGridMetrics(grid: HTMLElement, sampleTile: HTMLElement | null): GridMetrics | null {
  const rect = grid.getBoundingClientRect();
  if (rect.width < 8 || rect.height < 8) return null;

  const style = window.getComputedStyle(grid);
  const cols = style.gridTemplateColumns
    .split(/\s+/)
    .filter((part) => part && part !== 'none').length;
  if (cols < 1) return null;

  const gapX = Number.parseFloat(style.columnGap || style.gap || '0') || 0;
  const gapY = Number.parseFloat(style.rowGap || style.gap || '0') || 0;

  let cellW = (rect.width - gapX * Math.max(0, cols - 1)) / cols;
  let cellH = cellW;

  if (sampleTile) {
    const tr = sampleTile.getBoundingClientRect();
    // Preferir altura real da célula (tiles com conteúdo); largura lógica = 1 coluna.
    if (tr.height > 8) cellH = tr.height;
    if (tr.width > 8) {
      // Se o sample for wide (2 cols), normalizar para 1 coluna.
      const spanGuess = Math.max(1, Math.round((tr.width + gapX) / (cellW + gapX)));
      if (spanGuess === 1) cellW = tr.width;
    }
  }

  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    cols,
    gapX,
    gapY,
    cellW,
    cellH,
  };
}

/**
 * Índice lógico (0..count-1) sob o ponteiro, calculado pela geometria do grid —
 * não por hover/dragenter em elementos individuais.
 *
 * Itens "wide" (col-span-2) ocupam 2 colunas no fluxo CSS; simulamos o packing
 * na mesma ordem da lista para mapear (col,row) → índice.
 */
function pointerToOrderIndex(
  clientX: number,
  clientY: number,
  metrics: GridMetrics,
  order: string[],
  spanOf: (id: string) => number
): number {
  const { left, top, cols, gapX, gapY, cellW, cellH } = metrics;
  const count = order.length;
  if (count === 0) return 0;

  // Empacota spans como o CSS Grid (auto-placement row-major).
  const slots: Array<{ index: number; col: number; row: number; span: number }> = [];
  let col = 0;
  let row = 0;
  for (let i = 0; i < count; i++) {
    const span = Math.min(cols, Math.max(1, spanOf(order[i]!)));
    if (col + span > cols) {
      col = 0;
      row += 1;
    }
    slots.push({ index: i, col, row, span });
    col += span;
    if (col >= cols) {
      col = 0;
      row += 1;
    }
  }

  const maxRow = slots.reduce((m, s) => Math.max(m, s.row), 0);

  // Coluna/linha contínuas a partir do ponteiro (clamp no grid).
  const relX = clientX - left;
  const relY = clientY - top;
  const strideX = cellW + gapX;
  const strideY = cellH + gapY;
  const pointerCol = Math.max(0, Math.min(cols - 1, Math.floor(relX / Math.max(1, strideX))));
  const pointerRow = Math.max(0, Math.min(maxRow, Math.floor(relY / Math.max(1, strideY))));

  // Célula sob o ponteiro: menor distância ao centro da área ocupada pelo item.
  let bestIndex = slots[slots.length - 1]!.index;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const slot of slots) {
    const x0 = slot.col * strideX;
    const y0 = slot.row * strideY;
    const w = slot.span * cellW + (slot.span - 1) * gapX;
    const h = cellH;
    const cx = x0 + w / 2;
    const cy = y0 + h / 2;

    // Dentro da célula (com pequena folga) → escolha imediata pela col/row.
    const inside =
      relX >= x0 - gapX * 0.35 &&
      relX <= x0 + w + gapX * 0.35 &&
      relY >= y0 - gapY * 0.35 &&
      relY <= y0 + h + gapY * 0.35;

    if (inside && slot.col <= pointerCol && pointerCol < slot.col + slot.span && slot.row === pointerRow) {
      return slot.index;
    }

    const d = (cx - relX) ** 2 + (cy - relY) ** 2;
    if (d < bestDist) {
      bestDist = d;
      bestIndex = slot.index;
    }
  }

  // Se o ponteiro está em uma linha/coluna além do último item, ancora no fim.
  if (pointerRow > maxRow || (pointerRow === maxRow && pointerCol >= cols - 1 && relX > metrics.width * 0.85)) {
    return count - 1;
  }

  return bestIndex;
}

/**
 * Reorganização estilo Home Screen iOS/iPadOS:
 * long-press → edit mode + lift, arrasto com translate3d (baixa latência),
 * demais ícones abrem espaço com FLIP, índice calculado pela geometria do grid.
 */
export function useIosHomeAppReorder<T extends string>(opts: {
  order: T[];
  onReorder: (next: T[]) => void;
  /** Toque curto (sem long-press / sem arrasto) — abrir o app. */
  onActivate: (id: T) => void;
  /** Span de colunas CSS (1 = normal, 2 = wide). Default 1. */
  getItemSpan?: (id: T) => number;
}) {
  const { order, onReorder, onActivate, getItemSpan } = opts;
  const orderRef = useRef(order);
  orderRef.current = order;
  const onReorderRef = useRef(onReorder);
  onReorderRef.current = onReorder;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;
  const getItemSpanRef = useRef(getItemSpan);
  getItemSpanRef.current = getItemSpan;

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
  /** Último índice lógico alvo — NÃO id de ícone (isso causava células “presas”). */
  const lastIndexRef = useRef<number | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const sessionRef = useRef<PointerSession | null>(null);
  const draggingIdRef = useRef<T | null>(null);
  const editModeRef = useRef(false);
  const reorderRafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const captureElRef = useRef<HTMLElement | null>(null);

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

  const releasePointerCapture = useCallback(() => {
    const el = captureElRef.current;
    const pid = activePointerIdRef.current;
    if (el && pid != null) {
      try {
        if (el.hasPointerCapture?.(pid)) el.releasePointerCapture(pid);
      } catch {
        /* ignore */
      }
    }
    captureElRef.current = null;
    activePointerIdRef.current = null;
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
      void el.offsetWidth;
      el.style.transition = `transform ${FLIP_MS}ms ${FLIP_EASING}`;
      el.style.transform = 'translate3d(0,0,0)';
    });
  }, [order, draggingId]);

  const endDrag = useCallback(() => {
    clearLongPress();
    releasePointerCapture();
    if (reorderRafRef.current != null) {
      cancelAnimationFrame(reorderRafRef.current);
      reorderRafRef.current = null;
    }
    pendingPointerRef.current = null;
    lastIndexRef.current = null;
    setDraggingId(null);
    setGhostMeta(null);
    draggingIdRef.current = null;
    window.setTimeout(() => {
      tileElsRef.current.forEach((el) => {
        el.style.transition = '';
        el.style.transform = '';
      });
    }, FLIP_MS + 40);
  }, [clearLongPress, releasePointerCapture]);

  const finishEditMode = useCallback(() => {
    endDrag();
    setIsEditMode(false);
    editModeRef.current = false;
  }, [endDrag]);

  const beginDrag = useCallback(
    (
      id: T,
      rect: DOMRect,
      clientX: number,
      clientY: number,
      label: string,
      pointerId?: number,
      captureEl?: HTMLElement | null
    ) => {
      longPressFiredRef.current = true;
      editModeRef.current = true;
      setIsEditMode(true);
      draggingIdRef.current = id;
      setDraggingId(id);
      dragOffsetRef.current = { x: clientX - rect.left, y: clientY - rect.top };
      dragOriginRef.current = { x: rect.left, y: rect.top };
      lastPointerRef.current = { x: clientX, y: clientY };
      lastIndexRef.current = orderRef.current.indexOf(id);
      lastReorderAtRef.current = 0;
      setGhostMeta({ id, width: rect.width, height: rect.height, label });

      if (pointerId != null && captureEl) {
        try {
          captureEl.setPointerCapture(pointerId);
          activePointerIdRef.current = pointerId;
          captureElRef.current = captureEl;
        } catch {
          /* ignore */
        }
      }
    },
    []
  );

  const tryReorderAtPoint = useCallback((clientX: number, clientY: number) => {
    const dragId = draggingIdRef.current;
    const grid = gridRef.current;
    if (!dragId || !grid) return;

    const now = performance.now();
    if (now - lastReorderAtRef.current < REORDER_MIN_INTERVAL_MS) return;

    const currentOrder = orderRef.current;
    const from = currentOrder.indexOf(dragId);
    if (from < 0) return;

    // Sample: qualquer tile (preferir um não-wide se possível).
    let sample: HTMLElement | null = null;
    for (const id of currentOrder) {
      const el = tileElsRef.current.get(id);
      if (!el) continue;
      const span = getItemSpanRef.current?.(id as T) ?? 1;
      if (span <= 1) {
        sample = el;
        break;
      }
      if (!sample) sample = el;
    }

    const metrics = readGridMetrics(grid, sample);
    if (!metrics) return;

    const spanOf = (id: string) => getItemSpanRef.current?.(id as T) ?? 1;
    const toIndex = pointerToOrderIndex(
      clientX,
      clientY,
      metrics,
      currentOrder as string[],
      spanOf
    );

    if (toIndex === from || toIndex === lastIndexRef.current) return;

    const next = moveIndexInOrder(currentOrder, from, toIndex);
    if (!next) return;

    captureFlipFrom();
    lastIndexRef.current = toIndex;
    lastReorderAtRef.current = now;
    onReorderRef.current(next);
  }, [captureFlipFrom]);

  // Window listeners while dragging — pointermove imediato no ghost; reorder em rAF.
  useEffect(() => {
    if (!draggingId) return;

    const onMove = (event: PointerEvent) => {
      if (
        activePointerIdRef.current != null &&
        event.pointerId !== activePointerIdRef.current
      ) {
        return;
      }
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

    const onUp = (event: PointerEvent) => {
      if (
        activePointerIdRef.current != null &&
        event.pointerId !== activePointerIdRef.current
      ) {
        return;
      }
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
        const target = event.currentTarget;
        const rect = target.getBoundingClientRect();
        sessionRef.current = {
          id,
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          moved: false,
        };
        lastPointerRef.current = { x: event.clientX, y: event.clientY };

        if (editModeRef.current) {
          beginDrag(id, rect, event.clientX, event.clientY, label, event.pointerId, target);
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
          // Capture no próprio tile para o dedo continuar controlando ao passar sobre outros apps.
          const el = tileElsRef.current.get(id) ?? target;
          const liveRect = el.getBoundingClientRect();
          beginDrag(id, liveRect, px, py, label, pointerId, el);
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
