import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pipette, Sparkles } from 'lucide-react';
import { DEFAULT_ACCENT } from '../utils/appAppearance';

const PRESETS: { hex: string; name: string }[] = [
  { hex: '#F5D00B', name: 'Amarelo clássico' },
  { hex: '#EAB308', name: 'Âmbar' },
  { hex: '#CA8A04', name: 'Ouro' },
  { hex: '#EA580C', name: 'Laranja' },
  { hex: '#DC2626', name: 'Vermelho' },
  { hex: '#2563EB', name: 'Azul' },
  { hex: '#059669', name: 'Esmeralda' },
  { hex: '#7C3AED', name: 'Violeta' },
  { hex: '#DB2777', name: 'Magenta' },
  { hex: '#0891B2', name: 'Ciano' },
  { hex: '#475569', name: 'Ardósia' },
];

function safeDisplayHex(raw: string): string {
  const t = raw.trim();
  return /^#[0-9A-Fa-f]{6}$/i.test(t) ? t.toUpperCase() : DEFAULT_ACCENT;
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (x: number) => Math.max(0, Math.min(255, Math.round(x)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d > 1e-10) {
    if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
  }
  return { h: (h + 360) % 360, s, v };
}

const WHEEL_SIZE = 240;
const WHEEL_PADDING = 2;

function polarToHex(cx: number, cy: number, radius: number, clientX: number, clientY: number, rect: DOMRect): string | null {
  const scaleX = WHEEL_SIZE / rect.width;
  const scaleY = WHEEL_SIZE / rect.height;
  const x = (clientX - rect.left) * scaleX;
  const y = (clientY - rect.top) * scaleY;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > radius) return null;
  if (dist < 1) {
    const [r0, g0, b0] = hsvToRgb(0, 0, 1);
    return rgbToHex(r0, g0, b0);
  }
  const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  const s = Math.min(1, dist / radius);
  const [r, g, b] = hsvToRgb(angleDeg, s, 1);
  return rgbToHex(r, g, b);
}

function hexToWheelPosition(hex: string, cx: number, cy: number, radius: number): { x: number; y: number } {
  const rgb = hexToRgb(hex);
  if (!rgb) return { x: cx, y: cy };
  const { h, s, v } = rgbToHsv(rgb[0], rgb[1], rgb[2]);
  if (s < 0.02 || v < 0.02) return { x: cx, y: cy };
  const angleRad = (h * Math.PI) / 180;
  const dist = s * radius;
  return { x: cx + Math.cos(angleRad) * dist, y: cy + Math.sin(angleRad) * dist };
}

type WheelProps = {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
};

function CircularColorWheel({ value, onChange, disabled }: WheelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [handle, setHandle] = useState<{ x: number; y: number } | null>(null);

  const cx = WHEEL_SIZE / 2;
  const cy = WHEEL_SIZE / 2;
  const radius = WHEEL_SIZE / 2 - WHEEL_PADDING;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
    const logical = WHEEL_SIZE;
    canvas.width = Math.round(logical * dpr);
    canvas.height = Math.round(logical * dpr);
    canvas.style.width = `${logical}px`;
    canvas.style.height = `${logical}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cx0 = (logical / 2) * dpr;
    const cy0 = (logical / 2) * dpr;
    const r0 = (logical / 2 - WHEEL_PADDING) * dpr;
    const wPx = canvas.width;
    const hPx = canvas.height;
    const imageData = ctx.createImageData(wPx, hPx);
    const data = imageData.data;
    for (let py = 0; py < hPx; py++) {
      for (let px = 0; px < wPx; px++) {
        const dx = px - cx0 + 0.5;
        const dy = py - cy0 + 0.5;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const i = (py * wPx + px) * 4;
        if (dist > r0) {
          data[i] = 0;
          data[i + 1] = 0;
          data[i + 2] = 0;
          data[i + 3] = 0;
          continue;
        }
        if (dist < dpr * 0.75) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = 255;
          continue;
        }
        const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
        const s = Math.min(1, dist / r0);
        const [r, g, b] = hsvToRgb(angleDeg, s, 1);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, []);

  const validHex = safeDisplayHex(value);

  useEffect(() => {
    const pos = hexToWheelPosition(validHex, cx, cy, radius);
    setHandle(pos);
  }, [validHex, cx, cy, radius]);

  const pickAt = useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el || disabled) return;
      const rect = el.getBoundingClientRect();
      const hex = polarToHex(cx, cy, radius, clientX, clientY, rect);
      if (hex) onChange(hex);
    },
    [cx, cy, radius, onChange, disabled]
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    pickAt(e.clientX, e.clientY);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || disabled) return;
    pickAt(e.clientX, e.clientY);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    draggingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const hx = handle ? (handle.x / WHEEL_SIZE) * 100 : 50;
  const hy = handle ? (handle.y / WHEEL_SIZE) * 100 : 50;

  return (
    <div ref={containerRef} className="relative mx-auto w-fit select-none touch-none">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Roda de cores: toque ou arraste para escolher matiz e saturação. O centro é branco."
        className={`block rounded-full shadow-inner ring-1 ring-black/[0.08] dark:ring-white/15 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-crosshair'}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      />
      {handle && !disabled ? (
        <span
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-2 ring-black/25 dark:ring-white/40"
          style={{
            left: `${hx}%`,
            top: `${hy}%`,
            backgroundColor: validHex,
          }}
          aria-hidden
        />
      ) : null}
    </div>
  );
}

type Props = {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
};

/**
 * Seletor de cor de destaque: paleta sugerida + roda circular HSV + prévia.
 */
export function AccentColorPicker({ value, onChange, disabled }: Props) {
  const validHex = safeDisplayHex(value);
  const selectedUpper = value.length === 7 ? value.toUpperCase() : '';

  return (
    <div className="space-y-5">
      <p className="text-[13px] font-medium leading-relaxed text-zinc-600 dark:text-zinc-300">
        Botões principais, ícones de destaque e realces usam esta cor em todo o sistema.
      </p>

      <div>
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
          Paleta sugerida
        </p>
        <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-6">
          {PRESETS.map((p) => {
            const active = selectedUpper === p.hex.toUpperCase();
            return (
              <button
                key={p.hex}
                type="button"
                disabled={disabled}
                title={`${p.name} · ${p.hex}`}
                onClick={() => onChange(p.hex)}
                className={`
                  relative flex aspect-square min-h-[44px] min-w-0 items-center justify-center rounded-2xl transition-all duration-200
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900
                  ${active ? 'z-[1] scale-[1.02] shadow-lg ring-2 ring-zinc-900/20 ring-offset-2 ring-offset-white dark:ring-white/35 dark:ring-offset-zinc-900' : 'hover:z-[1] hover:scale-[1.04] hover:shadow-md active:scale-[0.98]'}
                `}
                style={{ backgroundColor: p.hex }}
                aria-label={p.name}
                aria-pressed={active}
              >
                {active ? (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/95 text-[11px] font-bold text-zinc-900 shadow-md dark:bg-zinc-900 dark:text-white">
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11px] text-zinc-400 dark:text-zinc-500">Toque ou clique para aplicar</p>
      </div>

      <div className="rounded-2xl border border-zinc-200/90 bg-zinc-50/90 p-4 dark:border-white/[0.08] dark:bg-white/[0.04]">
        <div className="mb-3 flex items-center gap-2">
          <Pipette className="h-4 w-4 text-zinc-500 dark:text-zinc-400" strokeWidth={2} />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
            Personalizar
          </span>
        </div>
        <p className="mb-4 text-center text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Arraste na roda: o centro é branco; quanto mais longe da borda, mais vibrante a cor.
        </p>
        <CircularColorWheel value={value} onChange={onChange} disabled={disabled} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-gradient-to-b from-white to-zinc-50/95 shadow-sm dark:border-white/[0.08] dark:from-zinc-900/95 dark:to-zinc-950">
        <div className="flex items-center gap-2 border-b border-zinc-100 px-4 py-2.5 dark:border-white/[0.06]">
          <Sparkles className="h-3.5 w-3.5 text-amber-500/90" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
            Prévia no app
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <span
            className="inline-flex cursor-default select-none rounded-xl px-4 py-2.5 text-[14px] font-semibold text-black shadow-sm"
            style={{ backgroundColor: validHex }}
          >
            Botão principal
          </span>
          <span className="text-[14px] font-semibold underline decoration-2 underline-offset-[5px]" style={{ color: validHex }}>
            Link
          </span>
          <span className="inline-flex h-2.5 w-2.5 rounded-full" style={{ backgroundColor: validHex }} aria-hidden />
        </div>
      </div>
    </div>
  );
}
