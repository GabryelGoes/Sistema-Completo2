import React from 'react';
import { Handshake, X } from 'lucide-react';

/** Indica que o serviço do orçamento é terceirizado. */
export const BudgetServiceOutsourcedBadge: React.FC<{
  className?: string;
  /** Remove a etiqueta (volta a ser só texto, se houver). */
  onRemove?: () => void;
}> = ({ className = '', onRemove }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-500/18 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800 ring-1 ring-orange-500/45 dark:bg-orange-500/25 dark:text-orange-200 dark:ring-orange-400/50 ${className}`}
    title="Serviço terceirizado"
  >
    <Handshake
      className="h-3 w-3 text-orange-600 dark:text-orange-300"
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
        className="-mr-0.5 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-orange-800/80 transition-colors hover:bg-orange-500/20 hover:text-orange-950 dark:text-orange-200 dark:hover:bg-white/10"
        aria-label="Remover etiqueta Terceirizado"
        title="Remover etiqueta"
      >
        <X className="h-3 w-3" strokeWidth={2.6} />
      </button>
    ) : null}
  </span>
);
