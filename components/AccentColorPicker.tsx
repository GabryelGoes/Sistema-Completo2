import React, { useRef } from 'react';
import { Pipette, Sparkles } from 'lucide-react';
import { DEFAULT_ACCENT } from '../utils/appAppearance';

const PRESETS: { hex: string; name: string }[] = [
  { hex: '#F5D00B', name: 'Amarelo clássico' },
  { hex: '#EAB308', name: 'Âmbar' },
  { hex: '#CA8A04', name: 'Ouro' },
  { hex: '#2563EB', name: 'Azul' },
  { hex: '#059669', name: 'Esmeralda' },
  { hex: '#7C3AED', name: 'Violeta' },
  { hex: '#DB2777', name: 'Magenta' },
  { hex: '#EA580C', name: 'Laranja' },
  { hex: '#0891B2', name: 'Ciano' },
  { hex: '#475569', name: 'Ardósia' },
];

function safeDisplayHex(raw: string): string {
  const t = raw.trim();
  return /^#[0-9A-Fa-f]{6}$/i.test(t) ? t.toUpperCase() : DEFAULT_ACCENT;
}

type Props = {
  value: string;
  onChange: (hex: string) => void;
  disabled?: boolean;
};

/**
 * Seletor de cor de destaque da oficina: paleta sugerida + roda do sistema + hex + prévia.
 */
export function AccentColorPicker({ value, onChange, disabled }: Props) {
  const nativePickerRef = useRef<HTMLInputElement>(null);
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
        <div className="grid grid-cols-5 gap-2.5">
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

        <input
          ref={nativePickerRef}
          type="color"
          value={validHex}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="sr-only"
          tabIndex={-1}
          aria-label="Valor da cor no seletor nativo"
        />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <button
            type="button"
            disabled={disabled}
            onClick={() => nativePickerRef.current?.click()}
            aria-label="Abrir seletor de cores do sistema"
            className="flex shrink-0 items-center gap-3 rounded-xl border border-zinc-200/90 bg-white px-3 py-2.5 text-left shadow-sm transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-white/10 dark:bg-zinc-900/90 dark:hover:bg-zinc-800/95 sm:max-w-[200px]"
          >
            <span
              className="h-12 w-12 shrink-0 rounded-xl shadow-inner ring-1 ring-black/[0.06] dark:ring-white/10"
              style={{ backgroundColor: validHex }}
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-zinc-900 dark:text-white">Roda de cores</span>
              <span className="block text-[11px] leading-tight text-zinc-500 dark:text-zinc-400">Seletor do sistema operacional</span>
            </span>
          </button>

          <div className="min-w-0 flex-1">
            <label htmlFor="accent-hex-input" className="mb-1 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              Hexadecimal
            </label>
            <input
              id="accent-hex-input"
              type="text"
              value={value}
              disabled={disabled}
              onChange={(e) => {
                const v = e.target.value.trim();
                if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange(v.length === 7 ? v.toUpperCase() : v);
              }}
              placeholder="#F5D00B"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 font-mono text-[15px] font-medium tracking-wide text-zinc-900 placeholder:text-zinc-400 focus:border-[#007AFF]/55 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/20 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            />
          </div>
        </div>
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
