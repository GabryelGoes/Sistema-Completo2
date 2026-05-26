import React from 'react';
import { AlertTriangle, PackageX } from 'lucide-react';
import type { WorkshopPartStockStatus } from '../../utils/workshopPartStock';

type Props = {
  status: WorkshopPartStockStatus;
  className?: string;
};

/** Alerta de estoque zerado ou abaixo da quantidade mínima cadastrada. */
export const WorkshopPartStockBadge: React.FC<Props> = ({ status, className = '' }) => {
  if (status === 'ok') return null;
  if (status === 'zero') {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-900 ring-1 ring-red-300/70 dark:bg-red-950/55 dark:text-red-200 dark:ring-red-500/35 ${className}`}
        title="Produto sem estoque"
      >
        <PackageX className="h-3 w-3" strokeWidth={2.2} aria-hidden />
        Sem estoque
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900 ring-1 ring-amber-300/70 dark:bg-amber-950/55 dark:text-amber-200 dark:ring-amber-500/35 ${className}`}
      title="Quantidade em estoque na ou abaixo do mínimo configurado"
    >
      <AlertTriangle className="h-3 w-3" strokeWidth={2.2} aria-hidden />
      Acabando
    </span>
  );
};
