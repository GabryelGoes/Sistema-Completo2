import React from 'react';
import { Package } from 'lucide-react';

/** Indica que a peça do orçamento veio do estoque da oficina. */
export const BudgetPartStockBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-emerald-950/40 dark:bg-emerald-700 dark:text-white dark:ring-emerald-500/50 ${className}`}
    title="Peça do estoque da oficina"
  >
    <Package className="h-3 w-3 text-white" strokeWidth={2.2} aria-hidden />
    Estoque
  </span>
);
