import React from 'react';
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
};

export const BudgetServiceSuggestionDropdown: React.FC<BudgetServiceSuggestionDropdownProps> = ({
  open,
  position,
  suggestions,
  onClose,
  onSelect,
  onKeepOpen,
}) => {
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
    >
      <div className="flex flex-col gap-0.5">
        {suggestions.map((service) => {
          const hasLabor =
            service.labor_hours != null && Number.isFinite(Number(service.labor_hours));
          return (
            <button
              key={service.id}
              type="button"
              role="option"
              onClick={() => {
                onSelect(service);
                onClose();
              }}
              className="flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-sky-50 active:bg-sky-100/90"
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
