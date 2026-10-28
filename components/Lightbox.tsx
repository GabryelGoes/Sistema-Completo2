import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { ModalPortal } from './ui/ModalPortal';
import {
  mediaOverlayIconBtn,
  mediaOverlayNavBtn,
} from './ui/iosModalStyles';

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
  /** Controles só após clique/toque na foto; pinça não revela. */
  const [showChrome, setShowChrome] = useState(false);
  const preloadedImagesRef = useRef<Set<string>>(new Set());

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastDistRef = useRef<number | null>(null);
  const dragStartXRef = useRef<number>(0);
  const tapOriginRef = useRef<{ x: number; y: number } | null>(null);
  const didPinchRef = useRef(false);
  const didPanOrSwipeRef = useRef(false);
  const lastTouchToggleAtRef = useRef(0);
  const singleClickTimerRef = useRef<number | null>(null);
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
    setShowChrome(false);
  }, [src]);

  useEffect(() => {
    return () => {
      if (singleClickTimerRef.current != null) {
        window.clearTimeout(singleClickTimerRef.current);
      }
    };
  }, []);

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
    if (!src) return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      applyWheelZoom(e.clientX, e.clientY, e.deltaY);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyWheelZoom, src]);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      dragStartXRef.current = e.touches[0].clientX;
      tapOriginRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      didPinchRef.current = false;
      didPanOrSwipeRef.current = false;
      if (scaleRef.current > 1) {
        setIsDragging(true);
      } else if (hasMultiple) {
        setIsSwiping(true);
        setTranslate({ x: 0, y: 0 });
      }
    } else if (e.touches.length === 2) {
      didPinchRef.current = true;
      didPanOrSwipeRef.current = true;
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      lastDistRef.current = dist;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastDistRef.current) {
      didPinchRef.current = true;
      didPanOrSwipeRef.current = true;
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
      return;
    }

    if (e.touches.length === 1 && lastTouchRef.current) {
      const dx = e.touches[0].clientX - lastTouchRef.current.x;
      const dy = e.touches[0].clientY - lastTouchRef.current.y;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
        didPanOrSwipeRef.current = true;
      }
      if (scaleRef.current > 1) {
        setIsDragging(true);
        setTranslate((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
      } else if (hasMultiple && Math.abs(dx) > Math.abs(dy)) {
        const deltaX = e.touches[0].clientX - dragStartXRef.current;
        setIsSwiping(true);
        setTranslate({ x: deltaX, y: 0 });
      }
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      lastDistRef.current = null;
      setIsDragging(scaleRef.current > 1);
      setIsSwiping(false);
      return;
    }

    if (e.touches.length > 1) return;

    const endTouch = e.changedTouches[0];
    const endX = endTouch?.clientX ?? lastTouchRef.current?.x ?? dragStartXRef.current;
    const endY = endTouch?.clientY ?? lastTouchRef.current?.y ?? 0;
    const origin = tapOriginRef.current;
    const tapTravel =
      origin != null
        ? Math.hypot(endX - origin.x, endY - origin.y)
        : Math.abs(endX - dragStartXRef.current);

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

    if (!didPinchRef.current && !didPanOrSwipeRef.current && tapTravel < 12) {
      lastTouchToggleAtRef.current = Date.now();
      setShowChrome((v) => !v);
    }

    lastTouchRef.current = null;
    lastDistRef.current = null;
    tapOriginRef.current = null;
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
    if (singleClickTimerRef.current != null) {
      window.clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    if (scaleRef.current > 1) {
      setScale(1);
      setTranslate({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  const handlePhotoSurfaceClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.detail > 1) return;
    if (Date.now() - lastTouchToggleAtRef.current < 450) return;
    if (singleClickTimerRef.current != null) {
      window.clearTimeout(singleClickTimerRef.current);
    }
    singleClickTimerRef.current = window.setTimeout(() => {
      singleClickTimerRef.current = null;
      setShowChrome((v) => !v);
    }, 220);
  };

  if (!src) return null;

  const chromeBtn = `${mediaOverlayIconBtn} !h-8 !w-8`;
  const chromeNavBtn = `${mediaOverlayNavBtn} !h-9 !w-9`;

  return (
    <ModalPortal>
      <div
        data-media-overlay
        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/95 backdrop-blur-xl animate-modal-backdrop overflow-hidden overscroll-contain"
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={hasMultiple ? 'Galeria de fotos — toque para controles' : 'Visualização de foto'}
      >
        {showChrome ? (
          <div className="absolute top-[max(1rem,env(safe-area-inset-top))] right-[max(1rem,env(safe-area-inset-right))] z-50 flex items-center gap-1.5">
            <button type="button" onClick={onClose} className={chromeBtn} aria-label="Fechar">
              <X className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        ) : null}

        {showChrome && hasMultiple && canGoPrev ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            className={`absolute left-2 top-1/2 -translate-y-1/2 md:left-6 ${chromeNavBtn}`}
            aria-label="Foto anterior"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        ) : null}
        {showChrome && hasMultiple && canGoNext ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            className={`absolute right-2 top-1/2 -translate-y-1/2 md:right-10 ${chromeNavBtn}`}
            aria-label="Próxima foto"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}

        <div
          ref={containerRef}
          className={`flex h-full w-full touch-none items-center justify-center ${
            scale > 1 ? (isMousePanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-zoom-in'
          }`}
          onClick={handlePhotoSurfaceClick}
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
            crossOrigin="anonymous"
            decoding="async"
            loading="eager"
            onDragStart={(e) => {
              if (scaleRef.current > 1) e.preventDefault();
            }}
            style={{
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transition: isDragging || isSwiping || isMousePanning || scale > 1 ? 'none' : 'transform 0.2s ease-out',
            }}
            className="max-h-full max-w-full object-contain"
            draggable={scale <= 1}
          />
        </div>

        {showChrome && hasMultiple ? (
          <div className="pointer-events-none absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-1.5">
            {images.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  i === currentIndex ? 'bg-brand-yellow' : 'bg-zinc-500/60'
                }`}
              />
            ))}
          </div>
        ) : null}
      </div>
    </ModalPortal>
  );
}
