import React from 'react';
import { Package } from 'lucide-react';

/** Indica que a peça do orçamento veio do estoque da oficina. */
export const BudgetPartStockBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-500/35 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-400/40 ${className}`}
    title="Peça do estoque da oficina"
  >
    <Package className="h-3 w-3 text-emerald-600 dark:text-emerald-300" strokeWidth={2.2} aria-hidden />
    Estoque
  </span>
);
