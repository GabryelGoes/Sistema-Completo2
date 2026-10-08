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

const MODE_BTN_CLASS: Record<LabScanMode, { idle: string; active: string }> = {
  consultar: {
    idle: 'bg-violet-600 text-white hover:brightness-110',
    active: 'bg-violet-600 text-white ring-2 ring-violet-300 ring-offset-2 ring-offset-zinc-100 dark:ring-violet-400/70 dark:ring-offset-zinc-950',
  },
  saida: {
    idle: 'bg-emerald-600 text-white hover:brightness-110',
    active: 'bg-emerald-600 text-white ring-2 ring-emerald-300 ring-offset-2 ring-offset-zinc-100 dark:ring-emerald-400/70 dark:ring-offset-zinc-950',
  },
  retorno: {
    idle: 'bg-[#F5D00B] text-black hover:brightness-105',
    active: 'bg-[#F5D00B] text-black ring-2 ring-amber-300 ring-offset-2 ring-offset-zinc-100 dark:ring-amber-400/80 dark:ring-offset-zinc-950',
  },
};

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
          const colors = MODE_BTN_CLASS[opt.id];
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={selected}
              className={`inline-flex shrink-0 items-center justify-center rounded-lg px-3 py-2 text-[12px] font-bold tracking-tight transition active:scale-[0.98] sm:px-3.5 sm:text-[13px] ${
                selected ? colors.active : colors.idle
              } ${selected ? '' : 'opacity-90'}`}
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
