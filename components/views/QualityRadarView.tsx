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
        <div className={`${hub.surface} max-w-md p-8 text-center`}>
          <h1 className="text-[18px] font-semibold text-zinc-900 dark:text-white">
            Acesso restrito
          </h1>
          <p className={`mt-2 text-[14px] ${hub.muted}`}>
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
    body = <CareerPlansPanel />;
  } else if (section === 'reunioes') {
    body = <MeetingsPanel />;
  } else if (section === 'relatorios') {
    body = (
      <ReportsPanel
        incidents={incidents}
        from={from}
        to={to}
        loading={loading}
        technicians={technicians}
        onFocusEmployee={focusEmployeeFromReport}
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

  return (
    <div
      className={`${hub.page} gap-4 px-4 pb-28 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-8`}
    >
      <header className={`${hub.surface} overflow-hidden`}>
        <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between md:p-5">
          <div className="min-w-0">
            {!isDesktopShell ? (
              <>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${hub.muted}`}>
                  Gerência e diretoria
                </p>
                <h1 className="mt-1 flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white md:text-[1.75rem]">
                  <img
                    src={QUALITY_RADAR_ICON}
                    alt=""
                    className="h-9 w-9 rounded-xl object-cover"
                    draggable={false}
                  />
                  {QUALITY_RADAR_MODULE_TITLE}
                </h1>
                <p className={`mt-1 max-w-2xl text-[14px] leading-relaxed ${hub.muted}`}>
                  {QUALITY_RADAR_MODULE_SUBTITLE}
                </p>
              </>
            ) : (
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.16em] ${hub.muted}`}>
                  Central gerencial
                </p>
                <p className="mt-1 text-[15px] font-semibold text-zinc-900 dark:text-white">
                  {HUB_SECTIONS.find((s) => s.id === section)?.label ?? QUALITY_RADAR_MODULE_TITLE}
                </p>
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
            <div className="flex flex-wrap gap-1 rounded-xl border border-zinc-200 bg-[#FAFAFA] p-1 dark:border-zinc-800 dark:bg-zinc-950">
              {periodDefs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPeriodPreset(p.id)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
                    periodPreset === p.id
                      ? 'bg-[#FFD60A] text-zinc-900'
                      : 'text-zinc-600 hover:bg-white dark:text-zinc-300 dark:hover:bg-zinc-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className={`border-t ${hub.hairline} px-4 py-2 text-[12px] ${hub.muted} md:px-5`}>
          Período: {periodLabel}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className={`${hub.surface} p-2 lg:sticky lg:top-4 lg:self-start`}>{nav}</aside>
        <main className="min-w-0">{body}</main>
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
