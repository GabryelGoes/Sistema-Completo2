import React, { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, ClipboardCheck, Loader2, Sparkles } from 'lucide-react';
import { uiOsModalCardSectionTitle, uiOsModalSectionIconWrap } from '../ui/appTypography';
import {
  LAB_VALVE_CLEANING_SERVICE_LABEL,
  isLabEvaluationOpen,
} from '../../utils/labStandardServices';

export type LabEvaluationSectionProps = {
  insetCardClass: string;
  inputClass: string;
  orderStatus: string;
  evaluatedService: string | null | undefined;
  evaluatedAt: string | null | undefined;
  evaluatedByName: string | null | undefined;
  evaluatedByDisplayName: string;
  onConfirmEvaluation: (
    service: string,
    nextStatus: 'EM_SERVICO' | 'AGUARDANDO_APROVACAO'
  ) => Promise<void>;
};

function formatEvaluatedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return '';
  }
}

export const LabEvaluationSection: React.FC<LabEvaluationSectionProps> = ({
  insetCardClass,
  inputClass,
  orderStatus,
  evaluatedService,
  evaluatedAt,
  evaluatedByName,
  evaluatedByDisplayName,
  onConfirmEvaluation,
}) => {
  const [otherService, setOtherService] = useState('');
  const [saving, setSaving] = useState<'cleaning' | 'other' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasEvaluation = Boolean((evaluatedService ?? '').trim());
  const evaluationOpen = isLabEvaluationOpen(orderStatus) && !hasEvaluation;

  if (!evaluationOpen && !hasEvaluation) return null;

  const handleCleaning = async () => {
    setSaving('cleaning');
    setError(null);
    try {
      await onConfirmEvaluation(LAB_VALVE_CLEANING_SERVICE_LABEL, 'EM_SERVICO');
    } catch (e) {
      setError((e as Error)?.message ?? 'Não foi possível registrar a avaliação.');
    } finally {
      setSaving(null);
    }
  };

  const handleOther = async () => {
    const text = otherService.trim();
    if (!text) {
      setError('Descreva o serviço necessário.');
      return;
    }
    setSaving('other');
    setError(null);
    try {
      await onConfirmEvaluation(text, 'AGUARDANDO_APROVACAO');
      setOtherService('');
    } catch (e) {
      setError((e as Error)?.message ?? 'Não foi possível registrar a avaliação.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div
      className={`${insetCardClass} min-w-0 overflow-hidden shadow-[0_8px_30px_-8px_rgba(0,0,0,0.12),0_2px_12px_-6px_rgba(0,0,0,0.06)] dark:shadow-[0_14px_38px_-12px_rgba(0,0,0,0.5),0_4px_14px_-8px_rgba(0,0,0,0.28)]`}
    >
      <div className="relative flex items-center gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 backdrop-blur-[2px] dark:border-white/[0.08] dark:bg-zinc-950/35 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4">
        <div className={uiOsModalSectionIconWrap}>
          <ClipboardCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" strokeWidth={2.25} aria-hidden />
        </div>
        <p className={uiOsModalCardSectionTitle}>Avaliação técnica</p>
      </div>

      <div className="space-y-3 border-t border-zinc-200/60 bg-zinc-50/90 px-3 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-4 sm:py-4">
        {hasEvaluation ? (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3.5 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <div className="min-w-0">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-emerald-800/90 dark:text-emerald-300/90">
                  Serviço definido
                </p>
                <p className="mt-1 text-[15px] font-semibold leading-snug text-zinc-900 dark:text-white">
                  {evaluatedService}
                </p>
                {evaluatedAt ? (
                  <p className="mt-1 text-[12px] text-zinc-600 dark:text-zinc-400">
                    {formatEvaluatedAt(evaluatedAt)}
                    {(evaluatedByName ?? evaluatedByDisplayName)
                      ? ` · ${evaluatedByName ?? evaluatedByDisplayName}`
                      : null}
                  </p>
                ) : null}
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Após inspecionar o produto, registre se a solução é{' '}
              <strong className="font-semibold text-zinc-800 dark:text-zinc-200">limpeza de válvulas</strong> ou outro
              serviço — sem precisar montar um orçamento completo só para isso.
            </p>

            <button
              type="button"
              onClick={() => void handleCleaning()}
              disabled={saving != null}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-violet-500/40 bg-violet-600 px-4 py-3.5 text-left text-white shadow-md shadow-violet-500/20 transition hover:brightness-105 active:scale-[0.99] disabled:opacity-55"
            >
              {saving === 'cleaning' ? (
                <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
              ) : (
                <Sparkles className="h-5 w-5 shrink-0 opacity-95" />
              )}
              <span className="min-w-0">
                <span className="block text-[14px] font-bold leading-snug">{LAB_VALVE_CLEANING_SERVICE_LABEL}</span>
                <span className="block text-[12px] font-medium text-white/85">Move para Em serviço</span>
              </span>
            </button>

            <div className="rounded-xl border border-zinc-200/80 bg-white/90 p-3 dark:border-white/[0.1] dark:bg-zinc-950/50">
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Outro serviço necessário
              </label>
              <input
                value={otherService}
                onChange={(e) => setOtherService(e.target.value)}
                placeholder="Ex.: troca de componente, reparo eletrônico…"
                className={`${inputClass} !h-11 !py-0 text-[13px]`}
                disabled={saving != null}
              />
              <button
                type="button"
                onClick={() => void handleOther()}
                disabled={saving != null}
                className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-zinc-300/90 bg-white px-3 py-2.5 text-[13px] font-semibold text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-55 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                {saving === 'other' ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Registrar e aguardar aprovação
              </button>
            </div>
          </>
        )}

        {error ? (
          <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
};
