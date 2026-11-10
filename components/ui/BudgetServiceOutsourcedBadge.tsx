import React from 'react';
import { Handshake, X } from 'lucide-react';

/** Indica que o serviço do orçamento é terceirizado. */
export const BudgetServiceOutsourcedBadge: React.FC<{
  className?: string;
  /** Remove a etiqueta (volta a ser só texto, se houver). */
  onRemove?: () => void;
}> = ({ className = '', onRemove }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-[#007AFF]/18 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#0055CC] ring-1 ring-[#007AFF]/45 dark:bg-[#007AFF]/25 dark:text-[#7AB8FF] dark:ring-[#007AFF]/50 ${className}`}
    title="Serviço terceirizado"
  >
    <Handshake
      className="h-3 w-3 text-[#007AFF] dark:text-[#7AB8FF]"
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
        className="-mr-0.5 ml-0.5 inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm text-[#0055CC]/80 transition-colors hover:bg-[#007AFF]/20 hover:text-[#003d99] dark:text-[#7AB8FF] dark:hover:bg-white/10"
        aria-label="Remover etiqueta Terceirizado"
        title="Remover etiqueta"
      >
        <X className="h-3 w-3" strokeWidth={2.6} />
      </button>
    ) : null}
  </span>
);
