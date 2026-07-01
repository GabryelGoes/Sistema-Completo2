import React, { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CheckCircle2, ClipboardCheck, Loader2, Plus, Trash2 } from 'lucide-react';
import { uiOsModalCardSectionTitle, uiOsModalSectionIconWrap } from '../ui/appTypography';
import {
  getLabQuickServices,
  isAbsModuleKind,
  LAB_QUICK_SERVICES_CHANGED_EVENT,
  LAB_QUICK_SERVICE_COLOR_CLASSES,
  type LabQuickService,
} from '../../utils/labQuickServices';
import { isLabEvaluationOpen } from '../../utils/labStandardServices';
import {
  BudgetPartsEditor,
  mapBudgetPartRowsToPayload,
  type BudgetPartRow,
} from '../budget/BudgetPartsEditor';
import { getWorkshopParts, type WorkshopPart } from '../../services/apiService';
import { parseSuggestedValueInput, formatSuggestedValueBrl } from '../../utils/budgetServiceFields';
import type { BudgetPartFields } from '../../utils/budgetPartStock';

export type LabEvaluationServiceDraft = {
  id: string;
  description: string;
  labPresetId: string | null;
  outsourced: boolean;
  preApproved: boolean;
  suggestedValueInput: string;
  lineObservations: string;
};

export type LabEvaluationSubmitPayload = {
  services: {
    description: string;
    labPresetId?: string | null;
    outsourced?: boolean;
    preApproved?: boolean;
    suggestedValue?: number | null;
    lineObservations?: string;
  }[];
  parts: BudgetPartFields[];
  observations: string;
};

export type LabEvaluationSectionProps = {
  insetCardClass: string;
  inputClass: string;
  orderStatus: string;
  moduleKind: string | null | undefined;
  evaluatedService: string | null | undefined;
  evaluatedAt: string | null | undefined;
  evaluatedByName: string | null | undefined;
  evaluatedByDisplayName: string;
  onSubmitEvaluation: (payload: LabEvaluationSubmitPayload) => Promise<void>;
};

function formatEvaluatedAt(iso: string | null | undefined): string {
  if (!iso) return '';
  try {
    return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return '';
  }
}

function newDraftFromPreset(preset: LabQuickService): LabEvaluationServiceDraft {
  return {
    id: `svc-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: preset.label,
    labPresetId: preset.id,
    outsourced: false,
    preApproved: false,
    suggestedValueInput: '',
    lineObservations: '',
  };
}

export const LabEvaluationSection: React.FC<LabEvaluationSectionProps> = ({
  insetCardClass,
  inputClass,
  orderStatus,
  moduleKind,
  evaluatedService,
  evaluatedAt,
  evaluatedByName,
  evaluatedByDisplayName,
  onSubmitEvaluation,
}) => {
  const [quickServices, setQuickServices] = useState<LabQuickService[]>(() => getLabQuickServices());
  const [serviceDrafts, setServiceDrafts] = useState<LabEvaluationServiceDraft[]>([]);
  const [otherService, setOtherService] = useState('');
  const [parts, setParts] = useState<BudgetPartRow[]>([]);
  const [observations, setObservations] = useState('');
  const [workshopParts, setWorkshopParts] = useState<WorkshopPart[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reloadQuickServices = useCallback(() => {
    setQuickServices(getLabQuickServices());
  }, []);

  useEffect(() => {
    reloadQuickServices();
    const onChange = () => reloadQuickServices();
    window.addEventListener(LAB_QUICK_SERVICES_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LAB_QUICK_SERVICES_CHANGED_EVENT, onChange);
  }, [reloadQuickServices]);

  useEffect(() => {
    void getWorkshopParts()
      .then(setWorkshopParts)
      .catch(() => setWorkshopParts([]));
  }, []);

  const hasEvaluation = Boolean((evaluatedService ?? '').trim());
  const evaluationOpen = isLabEvaluationOpen(orderStatus) && !hasEvaluation;
  const showAbsPresets = isAbsModuleKind(moduleKind);

  if (!evaluationOpen && !hasEvaluation) return null;

  const addPreset = (preset: LabQuickService) => {
    setServiceDrafts((prev) => [...prev, newDraftFromPreset(preset)]);
    setError(null);
  };

  const addOtherService = () => {
    const text = otherService.trim();
    if (!text) {
      setError('Descreva o outro serviço antes de adicionar.');
      return;
    }
    setServiceDrafts((prev) => [
      ...prev,
      {
        id: `svc-other-${Date.now()}`,
        description: text,
        labPresetId: null,
        outsourced: false,
        preApproved: false,
        suggestedValueInput: '',
        lineObservations: '',
      },
    ]);
    setOtherService('');
    setError(null);
  };

  const updateDraft = (id: string, patch: Partial<LabEvaluationServiceDraft>) => {
    setServiceDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const removeDraft = (id: string) => {
    setServiceDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSubmit = async () => {
    if (serviceDrafts.length === 0) {
      setError('Adicione pelo menos um serviço à avaliação.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const services = serviceDrafts.map((d) => ({
        description: d.description.trim(),
        labPresetId: d.labPresetId,
        outsourced: d.outsourced,
        preApproved: d.preApproved,
        suggestedValue: parseSuggestedValueInput(d.suggestedValueInput),
        lineObservations: d.lineObservations.trim() || undefined,
      }));
      await onSubmitEvaluation({
        services,
        parts: mapBudgetPartRowsToPayload(parts),
        observations: observations.trim(),
      });
      setServiceDrafts([]);
      setParts([]);
      setObservations('');
    } catch (e) {
      setError((e as Error)?.message ?? 'Não foi possível registrar a avaliação.');
    } finally {
      setSaving(false);
    }
  };

  const partsInset = 'rounded-xl border border-zinc-200/80 bg-white/90 dark:border-white/[0.1] dark:bg-zinc-950/50';

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
                  Avaliação enviada ao orçamento
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
              Após inspecionar o produto, adicione os serviços necessários. Ao enviar, um orçamento será criado para
              aprovação do cliente.
            </p>

            {showAbsPresets ? (
              <div className="flex flex-wrap gap-2">
                {quickServices
                  .filter((p) => p.absOnly)
                  .map((preset) => {
                    const color = LAB_QUICK_SERVICE_COLOR_CLASSES[preset.color];
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => addPreset(preset)}
                        disabled={saving}
                        className={`rounded-xl border-2 px-3.5 py-2.5 text-[13px] font-semibold shadow-md transition active:scale-[0.98] disabled:opacity-55 ${color.btn} ${color.btnHover}`}
                      >
                        {preset.label}
                      </button>
                    );
                  })}
              </div>
            ) : null}

            <div className="rounded-xl border border-zinc-200/80 bg-white/90 p-3 dark:border-white/[0.1] dark:bg-zinc-950/50">
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Outro serviço
              </label>
              <div className="flex gap-2">
                <input
                  value={otherService}
                  onChange={(e) => setOtherService(e.target.value)}
                  placeholder="Ex.: troca de componente, reparo específico…"
                  className={`${inputClass} !h-11 min-w-0 flex-1 !py-0 text-[13px]`}
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addOtherService();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addOtherService}
                  disabled={saving}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-zinc-300/90 bg-white px-3 py-2 text-[13px] font-semibold text-zinc-800 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
                >
                  <Plus className="h-4 w-4" />
                  Add
                </button>
              </div>
            </div>

            {serviceDrafts.length > 0 ? (
              <div className="space-y-2.5">
                <p className="text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Serviços na avaliação ({serviceDrafts.length})
                </p>
                {serviceDrafts.map((draft) => {
                  const preset = draft.labPresetId
                    ? quickServices.find((p) => p.id === draft.labPresetId)
                    : null;
                  const allowPre = preset?.allowPreApproval === true;
                  return (
                    <div
                      key={draft.id}
                      className="rounded-xl border border-violet-500/20 bg-white/95 p-3 dark:border-violet-400/20 dark:bg-zinc-950/60"
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">
                          {draft.description}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeDraft(draft.id)}
                          disabled={saving}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                          aria-label="Remover serviço"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-3 text-[13px]">
                        <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                          <input
                            type="checkbox"
                            checked={draft.outsourced}
                            onChange={(e) => updateDraft(draft.id, { outsourced: e.target.checked })}
                            disabled={saving}
                            className="h-4 w-4 rounded"
                          />
                          Terceirizado
                        </label>
                        {allowPre ? (
                          <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-200">
                            <input
                              type="checkbox"
                              checked={draft.preApproved}
                              onChange={(e) => updateDraft(draft.id, { preApproved: e.target.checked })}
                              disabled={saving}
                              className="h-4 w-4 rounded"
                            />
                            Limpeza pré-aprovada
                          </label>
                        ) : null}
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            Valor sugerido (interno)
                          </label>
                          <input
                            value={draft.suggestedValueInput}
                            onChange={(e) => updateDraft(draft.id, { suggestedValueInput: e.target.value })}
                            placeholder="Ex.: 450,00"
                            className={`${inputClass} !h-10 !py-0 text-[13px]`}
                            disabled={saving}
                          />
                          {parseSuggestedValueInput(draft.suggestedValueInput) != null ? (
                            <p className="mt-0.5 text-[11px] text-violet-700 dark:text-violet-300">
                              {formatSuggestedValueBrl(parseSuggestedValueInput(draft.suggestedValueInput))}
                            </p>
                          ) : null}
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                            Observações do serviço
                          </label>
                          <input
                            value={draft.lineObservations}
                            onChange={(e) => updateDraft(draft.id, { lineObservations: e.target.value })}
                            placeholder="Opcional"
                            className={`${inputClass} !h-10 !py-0 text-[13px]`}
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}

            <BudgetPartsEditor
              parts={parts}
              onChange={setParts}
              workshopParts={workshopParts}
              inputClass={inputClass}
              insetClass={partsInset}
              disabled={saving}
            />

            <div>
              <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Observações gerais
              </label>
              <textarea
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
                placeholder="Informações para o orçamentista…"
                rows={2}
                className={`${inputClass} min-h-[72px] resize-y text-[13px]`}
                disabled={saving}
              />
            </div>

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving || serviceDrafts.length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3.5 text-[14px] font-bold text-white shadow-md shadow-violet-500/25 transition hover:brightness-105 disabled:opacity-55"
            >
              {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Enviar avaliação para orçamento
            </button>
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
