import React from 'react';
import { Package } from 'lucide-react';

/** Indica que a peça do orçamento veio do estoque da oficina. */
export const BudgetPartStockBadge: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span
    className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800 ring-1 ring-emerald-300/70 dark:bg-emerald-950/55 dark:text-emerald-200 dark:ring-emerald-500/35 ${className}`}
    title="Peça do estoque da oficina"
  >
    <Package className="h-3 w-3" strokeWidth={2.2} aria-hidden />
    Estoque
  </span>
);
