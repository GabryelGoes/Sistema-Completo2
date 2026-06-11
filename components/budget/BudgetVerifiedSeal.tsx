import React from 'react';
import { BadgeCheck } from 'lucide-react';

export type BudgetVerifiedSealProps = {
  verifiedByName?: string | null;
  verifiedAt?: string | null;
  /** `header` = compacto no topo; `hero` = destaque maior no painel. */
  variant?: 'header' | 'hero';
  /** `sm` = listas minimizadas; `md` = padrão. */
  size?: 'sm' | 'md';
  className?: string;
};

export const BudgetVerifiedSeal: React.FC<BudgetVerifiedSealProps> = ({
  verifiedByName,
  verifiedAt,
  variant = 'header',
  size = 'md',
  className = '',
}) => {
  const when =
    verifiedAt && String(verifiedAt).trim()
      ? new Date(verifiedAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  if (variant === 'hero') {
    return (
      <div
        className={`relative overflow-hidden rounded-2xl border border-emerald-200/90 bg-gradient-to-br from-emerald-50 via-white to-teal-50/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_8px_24px_-14px_rgba(16,185,129,0.45)] ${className}`}
        role="status"
        aria-label="Orçamento verificado"
      >
        <div
          className="pointer-events-none absolute -right-6 -top-8 h-24 w-24 rounded-full bg-emerald-400/15 blur-2xl"
          aria-hidden
        />
        <div className="relative flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-[0_6px_18px_-6px_rgba(16,185,129,0.65)] ring-2 ring-white/80">
            <BadgeCheck className="h-7 w-7" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-emerald-800/90">Selo de verificado</p>
            <p className="mt-0.5 text-[15px] font-semibold leading-snug text-slate-900">
              Conferido e liberado para continuidade
            </p>
            <p className="mt-1 text-[12px] leading-snug text-slate-600">
              {verifiedByName?.trim() ? `Por ${verifiedByName.trim()}` : 'Por responsável da oficina'}
              {when ? ` · ${when}` : ''}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const sm = size === 'sm';

  return (
    <div
      className={`inline-flex max-w-full items-center rounded-full border border-emerald-300/70 bg-gradient-to-r from-emerald-50 to-teal-50/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:border-emerald-500/30 dark:from-emerald-500/12 dark:to-teal-500/10 ${
        sm ? 'gap-1 px-2 py-0.5' : 'gap-2 px-3 py-1.5'
      } ${className}`}
      role="status"
      aria-label="Orçamento verificado"
      title={
        verifiedByName?.trim() || when
          ? `${verifiedByName?.trim() ? `Por ${verifiedByName.trim()}` : 'Verificado'}${when ? ` · ${when}` : ''}`
          : 'Orçamento verificado'
      }
    >
      <span
        className={`flex shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm ${
          sm ? 'h-4 w-4' : 'h-6 w-6'
        }`}
      >
        <BadgeCheck className={sm ? 'h-2.5 w-2.5' : 'h-3.5 w-3.5'} strokeWidth={2.5} aria-hidden />
      </span>
      <span
        className={`min-w-0 truncate font-bold uppercase tracking-[0.1em] text-emerald-800 dark:text-emerald-300 ${
          sm ? 'text-[9px]' : 'text-[11px]'
        }`}
      >
        Verificado
      </span>
    </div>
  );
};
