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
import type { QualityIncident } from '../../services/apiService';
import {
  QUALITY_CATEGORY_LABEL,
  type QualityIncidentCategory,
} from '../../constants/qualityRadar';
import {
  buildQualityRadarReport,
  formatReportPeriodLabel,
  type TechnicianQualityRow,
} from '../../utils/qualityRadarReports';
import type { QualityRadarTechnicianOption } from '../../utils/qualityRadarTechnicians';
import {
  criticalIncidentCount,
  incidentsForEmployee,
  openIncidentCount,
  reworkIncidentCount,
} from '../../utils/qualityRadarPeople';
import { hub } from './hubTheme';
import {
  HubEmptyState,
  HubPreparedNote,
  HubScorePreview,
  HubSectionHeader,
  HubStatCard,
} from './HubPrimitives';

export function OverviewPanel({
  employees,
  incidents,
  loading,
  periodLabel,
  onOpenEmployees,
  onOpenIncidents,
  onOpenEvaluations,
}: {
  employees: QualityRadarTechnicianOption[];
  incidents: QualityIncident[];
  loading: boolean;
  periodLabel: string;
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

  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Visão Geral"
        subtitle={`Indicadores do período ${periodLabel}. Avaliações e planos ainda não possuem backend.`}
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
          value="—"
          prepared
          hint="Fila de avaliações ainda sem backend"
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

export function EmployeesPanel({
  employees,
  incidents,
  loading,
  onOpenIncidentsFor,
}: {
  employees: QualityRadarTechnicianOption[];
  incidents: QualityIncident[];
  loading: boolean;
  onOpenIncidentsFor: (employeeSelectId: string) => void;
}) {
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

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

  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Funcionários"
        subtitle="Lista real de técnicos e usuários do sistema. Avaliações e carreira entram nas próximas fases."
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
              description="O perfil mostra histórico de ocorrências e espaços reservados para avaliações e evolução profissional."
            />
          ) : (
            <div className="space-y-4">
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${hub.muted}`}>
                  Perfil
                </p>
                <h3 className="mt-1 text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-white">
                  {selected.name}
                </h3>
                <p className={`mt-1 text-[13px] ${hub.muted}`}>
                  {selected.jobTitle?.trim() ||
                    (selected.source === 'workshop_technician'
                      ? 'Técnico cadastrado'
                      : 'Usuário do sistema')}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <HubStatCard label="Ocorrências" value={selectedIncidents.length} />
                <HubStatCard label="Em aberto" value={openIncidentCount(selectedIncidents)} />
                <HubStatCard label="Retrabalhos" value={reworkIncidentCount(selectedIncidents)} />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                    Histórico de ocorrências
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
                          {new Date(inc.occurredAt).toLocaleDateString('pt-BR')}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <HubPreparedNote>
                Espaço reservado para futuras avaliações por competência e acompanhamento de
                evolução profissional. Nada é salvo nesta fase.
              </HubPreparedNote>
              <div className="grid gap-2 sm:grid-cols-2">
                <HubScorePreview label="Exemplo de competência (visual)" />
                <HubScorePreview label="Exemplo de comunicação (visual)" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function EvaluationsPanel() {
  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Avaliações"
        subtitle="Estrutura visual pronta. Persistência e fila automática pós-OS virão em fases seguintes."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {['Pendentes', 'Concluídas', 'Adiadas', 'Dispensadas'].map((label) => (
          <HubStatCard
            key={label}
            label={label}
            value="—"
            prepared
            hint="Sem API de avaliações nesta fase"
          />
        ))}
      </div>

      <HubEmptyState
        icon={ClipboardCheck}
        title="Nenhuma avaliação gerencial"
        description="Quando a API estiver disponível, esta central listará avaliações pendentes, concluídas, adiadas e dispensadas, com notas de 1 a 5 por competência e vínculo a serviço/OS."
        prepared
      />

      <div className={`${hub.surface} space-y-3 p-4`}>
        <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
          Prévia do formulário (somente leitura)
        </p>
        <HubPreparedNote>
          Campos abaixo são ilustrativos. Não há botão de salvar — evita gravar dados sem backend.
        </HubPreparedNote>
        <div className="grid gap-3 md:grid-cols-2">
          <HubScorePreview label="Diagnóstico" />
          <HubScorePreview label="Montagem" />
          <HubScorePreview label="Comunicação" />
          <HubScorePreview label="Organização" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className={`${hub.surfaceInset} p-3`}>
            <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">Pontos positivos</p>
            <p className={`mt-2 text-[13px] ${hub.muted}`}>Disponível na próxima fase.</p>
          </div>
          <div className={`${hub.surfaceInset} p-3`}>
            <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">
              Oportunidades de melhoria
            </p>
            <p className={`mt-2 text-[13px] ${hub.muted}`}>Disponível na próxima fase.</p>
          </div>
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

  useEffect(() => {
    let cancelled = false;
    setTimeLoading(true);
    setTimeError(null);
    void import('../../services/apiService')
      .then(({ getRdaWorkPerformanceSummary }) =>
        getRdaWorkPerformanceSummary({ from: periodFrom, to: periodTo })
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
  }, [periodFrom, periodTo]);

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
        subtitle="Tempo real das sessões RDA + histórico de ocorrências (sem nota 1–5)."
      />

      <HubPreparedNote>
        Avaliações por competência ainda não entram aqui. Ocorrências permanecem como histórico
        operacional separado do cronômetro.
      </HubPreparedNote>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HubStatCard
          label="Tempo produtivo"
          value={timeLoading ? '—' : formatMs(totalProductive)}
          hint={migrationPending ? 'Migration pendente' : 'Soma das sessões no período'}
        />
        <HubStatCard
          label="Tempo pausado"
          value={timeLoading ? '—' : formatMs(totalPaused)}
          hint="Inclui pausas abertas até agora"
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
                            key={s.description}
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
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

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
    const nameNorm = row.technicianName.trim().toLowerCase();
    const byName = technicians.find((t) => t.name.trim().toLowerCase() === nameNorm);
    return byName?.id ?? null;
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
