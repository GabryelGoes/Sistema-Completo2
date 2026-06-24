import React from 'react';
import { Image as ImageIcon } from 'lucide-react';
import type { WorkshopPart } from '../../services/apiService';
import { PartPhotoImg } from '../ui/PartPhotoImg';
import { getWorkshopPartCoverUrl } from '../../utils/workshopPartPhotoSlots';

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
};

export const BudgetPartSuggestionDropdown: React.FC<BudgetPartSuggestionDropdownProps> = ({
  open,
  position,
  suggestions,
  onClose,
  onSelect,
  onKeepOpen,
}) => {
  if (!open || !position || suggestions.length === 0) return null;

  const previewPart = suggestions[0];
  const previewUrl = previewPart ? getWorkshopPartCoverUrl(previewPart) : null;

  const handleSelect = (part: WorkshopPart) => {
    onSelect(part);
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[215] bg-transparent" onClick={onClose} aria-hidden />
      <div
        className="fixed z-[216] max-h-[min(280px,42vh)] overflow-hidden overflow-y-auto rounded-[14px] border border-sky-200/80 bg-white shadow-[0_16px_48px_-12px_rgba(14,116,144,0.2)]"
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
        {previewPart ? (
          <div className="flex items-center gap-3 border-b border-sky-100/90 bg-sky-50/50 px-3 py-2.5">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-sky-200/80 bg-white">
              {previewUrl ? (
                <PartPhotoImg
                  src={previewUrl}
                  alt={previewPart.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <ImageIcon className="h-6 w-6 text-sky-300" strokeWidth={1.75} aria-hidden />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-700/80">Prévia</p>
              <p className="truncate text-[13px] font-semibold text-slate-900">{previewPart.name}</p>
              <p className="text-[11px] font-medium text-amber-800/90">
                Estoque{previewPart.stock_qty != null ? ` · ${previewPart.stock_qty}` : ''}
              </p>
            </div>
          </div>
        ) : null}

        <div className="py-1">
          {suggestions.map((part) => {
            const cover = getWorkshopPartCoverUrl(part);
            return (
              <button
                key={part.id}
                type="button"
                role="option"
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleSelect(part);
                }}
                onClick={() => handleSelect(part)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] text-slate-800 transition-colors hover:bg-sky-50 active:bg-sky-100"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-sky-200/70 bg-white">
                  {cover ? (
                    <PartPhotoImg src={cover} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <ImageIcon className="h-4 w-4 text-sky-300" strokeWidth={1.75} aria-hidden />
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate font-medium">{part.name}</span>
                <span className="shrink-0 text-[11px] font-semibold text-amber-800/90">
                  Estoque{part.stock_qty != null ? ` · ${part.stock_qty}` : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};
