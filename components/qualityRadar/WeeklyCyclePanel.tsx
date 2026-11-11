import React, { useCallback, useEffect, useState } from 'react';
import {
  Archive,
  Check,
  Download,
  Loader2,
  Play,
  RefreshCw,
  SkipForward,
  AlertTriangle,
} from 'lucide-react';
import {
  approveQualityPersonWeeklyReport,
  approveQualityTeamWeeklyReport,
  getQualityPersonWeeklyReport,
  getQualityTeamWeeklyReport,
  getQualityWeeklyCycle,
  getQualityWeeklyCycleSettings,
  listQualityWeeklyCycles,
  prepareQualityWeeklyCycle,
  saveQualityPersonWeeklyReport,
  saveQualityTeamWeeklyReport,
  skipQualityPersonWeeklyReport,
  updateQualityWeeklyCycleSettings,
  type QualityWeeklyCycle,
  type QualityWeeklyPersonReport,
} from '../../services/apiService';
import {
  downloadQualityPersonWeeklyPdf,
  downloadQualityTeamWeeklyPdf,
} from '../../utils/qualityWeeklyReportsPdf';
import { hub } from './hubTheme';

type Props = {
  onOpenInterview?: (weeklyReviewId: string | null, personName: string) => void;
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  in_progress: 'Em elaboração',
  awaiting_review: 'Aguardando revisão',
  approved: 'Aprovado',
  archived: 'Arquivado',
  skipped: 'Pulado',
  insufficient_data: 'Sem dados suficientes',
};

/**
 * Ciclo semanal + relatórios individuais/equipe (Fase 4).
 */
export function WeeklyCyclePanel({ onOpenInterview }: Props) {
  const [cycles, setCycles] = useState<QualityWeeklyCycle[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reports, setReports] = useState<QualityWeeklyPersonReport[]>([]);
  const [cycle, setCycle] = useState<QualityWeeklyCycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState<{
    enabled: boolean;
    weekday: number;
    hour: number;
    minute: number;
    timezone: string;
  } | null>(null);
  const [lastRun, setLastRun] = useState<Record<string, unknown> | null>(null);
  const [schedulerNotes, setSchedulerNotes] = useState<string>('');
  const [editReportId, setEditReportId] = useState<string | null>(null);
  const [editAnalysis, setEditAnalysis] = useState({
    overall: '',
    strengths: '',
    difficulties: '',
    bestSkills: '',
    evolutionVsPrior: '',
    autonomyAndOrganization: '',
    collaboration: '',
    technicalDevelopment: '',
    errorsAndCorrectives: '',
  });
  const [editAction, setEditAction] = useState({
    improvements: '',
    trainings: '',
    nextWeekGoals: '',
    ownersAndDeadlines: '',
  });
  const [editConclusion, setEditConclusion] = useState({
    periodSynthesis: '',
    leaderObservations: '',
    directorateDiscussionPoints: '',
  });
  const [teamBody, setTeamBody] = useState({
    weekSummary: '',
    teamWins: '',
    recurringDifficulties: '',
    trainingNeeds: '',
    observedImprovements: '',
    operationalIssues: '',
    pdiSituation: '',
    nextWeekCommitments: '',
  });

  const loadCycles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, sett] = await Promise.all([
        listQualityWeeklyCycles(),
        getQualityWeeklyCycleSettings(),
      ]);
      setCycles(list.cycles || []);
      if (list.code === 'MIGRATION_PENDING') {
        setError(list.error || 'Migration Fase 4 pendente.');
      }
      setSettings(sett.schedule);
      setLastRun((sett.lastRun as Record<string, unknown>) || null);
      setSchedulerNotes(sett.schedulerNotes?.preferred || '');
      if (!activeId && list.cycles?.[0]?.id) {
        setActiveId(list.cycles[0].id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar ciclos.');
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  const loadCycleDetail = useCallback(async (id: string) => {
    setBusy(true);
    try {
      const data = await getQualityWeeklyCycle(id);
      setCycle(data.cycle);
      setReports(data.reports || []);
      try {
        const team = await getQualityTeamWeeklyReport(id);
        const body = (team.versions?.[0]?.body_json || {}) as Record<string, string>;
        setTeamBody((prev) => ({
          ...prev,
          weekSummary: body.weekSummary || '',
          teamWins: body.teamWins || '',
          recurringDifficulties: body.recurringDifficulties || '',
          trainingNeeds: body.trainingNeeds || '',
          observedImprovements: body.observedImprovements || '',
          operationalIssues: body.operationalIssues || '',
          pdiSituation: body.pdiSituation || '',
          nextWeekCommitments: body.nextWeekCommitments || '',
        }));
      } catch {
        /* ok */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao abrir ciclo.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void loadCycles();
  }, [loadCycles]);

  useEffect(() => {
    if (activeId) void loadCycleDetail(activeId);
  }, [activeId, loadCycleDetail]);

  const runPrepare = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await prepareQualityWeeklyCycle({ force: true, notify: true });
      if (!res.ok) throw new Error(res.error || res.skipReason || 'Preparação falhou');
      await loadCycles();
      if (res.cycleId) setActiveId(res.cycleId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha na preparação.');
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      const res = await updateQualityWeeklyCycleSettings(settings);
      setSettings(res.schedule);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar agenda.');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = async (reportId: string) => {
    setBusy(true);
    try {
      const data = await getQualityPersonWeeklyReport(reportId);
      const v = data.versions?.[0];
      setEditReportId(reportId);
      setEditAnalysis({
        overall: String(v?.analysis_json?.overall || ''),
        strengths: String(v?.analysis_json?.strengths || ''),
        difficulties: String(v?.analysis_json?.difficulties || ''),
        bestSkills: String(v?.analysis_json?.bestSkills || ''),
        evolutionVsPrior: String(v?.analysis_json?.evolutionVsPrior || ''),
        autonomyAndOrganization: String(v?.analysis_json?.autonomyAndOrganization || ''),
        collaboration: String(v?.analysis_json?.collaboration || ''),
        technicalDevelopment: String(v?.analysis_json?.technicalDevelopment || ''),
        errorsAndCorrectives: String(v?.analysis_json?.errorsAndCorrectives || ''),
      });
      setEditAction({
        improvements: String(v?.action_plan_json?.improvements || ''),
        trainings: String(v?.action_plan_json?.trainings || ''),
        nextWeekGoals: String(v?.action_plan_json?.nextWeekGoals || ''),
        ownersAndDeadlines: String(v?.action_plan_json?.ownersAndDeadlines || ''),
      });
      setEditConclusion({
        periodSynthesis: String(v?.conclusion_json?.periodSynthesis || ''),
        leaderObservations: String(v?.conclusion_json?.leaderObservations || ''),
        directorateDiscussionPoints: String(
          v?.conclusion_json?.directorateDiscussionPoints || ''
        ),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar relatório.');
    } finally {
      setBusy(false);
    }
  };

  const saveEdit = async () => {
    if (!editReportId) return;
    setBusy(true);
    try {
      await saveQualityPersonWeeklyReport(editReportId, {
        analysis: editAnalysis,
        actionPlan: editAction,
        conclusion: editConclusion,
      });
      if (activeId) await loadCycleDetail(activeId);
      setEditReportId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  const exportPersonPdf = async (reportId: string) => {
    const data = await getQualityPersonWeeklyReport(reportId);
    const v = data.versions?.[0];
    if (!v) return;
    downloadQualityPersonWeeklyPdf({
      header: (v.header_json || {
        personName: data.report.person_name,
        jobTitle: data.report.job_title,
        periodFrom: cycle?.week_from || '',
        periodTo: cycle?.week_to || '',
        leaderName: data.report.leader_name || '',
        elaboratedAt: v.created_at || new Date().toISOString(),
      }) as {
        personName: string;
        jobTitle: string;
        periodFrom: string;
        periodTo: string;
        leaderName: string;
        elaboratedAt: string;
      },
      indicators: (v.indicators_json || {}) as Record<string, number | null>,
      analysis: (v.analysis_json || {}) as Record<string, string>,
      actionPlan: (v.action_plan_json || {}) as Record<string, string>,
      conclusion: (v.conclusion_json || {}) as Record<string, string>,
      unavailableFields: (v.unavailable_fields as string[]) || [],
    });
  };

  const exportTeamPdf = async () => {
    if (!activeId || !cycle) return;
    const team = await getQualityTeamWeeklyReport(activeId);
    const body = (team.versions?.[0]?.body_json || teamBody) as typeof teamBody & {
      noteNoRanking?: string;
      unavailableFields?: string[];
    };
    downloadQualityTeamWeeklyPdf({
      weekFrom: cycle.week_from,
      weekTo: cycle.week_to,
      body: {
        ...teamBody,
        ...body,
        noteNoRanking:
          body.noteNoRanking ||
          'Este consolidado não ranqueia profissionais de níveis ou funções diferentes.',
      },
      approvedByName: team.teamReport?.approved_by_name,
    });
  };

  return (
    <div className={hub.stack}>
      <div className={`${hub.surface} ${hub.cardPad} md:p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[17px] font-semibold">Ciclo semanal inteligente</h2>
            <p className={`mt-1 text-[13px] ${hub.muted}`}>
              Preparação automática sem LLM longo. Entrevista com a RDA; aprovação humana;
              PDF para diretoria. Sem notas automáticas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={hub.btnPrimary} disabled={busy} onClick={() => void runPrepare()}>
              <Play className="h-4 w-4" /> Preparar semana
            </button>
            <button type="button" className={hub.btnSecondary} disabled={busy} onClick={() => void loadCycles()}>
              <RefreshCw className="h-4 w-4" /> Atualizar
            </button>
          </div>
        </div>
        {error && <p className="mt-3 text-[12px] text-amber-700 dark:text-amber-300">{error}</p>}
        {lastRun && (
          <p className={`mt-2 text-[12px] ${hub.muted}`}>
            Última execução: {String(lastRun.started_at || '')} · ok={String(lastRun.ok)} ·
            skipped={String(lastRun.skipped)} · prepared={String(lastRun.persons_prepared ?? 0)}
          </p>
        )}
        {schedulerNotes && (
          <p className={`mt-1 text-[11px] ${hub.muted}`}>Agendador: {schedulerNotes}</p>
        )}
      </div>

      {settings && (
        <div className={`${hub.surface} ${hub.cardPad}`}>
          <h3 className="text-[14px] font-semibold">Agendamento</h3>
          <p className={`mt-1 text-[12px] ${hub.muted}`}>
            Padrão: sexta 16h America/Sao_Paulo. Vercel Hobby não tem cron semanal nativo —
            use pg_cron ou cron diário com janela local.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-[12px] font-semibold text-zinc-500">
              Ativo
              <select
                className={`${hub.select} mt-1 w-full`}
                value={settings.enabled ? '1' : '0'}
                onChange={(e) =>
                  setSettings({ ...settings, enabled: e.target.value === '1' })
                }
              >
                <option value="1">Sim</option>
                <option value="0">Não</option>
              </select>
            </label>
            <label className="text-[12px] font-semibold text-zinc-500">
              Dia (0=dom…5=sex)
              <input
                className={`${hub.input} mt-1`}
                type="number"
                min={0}
                max={6}
                value={settings.weekday}
                onChange={(e) =>
                  setSettings({ ...settings, weekday: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-[12px] font-semibold text-zinc-500">
              Hora
              <input
                className={`${hub.input} mt-1`}
                type="number"
                min={0}
                max={23}
                value={settings.hour}
                onChange={(e) => setSettings({ ...settings, hour: Number(e.target.value) })}
              />
            </label>
            <label className="text-[12px] font-semibold text-zinc-500">
              Minuto
              <input
                className={`${hub.input} mt-1`}
                type="number"
                min={0}
                max={59}
                value={settings.minute}
                onChange={(e) =>
                  setSettings({ ...settings, minute: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-[12px] font-semibold text-zinc-500">
              Fuso
              <input
                className={`${hub.input} mt-1`}
                value={settings.timezone}
                onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              />
            </label>
          </div>
          <button type="button" className={`${hub.btnSecondary} mt-3`} disabled={busy} onClick={() => void saveSettings()}>
            Salvar agenda
          </button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        <div className={`${hub.surface} overflow-hidden`}>
          <div className="border-b border-zinc-200 px-3 py-2 text-[13px] font-semibold dark:border-zinc-800">
            Ciclos
          </div>
          {loading ? (
            <div className={`flex items-center gap-2 p-3 text-[12px] ${hub.muted}`}>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> …
            </div>
          ) : cycles.length === 0 ? (
            <p className={`p-3 text-[12px] ${hub.muted}`}>Nenhum ciclo. Prepare a semana.</p>
          ) : (
            <ul className="max-h-[420px] overflow-y-auto">
              {cycles.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={`w-full px-3 py-2.5 text-left text-[12px] ${
                      activeId === c.id
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-900'
                    }`}
                    onClick={() => setActiveId(c.id)}
                  >
                    <div className="font-semibold">
                      {c.week_from} → {c.week_to}
                    </div>
                    <div className="opacity-80">
                      {STATUS_LABEL[c.status] || c.status} · {c.person_count} pessoas
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-3">
          {cycle && (
            <>
              <div className={`${hub.surface} ${hub.cardPad}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-[15px] font-semibold">
                      Semana {cycle.week_from} → {cycle.week_to}
                    </h3>
                    <p className={`text-[12px] ${hub.muted}`}>
                      {STATUS_LABEL[cycle.status] || cycle.status} · aprovados{' '}
                      {cycle.approved_count}/{cycle.person_count}
                    </p>
                  </div>
                  <button type="button" className={hub.btnSecondary} onClick={() => void exportTeamPdf()}>
                    <Download className="h-4 w-4" /> PDF equipe
                  </button>
                </div>
              </div>

              <div className={`${hub.surface} overflow-hidden`}>
                <div className="border-b border-zinc-200 px-4 py-2 text-[13px] font-semibold dark:border-zinc-800">
                  Relatórios individuais
                </div>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {reports.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[14px] font-semibold">{r.person_name}</div>
                        <div className={`text-[12px] ${hub.muted}`}>
                          {STATUS_LABEL[r.status] || r.status}
                          {r.job_title ? ` · ${r.job_title}` : ''}
                        </div>
                      </div>
                      <button
                        type="button"
                        className={hub.btnGhost}
                        onClick={() =>
                          onOpenInterview?.(r.weekly_review_id || null, r.person_name)
                        }
                      >
                        Entrevista RDA
                      </button>
                      <button type="button" className={hub.btnGhost} onClick={() => void openEdit(r.id)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className={hub.btnGhost}
                        onClick={() =>
                          void skipQualityPersonWeeklyReport(r.id, {
                            reason: 'Pulado nesta semana',
                          }).then(() => activeId && loadCycleDetail(activeId))
                        }
                      >
                        <SkipForward className="h-3.5 w-3.5" /> Pular
                      </button>
                      <button
                        type="button"
                        className={hub.btnGhost}
                        onClick={() =>
                          void skipQualityPersonWeeklyReport(r.id, {
                            reason: 'Informações insuficientes',
                            insufficientData: true,
                          }).then(() => activeId && loadCycleDetail(activeId))
                        }
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Sem dados
                      </button>
                      <button
                        type="button"
                        className={hub.btnSecondary}
                        onClick={() => void exportPersonPdf(r.id)}
                      >
                        <Download className="h-3.5 w-3.5" /> PDF
                      </button>
                      {r.status !== 'approved' && (
                        <button
                          type="button"
                          className={hub.btnPrimary}
                          onClick={() =>
                            void approveQualityPersonWeeklyReport(r.id).then(
                              () => activeId && loadCycleDetail(activeId)
                            )
                          }
                        >
                          <Check className="h-3.5 w-3.5" /> Aprovar
                        </button>
                      )}
                    </li>
                  ))}
                  {reports.length === 0 && (
                    <li className={`px-4 py-3 text-[13px] ${hub.muted}`}>
                      Nenhum relatório neste ciclo.
                    </li>
                  )}
                </ul>
              </div>

              <div className={`${hub.surface} ${hub.cardPad}`}>
                <h3 className="mb-2 text-[14px] font-semibold">Consolidado da equipe</h3>
                <p className={`mb-3 text-[11px] ${hub.muted}`}>
                  Sem rankings entre funções/níveis diferentes.
                </p>
                <div className="grid gap-2 md:grid-cols-2">
                  {(
                    [
                      ['weekSummary', 'Resumo'],
                      ['teamWins', 'Conquistas'],
                      ['recurringDifficulties', 'Dificuldades'],
                      ['trainingNeeds', 'Treinamentos'],
                      ['observedImprovements', 'Melhorias'],
                      ['operationalIssues', 'Operacional'],
                      ['pdiSituation', 'PDIs'],
                      ['nextWeekCommitments', 'Compromissos'],
                    ] as const
                  ).map(([k, label]) => (
                    <label key={k} className="text-[11px] font-semibold text-zinc-500">
                      {label}
                      <textarea
                        className={`${hub.input} mt-1 min-h-[64px] text-[13px]`}
                        value={teamBody[k]}
                        onChange={(e) => setTeamBody((b) => ({ ...b, [k]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={hub.btnSecondary}
                    disabled={busy || !activeId}
                    onClick={() =>
                      activeId &&
                      void saveQualityTeamWeeklyReport(activeId, teamBody).then(() =>
                        loadCycleDetail(activeId)
                      )
                    }
                  >
                    Salvar consolidado
                  </button>
                  <button
                    type="button"
                    className={hub.btnPrimary}
                    disabled={busy || !activeId}
                    onClick={() =>
                      activeId &&
                      void approveQualityTeamWeeklyReport(activeId).then(() =>
                        loadCycleDetail(activeId)
                      )
                    }
                  >
                    <Archive className="h-4 w-4" /> Aprovar consolidado
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {editReportId && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 md:items-center">
          <div className={`${hub.surface} max-h-[90vh] w-full max-w-2xl overflow-y-auto p-4`}>
            <h3 className="text-[15px] font-semibold">Editar relatório (nova versão)</h3>
            <p className={`mb-3 text-[12px] ${hub.muted}`}>
              Correções criam versão nova — a anterior permanece no histórico.
            </p>
            <div className="space-y-2">
              {(Object.keys(editAnalysis) as Array<keyof typeof editAnalysis>).map((k) => (
                <label key={k} className="block text-[11px] font-semibold text-zinc-500">
                  {k}
                  <textarea
                    className={`${hub.input} mt-1 min-h-[52px] text-[13px]`}
                    value={editAnalysis[k]}
                    onChange={(e) => setEditAnalysis((a) => ({ ...a, [k]: e.target.value }))}
                  />
                </label>
              ))}
              {(Object.keys(editAction) as Array<keyof typeof editAction>).map((k) => (
                <label key={k} className="block text-[11px] font-semibold text-zinc-500">
                  {k}
                  <textarea
                    className={`${hub.input} mt-1 min-h-[52px] text-[13px]`}
                    value={editAction[k]}
                    onChange={(e) => setEditAction((a) => ({ ...a, [k]: e.target.value }))}
                  />
                </label>
              ))}
              {(Object.keys(editConclusion) as Array<keyof typeof editConclusion>).map((k) => (
                <label key={k} className="block text-[11px] font-semibold text-zinc-500">
                  {k}
                  <textarea
                    className={`${hub.input} mt-1 min-h-[52px] text-[13px]`}
                    value={editConclusion[k]}
                    onChange={(e) => setEditConclusion((a) => ({ ...a, [k]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className={hub.btnPrimary} disabled={busy} onClick={() => void saveEdit()}>
                Salvar versão
              </button>
              <button type="button" className={hub.btnGhost} onClick={() => setEditReportId(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
