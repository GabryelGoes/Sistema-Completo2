import React from 'react';
import { Eye, Image as ImageIcon, Package } from 'lucide-react';
import type { WorkshopPart } from '../../services/apiService';
import { PartPhotoImg } from '../ui/PartPhotoImg';
import { getWorkshopPartCoverUrl } from '../../utils/workshopPartPhotoSlots';
import { formatWorkshopPartQty } from '../../utils/workshopPartStock';
import {
  BudgetSuggestionPopoverShell,
  type BudgetSuggestionBoxPosition,
} from './BudgetSuggestionPopoverShell';

export type { BudgetSuggestionBoxPosition };

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
    <BudgetSuggestionPopoverShell
      open={open}
      position={position}
      onClose={onClose}
      onKeepOpen={onKeepOpen}
      ariaLabel="Sugestões de peças do estoque"
      title="Peças em estoque"
      subtitle={`${suggestions.length} sugest${suggestions.length === 1 ? 'ão' : 'ões'}`}
    >
      <div className="flex flex-col gap-0.5">
        {suggestions.map((part) => {
          const cover = getWorkshopPartCoverUrl(part);
          return (
            <div
              key={part.id}
              role="option"
              className="flex w-full items-center gap-1.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-sky-50"
            >
              <button
                type="button"
                onClick={() => handleSelect(part)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-1.5 py-1.5 text-left"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sky-200/70 bg-gradient-to-b from-white to-sky-50/80 shadow-sm">
                  {cover ? (
                    <PartPhotoImg src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-sky-300" strokeWidth={1.75} aria-hidden />
                  )}
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium leading-snug text-slate-800">
                    {part.name}
                  </span>
                  <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800/85">
                    <Package className="h-3 w-3 opacity-80" strokeWidth={2.2} aria-hidden />
                    Estoque{part.stock_qty != null ? ` · ${formatWorkshopPartQty(part.stock_qty)}` : ''}
                  </span>
                </span>
              </button>
              {onOpenPartDetails ? (
                <button
                  type="button"
                  aria-label={`Ver ficha de ${part.name}`}
                  onClick={() => onOpenPartDetails(part)}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-200/90 bg-white text-sky-700 shadow-sm transition-colors hover:bg-sky-50"
                >
                  <Eye className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </BudgetSuggestionPopoverShell>
  );
};
