import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
import { mediaOverlayCloseBtn, mediaOverlayHintText, mediaOverlayNavBtn } from './ui/iosModalStyles';

const SWIPE_THRESHOLD = 44;

export type LightboxProps = {
  src?: string;
  images?: string[];
  initialIndex?: number;
  onClose: () => void;
};

/** Visualização em tela cheia com zoom, pinch e navegação (Pátio, Laboratório, Radar de Qualidade). */
export function Lightbox({ src: singleSrc, images: imagesProp, initialIndex = 0, onClose }: LightboxProps) {
  const images = imagesProp && imagesProp.length > 0 ? imagesProp : singleSrc ? [singleSrc] : [];
  const [currentIndex, setCurrentIndex] = useState(
    initialIndex >= 0 && initialIndex < images.length ? initialIndex : 0
  );
  const src = images[currentIndex] ?? singleSrc ?? '';

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isMousePanning, setIsMousePanning] = useState(false);
  const preloadedImagesRef = useRef<Set<string>>(new Set());

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastDistRef = useRef<number | null>(null);
  const dragStartXRef = useRef<number>(0);
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const mousePanRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  scaleRef.current = scale;
  translateRef.current = translate;

  const hasMultiple = images.length > 1;
  const canGoPrev = hasMultiple && currentIndex > 0;
  const canGoNext = hasMultiple && currentIndex < images.length - 1;

  const preloadImage = useCallback((url?: string) => {
    if (!url || preloadedImagesRef.current.has(url)) return;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    preloadedImagesRef.current.add(url);
  }, []);

  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
    setCurrentIndex(initialIndex >= 0 && initialIndex < images.length ? initialIndex : 0);
  }, [initialIndex, images.length]);

  useEffect(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    if (!hasMultiple) {
      preloadImage(src);
      return;
    }
    preloadImage(images[currentIndex]);
    preloadImage(images[currentIndex - 1]);
    preloadImage(images[currentIndex + 1]);
    preloadImage(images[currentIndex - 2]);
    preloadImage(images[currentIndex + 2]);
  }, [hasMultiple, images, currentIndex, src, preloadImage]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      if (images.length <= 1) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentIndex((i) => (i > 0 ? i - 1 : i));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentIndex((i) => (i < images.length - 1 ? i + 1 : i));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [images.length, onClose]);

  const goPrev = () => {
    if (canGoPrev) setCurrentIndex((i) => i - 1);
  };
  const goNext = () => {
    if (canGoNext) setCurrentIndex((i) => i + 1);
  };

  const getFocalOffset = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clientX - (rect.left + rect.width / 2),
      y: clientY - (rect.top + rect.height / 2),
    };
  };

  const applyWheelZoom = useCallback((clientX: number, clientY: number, deltaY: number) => {
    const oldScale = scaleRef.current;
    const oldTx = translateRef.current.x;
    const oldTy = translateRef.current.y;
    const factor = deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.min(5, Math.max(1, oldScale * factor));
    if (newScale <= 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
      return;
    }
    const { x: fx, y: fy } = getFocalOffset(clientX, clientY);
    const zoomRatio = newScale / oldScale;
    setScale(newScale);
    setTranslate({
      x: fx * (1 - zoomRatio) + oldTx * zoomRatio,
      y: fy * (1 - zoomRatio) + oldTy * zoomRatio,
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyWheelZoom(e.clientX, e.clientY, e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyWheelZoom]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragStartXRef.current = e.touches[0].clientX;
      if (scaleRef.current > 1) {
        setIsDragging(true);
      } else if (hasMultiple) {
        setIsSwiping(true);
        setTranslate({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && lastTouchRef.current) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      if (scaleRef.current > 1) {
        setIsDragging(true);
        setTranslate((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      } else if (hasMultiple && Math.abs(dx) > Math.abs(dy)) {
        const deltaX = e.touches[0].clientX - dragStartXRef.current;
        setIsSwiping(true);
        setTranslate({ x: deltaX, y: 0 });
      }
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else if (e.touches.length === 2 && lastDistRef.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      const ratio = dist / lastDistRef.current;
      setScale((s) => {
        const next = Math.min(Math.max(1, s * ratio), 5);
        if (next <= 1) setTranslate({ x: 0, y: 0 });
        return next;
      });
      lastDistRef.current = dist;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const endTouch = e.changedTouches[0];
    const endX = endTouch?.clientX ?? lastTouchRef.current?.x ?? dragStartXRef.current;
    if (scaleRef.current > 1) {
      setIsDragging(false);
    } else {
      if (hasMultiple) {
        const deltaX = endX - dragStartXRef.current;
        if (deltaX > SWIPE_THRESHOLD && canGoPrev) goPrev();
        else if (deltaX < -SWIPE_THRESHOLD && canGoNext) goNext();
      }
      setTranslate({ x: 0, y: 0 });
    }
    lastTouchRef.current = null;
    lastDistRef.current = null;
    setIsSwiping(false);
    if (scaleRef.current < 1) setScale(1);
  };

  const stopMousePanning = useCallback(() => {
    mousePanRef.current = null;
    setIsMousePanning(false);
    setIsDragging(false);
    lastTouchRef.current = null;
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (e.button !== 0 || scaleRef.current <= 1) return;
    e.preventDefault();
    e.stopPropagation();
    mousePanRef.current = { x: e.clientX, y: e.clientY };
    setIsMousePanning(true);
    setIsDragging(true);
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || !mousePanRef.current || scaleRef.current <= 1) return;
    const dx = e.clientX - mousePanRef.current.x;
    const dy = e.clientY - mousePanRef.current.y;
    mousePanRef.current = { x: e.clientX, y: e.clientY };
    setTranslate((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (!mousePanRef.current) return;
    stopMousePanning();
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handleDoubleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (scaleRef.current > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  if (!src) return null;

  return (
    <ModalPortal>
      <div
        data-media-overlay
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-modal-backdrop overflow-hidden overscroll-contain"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={
          hasMultiple ? 'Galeria de fotos — use as setas ou deslize para trocar' : 'Visualização de foto'
        }
      >
        <button
          type="button"
          onClick={onClose}
          className={mediaOverlayCloseBtn}
          aria-label="Fechar"
        >
          <X className="h-6 w-6" />
        </button>

        {hasMultiple && canGoPrev ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className={`absolute left-2 top-1/2 -translate-y-1/2 md:left-6 ${mediaOverlayNavBtn}`}
            aria-label="Foto anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}
        {hasMultiple && canGoNext ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 md:right-14 ${mediaOverlayNavBtn}`}
            aria-label="Próxima foto"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}

        <div
          ref={containerRef}
          className={`flex h-full w-full touch-none items-center justify-center ${
            scale > 1 ? (isMousePanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
          }`}
          onClick={(e) => e.stopPropagation()}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onTouchCancel={handleTouchEnd}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onLostPointerCapture={stopMousePanning}
          onDoubleClick={handleDoubleTap}
        >
          <img
            ref={imageRef}
            src={src}
            alt="Preview"
            decoding="async"
            loading="eager"
            onDragStart={(e) => e.preventDefault()}
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transition: isDragging || isSwiping || isMousePanning || scale > 1 ? 'none' : 'transform 0.2s ease-out',
            }}
            className="max-h-full max-w-full select-none object-contain pointer-events-none"
            draggable={false}
          />
        </div>

        {hasMultiple ? (
          <>
            <div className="pointer-events-none absolute bottom-10 left-1/2 flex -translate-x-1/2 gap-1.5">
              {images.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    i === currentIndex ? 'bg-brand-yellow' : 'bg-zinc-500/60'
                  }`}
                />
              ))}
            </div>
            <p className={`pointer-events-none absolute bottom-4 left-1/2 max-w-[min(90vw,20rem)] -translate-x-1/2 text-center text-[11px] font-medium leading-snug ${mediaOverlayHintText}`}>
              Scroll para zoom · arraste com zoom · setas ← → para trocar
            </p>
          </>
        ) : (
          <div className={`pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 rounded-full border border-white/20 bg-black/50 px-4 py-2 text-xs ${mediaOverlayHintText} backdrop-blur-md`}>
            Duplo clique ou scroll para zoom · arraste para mover
          </div>
        )}
      </div>
    </ModalPortal>
  );
}
