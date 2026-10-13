import React from 'react';
import { AlertTriangle, Check, PackageX } from 'lucide-react';
import type { WorkshopPartStockStatus } from '../../utils/workshopPartStock';

type Props = {
  status: WorkshopPartStockStatus;
  className?: string;
  /** Quando true, também exibe o badge verde "Em estoque". */
  showOk?: boolean;
};

/** Status de estoque: zerado, acabando ou em estoque. */
export const WorkshopPartStockBadge: React.FC<Props> = ({
  status,
  className = '',
  showOk = false,
}) => {
  if (status === 'ok') {
    if (!showOk) return null;
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950/55 dark:text-emerald-200 ${className}`}
        title="Produto com estoque adequado"
      >
        <Check className="h-3 w-3" strokeWidth={2.5} aria-hidden />
        Em estoque
      </span>
    );
  }
  if (status === 'zero') {
    return (
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-semibold text-red-900 dark:bg-red-950/55 dark:text-red-200 ${className}`}
        title="Produto sem estoque"
      >
        <PackageX className="h-3 w-3" strokeWidth={2.2} aria-hidden />
        Sem estoque
      </span>
    );
  }
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/55 dark:text-amber-200 ${className}`}
      title="Quantidade em estoque na ou abaixo do mínimo configurado"
    >
      <AlertTriangle className="h-3 w-3" strokeWidth={2.2} aria-hidden />
      Acabando
    </span>
  );
};
