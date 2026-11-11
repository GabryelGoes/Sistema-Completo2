import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { QualityIncidentEditorModal } from '../QualityIncidentEditorModal';
import {
  getQualityIncidents,
  type AuthSession,
  type QualityIncident,
  type QualityIncidentCategory,
  type QualityIncidentSeverity,
  type QualityIncidentStatus,
} from '../../services/apiService';
import {
  getQualityRadarTechnicianOptions,
  normalizeQualityRadarPersonKey,
  type QualityRadarTechnicianOption,
} from '../../utils/qualityRadarTechnicians';
import {
  QUALITY_RADAR_ICON,
  QUALITY_RADAR_MODULE_SUBTITLE,
  QUALITY_RADAR_MODULE_TITLE,
} from '../../constants/qualityRadar';
import { formatReportPeriodLabel } from '../../utils/qualityRadarReports';
import { useDesktopShellLayout } from '../ui/DesktopShellContext';
import { HUB_SECTIONS, hub, type HubSectionId } from '../qualityRadar/hubTheme';
import { IncidentsListPanel } from '../qualityRadar/IncidentsListPanel';
import {
  CareerPlansPanel,
  EmployeesPanel,
  EvaluationsPanel,
  MeetingsPanel,
  OverviewPanel,
  PerformancePanel,
  ReportsPanel,
} from '../qualityRadar/ManagerialPanels';
import { WeeklyReviewPanel } from '../qualityRadar/WeeklyReviewPanel';
import { HubPanelShell } from '../qualityRadar/HubPrimitives';

type PeriodPreset = 'month' | 'quarter' | 'year';

function periodBounds(preset: PeriodPreset): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  let from: Date;
  if (preset === 'month') {
    from = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (preset === 'quarter') {
    from = new Date(now);
    from.setDate(from.getDate() - 90);
    from.setHours(0, 0, 0, 0);
  } else {
    from = new Date(now.getFullYear(), 0, 1);
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

export const QualityRadarView: React.FC<{ authSession?: AuthSession | null }> = ({ authSession }) => {
  const isDesktopShell = useDesktopShellLayout();
  const [section, setSection] = useState<HubSectionId>('visao_geral');
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('month');
  const [items, setItems] = useState<QualityIncident[] | null>(null);
  const [technicians, setTechnicians] = useState<QualityRadarTechnicianOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTechnicianId, setFilterTechnicianId] = useState('');
  const [filterCategory, setFilterCategory] = useState<QualityIncidentCategory | ''>('');
  const [filterSeverity, setFilterSeverity] = useState<QualityIncidentSeverity | ''>('');
  const [filterStatus, setFilterStatus] = useState<QualityIncidentStatus | ''>('');
  const [editorId, setEditorId] = useState<string | null | undefined>(undefined);
  const [editorOpen, setEditorOpen] = useState(false);
  const [pendingEvaluations, setPendingEvaluations] = useState<number | null>(null);
  const [evaluationsLoading, setEvaluationsLoading] = useState(false);

  const canAccessRadar =
    authSession?.role === 'admin' ||
    !!authSession?.permissions?.full_access ||
    !!authSession?.permissions?.access_radar_qualidade;

  const authorName =
    authSession?.displayName ??
    authSession?.username ??
    (authSession?.role === 'admin' ? 'Administrador' : '');
  const authorUserId = authSession?.userId ?? null;

  const { from, to } = useMemo(() => periodBounds(periodPreset), [periodPreset]);
  const periodLabel = useMemo(() => formatReportPeriodLabel(from, to), [from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setEvaluationsLoading(true);
    setError(null);
    try {
      // Período completo no servidor; filtros da aba Ocorrências são client-side
      // para não distorcer Visão Geral / Funcionários / Desempenho / Relatórios.
      const [data, techs] = await Promise.all([
        getQualityIncidents({ from, to }),
        getQualityRadarTechnicianOptions(),
      ]);
      setItems(data);
      setTechnicians(techs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar os dados do Radar.');
      setItems([]);
    } finally {
      setLoading(false);
    }

    try {
      const { getRdaEvalSummary } = await import('../../services/apiService');
      const summary = await getRdaEvalSummary({ from, to });
      setPendingEvaluations(summary.pending ?? 0);
    } catch {
      setPendingEvaluations(null);
    } finally {
      setEvaluationsLoading(false);
    }
  }, [from, to]);

  const filteredIncidents = useMemo(() => {
    const list = items ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((inc) => {
      if (filterCategory && inc.category !== filterCategory) return false;
      if (filterSeverity && inc.severity !== filterSeverity) return false;
      if (filterStatus && inc.status !== filterStatus) return false;
      if (filterTechnicianId) {
        const tech = technicians.find((t) => t.id === filterTechnicianId);
        if (tech) {
          const byId =
            tech.workshopTechnicianId && inc.technicianId === tech.workshopTechnicianId;
          const byName =
            normalizeQualityRadarPersonKey(inc.technicianName || '') ===
            normalizeQualityRadarPersonKey(tech.name);
          if (!byId && !byName) return false;
        }
      }
      if (!q) return true;
      const hay = [
        inc.title,
        inc.description,
        inc.technicianName,
        inc.plate,
        inc.vehicleSummary,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [
    items,
    search,
    filterCategory,
    filterSeverity,
    filterStatus,
    filterTechnicianId,
    technicians,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const incidents = items ?? [];

  const openCreate = () => {
    setEditorId(null);
    setEditorOpen(true);
  };

  const openEdit = (id: string) => {
    setEditorId(id);
    setEditorOpen(true);
  };

  const clearFilters = () => {
    setFilterTechnicianId('');
    setFilterCategory('');
    setFilterSeverity('');
    setFilterStatus('');
    setSearch('');
  };

  const openIncidentsForEmployee = (employeeSelectId: string) => {
    setFilterTechnicianId(employeeSelectId);
    setSection('ocorrencias');
  };

  const focusEmployeeFromReport = (selectValue: string | null, techName: string) => {
    if (selectValue) setFilterTechnicianId(selectValue);
    else {
      setFilterTechnicianId('');
      setSearch(techName);
    }
    setSection('ocorrencias');
  };

  const periodDefs = [
    { id: 'month' as const, label: 'Este mês' },
    { id: 'quarter' as const, label: '90 dias' },
    { id: 'year' as const, label: 'Este ano' },
  ] as const;

  const nav = (
    <nav
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [-ms-overflow-style:none] [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden"
      aria-label="Áreas do Radar"
    >
      {HUB_SECTIONS.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={() => setSection(s.id)}
          className={`${hub.navItem(section === s.id)} shrink-0 whitespace-nowrap lg:w-full`}
          title={s.description}
          aria-current={section === s.id ? 'page' : undefined}
        >
          <span className="hidden md:inline lg:inline">{s.label}</span>
          <span className="md:hidden">{s.shortLabel}</span>
        </button>
      ))}
    </nav>
  );

  if (!canAccessRadar) {
    return (
      <div className={`${hub.page} items-center justify-center px-6 py-24`}>
        <div className={`${hub.surface} ${hub.cardPad} max-w-md p-8 text-center ${hub.panelMotion}`}>
          <p className={hub.eyebrow}>Radar de Qualidade</p>
          <h1 className={`mt-2 ${hub.title}`}>Acesso restrito</h1>
          <p className={`mt-2 ${hub.meta}`}>
            O Radar de Qualidade é exclusivo da gerência e de usuários com permissão
            correspondente. Solicite acesso à Gerência se precisar deste módulo.
          </p>
        </div>
      </div>
    );
  }

  let body: React.ReactNode = null;
  if (section === 'visao_geral') {
    body = (
      <OverviewPanel
        employees={technicians}
        incidents={incidents}
        loading={loading}
        periodLabel={periodLabel}
        pendingEvaluations={pendingEvaluations}
        evaluationsLoading={evaluationsLoading}
        onOpenEmployees={() => setSection('funcionarios')}
        onOpenIncidents={() => setSection('ocorrencias')}
        onOpenEvaluations={() => setSection('avaliacoes')}
      />
    );
  } else if (section === 'funcionarios') {
    body = (
      <EmployeesPanel
        employees={technicians}
        incidents={incidents}
        loading={loading}
        onOpenIncidentsFor={openIncidentsForEmployee}
        periodFrom={from}
        periodTo={to}
      />
    );
  } else if (section === 'avaliacoes') {
    body = (
      <EvaluationsPanel
        employees={technicians}
        periodFrom={from}
        periodTo={to}
      />
    );
  } else if (section === 'desempenho') {
    body = (
      <PerformancePanel
        employees={technicians}
        incidents={incidents}
        loading={loading}
        periodFrom={from}
        periodTo={to}
      />
    );
  } else if (section === 'planos') {
    body = <CareerPlansPanel employees={technicians} />;
  } else if (section === 'reunioes') {
    body = <MeetingsPanel employees={technicians} />;
  } else if (section === 'revisao_semanal') {
    body = <WeeklyReviewPanel employees={technicians} />;
  } else if (section === 'relatorios') {
    body = (
      <ReportsPanel
        incidents={incidents}
        from={from}
        to={to}
        loading={loading}
        technicians={technicians}
        onFocusEmployee={focusEmployeeFromReport}
        onOpenInterview={() => setSection('revisao_semanal')}
      />
    );
  } else {
    body = (
      <IncidentsListPanel
        items={loading && !items ? null : filteredIncidents}
        loading={loading}
        error={error}
        technicians={technicians}
        search={search}
        filterTechnicianId={filterTechnicianId}
        filterCategory={filterCategory}
        filterSeverity={filterSeverity}
        filterStatus={filterStatus}
        onSearch={setSearch}
        onFilterTechnicianId={setFilterTechnicianId}
        onFilterCategory={setFilterCategory}
        onFilterSeverity={setFilterSeverity}
        onFilterStatus={setFilterStatus}
        onClearFilters={clearFilters}
        onOpenCreate={openCreate}
        onOpenEdit={openEdit}
      />
    );
  }

  const activeSection = HUB_SECTIONS.find((s) => s.id === section);

  return (
    <div
      className={`${hub.page} gap-5 px-4 pb-28 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-8`}
    >
      <header className={`${hub.chrome} sticky top-2 z-20 overflow-hidden md:top-3`}>
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div className="min-w-0">
            {!isDesktopShell ? (
              <>
                <p className={hub.eyebrow}>Gerência e diretoria</p>
                <h1 className={`mt-1.5 flex items-center gap-2.5 ${hub.display}`}>
                  <img
                    src={QUALITY_RADAR_ICON}
                    alt=""
                    className="h-9 w-9 rounded-[0.95rem] object-cover"
                    draggable={false}
                  />
                  {QUALITY_RADAR_MODULE_TITLE}
                </h1>
                <p className={`mt-1.5 max-w-2xl ${hub.meta}`}>{QUALITY_RADAR_MODULE_SUBTITLE}</p>
              </>
            ) : (
              <div>
                <p className={hub.eyebrow}>Central gerencial</p>
                <p className={`mt-1 text-[15px] font-semibold leading-snug tracking-[-0.01em] ${hub.ink}`}>
                  {activeSection?.label ?? QUALITY_RADAR_MODULE_TITLE}
                </p>
                {activeSection?.description ? (
                  <p className={`mt-0.5 ${hub.caption}`}>{activeSection.description}</p>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className={hub.btnSecondary}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <div className={hub.segmentTrack} role="group" aria-label="Período">
              {periodDefs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodPreset(p.id)}
                  className={hub.segmentItem(periodPreset === p.id)}
                  aria-pressed={periodPreset === p.id}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div
          className={`border-t border-zinc-200/80 px-4 py-2.5 ${hub.caption} dark:border-zinc-700/80 md:px-5`}
        >
          Período: {periodLabel}
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className={`${hub.aside} p-2 lg:sticky lg:top-[5.75rem] lg:self-start`}>
          {nav}
        </aside>
        <main className="min-w-0">
          <HubPanelShell key={section}>{body}</HubPanelShell>
        </main>
      </div>

      <QualityIncidentEditorModal
        open={editorOpen}
        incidentId={editorId ?? null}
        authorName={authorName}
        authorUserId={authorUserId}
        onClose={() => {
          setEditorOpen(false);
          setEditorId(undefined);
        }}
        onSaved={() => void load()}
      />
    </div>
  );
};
