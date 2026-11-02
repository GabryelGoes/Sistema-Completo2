import React, { useEffect, useRef } from 'react';
import { Clock3 } from 'lucide-react';
import type { WorkshopService } from '../../services/apiService';
import { formatLaborLabel } from '../../utils/workshopLaborFormat';
import {
  BudgetSuggestionPopoverShell,
  type BudgetSuggestionBoxPosition,
} from './BudgetSuggestionPopoverShell';

type BudgetServiceSuggestionDropdownProps = {
  open: boolean;
  position: BudgetSuggestionBoxPosition | null;
  suggestions: WorkshopService[];
  onClose: () => void;
  onSelect: (service: WorkshopService) => void;
  onKeepOpen?: () => void;
  /** Layout touch: sem título/contagem, sem blur, sempre abaixo do campo. */
  compactTouch?: boolean;
  /** Índice destacado por teclado/mouse (−1 = nenhum). */
  highlightedIndex?: number;
  onHighlightedIndexChange?: (index: number) => void;
};

export const BudgetServiceSuggestionDropdown: React.FC<BudgetServiceSuggestionDropdownProps> = ({
  open,
  position,
  suggestions,
  onClose,
  onSelect,
  onKeepOpen,
  compactTouch = false,
  highlightedIndex = -1,
  onHighlightedIndexChange,
}) => {
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (highlightedIndex < 0) return;
    optionRefs.current[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex]);

  if (!open || !position || suggestions.length === 0) return null;

  return (
    <BudgetSuggestionPopoverShell
      open={open}
      position={position}
      onClose={onClose}
      onKeepOpen={onKeepOpen}
      ariaLabel="Sugestões de serviços"
      title="Serviços"
      subtitle={`${suggestions.length} sugest${suggestions.length === 1 ? 'ão' : 'ões'}`}
      hideHeader={compactTouch}
      clearBackdrop={compactTouch}
      forceBelow={compactTouch}
    >
      <div className="flex flex-col gap-0.5" role="presentation">
        {suggestions.map((service, index) => {
          const hasLabor =
            service.labor_hours != null && Number.isFinite(Number(service.labor_hours));
          const isActive = index === highlightedIndex;
          return (
            <button
              key={service.id}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="option"
              aria-selected={isActive}
              onMouseEnter={() => onHighlightedIndexChange?.(index)}
              onClick={() => {
                onSelect(service);
                onClose();
              }}
              className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? 'bg-sky-100 active:bg-sky-100/90'
                  : 'hover:bg-sky-50 active:bg-sky-100/90'
              }`}
            >
              <span className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-slate-800">
                {service.name}
              </span>
              {hasLabor ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-sky-800/90">
                  <Clock3 className="h-3 w-3 opacity-80" strokeWidth={2.2} aria-hidden />
                  {formatLaborLabel(Number(service.labor_hours))}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </BudgetSuggestionPopoverShell>
  );
};
