import React from 'react';
import { Handshake } from 'lucide-react';

/** Indica que o serviço do orçamento é terceirizado. */
export const BudgetServiceOutsourcedBadge: React.FC<{ className?: string }> = ({
  className = '',
}) => (
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
  </span>
);
