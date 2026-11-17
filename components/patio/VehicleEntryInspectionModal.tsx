import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import {
  getVehicleEntryInspection,
  saveVehicleEntryInspection,
  startVehicleEntryInspection,
  type EntryAnswerRecordDto,
  type EntryAnswerValueDto,
  type EntryQuestionSnapshotDto,
  type VehicleEntryInspectionDto,
} from '../../services/apiService';
import {
  ENTRY_ANSWER_LABELS,
  ENTRY_GROUP_LABELS,
  ENTRY_STATUS_LABELS,
  type EntryQuestionGroup,
} from '../../utils/vehicleEntryInspection';
import { ModalPortal } from '../ui/ModalPortal';
import { resolveIosModalOverlayClass } from '../ui/iosModalStyles';
import { useDesktopShellLayout } from '../ui/DesktopShellContext';
import {
  modalBackdropAnimClass,
  modalSheetAnimClass,
  useAnimatedModalClose,
} from '../../hooks/useModalExitAnimation';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  serviceOrderId: string;
  canEdit: boolean;
  vehicleLabel?: string;
};

type DraftAnswers = Record<string, EntryAnswerRecordDto>;

const GROUP_ORDER: EntryQuestionGroup[] = [
  'condicoes_gerais',
  'sistema_freios',
  'sistema_abs',
];

export const VehicleEntryInspectionModal: React.FC<Props> = ({
  isOpen,
  onClose,
  serviceOrderId,
  canEdit,
  vehicleLabel,
}) => {
  const isDesktopShell = useDesktopShellLayout();
  const { exiting, requestClose } = useAnimatedModalClose(isOpen, onClose);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [inspection, setInspection] = useState<VehicleEntryInspectionDto | null>(null);
  const [questions, setQuestions] = useState<EntryQuestionSnapshotDto[]>([]);
  const [draft, setDraft] = useState<DraftAnswers>({});
  const [observations, setObservations] = useState('');

  const load = useCallback(async () => {
    if (!serviceOrderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getVehicleEntryInspection(serviceOrderId);
      setQuestions(res.inspection?.questionSnapshot || res.definition.questions);
      setInspection(res.inspection);
      setDraft(res.inspection?.answers || {});
      setObservations(res.inspection?.observations || '');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [serviceOrderId]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  const grouped = useMemo(() => {
    return GROUP_ORDER.map((g) => ({
      group: g,
      items: questions.filter((q) => q.group === g).sort((a, b) => a.order - b.order),
    })).filter((g) => g.items.length > 0);
  }, [questions]);

  const setAnswer = (qid: string, value: EntryAnswerValueDto) => {
    setDraft((prev) => ({
      ...prev,
      [qid]: { ...(prev[qid] || {}), value, note: prev[qid]?.note ?? null },
    }));
  };

  const setNote = (qid: string, note: string) => {
    setDraft((prev) => ({
      ...prev,
      [qid]: { ...(prev[qid] || { value: null }), note },
    }));
  };

  const ensureStarted = async (): Promise<VehicleEntryInspectionDto> => {
    if (inspection) return inspection;
    const res = await startVehicleEntryInspection(serviceOrderId);
    setInspection(res.inspection);
    setQuestions(res.inspection.questionSnapshot);
    return res.inspection;
  };

  const persist = async (opts?: { markCompleted?: boolean }) => {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    setMsg(null);
    try {
      const current = await ensureStarted();
      const res = await saveVehicleEntryInspection(serviceOrderId, {
        answers: draft,
        observations: observations.trim() || null,
        expectedUpdatedAt: current.updatedAt,
        markCompleted: opts?.markCompleted,
      });
      setInspection(res.inspection);
      setDraft(res.inspection.answers);
      setMsg(opts?.markCompleted ? 'Inspeção concluída.' : 'Respostas salvas.');
    } catch (e: unknown) {
      const err = e as Error & { code?: string; inspection?: VehicleEntryInspectionDto };
      if (err.code === 'cas_conflict' && err.inspection) {
        setInspection(err.inspection);
        setDraft(err.inspection.answers);
        setQuestions(err.inspection.questionSnapshot);
      }
      setError(err.message || 'Falha ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const progress = inspection?.progress;

  return (
    <ModalPortal forceBody onRequestClose={requestClose}>
      <div
        className={`${resolveIosModalOverlayClass(isDesktopShell, 'z-[120]')} ${modalBackdropAnimClass(exiting)}`}
        onClick={requestClose}
        role="presentation"
      >
        <div
          className={`flex w-full min-h-0 flex-col overflow-hidden border-0 bg-white shadow-2xl dark:bg-zinc-900 ${
            isDesktopShell
              ? 'h-[min(820px,92dvh)] max-h-[min(820px,92dvh)] max-w-2xl rounded-[1.75rem]'
              : 'h-[min(920px,96dvh)] max-h-[min(920px,96dvh)] max-w-lg rounded-[1.75rem]'
          } ${modalSheetAnimClass(exiting)}`}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Inspeção de Entrada"
        >
          <header className="flex shrink-0 items-start gap-3 border-b border-zinc-200/90 px-4 py-3 dark:border-zinc-700">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
                Condições de chegada
              </p>
              <h2 className="text-[17px] font-semibold tracking-tight text-zinc-900 dark:text-white">
                Inspeção de Entrada
              </h2>
              {vehicleLabel ? (
                <p className="truncate text-[12px] text-zinc-500">{vehicleLabel}</p>
              ) : null}
              {inspection ? (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {ENTRY_STATUS_LABELS[inspection.status]}
                  </span>
                  <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                    {progress?.answered ?? 0}/{progress?.total ?? questions.length}
                  </span>
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={requestClose}
              className="rounded-full p-2 text-zinc-500 transition hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-zinc-800"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 custom-scrollbar">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
              </div>
            ) : (
              <div className="space-y-5">
                {error ? (
                  <p className="rounded-xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                    {error}
                  </p>
                ) : null}
                {msg ? (
                  <p className="rounded-xl border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                    {msg}
                  </p>
                ) : null}

                <p className="text-[12px] text-zinc-500">
                  Registro simples das condições em que o veículo chegou. Não bloqueia diagnóstico
                  nem movimentação da OS.
                </p>

                {grouped.map(({ group, items }) => (
                  <section key={group} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">
                        {ENTRY_GROUP_LABELS[group]}
                      </h3>
                      <div className="h-px flex-1 bg-zinc-200/80 dark:bg-white/10" />
                    </div>
                    <ul className="space-y-2.5">
                      {items.map((question) => {
                        const ans = draft[question.id];
                        const value = ans?.value ?? null;
                        return (
                          <li
                            key={question.id}
                            className="rounded-xl border border-zinc-200/80 bg-zinc-50/50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.02]"
                          >
                            <p className="text-[13px] font-medium text-zinc-900 dark:text-white">
                              {question.order}. {question.prompt}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {question.options.map((opt) => {
                                const selected = value === opt;
                                const label =
                                  ENTRY_ANSWER_LABELS[opt as keyof typeof ENTRY_ANSWER_LABELS] ||
                                  opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    disabled={!canEdit || saving}
                                    onClick={() => setAnswer(question.id, opt)}
                                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition active:scale-[0.97] disabled:opacity-50 ${
                                      selected
                                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                        : 'border border-zinc-200 bg-white text-zinc-700 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-200'
                                    }`}
                                  >
                                    {label}
                                  </button>
                                );
                              })}
                            </div>
                            <input
                              type="text"
                              disabled={!canEdit || saving}
                              value={ans?.note || ''}
                              onChange={(e) => setNote(question.id, e.target.value)}
                              placeholder="Observação (opcional)"
                              className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-zinc-400 disabled:opacity-60 dark:border-white/10 dark:bg-zinc-950"
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}

                <section className="space-y-2">
                  <h3 className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">
                    Observações gerais
                  </h3>
                  <textarea
                    disabled={!canEdit || saving}
                    value={observations}
                    onChange={(e) => setObservations(e.target.value)}
                    rows={3}
                    placeholder="Notas livres da inspeção…"
                    className="w-full resize-none rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-zinc-950"
                  />
                </section>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-zinc-200/90 px-4 py-3 dark:border-zinc-700">
            <button
              type="button"
              onClick={requestClose}
              className="rounded-xl px-3 py-2 text-[13px] font-semibold text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Fechar
            </button>
            {canEdit ? (
              <>
                <button
                  type="button"
                  disabled={saving || loading}
                  onClick={() => void persist()}
                  className="rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[13px] font-semibold disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
                </button>
                <button
                  type="button"
                  disabled={saving || loading}
                  onClick={() => void persist({ markCompleted: true })}
                  className="rounded-xl bg-zinc-900 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-zinc-900"
                >
                  Concluir inspeção
                </button>
              </>
            ) : null}
          </footer>
        </div>
      </div>
    </ModalPortal>
  );
};
