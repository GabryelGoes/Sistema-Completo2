import React, { useMemo } from 'react';
import { BadgeCheck, ClipboardCheck, Loader2, ShieldAlert } from 'lucide-react';
import type { BudgetPartFields } from '../../utils/budgetPartStock';

export type BudgetVerificationPanelProps = {
  isVerified: boolean;
  verifiedAt?: string | null;
  verifiedByName?: string | null;
  canVerify: boolean;
  verifying?: boolean;
  onVerify?: () => void;
  diagnosis: string;
  services: { description: string }[];
  parts: BudgetPartFields[];
  /** Número cronológico do orçamento (quando há mais de um na OS). */
  budgetNum?: number;
  /** Orçamento criado/editado recentemente — destaque visual de pendência. */
  highlightPending?: boolean;
  /**
   * Layout PC: botão “Marcar como verificado” à direita;
   * `selectionSlot` fica abaixo do botão.
   */
  pcLayout?: boolean;
  /** Botões de seleção de orçamento (exibidos abaixo do botão no PC). */
  selectionSlot?: React.ReactNode;
};

export const BudgetVerificationPanel: React.FC<BudgetVerificationPanelProps> = ({
  isVerified,
  verifiedAt,
  verifiedByName,
  canVerify,
  verifying = false,
  onVerify,
  diagnosis,
  services,
  parts,
  budgetNum,
  highlightPending = true,
  pcLayout = false,
  selectionSlot,
}) => {
  const checklist = useMemo(() => {
    const items: { ok: boolean; label: string }[] = [
      { ok: diagnosis.trim().length > 0, label: 'Diagnóstico' },
      {
        ok: services.length > 0,
        label: services.length > 0 ? `${services.length} Serv.` : 'Serv.',
      },
      {
        ok: parts.length > 0 || services.length > 0,
        label: parts.length > 0 ? `${parts.length} Peças` : 'Peças',
      },
    ];
    const ready = items.filter((i) => i.ok).length;
    return { items, ready, total: items.length };
  }, [diagnosis, services.length, parts.length]);

  const verifiedWhen =
    verifiedAt && String(verifiedAt).trim()
      ? new Date(verifiedAt).toLocaleString('pt-BR', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null;

  const verifyButton = (
    <button
      type="button"
      onClick={onVerify}
      disabled={verifying}
      className={
        pcLayout
          ? 'inline-flex shrink-0 items-center justify-center gap-1 rounded-md border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20'
          : 'inline-flex items-center gap-1 rounded-md border border-emerald-300/70 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-200 dark:hover:bg-emerald-500/20'
      }
    >
      {verifying ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
      {verifying ? 'Salvando…' : 'Marcar como Verificado'}
    </button>
  );

  if (isVerified) {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-2 dark:border-emerald-500/25 dark:bg-emerald-500/10"
        role="status"
        aria-label="Orçamento verificado"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white">
          <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold leading-tight text-emerald-900 dark:text-emerald-200">
            {budgetNum != null ? `Orçamento ${budgetNum} verificado` : 'Verificado e liberado'}
          </p>
          <p className="truncate text-[10px] leading-tight text-emerald-800/80 dark:text-emerald-300/80">
            {verifiedByName?.trim() ? verifiedByName.trim() : 'Responsável'}
            {verifiedWhen ? ` · ${verifiedWhen}` : ''}
          </p>
        </div>
      </div>
    );
  }

  if (canVerify) {
    if (pcLayout) {
      return (
        <div className="overflow-hidden rounded-xl border border-sky-200/80 bg-white/90 shadow-sm dark:border-sky-500/20 dark:bg-zinc-950/40">
          <div className="flex items-start gap-3 px-2.5 py-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#007AFF] text-white">
              <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sky-800/90 dark:text-sky-300/90">
                Conferência do Orçamento
                {budgetNum != null ? ` · ${budgetNum}` : ''}
              </p>
              <p className="mt-0.5 text-[11px] leading-tight text-slate-600 dark:text-zinc-400">
                Revise e libere para o orçamentista
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                {checklist.items.map((item) => (
                  <span
                    key={item.label}
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                      item.ok
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-amber-800 dark:text-amber-200'
                    }`}
                  >
                    <span aria-hidden>{item.ok ? '✓' : '!'}</span>
                    {item.label}
                  </span>
                ))}
                <span className="text-[10px] text-slate-500 dark:text-zinc-500">
                  {checklist.ready}/{checklist.total} conferidos
                </span>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              {verifyButton}
              {selectionSlot ? (
                <div className="flex max-w-[11rem] flex-wrap justify-end gap-1">{selectionSlot}</div>
              ) : null}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="overflow-hidden rounded-xl border border-sky-200/80 bg-white/90 shadow-sm dark:border-sky-500/20 dark:bg-zinc-950/40">
        <div className="flex items-start gap-2 px-2.5 py-2 dark:border-white/[0.06]">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#007AFF] text-white">
            <ClipboardCheck className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-sky-800/90 dark:text-sky-300/90">
                Conferência do Orçamento
                {budgetNum != null ? ` · ${budgetNum}` : ''}
              </p>
              {verifyButton}
            </div>
            <p className="mt-0.5 text-[11px] leading-tight text-slate-600 dark:text-zinc-400">
              Revise e libere para o orçamentista
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 pb-2 pl-[2.75rem]">
          {checklist.items.map((item) => (
            <span
              key={item.label}
              className={`inline-flex items-center gap-1 text-[10px] font-semibold ${
                item.ok
                  ? 'text-emerald-700 dark:text-emerald-300'
                  : 'text-amber-800 dark:text-amber-200'
              }`}
            >
              <span aria-hidden>{item.ok ? '✓' : '!'}</span>
              {item.label}
            </span>
          ))}
          <span className="text-[10px] text-slate-500 dark:text-zinc-500">
            {checklist.ready}/{checklist.total} conferidos
          </span>
        </div>
      </div>
    );
  }

  if (!highlightPending) return null;

  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-amber-200/80 bg-amber-50/80 px-2.5 py-2 dark:border-amber-500/25 dark:bg-amber-500/10"
      role="status"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/30 text-amber-900 dark:text-amber-200">
        <ShieldAlert className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[12px] font-semibold leading-tight text-amber-950 dark:text-amber-100">
          {budgetNum != null ? `Orçamento ${budgetNum} aguardando` : 'Aguardando verificação'}
        </p>
        <p className="text-[10px] leading-tight text-amber-900/80 dark:text-amber-200/80">
          Um responsável precisa conferir antes da continuidade.
        </p>
      </div>
    </div>
  );
};
