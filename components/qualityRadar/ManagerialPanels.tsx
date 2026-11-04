import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  ChevronRight,
  ClipboardCheck,
  Flag,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { QualityIncident, RdaEvalRequest, RdaEvalScores } from '../../services/apiService';
import {
  QUALITY_CATEGORY_LABEL,
  QUALITY_FAULT_ATTRIBUTION_LABEL,
  QUALITY_RECOGNITION_CATEGORIES,
  QUALITY_RECOGNITION_CATEGORY_LABEL,
  type QualityIncidentCategory,
} from '../../constants/qualityRadar';
import {
  buildQualityRadarReport,
  formatReportPeriodLabel,
  type TechnicianQualityRow,
} from '../../utils/qualityRadarReports';
import {
  normalizeQualityRadarPersonKey,
  type QualityRadarTechnicianOption,
} from '../../utils/qualityRadarTechnicians';
import {
  criticalIncidentCount,
  incidentsForEmployee,
  investigationIncidents,
  openIncidentCount,
  provenFaultIncidents,
  recognitionsForEmployee,
  reworkIncidentCount,
} from '../../utils/qualityRadarPeople';
import { RDA_EVAL_COMPETENCY_LABELS } from '../../services/rdaIntelligence/evaluations/types';
import { hub } from './hubTheme';
import {
  HubEmptyState,
  HubPreparedNote,
  HubSectionHeader,
  HubStatCard,
} from './HubPrimitives';

export { EvaluationsPanel } from './EvaluationsPanel';

export function OverviewPanel({
  employees,
  incidents,
  loading,
  periodLabel,
  pendingEvaluations,
  evaluationsLoading,
  onOpenEmployees,
  onOpenIncidents,
  onOpenEvaluations,
}: {
  employees: QualityRadarTechnicianOption[];
  incidents: QualityIncident[];
  loading: boolean;
  periodLabel: string;
  pendingEvaluations: number | null;
  evaluationsLoading: boolean;
  onOpenEmployees: () => void;
  onOpenIncidents: () => void;
  onOpenEvaluations: () => void;
}) {
  const open = openIncidentCount(incidents);
  const critical = criticalIncidentCount(incidents);
  const dash = loading ? '—' : undefined;

  const alerts: { title: string; detail: string; action?: () => void }[] = [];
  if (!loading && critical > 0) {
    alerts.push({
      title: `${critical} ocorrência${critical === 1 ? '' : 's'} crítica${critical === 1 ? '' : 's'}`,
      detail: 'Requer atenção da gerência no histórico operacional.',
      action: onOpenIncidents,
    });
  }
  if (!loading && open > 0) {
    alerts.push({
      title: `${open} ocorrência${open === 1 ? '' : 's'} em aberto`,
      detail: 'Acompanhe status e planos de ação no histórico.',
      action: onOpenIncidents,
    });
  }
  if (!evaluationsLoading && (pendingEvaluations ?? 0) > 0) {
    alerts.push({
      title: `${pendingEvaluations} avaliação${pendingEvaluations === 1 ? '' : 'ões'} pendente${pendingEvaluations === 1 ? '' : 's'}`,
      detail: 'Fila gerencial após finalização de sessões de tempo.',
      action: onOpenEvaluations,
    });
  }

  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Visão Geral"
        subtitle={`Indicadores do período ${periodLabel}. Avaliações usam dados reais da fila RDA.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HubStatCard
          label="Funcionários"
          value={dash ?? employees.length}
          hint="Cadastros reais (técnicos e usuários)"
          emphasize
        />
        <HubStatCard
          label="Avaliações pendentes"
          value={evaluationsLoading ? '—' : (pendingEvaluations ?? 0)}
          hint="Solicitações aguardando gerente"
          emphasize={!evaluationsLoading && (pendingEvaluations ?? 0) > 0}
        />
        <HubStatCard
          label="Reuniões agendadas"
          value="—"
          prepared
          hint="Reuniões gerenciais ainda sem backend"
        />
        <HubStatCard
          label="Planos ativos"
          value="—"
          prepared
          hint="Planos de carreira ainda sem backend"
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <HubStatCard label="Ocorrências no período" value={dash ?? incidents.length} />
        <HubStatCard label="Ocorrências em aberto" value={dash ?? open} />
        <HubStatCard label="Críticas" value={dash ?? critical} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className={`${hub.surface} p-4`}>
          <p className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${hub.muted}`}>
            Atalhos
          </p>
          <div className="mt-3 flex flex-col gap-2">
            {[
              { label: 'Ver funcionários', onClick: onOpenEmployees, icon: Users },
              { label: 'Histórico de ocorrências', onClick: onOpenIncidents, icon: AlertTriangle },
              { label: 'Central de avaliações', onClick: onOpenEvaluations, icon: ClipboardCheck },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={item.onClick}
                className="flex items-center justify-between rounded-xl border border-zinc-200 bg-[#FAFAFA] px-3 py-3 text-left transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700"
              >
                <span className="flex items-center gap-2 text-[14px] font-semibold text-zinc-900 dark:text-white">
                  <item.icon className="h-4 w-4 text-zinc-500" />
                  {item.label}
                </span>
                <ChevronRight className="h-4 w-4 text-zinc-400" />
              </button>
            ))}
          </div>
        </div>

        <div className={`${hub.surface} p-4`}>
          <p className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${hub.muted}`}>
            Alertas e pendências
          </p>
          {alerts.length === 0 ? (
            <p className={`mt-4 text-[13px] ${hub.muted}`}>
              {loading
                ? 'Carregando…'
                : 'Nenhum alerta operacional no período. Filas de avaliação e reuniões entram nas próximas fases.'}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {alerts.map((a) => (
                <li key={a.title}>
                  <button
                    type="button"
                    onClick={a.action}
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-3 text-left dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">{a.title}</p>
                    <p className={`mt-0.5 text-[12px] ${hub.muted}`}>{a.detail}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function formatScoreRow(scores: RdaEvalScores | null): string {
  if (!scores) return 'Sem notas ainda';
  return `QT ${scores.technicalQuality} · Org ${scores.organization} · Proc ${scores.procedures} · Aut ${scores.autonomy} · Com ${scores.communication}`;
}

export function EmployeesPanel({
  employees,
  incidents,
  loading,
  onOpenIncidentsFor,
  periodFrom,
  periodTo,
}: {
  employees: QualityRadarTechnicianOption[];
  incidents: QualityIncident[];
  loading: boolean;
  onOpenIncidentsFor: (employeeSelectId: string) => void;
  periodFrom?: string;
  periodTo?: string;
}) {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [evalHistory, setEvalHistory] = useState<RdaEvalRequest[]>([]);
  const [evalAvg, setEvalAvg] = useState<RdaEvalScores | null>(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [recognitions, setRecognitions] = useState<
    import('../../services/apiService').QualityRecognition[]
  >([]);
  const [recogLoading, setRecogLoading] = useState(false);
  const [recogTitle, setRecogTitle] = useState('');
  const [recogCategory, setRecogCategory] = useState<
    import('../../services/apiService').QualityRecognitionCategory
  >('qualidade_execucao');
  const [recogDesc, setRecogDesc] = useState('');
  const [recogBusy, setRecogBusy] = useState(false);
  const [recogMsg, setRecogMsg] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return employees;
    return employees.filter(
      (e) =>
        e.name.toLowerCase().includes(needle) ||
        (e.jobTitle || '').toLowerCase().includes(needle)
    );
  }, [employees, q]);

  const selected = employees.find((e) => e.id === selectedId) ?? null;
  const selectedIncidents = selected ? incidentsForEmployee(incidents, selected) : [];
  const selectedProven = selected ? provenFaultIncidents(selectedIncidents) : [];
  const selectedInvestigation = selected ? investigationIncidents(selectedIncidents) : [];
  const selectedRecognitions = selected
    ? recognitionsForEmployee(recognitions, selected)
    : [];

  useEffect(() => {
    let cancelled = false;
    if (!selected?.systemUserId) {
      setEvalHistory([]);
      setEvalAvg(null);
      return;
    }
    setEvalLoading(true);
    void import('../../services/apiService')
      .then(({ getRdaEvalTechnicianHistory }) =>
        getRdaEvalTechnicianHistory(selected.systemUserId!)
      )
      .then((data) => {
        if (cancelled) return;
        setEvalHistory(data.requests ?? []);
        setEvalAvg(data.averageScores);
      })
      .catch(() => {
        if (cancelled) return;
        setEvalHistory([]);
        setEvalAvg(null);
      })
      .finally(() => {
        if (!cancelled) setEvalLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.systemUserId]);

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setRecognitions([]);
      return;
    }
    setRecogLoading(true);
    void import('../../services/apiService')
      .then(({ getQualityRecognitions }) =>
        getQualityRecognitions({
          technicianId: selected.workshopTechnicianId || undefined,
          systemUserId: selected.systemUserId || undefined,
          from: periodFrom,
          to: periodTo,
        })
      )
      .then((rows) => {
        if (!cancelled) setRecognitions(rows);
      })
      .catch(() => {
        if (!cancelled) setRecognitions([]);
      })
      .finally(() => {
        if (!cancelled) setRecogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    selected?.id,
    selected?.workshopTechnicianId,
    selected?.systemUserId,
    periodFrom,
    periodTo,
  ]);

  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Funcionários"
        subtitle="Identidade estável, ocorrências, reconhecimentos e avaliações — sem inventar nota quando não há dados."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className={`${hub.surface} p-4`}>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Pesquisar por nome ou cargo…"
            className={hub.input}
          />
          <p className={`mt-2 text-[12px] ${hub.muted}`}>
            {loading ? 'Carregando…' : `${filtered.length} de ${employees.length}`}
          </p>
          <div className="mt-3 max-h-[28rem] space-y-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className={`px-1 py-8 text-center text-[13px] ${hub.muted}`}>
                Nenhum funcionário encontrado.
              </p>
            ) : (
              filtered.map((e) => {
                const count = incidentsForEmployee(incidents, e).length;
                const active = selectedId === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setSelectedId(e.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${
                      active
                        ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                        : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{e.name}</span>
                      <span
                        className={`block truncate text-[12px] ${
                          active ? 'text-white/70 dark:text-zinc-600' : hub.muted
                        }`}
                      >
                        {e.jobTitle?.trim() ||
                          (e.source === 'workshop_technician' ? 'Técnico' : 'Usuário do sistema')}
                      </span>
                    </span>
                    <span
                      className={`ml-2 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-bold tabular-nums ${
                        active
                          ? 'bg-[#FFD60A] text-zinc-900'
                          : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>

        <div className={`${hub.surface} p-4`}>
          {!selected ? (
            <HubEmptyState
              icon={Users}
              title="Selecione um funcionário"
              description="O perfil mostra cargo, ocorrências, reconhecimentos e avaliações reais — sem inventar dados."
            />
          ) : (
            <div className="space-y-4">
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${hub.muted}`}>
                  Informações profissionais
                </p>
                <h3 className="mt-1 text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-white">
                  {selected.name}
                </h3>
                <p className={`mt-1 text-[13px] ${hub.muted}`}>
                  {selected.jobTitle?.trim() ||
                    (selected.source === 'linked'
                      ? 'Técnico vinculado ao usuário do sistema'
                      : selected.source === 'workshop_technician'
                        ? 'Técnico cadastrado (sem vínculo de login)'
                        : 'Usuário do sistema')}
                </p>
                <p className={`mt-1 text-[11px] font-mono ${hub.muted}`}>
                  ID {selected.id}
                  {selected.workshopTechnicianId ? ` · WT ${selected.workshopTechnicianId.slice(0, 8)}` : ''}
                  {selected.systemUserId ? ` · SU ${selected.systemUserId.slice(0, 8)}` : ''}
                </p>
              </div>

              {selected.possibleDuplicateIds && selected.possibleDuplicateIds.length > 0 ? (
                <div className="rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
                  <p className="font-semibold">Possível duplicidade de cadastro</p>
                  <p className="mt-1">
                    Outro registro com nome equivalente existe. Não unimos automaticamente —
                    confirme o vínculo só se for a mesma pessoa.
                  </p>
                  {selected.source === 'workshop_technician' &&
                  selected.possibleDuplicateIds.some((id) => id.startsWith('su:')) ? (
                    <button
                      type="button"
                      disabled={linkBusy}
                      className="mt-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
                      onClick={() => {
                        const suId = selected.possibleDuplicateIds!
                          .find((id) => id.startsWith('su:'))
                          ?.slice(3);
                        if (!selected.workshopTechnicianId || !suId) return;
                        const reason = window.prompt(
                          'Justificativa para unificar estes cadastros (obrigatória):'
                        );
                        if (!reason || reason.trim().length < 3) return;
                        setLinkBusy(true);
                        void import('../../services/apiService')
                          .then(({ proposeQualityPersonLink, confirmQualityPersonLink }) =>
                            proposeQualityPersonLink({
                              workshopTechnicianId: selected.workshopTechnicianId!,
                              systemUserId: suId,
                              proposedReason: reason.trim(),
                            }).then(() =>
                              confirmQualityPersonLink({
                                workshopTechnicianId: selected.workshopTechnicianId!,
                                systemUserId: suId,
                                note: reason.trim(),
                              })
                            )
                          )
                          .then(() => window.location.reload())
                          .catch((e) =>
                            window.alert(e instanceof Error ? e.message : 'Falha ao vincular')
                          )
                          .finally(() => setLinkBusy(false));
                      }}
                    >
                      Confirmar vínculo com usuário do sistema
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <HubStatCard label="Ocorrências" value={selectedIncidents.length} />
                <HubStatCard label="Em aberto" value={openIncidentCount(selectedIncidents)} />
                <HubStatCard label="Erro comprovado" value={selectedProven.length} />
                <HubStatCard label="Reconhecimentos" value={selectedRecognitions.length} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className={`${hub.surfaceInset} p-3`}>
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                    Pontos fortes (reconhecimentos)
                  </p>
                  {selectedRecognitions.length === 0 ? (
                    <p className={`mt-2 text-[12px] ${hub.muted}`}>
                      Sem reconhecimentos no período — ausência não é avaliação negativa.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {[...new Set(selectedRecognitions.map((r) => r.category))]
                        .slice(0, 5)
                        .map((c) => (
                          <li key={c} className={`text-[12px] ${hub.muted}`}>
                            {QUALITY_RECOGNITION_CATEGORY_LABEL[c] || c}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
                <div className={`${hub.surfaceInset} p-3`}>
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                    Dificuldades registradas
                  </p>
                  {selectedProven.length === 0 ? (
                    <p className={`mt-2 text-[12px] ${hub.muted}`}>
                      Sem erros comprovados. Em investigação: {selectedInvestigation.length}.
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {[...new Set(selectedProven.map((i) => i.category))]
                        .slice(0, 5)
                        .map((c) => (
                          <li key={c} className={`text-[12px] ${hub.muted}`}>
                            {QUALITY_CATEGORY_LABEL[c]}
                          </li>
                        ))}
                    </ul>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                    Ocorrências
                  </p>
                  <button
                    type="button"
                    className={hub.btnGhost}
                    onClick={() => onOpenIncidentsFor(selected.id)}
                  >
                    Ver todas
                  </button>
                </div>
                {selectedIncidents.length === 0 ? (
                  <p className={`rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-[13px] ${hub.muted} dark:border-zinc-700`}>
                    Sem ocorrências no período selecionado.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedIncidents.slice(0, 6).map((inc) => (
                      <li
                        key={inc.id}
                        className="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
                      >
                        <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                          {inc.title || 'Sem título'}
                        </p>
                        <p className={`mt-0.5 text-[12px] ${hub.muted}`}>
                          {QUALITY_CATEGORY_LABEL[inc.category]} ·{' '}
                          {QUALITY_FAULT_ATTRIBUTION_LABEL[
                            inc.faultAttribution || 'investigacao'
                          ] || 'Em investigação'}{' '}
                          · {new Date(inc.occurredAt).toLocaleDateString('pt-BR')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-2 text-[13px] font-semibold text-zinc-900 dark:text-white">
                  Conquistas e reconhecimentos
                </p>
                {recogLoading ? (
                  <p className={`text-[13px] ${hub.muted}`}>Carregando…</p>
                ) : selectedRecognitions.length === 0 ? (
                  <p className={`rounded-xl border border-dashed px-3 py-4 text-[13px] ${hub.muted}`}>
                    Nenhum reconhecimento no período.
                  </p>
                ) : (
                  <ul className="mb-3 space-y-2">
                    {selectedRecognitions.slice(0, 6).map((r) => (
                      <li
                        key={r.id}
                        className="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
                      >
                        <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                          {r.title || QUALITY_RECOGNITION_CATEGORY_LABEL[r.category]}
                        </p>
                        <p className={`mt-0.5 text-[12px] ${hub.muted}`}>
                          {QUALITY_RECOGNITION_CATEGORY_LABEL[r.category]} ·{' '}
                          {new Date(r.occurredAt).toLocaleDateString('pt-BR')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
                  <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
                    Novo reconhecimento
                  </p>
                  <select
                    className={`${hub.input} mt-2`}
                    value={recogCategory}
                    onChange={(e) =>
                      setRecogCategory(
                        e.target.value as import('../../services/apiService').QualityRecognitionCategory
                      )
                    }
                  >
                    {QUALITY_RECOGNITION_CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`${hub.input} mt-2`}
                    value={recogTitle}
                    onChange={(e) => setRecogTitle(e.target.value)}
                    placeholder="Título (opcional)"
                  />
                  <textarea
                    className={`${hub.input} mt-2 min-h-[64px]`}
                    value={recogDesc}
                    onChange={(e) => setRecogDesc(e.target.value)}
                    placeholder="Descrição do acontecimento positivo…"
                  />
                  <button
                    type="button"
                    disabled={recogBusy || !recogDesc.trim()}
                    className="mt-2 rounded-xl bg-[#FFD60A] px-3 py-2 text-[13px] font-semibold text-zinc-900 disabled:opacity-50"
                    onClick={() => {
                      setRecogBusy(true);
                      setRecogMsg(null);
                      void import('../../services/apiService')
                        .then(({ createQualityRecognition }) =>
                          createQualityRecognition({
                            technicianId: selected.workshopTechnicianId,
                            systemUserId: selected.systemUserId,
                            personName: selected.name,
                            category: recogCategory,
                            title: recogTitle.trim(),
                            description: recogDesc.trim(),
                          })
                        )
                        .then((created) => {
                          setRecognitions((prev) => [created, ...prev]);
                          setRecogTitle('');
                          setRecogDesc('');
                          setRecogMsg('Reconhecimento registrado.');
                        })
                        .catch((e) =>
                          setRecogMsg(e instanceof Error ? e.message : 'Falha ao salvar.')
                        )
                        .finally(() => setRecogBusy(false));
                    }}
                  >
                    {recogBusy ? 'Salvando…' : 'Registrar'}
                  </button>
                  {recogMsg ? <p className={`mt-2 text-[12px] ${hub.muted}`}>{recogMsg}</p> : null}
                </div>
              </div>

              <div>
                <p className="mb-2 text-[13px] font-semibold text-zinc-900 dark:text-white">
                  Avaliações gerenciais
                </p>
                {!selected.systemUserId ? (
                  <p className={`rounded-xl border border-dashed px-3 py-4 text-[13px] ${hub.muted}`}>
                    Vincule este cadastro a um usuário do sistema para ver avaliações de tempo RDA.
                  </p>
                ) : evalLoading ? (
                  <p className={`text-[13px] ${hub.muted}`}>Carregando avaliações…</p>
                ) : (
                  <>
                    <p className={`mb-2 text-[12px] ${hub.muted}`}>{formatScoreRow(evalAvg)}</p>
                    {evalHistory.filter((r) => r.status === 'evaluated').length === 0 ? (
                      <p className={`rounded-xl border border-dashed px-3 py-4 text-[13px] ${hub.muted}`}>
                        Sem avaliações registradas ainda.
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {evalHistory
                          .filter((r) => r.status === 'evaluated' && r.evaluation)
                          .slice(0, 5)
                          .map((r) => (
                            <li
                              key={r.id}
                              className="rounded-xl border border-zinc-200 px-3 py-2.5 dark:border-zinc-800"
                            >
                              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                                {r.serviceDescription?.trim() || 'Serviço'} ·{' '}
                                {r.evaluation
                                  ? (
                                      (r.evaluation.scores.technicalQuality +
                                        r.evaluation.scores.organization +
                                        r.evaluation.scores.procedures +
                                        r.evaluation.scores.autonomy +
                                        r.evaluation.scores.communication) /
                                      5
                                    ).toFixed(1)
                                  : '—'}
                              </p>
                              <p className={`mt-0.5 text-[12px] ${hub.muted}`}>
                                {r.evaluatedAt
                                  ? new Date(r.evaluatedAt).toLocaleDateString('pt-BR')
                                  : ''}
                                {r.evaluation?.positives
                                  ? ` · ${r.evaluation.positives.slice(0, 80)}`
                                  : ''}
                              </p>
                            </li>
                          ))}
                      </ul>
                    )}
                    <p className={`mt-2 text-[11px] ${hub.muted}`}>
                      Competências: {Object.values(RDA_EVAL_COMPETENCY_LABELS).join(' · ')}.
                      Ocorrências abaixo permanecem histórico operacional separado.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PerformancePanel({
  employees,
  incidents,
  loading,
  periodFrom,
  periodTo,
}: {
  employees: QualityRadarTechnicianOption[];
  incidents: QualityIncident[];
  loading: boolean;
  periodFrom: string;
  periodTo: string;
}) {
  const [timeRows, setTimeRows] = useState<
    import('../../services/apiService').RdaWorkPerformanceTechnicianRow[]
  >([]);
  const [timeLoading, setTimeLoading] = useState(true);
  const [timeError, setTimeError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [orderType, setOrderType] = useState<'all' | 'vehicle' | 'module'>('all');
  const [correctSessionId, setCorrectSessionId] = useState('');
  const [correctProdH, setCorrectProdH] = useState('');
  const [correctPausedH, setCorrectPausedH] = useState('');
  const [correctReason, setCorrectReason] = useState('');
  const [correctBusy, setCorrectBusy] = useState(false);
  const [correctMsg, setCorrectMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTimeLoading(true);
    setTimeError(null);
    void import('../../services/apiService')
      .then(({ getRdaWorkPerformanceSummary }) =>
        getRdaWorkPerformanceSummary({
          from: periodFrom,
          to: periodTo,
          orderType,
        })
      )
      .then((summary) => {
        if (cancelled) return;
        setTimeRows(summary.technicians ?? []);
        setMigrationPending(summary.code === 'RDA_WORK_MIGRATION_REQUIRED');
        if (summary.error && summary.code === 'RDA_WORK_MIGRATION_REQUIRED') {
          setTimeError(summary.error);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setTimeError(e instanceof Error ? e.message : 'Falha ao carregar tempos.');
        setTimeRows([]);
      })
      .finally(() => {
        if (!cancelled) setTimeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [periodFrom, periodTo, orderType]);

  const incidentRows = useMemo(() => {
    return employees
      .map((e) => {
        const list = incidentsForEmployee(incidents, e);
        return {
          employee: e,
          total: list.length,
          open: openIncidentCount(list),
          rework: reworkIncidentCount(list),
          critical: criticalIncidentCount(list),
        };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [employees, incidents]);

  const totalProductive = timeRows.reduce((acc, r) => acc + r.liveProductiveMs, 0);
  const totalPaused = timeRows.reduce((acc, r) => acc + r.livePausedMs, 0);
  const finishedServices = timeRows.reduce((acc, r) => acc + r.finishedCount, 0);

  const formatMs = (ms: number) => {
    const totalSec = Math.floor(Math.max(0, ms) / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    return `${h}h ${String(m).padStart(2, '0')}m`;
  };

  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Desempenho"
        subtitle="Intervalos efetivos RDA (America/Sao_Paulo) + histórico de ocorrências."
      />

      <HubPreparedNote>
        Tempos vêm do cronômetro RDA, agregados por intervalo efetivo (não só started_at).
        Pátio e Laboratório ficam separados pelo filtro de setor. Avaliações 1–5 ficam na aba
        Avaliações.
      </HubPreparedNote>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: 'all', label: 'Todos os setores' },
            { id: 'vehicle', label: 'Pátio' },
            { id: 'module', label: 'Laboratório' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setOrderType(opt.id)}
            className={`rounded-xl px-3 py-2 text-[13px] font-semibold transition-colors ${
              orderType === opt.id
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HubStatCard
          label="Tempo produtivo"
          value={timeLoading ? '—' : formatMs(totalProductive)}
          hint={migrationPending ? 'Migration pendente' : 'Soma efetiva no período'}
        />
        <HubStatCard
          label="Tempo pausado"
          value={timeLoading ? '—' : formatMs(totalPaused)}
          hint="Pausas no período (separadas do produtivo)"
        />
        <HubStatCard
          label="Sessões finalizadas"
          value={timeLoading ? '—' : finishedServices}
          hint="Serviços com cronômetro encerrado"
        />
        <HubStatCard
          label="Retrabalhos (ocorrências)"
          value={loading ? '—' : reworkIncidentCount(incidents)}
          hint="Categoria retrabalho no histórico"
        />
      </div>

      {timeError ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-950 dark:bg-amber-950/30 dark:text-amber-100">
          {timeError}
        </p>
      ) : null}

      {timeLoading ? (
        <p className={hub.muted}>Carregando tempos…</p>
      ) : timeRows.length === 0 ? (
        <HubEmptyState
          icon={TrendingUp}
          title="Sem sessões de tempo no período"
          description="Quando os mecânicos iniciarem o cronômetro nas OS, o consolidado aparece aqui."
        />
      ) : (
        <div className="space-y-3">
          <div className={`${hub.surface} overflow-hidden`}>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="border-b border-zinc-200 bg-[#FAFAFA] text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400">
                  <tr>
                    <th className="px-4 py-3">Técnico</th>
                    <th className="px-4 py-3">Produtivo</th>
                    <th className="px-4 py-3">Pausado</th>
                    <th className="px-4 py-3">Sessões</th>
                    <th className="px-4 py-3">Finalizadas</th>
                  </tr>
                </thead>
                <tbody>
                  {timeRows.map((r) => (
                    <tr
                      key={r.technicianUserId}
                      className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80"
                    >
                      <td className="px-4 py-3 font-semibold text-zinc-900 dark:text-white">
                        {r.displayName}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{formatMs(r.liveProductiveMs)}</td>
                      <td className="px-4 py-3 tabular-nums">{formatMs(r.livePausedMs)}</td>
                      <td className="px-4 py-3 tabular-nums">{r.sessionCount}</td>
                      <td className="px-4 py-3 tabular-nums">{r.finishedCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {timeRows.some((r) => r.pauseByReason.length > 0 || r.serviceDurations.length > 0) ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {timeRows.slice(0, 6).map((r) => (
                <div key={`detail-${r.technicianUserId}`} className={`${hub.surface} p-4`}>
                  <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                    {r.displayName}
                  </p>
                  {r.pauseByReason.length > 0 ? (
                    <div className="mt-3">
                      <p className={`text-[11px] font-semibold uppercase tracking-wider ${hub.muted}`}>
                        Pausas por motivo
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {r.pauseByReason.map((p) => (
                          <li
                            key={p.reasonId}
                            className="flex justify-between text-[12px] text-zinc-700 dark:text-zinc-300"
                          >
                            <span>{p.label}</span>
                            <span className="font-mono tabular-nums">{formatMs(p.pausedMs)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {r.serviceDurations.length > 0 ? (
                    <div className="mt-3">
                      <p className={`text-[11px] font-semibold uppercase tracking-wider ${hub.muted}`}>
                        Duração por serviço
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {r.serviceDurations.slice(0, 5).map((s) => (
                          <li
                            key={`${s.lineId || 'gen'}-${s.description}`}
                            className="flex justify-between gap-3 text-[12px] text-zinc-700 dark:text-zinc-300"
                          >
                            <span className="truncate">{s.description}</span>
                            <span className="shrink-0 font-mono tabular-nums">
                              {formatMs(s.productiveMs)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {r.productiveByDay && r.productiveByDay.length > 0 ? (
                    <div className="mt-3">
                      <p className={`text-[11px] font-semibold uppercase tracking-wider ${hub.muted}`}>
                        Produtivo por dia (SP)
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {r.productiveByDay.slice(0, 7).map((d) => (
                          <li
                            key={d.day}
                            className="flex justify-between text-[12px] text-zinc-700 dark:text-zinc-300"
                          >
                            <span>{d.day}</span>
                            <span className="font-mono tabular-nums">{formatMs(d.productiveMs)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      <div className={`${hub.surface} p-4`}>
        <p className="mb-1 text-[14px] font-semibold text-zinc-900 dark:text-white">
          Correção gerencial de apontamento
        </p>
        <p className={`mb-3 text-[12px] ${hub.muted}`}>
          Ajusta tempos de sessão finalizada com justificativa obrigatória. O histórico de auditoria
          não é apagado.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={correctSessionId}
            onChange={(e) => setCorrectSessionId(e.target.value)}
            placeholder="ID da sessão"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
          <input
            value={correctReason}
            onChange={(e) => setCorrectReason(e.target.value)}
            placeholder="Justificativa (obrigatória)"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
          <input
            value={correctProdH}
            onChange={(e) => setCorrectProdH(e.target.value)}
            placeholder="Produtivo (minutos)"
            inputMode="numeric"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
          <input
            value={correctPausedH}
            onChange={(e) => setCorrectPausedH(e.target.value)}
            placeholder="Pausado (minutos)"
            inputMode="numeric"
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
          />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={correctBusy}
            className="rounded-xl bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
            onClick={() => {
              const prodMin = Number(correctProdH);
              const pausedMin = Number(correctPausedH);
              if (!correctSessionId.trim() || !correctReason.trim() || correctReason.trim().length < 3) {
                setCorrectMsg('Informe sessão e justificativa (mín. 3 caracteres).');
                return;
              }
              if (!Number.isFinite(prodMin) || prodMin < 0 || !Number.isFinite(pausedMin) || pausedMin < 0) {
                setCorrectMsg('Tempos em minutos devem ser números ≥ 0.');
                return;
              }
              setCorrectBusy(true);
              setCorrectMsg(null);
              void import('../../services/apiService')
                .then(async ({ correctRdaWorkSession }) => {
                  const mut =
                    typeof crypto !== 'undefined' && 'randomUUID' in crypto
                      ? crypto.randomUUID()
                      : `mut_${Date.now()}`;
                  await correctRdaWorkSession({
                    sessionId: correctSessionId.trim(),
                    productiveMs: Math.round(prodMin * 60_000),
                    pausedMs: Math.round(pausedMin * 60_000),
                    reason: correctReason.trim(),
                    clientMutationId: mut,
                  });
                  setCorrectMsg('Correção registrada com auditoria.');
                  setCorrectSessionId('');
                  setCorrectReason('');
                  setCorrectProdH('');
                  setCorrectPausedH('');
                })
                .catch((e) => {
                  setCorrectMsg(e instanceof Error ? e.message : 'Falha na correção.');
                })
                .finally(() => setCorrectBusy(false));
            }}
          >
            {correctBusy ? 'Salvando…' : 'Registrar correção'}
          </button>
          {correctMsg ? <p className={`text-[12px] ${hub.muted}`}>{correctMsg}</p> : null}
        </div>
      </div>

      <div className={`${hub.surface} p-4`}>
        <p className="mb-3 text-[14px] font-semibold text-zinc-900 dark:text-white">
          Ocorrências no período (histórico)
        </p>
        {loading ? (
          <p className={hub.muted}>Carregando…</p>
        ) : incidentRows.length === 0 ? (
          <p className={`text-[13px] ${hub.muted}`}>Nenhuma ocorrência no período.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-zinc-200 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="py-2 pr-3">Funcionário</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Abertas</th>
                  <th className="py-2 pr-3">Críticas</th>
                  <th className="py-2">Retrabalhos</th>
                </tr>
              </thead>
              <tbody>
                {incidentRows.map((r) => (
                  <tr key={r.employee.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80">
                    <td className="py-2 pr-3 font-medium">{r.employee.name}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.total}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.open}</td>
                    <td className="py-2 pr-3 tabular-nums">{r.critical}</td>
                    <td className="py-2 tabular-nums">{r.rework}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function CareerPlansPanel() {
  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Planos de Carreira"
        subtitle="Competências, metas, treinamentos e histórico de desenvolvimento."
      />
      <HubEmptyState
        icon={Target}
        title="Planos ainda não disponíveis"
        description="Esta área receberá competências, metas individuais, treinamentos e acompanhamento de evolução — sem persistência nesta fase."
        prepared
      />
      <div className="grid gap-3 md:grid-cols-3">
        {['Competências', 'Metas', 'Treinamentos'].map((label) => (
          <div key={label} className={`${hub.surfaceInset} p-4`}>
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">{label}</p>
            <p className={`mt-2 text-[12px] ${hub.muted}`}>Em preparação</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MeetingsPanel() {
  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Reuniões e Feedbacks"
        subtitle="Registros de reuniões, pautas, feedbacks, compromissos e datas de acompanhamento."
      />
      <HubEmptyState
        icon={Calendar}
        title="Nenhuma reunião registrada"
        description="A API de reuniões/feedbacks ainda não existe. A interface está pronta para receber esses registros sem inventar dados."
        prepared
      />
      <div className={`${hub.surface} p-4`}>
        <p className={`text-[12px] font-semibold uppercase tracking-[0.12em] ${hub.muted}`}>
          Estrutura prevista
        </p>
        <ul className={`mt-3 space-y-2 text-[13px] ${hub.muted}`}>
          <li className="flex items-center gap-2">
            <Flag className="h-3.5 w-3.5" /> Pauta e participantes
          </li>
          <li className="flex items-center gap-2">
            <Flag className="h-3.5 w-3.5" /> Feedbacks e compromissos
          </li>
          <li className="flex items-center gap-2">
            <Flag className="h-3.5 w-3.5" /> Data de acompanhamento
          </li>
        </ul>
      </div>
    </div>
  );
}

export function ReportsPanel({
  incidents,
  from,
  to,
  loading,
  technicians,
  onFocusEmployee,
}: {
  incidents: QualityIncident[];
  from: string;
  to: string;
  loading: boolean;
  technicians: QualityRadarTechnicianOption[];
  onFocusEmployee: (selectValue: string | null, techName: string) => void;
}) {
  const report = useMemo(
    () => buildQualityRadarReport(incidents, from, to),
    [incidents, from, to]
  );

  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Relatórios"
        subtitle={`${formatReportPeriodLabel(from, to)}. Consolidado operacional — não é nota de desempenho.`}
      />

      <HubPreparedNote>
        Relatórios individuais enriquecidos, apresentações para diretoria e recomendações do RDA
        Intelligence serão adicionados depois. O índice abaixo mede carga de ocorrências, não
        avaliação 1–5.
      </HubPreparedNote>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HubStatCard label="Ocorrências" value={loading ? '—' : report.totalIncidents} />
        <HubStatCard label="Em aberto" value={loading ? '—' : report.openIncidents} />
        <HubStatCard label="Críticas" value={loading ? '—' : report.criticalIncidents} />
        <HubStatCard
          label="Com ocorrências"
          value={loading ? '—' : report.techniciansWithIncidents}
        />
      </div>

      {loading ? (
        <p className={hub.muted}>Montando relatório…</p>
      ) : report.technicians.length === 0 ? (
        <HubEmptyState
          title="Sem dados para consolidar"
          description="Registre ocorrências no período para gerar o consolidado por funcionário."
        />
      ) : (
        <>
          {report.topCategories.length > 0 ? (
            <div className={`${hub.surface} p-4`}>
              <p className="mb-3 text-[13px] font-semibold text-zinc-900 dark:text-white">
                Principais categorias
              </p>
              <div className="flex flex-wrap gap-2">
                {report.topCategories.map((c) => (
                  <span
                    key={c.category}
                    className="rounded-lg bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white dark:bg-white dark:text-zinc-900"
                  >
                    {c.label}: {c.count}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 lg:grid-cols-2">
            {report.technicians.map((row) => (
              <IncidentLoadCard
                key={row.technicianId ?? row.technicianName}
                row={row}
                technicians={technicians}
                onSelect={onFocusEmployee}
              />
            ))}
          </div>
        </>
      )}

      <div className={`${hub.surface} p-4`}>
        <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
          Preparação para a diretoria
        </p>
        <p className={`mt-1 text-[13px] ${hub.muted}`}>
          Exportações e roteiros de apresentação entram nas próximas fases do RDA Intelligence.
        </p>
        <p className={`${hub.badge} ${hub.accentSoft} mt-3`}>Em preparação</p>
      </div>
    </div>
  );
}

function IncidentLoadCard({
  row,
  technicians,
  onSelect,
}: {
  row: TechnicianQualityRow;
  technicians: QualityRadarTechnicianOption[];
  onSelect: (selectValue: string | null, techName: string) => void;
}) {
  const maxCat = Math.max(...Object.values(row.byCategory), 1);
  const resolveSelectValue = (): string | null => {
    if (row.technicianId) {
      const wt = technicians.find((t) => t.workshopTechnicianId === row.technicianId);
      if (wt) return wt.id;
    }
    const nameNorm = normalizeQualityRadarPersonKey(row.technicianName);
    if (!nameNorm) return null;
    const byName = technicians.filter(
      (t) => normalizeQualityRadarPersonKey(t.name) === nameNorm
    );
    // Ambíguo (2+ cadastros): não escolhe automaticamente — deixa filtro por busca.
    return byName.length === 1 ? byName[0].id : null;
  };

  return (
    <button
      type="button"
      onClick={() => onSelect(resolveSelectValue(), row.technicianName)}
      className={`${hub.surface} w-full p-4 text-left transition hover:border-zinc-300 dark:hover:border-zinc-700`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-[11px] font-semibold uppercase tracking-wider ${hub.muted}`}>
            Funcionário
          </p>
          <h3 className="truncate text-lg font-semibold text-zinc-900 dark:text-white">
            {row.technicianName}
          </h3>
        </div>
        <span className={`${hub.badge} ${hub.accent} shrink-0`}>
          Carga {row.total}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: row.total },
          { label: 'Abertas', value: row.open },
          { label: 'Críticas', value: row.critical },
          { label: 'Resolvidas', value: row.resolved },
        ].map((k) => (
          <div
            key={k.label}
            className="rounded-xl bg-zinc-900 px-2 py-2 text-center text-white dark:bg-zinc-100 dark:text-zinc-900"
          >
            <p className="text-[10px] font-semibold opacity-80">{k.label}</p>
            <p className="text-xl font-bold tabular-nums">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        {(Object.entries(row.byCategory) as [QualityIncidentCategory, number][])
          .filter(([, n]) => n > 0)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 4)
          .map(([cat, count]) => (
            <div key={cat} className="flex items-center gap-2">
              <span className={`w-28 shrink-0 truncate text-[11px] ${hub.muted}`}>
                {QUALITY_CATEGORY_LABEL[cat]}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-[#FFD60A]"
                  style={{ width: `${Math.round((count / maxCat) * 100)}%` }}
                />
              </div>
              <span className="w-6 text-right text-[11px] font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
                {count}
              </span>
            </div>
          ))}
      </div>
    </button>
  );
}
