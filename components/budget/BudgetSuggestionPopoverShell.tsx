import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';

export type BudgetSuggestionBoxPosition = {
  top: number;
  left: number;
  width: number;
};

type BudgetSuggestionPopoverShellProps = {
  open: boolean;
  position: BudgetSuggestionBoxPosition | null;
  onClose: () => void;
  onKeepOpen?: () => void;
  ariaLabel: string;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
};

/**
 * Janelinha de sugestões (serviços/peças) em portal no body —
 * escapa do zoom do modal e permite rolagem touch sem bloquear o gesto.
 */
export const BudgetSuggestionPopoverShell: React.FC<BudgetSuggestionPopoverShellProps> = ({
  open,
  position,
  onClose,
  onKeepOpen,
  ariaLabel,
  title = 'Sugestões',
  subtitle,
  children,
}) => {
  const layout = useMemo(() => {
    if (!position || typeof window === 'undefined') return null;
    const margin = 10;
    const width = Math.min(position.width, window.innerWidth - margin * 2);
    const left = Math.max(margin, Math.min(position.left, window.innerWidth - width - margin));
    const spaceBelow = window.innerHeight - position.top - margin;
    const spaceAbove = position.top - margin - 8;
    const preferBelow = spaceBelow >= 140 || spaceBelow >= spaceAbove;
    const maxPanel = Math.min(300, preferBelow ? Math.max(148, spaceBelow) : Math.max(148, spaceAbove));
    const listMax = Math.max(96, maxPanel - 44);

    if (preferBelow) {
      return {
        top: position.top,
        bottom: undefined as number | undefined,
        left,
        width,
        maxPanel,
        listMax,
      };
    }
    return {
      top: undefined as number | undefined,
      bottom: window.innerHeight - position.top + 8,
      left,
      width,
      maxPanel,
      listMax,
    };
  }, [position]);

  if (!open || !position || !layout || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[320] bg-slate-900/10 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed z-[321] flex flex-col overflow-hidden rounded-2xl border border-sky-200/80 bg-white shadow-[0_18px_50px_-18px_rgba(15,23,42,0.35),0_8px_24px_-12px_rgba(14,116,144,0.22)]"
        style={{
          top: layout.top,
          bottom: layout.bottom,
          left: layout.left,
          width: layout.width,
          maxHeight: layout.maxPanel,
        }}
        onMouseDown={(e) => {
          // Mantém o foco no input no desktop; não usar preventDefault em pointer/touch
          // (isso quebrava a rolagem no mobile/tablet).
          e.preventDefault();
          onKeepOpen?.();
        }}
        onPointerDown={() => {
          onKeepOpen?.();
        }}
        role="listbox"
        aria-label={ariaLabel}
      >
        <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-sky-100 bg-gradient-to-b from-sky-50 to-white px-3.5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700/85">{title}</p>
          {subtitle ? (
            <p className="truncate text-[11px] font-medium tabular-nums text-sky-800/65">{subtitle}</p>
          ) : null}
        </div>
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5 [-webkit-overflow-scrolling:touch] [touch-action:pan-y]"
          style={{ maxHeight: layout.listMax }}
          onWheel={(e) => e.stopPropagation()}
          onTouchMove={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </>,
    document.body
  );
};
