import React from 'react';
import { Package } from 'lucide-react';

/** Indica que a peça do orçamento veio do estoque da oficina. */
export const BudgetPartStockBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-300/70 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-500/35 ${className}`}
    title="Peça do estoque da oficina"
  >
    <Package className="h-3 w-3" strokeWidth={2.2} aria-hidden />
    Estoque
  </span>
);
