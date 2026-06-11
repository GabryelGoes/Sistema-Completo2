import React, { useMemo } from 'react';
import { ClipboardCheck, Loader2, ShieldAlert, Sparkles } from 'lucide-react';
import type { BudgetPartFields } from '../../utils/budgetPartStock';
import { BudgetVerifiedSeal } from './BudgetVerifiedSeal';

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
  /** Orçamento criado/editado recentemente — destaque visual de pendência. */
  highlightPending?: boolean;
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
  highlightPending = true,
}) => {
  const checklist = useMemo(() => {
    const items: { ok: boolean; label: string }[] = [
      { ok: diagnosis.trim().length > 0, label: 'Diagnóstico preenchido' },
      { ok: services.length > 0, label: `${services.length} serviço${services.length === 1 ? '' : 's'} listado${services.length === 1 ? '' : 's'}` },
      { ok: parts.length > 0 || services.length > 0, label: parts.length > 0 ? `${parts.length} peça${parts.length === 1 ? '' : 's'} listada${parts.length === 1 ? '' : 's'}` : 'Peças (opcional)' },
    ];
    const ready = items.filter((i) => i.ok).length;
    return { items, ready, total: items.length };
  }, [diagnosis, services.length, parts.length]);

  if (isVerified) {
    return <BudgetVerifiedSeal variant="hero" verifiedAt={verifiedAt} verifiedByName={verifiedByName} />;
  }

  if (canVerify) {
    return (
      <div className="overflow-hidden rounded-2xl border border-sky-200/90 bg-gradient-to-br from-white via-sky-50/40 to-white shadow-[0_10px_32px_-18px_rgba(14,116,144,0.35),inset_0_1px_0_rgba(255,255,255,1)]">
        <div className="flex items-start gap-3 border-b border-sky-100/90 bg-white/80 px-4 py-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#007AFF] to-sky-600 text-white shadow-[0_6px_16px_-8px_rgba(0,122,255,0.55)]">
            <ClipboardCheck className="h-5 w-5" strokeWidth={2.25} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-sky-800/85">Conferência do orçamento</p>
            <p className="mt-0.5 text-[14px] font-semibold leading-snug text-slate-900">
              Revise o conteúdo e libere para o orçamentista
            </p>
            <p className="mt-1 text-[12px] leading-snug text-slate-600">
              Após verificar, o selo ficará visível para toda a equipe. Qualquer edição remove a verificação.
            </p>
          </div>
        </div>

        <div className="space-y-2 px-4 py-3.5">
          {checklist.items.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[13px] ${
                item.ok
                  ? 'border-emerald-200/80 bg-emerald-50/70 text-emerald-900'
                  : 'border-amber-200/80 bg-amber-50/60 text-amber-900'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                  item.ok ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-amber-950'
                }`}
                aria-hidden
              >
                {item.ok ? '✓' : '!'}
              </span>
              <span className="font-medium">{item.label}</span>
            </div>
          ))}
        </div>

        <div className="border-t border-sky-100/90 bg-sky-50/35 px-4 py-3.5">
          <button
            type="button"
            onClick={onVerify}
            disabled={verifying}
            className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-3 text-[14px] font-semibold text-white shadow-[0_8px_22px_-10px_rgba(16,185,129,0.65)] transition-[transform,filter] hover:brightness-105 active:scale-[0.99] disabled:opacity-60"
          >
            {verifying ? (
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-5 w-5 transition-transform group-hover:scale-110" aria-hidden />
            )}
            {verifying ? 'Registrando verificação…' : 'Marcar como verificado'}
          </button>
          <p className="mt-2 text-center text-[11px] text-slate-500">
            {checklist.ready}/{checklist.total} itens conferidos na prévia
          </p>
        </div>
      </div>
    );
  }

  if (!highlightPending) return null;

  return (
    <div
      className="flex items-start gap-3 rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50/90 to-orange-50/50 px-4 py-3.5"
      role="status"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400/25 text-amber-800">
        <ShieldAlert className="h-5 w-5" strokeWidth={2.2} aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-amber-950">Aguardando verificação</p>
        <p className="mt-0.5 text-[12px] leading-snug text-amber-900/85">
          Um responsável com acesso total precisa conferir este orçamento antes da continuidade no fluxo.
        </p>
      </div>
    </div>
  );
};
