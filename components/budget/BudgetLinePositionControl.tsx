import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
 * O menu vai para `document.body` (portal) para não ser cortado por overflow
 * no último item da lista.
 */
export const BudgetLinePositionControl: React.FC<BudgetLinePositionControlProps> = ({
  position,
  total,
  onMoveTo,
  ariaLabelPrefix = 'Linha',
}) => {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{
    top?: number;
    bottom?: number;
    left: number;
  } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const updateMenuPosition = useCallback(() => {
    const el = rootRef.current;
    if (!el || typeof window === 'undefined') return;
    const rect = el.getBoundingClientRect();
    const margin = 8;
    const estimatedHeight = Math.min(200, 56 + Math.ceil(total / 4) * 40);
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
    const left = Math.max(
      margin,
      Math.min(rect.left, window.innerWidth - 168 - margin)
    );
    if (openAbove) {
      setMenuPos({
        bottom: window.innerHeight - rect.top + 6,
        left,
      });
    } else {
      setMenuPos({
        top: rect.bottom + 6,
        left,
      });
    }
  }, [total]);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const t = event.target as Node;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onReposition = () => updateMenuPosition();
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updateMenuPosition]);

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

      {open && total > 1 && menuPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={`Mover ${ariaLabelPrefix.toLowerCase()} para posição`}
              className="fixed z-[360] min-w-[9.5rem] max-w-[12rem] rounded-xl border border-sky-200/80 bg-white p-2 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)]"
              style={{
                top: menuPos.top,
                bottom: menuPos.bottom,
                left: menuPos.left,
              }}
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
            </div>,
            document.body
          )
        : null}
    </div>
  );
};
