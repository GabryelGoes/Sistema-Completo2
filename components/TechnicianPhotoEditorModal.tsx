import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RotateCw, Loader2, Check } from 'lucide-react';

const PREVIEW_SIZE = 240;
const EXPORT_SIZE = 400;
const MIN_SCALE = 0.3;
const MAX_SCALE = 4;
const WHEEL_ZOOM_STEP = 0.15;

function getTouchDistance(t1: Touch, t2: Touch): number {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
}

interface TechnicianPhotoEditorModalProps {
  isOpen: boolean;
  imageFile: File | null;
  technicianName: string;
  onSave: (blob: Blob) => void;
  onCancel: () => void;
}

export const TechnicianPhotoEditorModal: React.FC<TechnicianPhotoEditorModalProps> = ({
  isOpen,
  imageFile,
  technicianName,
  onSave,
  onCancel,
}) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [saving, setSaving] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ w: number; h: number } | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  const pinchStartRef = useRef<{
    distance: number;
    centerX: number;
    centerY: number;
    scale: number;
    posX: number;
    posY: number;
  } | null>(null);
  const panStartRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const mousePanRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null);
  const stateRef = useRef({ scale, rotation, posX, posY });
  stateRef.current = { scale, rotation, posX, posY };

  useEffect(() => {
    if (!isOpen || !imageFile) {
      setImageSrc(null);
      setNaturalSize(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImageSrc(url);
    setScale(1);
    setRotation(0);
    setPosX(0);
    setPosY(0);
    setImageLoaded(false);
    setNaturalSize(null);
    return () => URL.revokeObjectURL(url);
  }, [isOpen, imageFile]);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!imageSrc) return;
      if (e.touches.length === 2) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const { scale, posX, posY } = stateRef.current;
        pinchStartRef.current = {
          distance: getTouchDistance(t1, t2),
          centerX: (t1.clientX + t2.clientX) / 2,
          centerY: (t1.clientY + t2.clientY) / 2,
          scale,
          posX,
          posY,
        };
        panStartRef.current = null;
      } else if (e.touches.length === 1) {
        const { posX, posY } = stateRef.current;
        panStartRef.current = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
          posX,
          posY,
        };
        pinchStartRef.current = null;
      }
    },
    [imageSrc]
  );

  const handleTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!imageSrc) return;
      if (e.touches.length === 2 && pinchStartRef.current) {
        e.preventDefault();
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const start = pinchStartRef.current;
        const distance = getTouchDistance(t1, t2);
        const centerX = (t1.clientX + t2.clientX) / 2;
        const centerY = (t1.clientY + t2.clientY) / 2;

        const minDist = 5;
        const scaleRatio = start.distance >= minDist && distance >= minDist
          ? distance / start.distance
          : 1;
        const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, start.scale * scaleRatio));
        const newPosX = start.posX + (centerX - start.centerX);
        const newPosY = start.posY + (centerY - start.centerY);

        if (Number.isFinite(newScale) && Number.isFinite(newPosX) && Number.isFinite(newPosY)) {
          setScale(newScale);
          setPosX(Math.max(-200, Math.min(200, newPosX)));
          setPosY(Math.max(-200, Math.min(200, newPosY)));
        }
      } else if (e.touches.length === 1 && panStartRef.current) {
        e.preventDefault();
        const start = panStartRef.current;
        const dx = e.touches[0].clientX - start.x;
        const dy = e.touches[0].clientY - start.y;
        const nextX = start.posX + dx;
        const nextY = start.posY + dy;
        if (Number.isFinite(nextX) && Number.isFinite(nextY)) {
          setPosX(Math.max(-200, Math.min(200, nextX)));
          setPosY(Math.max(-200, Math.min(200, nextY)));
        }
      }
    },
    [imageSrc]
  );

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchStartRef.current = null;
    if (e.touches.length < 1) panStartRef.current = null;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!imageSrc) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
    setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)));
  }, [imageSrc]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!imageSrc || e.button !== 0) return;
      e.preventDefault();
      const { posX, posY } = stateRef.current;
      mousePanRef.current = { x: e.clientX, y: e.clientY, posX, posY };
      const onMove = (ev: MouseEvent) => {
        if (!mousePanRef.current) return;
        const dx = ev.clientX - mousePanRef.current.x;
        const dy = ev.clientY - mousePanRef.current.y;
        setPosX(Math.max(-200, Math.min(200, mousePanRef.current.posX + dx)));
        setPosY(Math.max(-200, Math.min(200, mousePanRef.current.posY + dy)));
      };
      const onUp = () => {
        mousePanRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [imageSrc]
  );

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (el !== e.target && !el.contains(e.target as Node)) return;
      if (e.touches.length === 2 || (e.touches.length === 1 && panStartRef.current)) {
        e.preventDefault();
      }
    };
    const onWheelNative = (e: WheelEvent) => {
      if (el.contains(e.target as Node)) e.preventDefault();
    };
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('wheel', onWheelNative, { passive: false });
    return () => {
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('wheel', onWheelNative);
    };
  }, [isOpen]);

  const handleApply = async () => {
    if (!imageSrc || !imageRef.current?.complete || !imageLoaded) return;
    const img = imageRef.current;
    if (!img?.naturalWidth || !img?.naturalHeight) return;
    setSaving(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = EXPORT_SIZE;
      canvas.height = EXPORT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2d não disponível');

      const angleRad = (rotation * Math.PI) / 180;
      const cx = EXPORT_SIZE / 2;
      const cy = EXPORT_SIZE / 2;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const baseScale = Math.min(EXPORT_SIZE / iw, EXPORT_SIZE / ih);
      const posScale = EXPORT_SIZE / PREVIEW_SIZE;
      const tx = posX * posScale;
      const ty = posY * posScale;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, cx, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();

      ctx.translate(cx, cy);
      ctx.rotate(angleRad);
      ctx.scale(baseScale * scale, baseScale * scale);
      ctx.translate(tx, ty);
      ctx.drawImage(img, -iw / 2, -ih / 2, iw, ih);

      ctx.restore();

      await new Promise<void>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (blob) {
              onSave(blob);
              resolve();
            } else reject(new Error('Falha ao gerar imagem'));
            setSaving(false);
          },
          'image/jpeg',
          0.92
        );
      });
    } catch (e) {
      setSaving(false);
      throw e;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 backdrop-blur-sm p-3 sm:p-4 safe-area-inset">
      <div className="bg-white dark:bg-[#1C1C1E] rounded-2xl border border-zinc-200/60 dark:border-white/10 w-full max-w-md max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-zinc-200/60 dark:border-white/10 shrink-0">
          <h3 className="text-base sm:text-lg font-semibold text-zinc-900 dark:text-white truncate pr-2">
            Ajustar foto — {technicianName}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 rounded-full bg-zinc-200/80 dark:bg-white/10 flex items-center justify-center text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto overflow-x-hidden min-h-0 flex flex-col">
          <p className="text-[11px] sm:text-[12px] text-zinc-500 dark:text-zinc-400 mb-2 text-center">
            Arraste com 1 dedo para posicionar · Pinça com 2 dedos para zoom · Rotação na barra abaixo
          </p>
          <div className="flex justify-center mb-4">
            <div
              ref={previewRef}
              className="rounded-full overflow-hidden bg-zinc-200 dark:bg-zinc-800 shrink-0 relative touch-none select-none cursor-grab active:cursor-grabbing"
              style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onWheel={handleWheel}
            >
              {imageSrc && (
                <div
                  className="absolute inset-0 rounded-full overflow-hidden"
                  style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE }}
                >
                  <img
                    ref={imageRef}
                    src={imageSrc}
                    alt="Preview"
                    className="absolute pointer-events-none select-none"
                    style={(() => {
                      const n = naturalSize;
                      if (!n || !n.w || !n.h) {
                        return {
                          width: PREVIEW_SIZE,
                          height: PREVIEW_SIZE,
                          left: '50%',
                          top: '50%',
                          marginLeft: -PREVIEW_SIZE / 2,
                          marginTop: -PREVIEW_SIZE / 2,
                          transformOrigin: 'center center',
                          transform: `translate(${posX}px, ${posY}px) scale(${scale}) rotate(${rotation}deg)`,
                        };
                      }
                      const fit = PREVIEW_SIZE / Math.max(n.w, n.h);
                      const w = n.w * fit;
                      const h = n.h * fit;
                      return {
                        width: w,
                        height: h,
                        left: '50%',
                        top: '50%',
                        marginLeft: -w / 2,
                        marginTop: -h / 2,
                        transformOrigin: 'center center',
                        transform: `translate(${posX}px, ${posY}px) scale(${scale}) rotate(${rotation}deg)`,
                      };
                    })()}
                    crossOrigin="anonymous"
                    onLoad={() => {
                      const img = imageRef.current;
                      if (img?.naturalWidth && img?.naturalHeight) {
                        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                      }
                      setImageLoaded(true);
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Rotação (zoom e posição só por gestos: 1 dedo = arrastar, 2 dedos = pinça) */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-medium text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
                <RotateCw className="w-4 h-4" />
                Rotação
              </span>
              <span className="text-[13px] text-zinc-500 dark:text-zinc-500 tabular-nums">
                {rotation}°
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRotation((r) => (r - 15 + 360) % 360)}
                className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-white/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300"
              >
                −15°
              </button>
              <input
                type="range"
                min={0}
                max={360}
                step={5}
                value={rotation}
                onChange={(e) => setRotation(parseInt(e.target.value, 10))}
                className="flex-1 h-3 rounded-full appearance-none bg-zinc-200 dark:bg-zinc-700 accent-violet-500"
              />
              <button
                type="button"
                onClick={() => setRotation((r) => (r + 15) % 360)}
                className="w-10 h-10 rounded-xl bg-zinc-200 dark:bg-white/10 flex items-center justify-center text-zinc-700 dark:text-zinc-300"
              >
                +15°
              </button>
            </div>
          </div>

          <div className="flex gap-3 shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl bg-zinc-200 dark:bg-white/10 text-zinc-700 dark:text-zinc-300 font-medium"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={saving || !imageLoaded}
              className="flex-1 py-3 rounded-xl bg-violet-500 hover:bg-violet-600 disabled:opacity-50 text-white font-semibold flex items-center justify-center gap-2"
            >
              {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
              {saving ? 'Aplicando...' : 'Aplicar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

