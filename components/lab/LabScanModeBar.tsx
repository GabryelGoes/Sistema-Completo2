import React from 'react';
import {
  LAB_SCAN_MODE_OPTIONS,
  type LabScanMode,
} from '../../utils/labScanMode';

export type LabScanModeBarProps = {
  mode: LabScanMode;
  onChange: (mode: LabScanMode) => void;
  className?: string;
  /** Esconde o texto de dica (útil no cabeçalho compacto). */
  compact?: boolean;
};

/** Cores chapadas só no estado selecionado (sem aro). */
const MODE_ACTIVE_CLASS: Record<LabScanMode, string> = {
  consultar: 'bg-violet-600 text-white',
  saida: 'bg-emerald-600 text-white',
  retorno: 'bg-[#F5D00B] text-black',
};

const MODE_IDLE_CLASS =
  'border border-zinc-200/90 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-white/[0.12] dark:bg-zinc-900/80 dark:text-zinc-200 dark:hover:bg-zinc-800/80';

export function LabScanModeBar({
  mode,
  onChange,
  className = '',
  compact = false,
}: LabScanModeBarProps) {
  const active = LAB_SCAN_MODE_OPTIONS.find((o) => o.id === mode);
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex flex-nowrap items-center gap-1.5 sm:gap-2">
        <span className="shrink-0 text-[12px] font-semibold tracking-tight text-zinc-600 dark:text-zinc-300 sm:text-[13px]">
          Leitor QR:
        </span>
        {LAB_SCAN_MODE_OPTIONS.map((opt) => {
          const selected = opt.id === mode;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={selected}
              className={`inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-2 text-[12px] font-bold tracking-tight transition active:scale-[0.98] sm:px-3.5 sm:text-[13px] ${
                selected ? MODE_ACTIVE_CLASS[opt.id] : MODE_IDLE_CLASS
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {!compact && active ? (
        <p className="mt-1 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          {active.hint}
          {mode !== 'consultar' ? ' · Cada bip adiciona ao lote.' : ''}
        </p>
      ) : null}
    </div>
  );
}
