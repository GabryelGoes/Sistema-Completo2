import React from 'react';
import {
  LAB_SCAN_MODE_OPTIONS,
  type LabScanMode,
} from '../../utils/labScanMode';

export type LabScanModeBarProps = {
  mode: LabScanMode;
  onChange: (mode: LabScanMode) => void;
  className?: string;
};

export function LabScanModeBar({ mode, onChange, className = '' }: LabScanModeBarProps) {
  const active = LAB_SCAN_MODE_OPTIONS.find((o) => o.id === mode);
  return (
    <div className={`space-y-1.5 ${className}`}>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Pistola
        </span>
        {LAB_SCAN_MODE_OPTIONS.map((opt) => {
          const selected = opt.id === mode;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              aria-pressed={selected}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                selected
                  ? opt.id === 'saida'
                    ? 'bg-sky-600 text-white shadow-sm'
                    : opt.id === 'retorno'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-zinc-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-white text-zinc-700 hover:bg-zinc-100 dark:bg-white/10 dark:text-zinc-200'
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {active ? (
        <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          {active.hint}
          {mode !== 'consultar' ? ' · Cada bip adiciona ao lote.' : ''}
        </p>
      ) : null}
    </div>
  );
}
