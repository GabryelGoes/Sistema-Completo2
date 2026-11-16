import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  clearVehicleEntryInspectionCritical,
  confirmVehicleEntryRoadTest,
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
  ENTRY_ROAD_TEST_LABELS,
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
  'registro',
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
  const [clearNote, setClearNote] = useState('');
  const [confirmRoad, setConfirmRoad] = useState(false);

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
      setConfirmRoad(res.inspection?.roadTestStatus === 'performed');
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

  const handleClearCritical = async () => {
    if (!inspection || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await clearVehicleEntryInspectionCritical(serviceOrderId, {
        note: clearNote.trim(),
        expectedUpdatedAt: inspection.updatedAt,
      });
      setInspection(res.inspection);
      setClearNote('');
      setMsg('Bloqueio liberado após avaliação técnica.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao liberar.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmRoad = async () => {
    if (!inspection || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      // Salva rascunho antes de confirmar rodagem.
      const saved = await saveVehicleEntryInspection(serviceOrderId, {
        answers: draft,
        observations: observations.trim() || null,
        expectedUpdatedAt: inspection.updatedAt,
      });
      const res = await confirmVehicleEntryRoadTest(serviceOrderId, {
        confirm: true,
        expectedUpdatedAt: saved.inspection.updatedAt,
      });
      setInspection(res.inspection);
      setConfirmRoad(true);
      setMsg('Teste de rodagem registrado como realizado.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao confirmar rodagem.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const progress = inspection?.progress;
  const blocks = !!inspection?.safety?.blocksRoadTest;

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
                Antes do diagnóstico
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
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold ${
                      blocks
                        ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {ENTRY_ROAD_TEST_LABELS[inspection.roadTestStatus]}
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

                {blocks ? (
                  <div className="rounded-2xl border border-rose-300/60 bg-rose-50/90 px-3 py-3 dark:border-rose-800 dark:bg-rose-950/40">
                    <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-rose-800 dark:text-rose-200">
                      <ShieldAlert className="h-4 w-4" />
                      Condições críticas — teste de rodagem bloqueado
                    </p>
                    <ul className="mt-1.5 space-y-0.5">
                      {(inspection?.safety.criticalFindings || []).map((f) => (
                        <li key={f.questionId} className="text-[12px] text-rose-800/90 dark:text-rose-100/90">
                          · {f.message}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-rose-700/80 dark:text-rose-200/70">
                      Atendimento, inspeção estática e diagnóstico continuam liberados. Só a
                      liberação/registro de rodagem fica restrito até avaliação técnica.
                    </p>
                    {canEdit && !inspection?.criticalCleared ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={clearNote}
                          onChange={(e) => setClearNote(e.target.value)}
                          rows={2}
                          placeholder="Avaliação técnica para liberar o bloqueio…"
                          className="w-full resize-none rounded-xl border border-rose-200 bg-white px-3 py-2 text-[13px] outline-none focus:border-rose-400 dark:border-rose-900 dark:bg-zinc-950"
                        />
                        <button
                          type="button"
                          disabled={saving || clearNote.trim().length < 8}
                          onClick={() => void handleClearCritical()}
                          className="rounded-xl bg-rose-700 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
                        >
                          Liberar após avaliação
                        </button>
                      </div>
                    ) : null}
                    {inspection?.criticalCleared ? (
                      <p className="mt-2 text-[11px] text-emerald-800 dark:text-emerald-300">
                        Liberado por {inspection.criticalClearedBy || 'técnico'}:{' '}
                        {inspection.criticalClearanceNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {grouped.map(({ group, items }) => (
                  <section key={group} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">
                        {ENTRY_GROUP_LABELS[group]}
                      </h3>
                      <div className="h-px flex-1 bg-zinc-200/80 dark:bg-white/10" />
                    </div>
                    <ul className="space-y-2.5">
                      {items.map((q) => {
                        const ans = draft[q.id];
                        const value = ans?.value ?? null;
                        const isCritical = value && q.criticalValues.includes(value);
                        const needsNote =
                          q.requireJustificationIfUnchecked && value === 'nao_verificado';
                        return (
                          <li
                            key={q.id}
                            className={`rounded-xl border px-3 py-2.5 ${
                              isCritical
                                ? 'border-rose-300/70 bg-rose-50/50 dark:border-rose-800 dark:bg-rose-950/20'
                                : 'border-zinc-200/80 bg-zinc-50/50 dark:border-white/10 dark:bg-white/[0.02]'
                            }`}
                          >
                            <p className="text-[13px] font-medium text-zinc-900 dark:text-white">
                              {q.order}. {q.prompt}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {q.options.map((opt) => {
                                const selected = value === opt;
                                return (
                                  <button
                                    key={opt}
                                    type="button"
                                    disabled={!canEdit || saving}
                                    onClick={() => setAnswer(q.id, opt)}
                                    className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition active:scale-[0.97] disabled:opacity-50 ${
                                      selected
                                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                                        : 'border border-zinc-200 bg-white text-zinc-700 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-200'
                                    }`}
                                  >
                                    {ENTRY_ANSWER_LABELS[opt]}
                                  </button>
                                );
                              })}
                            </div>
                            {needsNote || isCritical || (ans?.note && ans.note.trim()) ? (
                              <input
                                type="text"
                                disabled={!canEdit || saving}
                                value={ans?.note || ''}
                                onChange={(e) => setNote(q.id, e.target.value)}
                                placeholder={
                                  needsNote
                                    ? 'Justificativa obrigatória…'
                                    : 'Observação (opcional)'
                                }
                                className="mt-2 w-full rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-zinc-950"
                              />
                            ) : null}
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

                {inspection?.anomalySummary?.length ? (
                  <section className="rounded-xl border border-amber-300/50 bg-amber-50/80 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/30">
                    <p className="mb-1 inline-flex items-center gap-1 text-[12px] font-semibold text-amber-900 dark:text-amber-100">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Resumo de anomalias
                    </p>
                    <ul className="space-y-0.5">
                      {inspection.anomalySummary.map((a) => (
                        <li key={a} className="text-[11px] text-amber-900/90 dark:text-amber-100/85">
                          · {a}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1.5 text-[10px] text-amber-800/70 dark:text-amber-200/60">
                      Não constitui diagnóstico automático.
                    </p>
                  </section>
                ) : null}

                {canEdit ? (
                  <section className="rounded-xl border border-zinc-200/80 bg-zinc-50/60 px-3 py-3 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">
                      Teste de rodagem
                    </p>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      Só registre como realizado com confirmação explícita. Condições críticas
                      impedem o registro até avaliação técnica.
                    </p>
                    <label className="mt-2 flex items-start gap-2 text-[12px] text-zinc-700 dark:text-zinc-200">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={confirmRoad}
                        disabled={
                          saving ||
                          blocks ||
                          inspection?.roadTestStatus === 'performed'
                        }
                        onChange={(e) => setConfirmRoad(e.target.checked)}
                      />
                      Confirmo que o teste de rodagem foi realizado com segurança.
                    </label>
                    <button
                      type="button"
                      disabled={
                        saving ||
                        !confirmRoad ||
                        blocks ||
                        inspection?.roadTestStatus === 'performed'
                      }
                      onClick={() => void handleConfirmRoad()}
                      className="mt-2 inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-[12px] font-semibold disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900"
                    >
                      {inspection?.roadTestStatus === 'performed' ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          Já registrado
                        </>
                      ) : (
                        'Registrar teste de rodagem'
                      )}
                    </button>
                  </section>
                ) : null}
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
