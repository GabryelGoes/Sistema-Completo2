import React from 'react';
import { Handshake, X } from 'lucide-react';

/** Indica que o serviço do orçamento é terceirizado. */
export const BudgetServiceOutsourcedBadge: React.FC<{
  className?: string;
  /** Remove a etiqueta (volta a ser só texto, se houver). */
  onRemove?: () => void;
}> = ({ className = '', onRemove }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-500/22 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-950 ring-1 ring-orange-700/40 dark:bg-orange-500/30 dark:text-orange-50 dark:ring-orange-300/55 ${className}`}
    title="Serviço terceirizado"
  >
    <Handshake
      className="h-3 w-3 text-orange-950 dark:text-orange-50"
      strokeWidth={2.2}
      aria-hidden
    />
    Terceirizado
    {onRemove ? (
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="-mr-0.5 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-orange-950/85 transition-colors hover:bg-orange-500/25 hover:text-orange-950 dark:text-orange-50 dark:hover:bg-white/10"
        aria-label="Remover etiqueta Terceirizado"
        title="Remover etiqueta"
      >
        <X className="h-3 w-3" strokeWidth={2.6} />
      </button>
    ) : null}
  </span>
);
