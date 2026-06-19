import React, { useMemo } from 'react';
import {
  ALL_BENCH_SLOTS,
  firstFreeBenchSlot,
  statusUsesBench,
} from '../../constants/labBench';
import { getStageConfig } from '../../constants/serviceOrderStages';

export interface LabBenchSlotEditorProps {
  status: string;
  currentSlot: number | null;
  occupiedSlots: Iterable<number>;
  disabled?: boolean;
  saving?: boolean;
  onSave: (slot: number | null) => void | Promise<void>;
  className?: string;
}

export function LabBenchSlotEditor({
  status,
  currentSlot,
  occupiedSlots,
  disabled = false,
  saving = false,
  onSave,
  className = '',
}: LabBenchSlotEditorProps) {
  const onBench = statusUsesBench(status);
  const occupied = useMemo(() => new Set(occupiedSlots), [occupiedSlots]);
  const suggested = useMemo(
    () => (onBench ? firstFreeBenchSlot(occupied) : null),
    [onBench, occupied]
  );
  const stage = getStageConfig(status, 'module');

  if (!onBench) {
    return (
      <p className={`text-xs text-zinc-500 dark:text-zinc-400 ${className}`}>
        O estágio &quot;{stage?.name ?? status}&quot; não usa compartimento na bancada (produto com o técnico ou fora do fluxo).
      </p>
    );
  }

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
          Compartimento na bancada (vaga fixa 1–24)
        </p>
        {suggested != null && currentSlot !== suggested ? (
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void onSave(suggested)}
            className="rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            Usar sugerido ({suggested})
          </button>
        ) : null}
      </div>
      {currentSlot != null ? (
        <p className="text-[11px] text-amber-800 dark:text-amber-200">
          Atual: compartimento <strong>{currentSlot}</strong> — permanece ao mudar de etapa.
        </p>
      ) : (
        <p className="text-[11px] text-amber-800 dark:text-amber-200">
          Este produto ainda não está posicionado na bancada física.
        </p>
      )}
      <div className="grid grid-cols-6 gap-1.5">
        {ALL_BENCH_SLOTS.map((slot) => {
          const taken = occupied.has(slot) && slot !== currentSlot;
          const isCurrent = currentSlot === slot;
          const isSuggested = suggested === slot && !taken;
          return (
            <button
              key={slot}
              type="button"
              disabled={disabled || saving || taken}
              onClick={() => void onSave(slot)}
              className={[
                'rounded-lg border px-1 py-1.5 text-center text-[11px] font-bold transition',
                isCurrent
                  ? 'border-amber-500 bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100'
                  : taken
                    ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900'
                    : isSuggested
                      ? 'border-emerald-400 bg-emerald-50 text-emerald-900 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200'
                      : 'border-zinc-200 bg-white text-zinc-800 hover:border-amber-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200',
              ].join(' ')}
              title={taken ? 'Ocupado por outro produto' : `Compartimento ${slot}`}
            >
              {slot}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 pt-0.5">
        {currentSlot != null ? (
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void onSave(null)}
            className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400"
          >
            Remover da bancada
          </button>
        ) : null}
        <p className="self-center text-[10px] text-zinc-500">
          A vaga não muda quando a etapa muda — só a cor do card.
        </p>
      </div>
    </div>
  );
}
