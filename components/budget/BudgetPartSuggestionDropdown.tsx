import React from 'react';
import { Eye } from 'lucide-react';
import type { WorkshopPart } from '../../services/apiService';

export type BudgetSuggestionBoxPosition = {
  top: number;
  left: number;
  width: number;
};

type BudgetPartSuggestionDropdownProps = {
  open: boolean;
  position: BudgetSuggestionBoxPosition | null;
  suggestions: WorkshopPart[];
  onClose: () => void;
  onSelect: (part: WorkshopPart) => void;
  onKeepOpen?: () => void;
  /** Abre ficha completa do produto (estoque). */
  onOpenPartDetails?: (part: WorkshopPart) => void;
};

export const BudgetPartSuggestionDropdown: React.FC<BudgetPartSuggestionDropdownProps> = ({
  open,
  position,
  suggestions,
  onClose,
  onSelect,
  onKeepOpen,
  onOpenPartDetails,
}) => {
  if (!open || !position || suggestions.length === 0) return null;

  const handleSelect = (part: WorkshopPart) => {
    onSelect(part);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[215] bg-transparent" onClick={onClose} aria-hidden />
      <div
        className="fixed z-[216] max-h-[min(220px,38vh)] overflow-hidden overflow-y-auto rounded-[14px] border border-sky-200/80 bg-white py-1 shadow-[0_16px_48px_-12px_rgba(14,116,144,0.2)]"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          onKeepOpen?.();
        }}
        onMouseDown={(e) => e.preventDefault()}
        role="listbox"
        aria-label="Sugestões de peças do estoque"
      >
        {suggestions.map((part) => (
          <div key={part.id} role="option" className="flex w-full items-center gap-2 px-2 py-1.5">
            <button
              type="button"
              onPointerDown={(e) => {
                e.preventDefault();
                handleSelect(part);
              }}
              onClick={() => handleSelect(part)}
              className="flex min-w-0 flex-1 items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[14px] text-slate-800 transition-colors hover:bg-sky-50 active:bg-sky-100"
            >
              <span className="min-w-0 flex-1 truncate font-medium">{part.name}</span>
              <span className="shrink-0 text-[11px] font-semibold text-amber-800/90">
                Estoque{part.stock_qty != null ? ` · ${part.stock_qty}` : ''}
              </span>
            </button>
            {onOpenPartDetails ? (
              <button
                type="button"
                aria-label={`Ver ficha de ${part.name}`}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onOpenPartDetails(part)}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-200/90 bg-white text-sky-700 hover:bg-sky-50"
              >
                <Eye className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
};
