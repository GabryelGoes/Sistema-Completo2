import React, { useMemo } from 'react';
import { Check, X } from 'lucide-react';
import type { BudgetPartFields } from '../../utils/budgetPartStock';
import { budgetHasExplicitApprovalDecisions, budgetReadRowClass } from '../../utils/budgetItemDisplay';
import { BudgetPartStockBadge } from '../ui/BudgetPartStockBadge';
import { formatLaborLabel } from '../../utils/workshopLaborFormat';
import { budgetReadBodyTextClass, budgetReadSectionTitleClass } from './budgetReadModalTheme';

export type BudgetReadModalBodyProps = {
  diagnosis: string;
  services: { description: string; approved?: boolean; labor_hours?: number | null }[];
  parts: BudgetPartFields[];
  observations: string;
};

export const BudgetReadModalBody: React.FC<BudgetReadModalBodyProps> = ({
  diagnosis,
  services,
  parts,
  observations,
}) => {
  const approvalContrast = useMemo(
    () => budgetHasExplicitApprovalDecisions(services, parts),
    [services, parts]
  );

  return (
    <>
      {diagnosis ? (
        <section>
          <h3 className={budgetReadSectionTitleClass}>Diagnóstico</h3>
          <div className={`${budgetReadBodyTextClass} whitespace-pre-wrap`}>{diagnosis}</div>
        </section>
      ) : null}
      {services.length > 0 ? (
        <section>
          <h3 className={budgetReadSectionTitleClass}>Serviços</h3>
          <ul className="list-none space-y-2 text-sm">
            {services.map((s, i) => (
              <li
                key={i}
                className={`flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-slate-800 ${budgetReadRowClass(
                  s.approved,
                  'paper',
                  approvalContrast
                )}`}
              >
                {s.approved === true ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Aprovado" />
                ) : null}
                {s.approved === false ? <X className="h-4 w-4 shrink-0 text-red-600" aria-label="Reprovado" /> : null}
                {s.approved !== true && s.approved !== false ? (
                  <span className="h-4 w-4 shrink-0 font-bold text-slate-400" aria-label="Pendente">
                    —
                  </span>
                ) : null}
                <span className={approvalContrast && s.approved === true ? 'font-medium' : ''}>{s.description}</span>
                {s.labor_hours != null && Number.isFinite(Number(s.labor_hours)) ? (
                  <span className="text-[13px] font-semibold tabular-nums text-slate-600">
                    ({formatLaborLabel(Number(s.labor_hours))})
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {parts.length > 0 ? (
        <section>
          <h3 className={budgetReadSectionTitleClass}>Peças</h3>
          <ul className="space-y-2 text-sm">
            {parts.map((p, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 text-slate-800 ${budgetReadRowClass(p.approved, 'paper', approvalContrast)}`}
              >
                {p.approved === true ? (
                  <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-label="Aprovado" />
                ) : null}
                {p.approved === false ? <X className="h-4 w-4 shrink-0 text-red-600" aria-label="Reprovado" /> : null}
                {p.approved !== true && p.approved !== false ? (
                  <span className="h-4 w-4 shrink-0 font-bold text-slate-400" aria-label="Pendente">
                    —
                  </span>
                ) : null}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                  <span className={approvalContrast && p.approved === true ? 'font-semibold' : 'font-medium'}>
                    ({p.quantity}x) {p.description}
                  </span>
                  {p.fromStock ? <BudgetPartStockBadge /> : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {observations ? (
        <section>
          <h3 className={budgetReadSectionTitleClass}>Observações</h3>
          <div className={`${budgetReadBodyTextClass} whitespace-pre-wrap`}>{observations}</div>
        </section>
      ) : null}
    </>
  );
};
