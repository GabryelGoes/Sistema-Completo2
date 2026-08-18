import React, { useEffect, useId, useRef, useState } from 'react';

type BudgetLinePositionControlProps = {
  /** Posição atual (1-based). */
  position: number;
  /** Total de itens na lista. */
  total: number;
  /** Move o item para o índice 0-based informado. */
  onMoveTo: (toIndex: number) => void;
  ariaLabelPrefix?: string;
};

/**
 * Badge numerado (mesmo tamanho do botão de lixo) que abre um seletor
 * para alterar a posição do serviço/peça na lista.
 */
export const BudgetLinePositionControl: React.FC<BudgetLinePositionControlProps> = ({
  position,
  total,
  onMoveTo,
  ariaLabelPrefix = 'Linha',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-200/80 bg-white text-[14px] font-semibold tabular-nums text-sky-900 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50"
        aria-label={`${ariaLabelPrefix} ${position}: alterar posição`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
      >
        {position}
      </button>

      {open && total > 1 ? (
        <div
          id={listId}
          role="listbox"
          aria-label={`Mover ${ariaLabelPrefix.toLowerCase()} para posição`}
          className="absolute left-0 top-[calc(100%+0.35rem)] z-40 min-w-[9.5rem] max-w-[12rem] rounded-xl border border-sky-200/90 bg-white p-2 shadow-[0_12px_32px_-10px_rgba(14,116,144,0.28)]"
        >
          <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-700/80">
            Mover para
          </p>
          <div className="flex max-h-40 flex-wrap gap-1 overflow-y-auto">
            {Array.from({ length: total }, (_, index) => {
              const isCurrent = index === position - 1;
              return (
                <button
                  key={index}
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  disabled={isCurrent}
                  onClick={() => {
                    onMoveTo(index);
                    setOpen(false);
                  }}
                  className={`flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-semibold tabular-nums transition-colors ${
                    isCurrent
                      ? 'cursor-default bg-sky-100 text-sky-800'
                      : 'border border-sky-200/70 bg-white text-slate-800 hover:border-sky-300 hover:bg-sky-50'
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};
