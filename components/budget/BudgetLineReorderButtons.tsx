import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

type BudgetLineReorderButtonsProps = {
  onMoveUp: () => void;
  onMoveDown: () => void;
  disableUp?: boolean;
  disableDown?: boolean;
  ariaLabelPrefix?: string;
};

export const BudgetLineReorderButtons: React.FC<BudgetLineReorderButtonsProps> = ({
  onMoveUp,
  onMoveDown,
  disableUp = false,
  disableDown = false,
  ariaLabelPrefix = 'Linha',
}) => (
  <div className="flex shrink-0 flex-col gap-0.5" aria-label={`${ariaLabelPrefix}: alterar ordem`}>
    <button
      type="button"
      onClick={onMoveUp}
      disabled={disableUp}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-200/80 bg-white text-sky-800/80 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-35"
      aria-label={`${ariaLabelPrefix}: subir`}
    >
      <ChevronUp className="h-4 w-4" strokeWidth={2.25} aria-hidden />
    </button>
    <button
      type="button"
      onClick={onMoveDown}
      disabled={disableDown}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-200/80 bg-white text-sky-800/80 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-35"
      aria-label={`${ariaLabelPrefix}: descer`}
    >
      <ChevronDown className="h-4 w-4" strokeWidth={2.25} aria-hidden />
    </button>
  </div>
);
