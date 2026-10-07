import React, { useMemo } from 'react';
import {
  ALL_BENCH_SLOTS,
  OFICINA_SHELF_LETTERS,
  firstFreeBenchSlot,
  firstFreeOficinaShelf,
  normalizeOficinaShelf,
  statusUsesBench,
} from '../../constants/labBench';
import { getStageConfig } from '../../constants/serviceOrderStages';

export interface LabBenchSlotEditorProps {
  status: string;
  currentSlot: number | null;
  occupiedSlots: Iterable<number>;
  /** Letra A–X da bancada da oficina (24 vagas). */
  currentOficinaShelf?: string | null;
  occupiedOficinaShelves?: Iterable<string>;
  disabled?: boolean;
  saving?: boolean;
  onSave: (slot: number | null) => void | Promise<void>;
  onSaveOficinaShelf?: (letter: string | null) => void | Promise<void>;
  className?: string;
}

export function LabBenchSlotEditor({
  status,
  currentSlot,
  occupiedSlots,
  currentOficinaShelf = null,
  occupiedOficinaShelves,
  disabled = false,
  saving = false,
  onSave,
  onSaveOficinaShelf,
  className = '',
}: LabBenchSlotEditorProps) {
  const onBench = statusUsesBench(status);
  const occupied = useMemo(() => new Set(occupiedSlots), [occupiedSlots]);
  const occupiedLetters = useMemo(
    () =>
      new Set(
        Array.from(occupiedOficinaShelves ?? [])
          .map((l) => normalizeOficinaShelf(l))
          .filter((l): l is string => Boolean(l))
      ),
    [occupiedOficinaShelves]
  );
  const suggested = useMemo(
    () => (onBench ? firstFreeBenchSlot(occupied) : null),
    [onBench, occupied]
  );
  const suggestedLetter = useMemo(
    () => (onBench ? firstFreeOficinaShelf(occupiedLetters) : null),
    [onBench, occupiedLetters]
  );
  const stage = getStageConfig(status, 'module');
  const currentLetter = normalizeOficinaShelf(currentOficinaShelf);

  if (!onBench) {
    return (
      <p className={`text-xs text-zinc-500 dark:text-zinc-400 ${className}`}>
        O estágio &quot;{stage?.name ?? status}&quot; não usa compartimento na bancada (produto com o técnico ou fora do fluxo).
      </p>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {typeof onSaveOficinaShelf === 'function' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Oficina — bancada (letra A–X)
            </p>
            {suggestedLetter != null && currentLetter !== suggestedLetter ? (
              <button
                type="button"
                disabled={disabled || saving}
                onClick={() => void onSaveOficinaShelf(suggestedLetter)}
                className="rounded-lg bg-violet-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
              >
                Usar sugerida ({suggestedLetter})
              </button>
            ) : null}
          </div>
          {currentLetter ? (
            <p className="text-[11px] text-violet-800 dark:text-violet-200">
              Atual: letra <strong>{currentLetter}</strong> — permanece ao mudar de etapa.
            </p>
          ) : (
            <p className="text-[11px] text-amber-800 dark:text-amber-200">
              Sem letra na oficina — o sistema atribui automaticamente na entrada ou no retorno.
            </p>
          )}
          <div className="grid grid-cols-8 gap-1.5">
            {OFICINA_SHELF_LETTERS.map((letter) => {
              const taken = occupiedLetters.has(letter) && letter !== currentLetter;
              const isCurrent = currentLetter === letter;
              const isSuggested = suggestedLetter === letter && !taken;
              return (
                <button
                  key={letter}
                  type="button"
                  disabled={disabled || saving || taken}
                  onClick={() => void onSaveOficinaShelf(letter)}
                  className={[
                    'rounded-lg border px-1 py-1.5 text-center text-[11px] font-bold transition',
                    isCurrent
                      ? 'border-violet-500 bg-violet-100 text-violet-950 dark:bg-violet-950/50 dark:text-violet-100'
                      : taken
                        ? 'cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900'
                        : isSuggested
                          ? 'border-violet-400 bg-violet-50 text-violet-900 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-200'
                          : 'border-zinc-200 bg-white text-zinc-800 hover:border-violet-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200',
                  ].join(' ')}
                  title={taken ? 'Letra ocupada por outro produto' : `Oficina ${letter}`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
          {currentLetter ? (
            <button
              type="button"
              disabled={disabled || saving}
              onClick={() => void onSaveOficinaShelf(null)}
              className="rounded-lg border border-zinc-300 px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400"
            >
              Remover letra da oficina
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Depósito / bancada (vaga 1–24)
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
            Letras A–X (oficina) e números 1–24 (depósito) são atribuídos automaticamente. Na Saída
            (scan do QR) a peça vai para Em serviço e libera as vagas; no Retorno a próxima letra
            livre é preenchida.
          </p>
        </div>
      </div>
    </div>
  );
}
