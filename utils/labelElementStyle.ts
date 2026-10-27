/**
 * Opacidade e rotação de elementos de etiqueta.
 * Na térmica (1-bit), opacidade < 100 usa dither Bayer para efeito de marca d'água.
 */

import type { LabelElementDef } from './labelTemplates';

const BAYER_4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
] as const;

export function clampLabelOpacity(v: unknown, fallback = 100): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function clampLabelRotation(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  // Normaliza para −180…180
  let r = ((Math.round(n) % 360) + 360) % 360;
  if (r > 180) r -= 360;
  return r;
}

function applyRotation(
  ctx: CanvasRenderingContext2D,
  elDef: Pick<LabelElementDef, 'x' | 'y' | 'w' | 'h' | 'rotation'>
): void {
  const rotation = clampLabelRotation(elDef.rotation, 0);
  if (Math.abs(rotation) < 0.01) return;
  const cx = elDef.x + elDef.w / 2;
  const cy = elDef.y + elDef.h / 2;
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.translate(-cx, -cy);
}

function ditherOnto(
  dest: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  opacityPct: number
): void {
  const w = src.width;
  const h = src.height;
  const sctx = src.getContext('2d');
  if (!sctx) return;
  const srcData = sctx.getImageData(0, 0, w, h).data;
  const destData = dest.getImageData(0, 0, w, h);
  const out = destData.data;
  const level = (opacityPct / 100) * 16;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = srcData[i + 3]!;
      const lum = 0.299 * srcData[i]! + 0.587 * srcData[i + 1]! + 0.114 * srcData[i + 2]!;
      if (a < 32 || lum >= 200) continue;
      const threshold = BAYER_4[y & 3]![x & 3]!;
      if (threshold < level) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
        out[i + 3] = 255;
      }
    }
  }
  dest.putImageData(destData, 0, 0);
}

/**
 * Executa o desenho do elemento respeitando rotation e opacity.
 * `draw` deve usar as coordenadas absolutas do elemento (x/y do layout).
 */
export function withLabelElementStyle(
  ctx: CanvasRenderingContext2D,
  elDef: Pick<LabelElementDef, 'x' | 'y' | 'w' | 'h' | 'opacity' | 'rotation'>,
  draw: (ctx: CanvasRenderingContext2D) => void
): void {
  const opacity = clampLabelOpacity(elDef.opacity, 100);
  if (opacity <= 0) return;

  const rotation = clampLabelRotation(elDef.rotation, 0);
  const needsDither = opacity < 99.5;

  if (!needsDither) {
    ctx.save();
    applyRotation(ctx, elDef);
    draw(ctx);
    ctx.restore();
    return;
  }

  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const tmp = document.createElement('canvas');
  tmp.width = w;
  tmp.height = h;
  const tctx = tmp.getContext('2d');
  if (!tctx) return;
  tctx.clearRect(0, 0, w, h);
  tctx.save();
  applyRotation(tctx, elDef);
  draw(tctx);
  tctx.restore();
  ditherOnto(ctx, tmp, opacity);
}
