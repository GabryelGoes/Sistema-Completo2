import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  ClipboardList,
  Plus,
  Radar,
  RefreshCw,
  Search,
  User,
} from 'lucide-react';
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
  qualityRadarTechnicianFilterParam,
  type QualityRadarTechnicianOption,
} from '../../utils/qualityRadarTechnicians';
import {
  QUALITY_CATEGORY_LABEL,
  QUALITY_RADAR_ICON,
  QUALITY_RADAR_MODULE_SUBTITLE,
  QUALITY_RADAR_MODULE_TITLE,
  QUALITY_SEVERITY_LABEL,
  QUALITY_SEVERITY_SOLID,
  QUALITY_STATUS_LABEL,
  QUALITY_STATUS_SOLID,
  QUALITY_CATEGORIES,
  QUALITY_SEVERITIES,
  QUALITY_STATUSES,
} from '../../constants/qualityRadar';
import {
  buildQualityRadarReport,
  formatReportPeriodLabel,
  technicianScore,
  type TechnicianQualityRow,
} from '../../utils/qualityRadarReports';

type TabId = 'ocorrencias' | 'relatorio';

type PeriodPreset = 'month' | 'quarter' | 'year';

const shell =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-zinc-900/45 backdrop-blur-2xl ' +
  'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45)]';

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
  const [activeTab, setActiveTab] = useState<TabId>('ocorrencias');
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

  const authorName =
    authSession?.displayName ?? authSession?.username ?? (authSession?.role === 'admin' ? 'Administrador' : '');
  const authorUserId = authSession?.userId ?? null;

  const { from, to } = useMemo(() => periodBounds(periodPreset), [periodPreset]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const techFilter = qualityRadarTechnicianFilterParam(filterTechnicianId);
      const [data, techs] = await Promise.all([
        getQualityIncidents({
          from,
          to,
          ...techFilter,
          category: filterCategory || undefined,
          severity: filterSeverity || undefined,
          status: filterStatus || undefined,
          q: search.trim() || undefined,
        }),
        getQualityRadarTechnicianOptions(),
      ]);
      setItems(data);
      setTechnicians(techs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as ocorrências.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [from, to, filterTechnicianId, filterCategory, filterSeverity, filterStatus, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const report = useMemo(
    () => buildQualityRadarReport(items ?? [], from, to),
    [items, from, to]
  );

  const stats = useMemo(() => {
    const list = items ?? [];
    return {
      total: list.length,
      open: list.filter((i) => ['aberta', 'em_analise', 'plano_acao'].includes(i.status)).length,
      critical: list.filter((i) => i.severity === 'critica').length,
      technicians: new Set(list.map((i) => i.technicianId ?? i.technicianName).filter(Boolean)).size,
    };
  }, [items]);

  const openCreate = () => {
    setEditorId(null);
    setEditorOpen(true);
  };

  const openEdit = (id: string) => {
    setEditorId(id);
    setEditorOpen(true);
  };

  const filterByTechnician = (selectValue: string | null, techName: string) => {
    setActiveTab('ocorrencias');
    if (selectValue) setFilterTechnicianId(selectValue);
    else {
      setFilterTechnicianId('');
      setSearch(techName);
    }
  };

  const clearFilters = () => {
    setFilterTechnicianId('');
    setFilterCategory('');
    setFilterSeverity('');
    setFilterStatus('');
    setSearch('');
  };

  return (
    <div className="relative flex min-h-full flex-col gap-4 px-4 pb-28 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-8">
      <div className="pointer-events-none absolute inset-0 -z-10 opacity-30 dark:opacity-20" aria-hidden>
        <div className="absolute -left-16 top-0 h-72 w-72 rounded-full bg-rose-400/35 blur-[100px]" />
        <div className="absolute right-0 top-32 h-80 w-80 rounded-full bg-orange-500/20 blur-[110px]" />
      </div>

      <header className={`relative overflow-hidden ${shell} p-5 md:p-6`}>
        <div className="absolute inset-0 bg-rose-600 pointer-events-none" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-100">Gestão da equipe</p>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-[1.75rem]">
              <img src={QUALITY_RADAR_ICON} alt="" className="h-9 w-9 rounded-xl object-cover" />
              {QUALITY_RADAR_MODULE_TITLE}
            </h1>
            <p className="max-w-xl text-[14px] leading-relaxed text-rose-50">{QUALITY_RADAR_MODULE_SUBTITLE}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl bg-white/20 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-white/30 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-2xl bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white shadow-lg transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900"
            >
              <Plus className="h-4 w-4" />
              Nova ocorrência
            </button>
          </div>
        </div>

        <div className="relative mt-5 flex flex-wrap gap-2 border-t border-white/25 pt-4">
          {(
            [
              { id: 'ocorrencias' as const, label: 'Ocorrências', icon: ClipboardList },
              { id: 'relatorio' as const, label: 'Relatório por mecânico', icon: BarChart3 },
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-[13px] font-semibold transition ${
                activeTab === id ? 'bg-white text-rose-700' : 'bg-white/20 text-white hover:bg-white/30'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
          <div className="ml-auto flex flex-wrap gap-2">
            {(
              [
                { id: 'month' as const, label: 'Este mês' },
                { id: 'quarter' as const, label: '90 dias' },
                { id: 'year' as const, label: 'Este ano' },
              ] as const
            ).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodPreset(p.id)}
                className={`rounded-xl px-3 py-1.5 text-[12px] font-semibold ${
                  periodPreset === p.id ? 'bg-white text-rose-700' : 'bg-white/15 text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="relative mt-2 text-[12px] text-rose-100/90">{formatReportPeriodLabel(from, to)}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Ocorrências', value: stats.total, card: 'border-rose-600 bg-rose-500' },
          { label: 'Em aberto', value: stats.open, card: 'border-orange-600 bg-orange-500' },
          { label: 'Críticas', value: stats.critical, card: 'border-red-700 bg-red-600' },
          { label: 'Mecânicos', value: stats.technicians, card: 'border-violet-600 bg-violet-500' },
        ].map((k) => (
          <div key={k.label} className={`rounded-2xl border p-4 text-white shadow-md ${k.card}`}>
            <p className="text-[12px] font-semibold text-white/90">{k.label}</p>
            <p className="mt-1 text-3xl font-bold tabular-nums">{loading ? '—' : k.value}</p>
          </div>
        ))}
      </div>

      {activeTab === 'ocorrencias' ? (
        <div className={`${shell} p-4`}>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="relative lg:col-span-2">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar título, mecânico, placa, descrição…"
                className="w-full rounded-2xl border border-zinc-200/90 bg-white py-2.5 pl-10 pr-4 text-[14px] outline-none focus:ring-2 focus:ring-rose-500/30 dark:border-white/[0.1] dark:bg-zinc-950 dark:text-white"
              />
            </div>
            <select
              value={filterTechnicianId}
              onChange={(e) => setFilterTechnicianId(e.target.value)}
              className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[14px] dark:border-white/[0.1] dark:bg-zinc-950 dark:text-white"
            >
              <option value="">Todos os usuários</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as QualityIncidentCategory | '')}
              className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[14px] dark:border-white/[0.1] dark:bg-zinc-950 dark:text-white"
            >
              <option value="">Todas categorias</option>
              {QUALITY_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select
              value={filterSeverity}
              onChange={(e) => setFilterSeverity(e.target.value as QualityIncidentSeverity | '')}
              className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[14px] dark:border-white/[0.1] dark:bg-zinc-950 dark:text-white"
            >
              <option value="">Todas severidades</option>
              {QUALITY_SEVERITIES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as QualityIncidentStatus | '')}
              className="rounded-2xl border border-zinc-200/90 bg-white px-3 py-2.5 text-[14px] dark:border-white/[0.1] dark:bg-zinc-950 dark:text-white"
            >
              <option value="">Todos status</option>
              {QUALITY_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          {(filterTechnicianId || filterCategory || filterSeverity || filterStatus || search) && (
            <button
              type="button"
              onClick={clearFilters}
              className="mb-3 text-[12px] font-semibold text-rose-600 dark:text-rose-400"
            >
              Limpar filtros
            </button>
          )}

          {error ? (
            <p className="mb-4 rounded-xl bg-red-500/10 px-3 py-2 text-[13px] text-red-700 dark:text-red-300">{error}</p>
          ) : null}

          {loading && !items ? (
            <div className="flex flex-col items-center gap-3 py-16 text-zinc-500">
              <RefreshCw className="h-10 w-10 animate-spin text-rose-500" />
              <p>Carregando ocorrências…</p>
            </div>
          ) : items && items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <Radar className="h-12 w-12 text-rose-500" />
              <p className="text-[15px] font-medium text-zinc-700 dark:text-zinc-300">Nenhuma ocorrência no período.</p>
              <button
                type="button"
                onClick={openCreate}
                className="rounded-xl bg-rose-600 px-4 py-2 text-[14px] font-semibold text-white"
              >
                Registrar primeira ocorrência
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {(items ?? []).map((inc) => (
                <button
                  key={inc.id}
                  type="button"
                  onClick={() => openEdit(inc.id)}
                  className="w-full rounded-2xl border border-zinc-200/80 bg-white p-4 text-left transition hover:border-rose-400/60 hover:shadow-md dark:border-white/[0.08] dark:bg-zinc-950/50 dark:hover:border-rose-500/40"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${QUALITY_STATUS_SOLID[inc.status]}`}>
                      {QUALITY_STATUS_LABEL[inc.status]}
                    </span>
                    <span className={`rounded-lg px-2 py-0.5 text-[11px] font-bold ${QUALITY_SEVERITY_SOLID[inc.severity]}`}>
                      {QUALITY_SEVERITY_LABEL[inc.severity]}
                    </span>
                    <span className="rounded-lg bg-zinc-800 px-2 py-0.5 text-[11px] font-semibold text-white">
                      {QUALITY_CATEGORY_LABEL[inc.category]}
                    </span>
                    {inc.plate ? (
                      <span className="rounded-lg bg-zinc-200 px-2 py-0.5 font-mono text-[11px] font-semibold text-zinc-800 dark:bg-zinc-700 dark:text-white">
                        {inc.plate}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2 text-[15px] font-bold text-zinc-900 dark:text-white">
                    {inc.title || 'Sem título'}
                  </h3>
                  <p className="mt-0.5 flex items-center gap-1.5 text-[13px] text-zinc-600 dark:text-zinc-400">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    {inc.technicianName || 'Mecânico não informado'}
                    <span className="text-zinc-400">·</span>
                    {new Date(inc.occurredAt).toLocaleDateString('pt-BR')}
                  </p>
                  {inc.description ? (
                    <p className="mt-2 line-clamp-2 text-[13px] text-zinc-600 dark:text-zinc-400">{inc.description}</p>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <ReportByTechnicianPanel
          report={report}
          loading={loading}
          technicians={technicians}
          onSelectTechnician={filterByTechnician}
        />
      )}

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

function ReportByTechnicianPanel({
  report,
  loading,
  technicians,
  onSelectTechnician,
}: {
  report: ReturnType<typeof buildQualityRadarReport>;
  loading: boolean;
  technicians: QualityRadarTechnicianOption[];
  onSelectTechnician: (selectValue: string | null, techName: string) => void;
}) {
  if (loading) {
    return (
      <div className={`${shell} flex flex-col items-center gap-3 py-16`}>
        <RefreshCw className="h-10 w-10 animate-spin text-rose-500" />
        <p className="text-zinc-500">Montando relatório…</p>
      </div>
    );
  }

  if (report.technicians.length === 0) {
    return (
      <div className={`${shell} flex flex-col items-center gap-3 py-16 text-center`}>
        <AlertTriangle className="h-12 w-12 text-rose-500" />
        <p className="text-[15px] font-medium text-zinc-700 dark:text-zinc-300">
          Nenhuma ocorrência registrada no período para gerar relatório.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {report.topCategories.length > 0 ? (
        <div className={`${shell} p-4`}>
          <p className="mb-3 text-[13px] font-semibold text-zinc-800 dark:text-zinc-200">Principais categorias</p>
          <div className="flex flex-wrap gap-2">
            {report.topCategories.map((c) => (
              <span
                key={c.category}
                className="rounded-xl bg-rose-500 px-3 py-1.5 text-[12px] font-semibold text-white"
              >
                {c.label}: {c.count}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-2">
        {report.technicians.map((row) => (
          <TechnicianReportCard
            key={row.technicianId ?? row.technicianName}
            row={row}
            technicians={technicians}
            onSelect={onSelectTechnician}
          />
        ))}
      </div>
    </div>
  );
}

function TechnicianReportCard({
  row,
  technicians,
  onSelect,
}: {
  row: TechnicianQualityRow;
  technicians: QualityRadarTechnicianOption[];
  onSelect: (selectValue: string | null, techName: string) => void;
}) {
  const score = technicianScore(row);
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
      className={`${shell} w-full p-4 text-left transition hover:border-rose-400/50 hover:shadow-lg`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Mecânico
          </p>
          <h3 className="truncate text-lg font-bold text-zinc-900 dark:text-white">{row.technicianName}</h3>
        </div>
        <span className="shrink-0 rounded-xl bg-rose-500 px-2.5 py-1 text-[12px] font-bold text-white">
          Score {score}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-4 gap-2">
        {[
          { label: 'Total', value: row.total, cls: 'bg-zinc-500' },
          { label: 'Abertas', value: row.open, cls: 'bg-orange-500' },
          { label: 'Críticas', value: row.critical, cls: 'bg-red-600' },
          { label: 'Resolvidas', value: row.resolved, cls: 'bg-emerald-500' },
        ].map((k) => (
          <div key={k.label} className={`rounded-xl ${k.cls} px-2 py-2 text-center text-white`}>
            <p className="text-[10px] font-semibold opacity-90">{k.label}</p>
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
              <span className="w-28 shrink-0 truncate text-[11px] text-zinc-600 dark:text-zinc-400">
                {QUALITY_CATEGORY_LABEL[cat]}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-rose-500"
                  style={{ width: `${Math.round((count / maxCat) * 100)}%` }}
                />
              </div>
              <span className="w-6 text-right text-[11px] font-bold tabular-nums text-zinc-700 dark:text-zinc-300">
                {count}
              </span>
            </div>
          ))}
      </div>

      {row.recentTitles.length > 0 ? (
        <ul className="mt-3 space-y-1 border-t border-zinc-200/80 pt-3 dark:border-white/[0.08]">
          {row.recentTitles.map((t) => (
            <li key={t} className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
              · {t}
            </li>
          ))}
        </ul>
      ) : null}
    </button>
  );
}
