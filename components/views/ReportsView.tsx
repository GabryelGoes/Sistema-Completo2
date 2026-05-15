import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BarChart3,
  CalendarRange,
  Car,
  ChevronLeft,
  ChevronRight,
  Download,
  Gauge,
  RefreshCw,
  Settings2,
  Shield,
  Users,
  Wrench,
} from 'lucide-react';
import { getServiceOrders, type ServiceOrderListItem } from '../../services/apiService';
import { getStageConfig, getStageStyle, CANCELLED_STATUS } from '../../constants/serviceOrderStages';
import {
  type ReportPeriodMode,
  type ReportWeekStart,
  filterVehicleOrders,
  getPeriodRange,
  ordersEnteredAndArchivedInPeriod,
  ordersEnteredInPeriod,
  ordersWarrantyInPeriod,
  reportTechnicianResponsibility,
  reportTopModels,
  downloadCsv,
} from '../../utils/workshopReports';

const REPORTS_SETTINGS_KEY = 'app_reports_settings_v1';

type ReportsSettings = {
  includeModules: boolean;
  weekStartsOn: ReportWeekStart;
  topModelsLimit: number;
};

const DEFAULT_SETTINGS: ReportsSettings = {
  includeModules: false,
  weekStartsOn: 'monday',
  topModelsLimit: 16,
};

type ReportSection = 'entradas' | 'fluxo' | 'tecnicos' | 'garantia' | 'modelos';

const SECTIONS: { id: ReportSection; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: 'entradas', label: 'Entradas', hint: 'Veículos que entraram no período', icon: <Car className="h-4 w-4" /> },
  {
    id: 'fluxo',
    label: 'Entrada e saída',
    hint: 'Entregues no período (mesma janela de entrada e arquivamento)',
    icon: <ArrowLeftRight className="h-4 w-4" />,
  },
  { id: 'tecnicos', label: 'Por técnico', hint: 'Responsáveis na data de entrada', icon: <Users className="h-4 w-4" /> },
  { id: 'garantia', label: 'Garantia', hint: 'Marcadas como garantia ou etapa Garantia', icon: <Shield className="h-4 w-4" /> },
  { id: 'modelos', label: 'Top modelos', hint: 'Marcas e modelos mais frequentes', icon: <BarChart3 className="h-4 w-4" /> },
];

function loadSettings(): ReportsSettings {
  try {
    const raw = localStorage.getItem(REPORTS_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<ReportsSettings>;
    return {
      includeModules: p.includeModules === true,
      weekStartsOn: p.weekStartsOn === 'sunday' ? 'sunday' : 'monday',
      topModelsLimit: typeof p.topModelsLimit === 'number' && p.topModelsLimit >= 5 && p.topModelsLimit <= 40 ? p.topModelsLimit : 16,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: ReportsSettings): void {
  try {
    localStorage.setItem(REPORTS_SETTINGS_KEY, JSON.stringify(s));
  } catch (_) {}
}

function formatPlate(plate: string | null | undefined, blur: boolean): string {
  const p = (plate ?? '—').toUpperCase();
  if (!blur) return p;
  if (p.length < 3) return '•••';
  return p.slice(0, 2) + '•••' + p.slice(-1);
}

export const ReportsView: React.FC<{ blurPlates?: boolean }> = ({ blurPlates = false }) => {
  const [settings, setSettings] = useState<ReportsSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>('week');
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [activeSection, setActiveSection] = useState<ReportSection>('entradas');
  const [rawOrders, setRawOrders] = useState<ServiceOrderListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(
    () => getPeriodRange(periodMode, referenceDate, settings.weekStartsOn),
    [periodMode, referenceDate, settings.weekStartsOn]
  );

  const orders = useMemo(
    () => filterVehicleOrders(rawOrders ?? [], settings.includeModules),
    [rawOrders, settings.includeModules]
  );

  const entradas = useMemo(
    () => ordersEnteredInPeriod(orders, range.start, range.end),
    [orders, range.start, range.end]
  );

  const fluxo = useMemo(
    () => ordersEnteredAndArchivedInPeriod(orders, range.start, range.end),
    [orders, range.start, range.end]
  );

  const tecnicos = useMemo(
    () => reportTechnicianResponsibility(orders, range.start, range.end),
    [orders, range.start, range.end]
  );

  const garantia = useMemo(
    () => ordersWarrantyInPeriod(orders, range.start, range.end),
    [orders, range.start, range.end]
  );

  const modelos = useMemo(
    () => reportTopModels(orders, range.start, range.end, settings.topModelsLimit),
    [orders, range.start, range.end, settings.topModelsLimit]
  );

  const maxModelCount = useMemo(() => modelos.reduce((m, r) => Math.max(m, r.count), 0) || 1, [modelos]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getServiceOrders();
      setRawOrders(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível carregar as ordens.');
      setRawOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const bumpPeriod = (dir: -1 | 1) => {
    const d = new Date(referenceDate);
    if (periodMode === 'week') {
      d.setDate(d.getDate() + dir * 7);
    } else {
      d.setMonth(d.getMonth() + dir);
    }
    setReferenceDate(d);
  };

  const persistSettings = (next: ReportsSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const exportOrdersCsv = (list: ServiceOrderListItem[], name: string) => {
    const headers = ['OS', 'Cliente', 'Placa', 'Marca', 'Modelo', 'Status', 'Entrada', 'Atualizado'];
    const rows = list.map((o) => {
      const stLabel =
        getStageConfig(o.status)?.name ?? (o.status === CANCELLED_STATUS ? 'Arquivado' : o.status);
      return [
        o.os_number != null ? String(o.os_number) : o.id.slice(0, 8),
        o.customer_name ?? o.customers?.name ?? '',
        formatPlate(o.plate, blurPlates),
        o.vehicle_brand ?? '',
        o.vehicle_model ?? o.module_identification ?? '',
        stLabel,
        o.created_at?.slice(0, 19).replace('T', ' ') ?? '',
        o.updated_at?.slice(0, 19).replace('T', ' ') ?? '',
      ];
    });
    const safe = name.replace(/[^\w\-]+/g, '_').slice(0, 48);
    downloadCsv(`rei_abs_${safe}_${range.shortLabel.replace(/[^\w]+/g, '-')}.csv`, headers, rows);
  };

  const shell =
    'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-zinc-900/45 backdrop-blur-2xl ' +
    'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45)]';

  return (
    <div className="relative flex min-h-full flex-col gap-4 px-4 pb-28 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-8">
      <div
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] dark:opacity-[0.22]"
        aria-hidden
      >
        <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-sky-400/30 blur-[100px] dark:bg-sky-500/20" />
        <div className="absolute right-0 top-24 h-80 w-80 rounded-full bg-violet-500/25 blur-[110px] dark:bg-violet-500/15" />
      </div>

      <header className={`relative overflow-hidden ${shell} p-5 md:p-6`}>
        <div className="absolute inset-0 bg-gradient-to-br from-sky-500/[0.07] via-transparent to-violet-500/[0.08] pointer-events-none" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-600 dark:text-sky-400">
              Inteligência operacional
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white md:text-[1.75rem]">
              Centro de relatórios
            </h1>
            <p className="max-w-xl text-[14px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              {range.longLabel}. Indicadores alimentados em tempo real pelas ordens de serviço — entradas, entregas,
              responsáveis, garantia e mix de modelos.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            <div className="flex items-center rounded-2xl border border-zinc-200/90 bg-white/60 p-1 dark:border-white/[0.1] dark:bg-zinc-950/40">
              <button
                type="button"
                onClick={() => setPeriodMode('week')}
                className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition ${
                  periodMode === 'week'
                    ? 'bg-zinc-900 text-white shadow-md dark:bg-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Semana
              </button>
              <button
                type="button"
                onClick={() => setPeriodMode('month')}
                className={`rounded-xl px-3 py-1.5 text-[13px] font-semibold transition ${
                  periodMode === 'month'
                    ? 'bg-zinc-900 text-white shadow-md dark:bg-white dark:text-zinc-900'
                    : 'text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Mês
              </button>
            </div>
            <div className="flex items-center gap-1 rounded-2xl border border-zinc-200/90 bg-white/60 px-1 py-1 dark:border-white/[0.1] dark:bg-zinc-950/40">
              <button
                type="button"
                onClick={() => bumpPeriod(-1)}
                className="rounded-xl p-2 text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
                aria-label="Período anterior"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <span className="flex items-center gap-1.5 px-2 text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                <CalendarRange className="h-4 w-4 text-sky-500" />
                {range.shortLabel}
              </span>
              <button
                type="button"
                onClick={() => bumpPeriod(1)}
                className="rounded-xl p-2 text-zinc-600 transition hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
                aria-label="Próximo período"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200/90 bg-white/70 px-3 py-2 text-[13px] font-semibold text-zinc-800 shadow-sm transition hover:bg-white dark:border-white/[0.1] dark:bg-zinc-900/60 dark:text-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen((v) => !v)}
              className={`inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-[13px] font-semibold transition ${
                settingsOpen
                  ? 'border-sky-400/50 bg-sky-500/15 text-sky-800 dark:text-sky-200'
                  : 'border-zinc-200/90 bg-white/70 text-zinc-800 dark:border-white/[0.1] dark:bg-zinc-900/60 dark:text-zinc-100'
              }`}
            >
              <Settings2 className="h-4 w-4" />
              Configurações
            </button>
          </div>
        </div>

        {settingsOpen ? (
          <div className="relative mt-5 grid gap-4 border-t border-zinc-200/70 pt-5 dark:border-white/[0.08] sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex cursor-pointer items-center justify-between gap-3 rounded-2xl border border-zinc-200/80 bg-white/50 p-3 dark:border-white/[0.08] dark:bg-zinc-950/30">
              <span className="text-[13px] font-medium text-zinc-800 dark:text-zinc-200">Incluir laboratório (módulos)</span>
              <input
                type="checkbox"
                checked={settings.includeModules}
                onChange={(e) => persistSettings({ ...settings, includeModules: e.target.checked })}
                className="h-5 w-5 accent-sky-600"
              />
            </label>
            <div className="rounded-2xl border border-zinc-200/80 bg-white/50 p-3 dark:border-white/[0.08] dark:bg-zinc-950/30">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Início da semana
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => persistSettings({ ...settings, weekStartsOn: 'monday' })}
                  className={`flex-1 rounded-xl py-2 text-[12px] font-semibold ${
                    settings.weekStartsOn === 'monday'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-400'
                  }`}
                >
                  Segunda
                </button>
                <button
                  type="button"
                  onClick={() => persistSettings({ ...settings, weekStartsOn: 'sunday' })}
                  className={`flex-1 rounded-xl py-2 text-[12px] font-semibold ${
                    settings.weekStartsOn === 'sunday'
                      ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-400'
                  }`}
                >
                  Domingo
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-200/80 bg-white/50 p-3 dark:border-white/[0.08] dark:bg-zinc-950/30">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <Gauge className="h-3.5 w-3.5" /> Top modelos (quantidade)
              </p>
              <input
                type="range"
                min={5}
                max={40}
                step={1}
                value={settings.topModelsLimit}
                onChange={(e) => persistSettings({ ...settings, topModelsLimit: Number(e.target.value) })}
                className="w-full accent-sky-600"
              />
              <p className="mt-1 text-center text-[12px] font-mono text-zinc-600 dark:text-zinc-400">{settings.topModelsLimit}</p>
            </div>
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Entradas', value: entradas.length, icon: <Car className="h-5 w-5" />, tone: 'from-sky-500/20 to-sky-600/5' },
          { label: 'Entrega no período', value: fluxo.length, icon: <Wrench className="h-5 w-5" />, tone: 'from-emerald-500/20 to-teal-600/5' },
          { label: 'Garantia', value: garantia.length, icon: <Shield className="h-5 w-5" />, tone: 'from-rose-500/20 to-orange-500/5' },
          { label: 'Ordens (filtro)', value: orders.length, icon: <BarChart3 className="h-5 w-5" />, tone: 'from-violet-500/20 to-indigo-600/5' },
        ].map((k) => (
          <div
            key={k.label}
            className={`relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-gradient-to-br ${k.tone} p-4 dark:border-white/[0.08]`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12px] font-medium text-zinc-600 dark:text-zinc-400">{k.label}</span>
              <span className="rounded-xl bg-white/70 p-2 text-zinc-800 shadow-sm dark:bg-zinc-900/70 dark:text-zinc-100">
                {k.icon}
              </span>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-zinc-900 dark:text-white">
              {loading ? '—' : k.value}
            </p>
          </div>
        ))}
      </div>

      <nav className={`${shell} p-2`}>
        <div className="flex gap-1 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((s) => {
            const active = activeSection === s.id;
            return (
              <button
                key={s.id}
                type="button"
                title={s.hint}
                onClick={() => setActiveSection(s.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                  active
                    ? 'bg-zinc-900 text-white shadow-lg dark:bg-white dark:text-zinc-900'
                    : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-white/[0.06]'
                }`}
              >
                {s.icon}
                <span className="text-[13px] font-semibold whitespace-nowrap">{s.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-[14px] text-red-800 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </div>
      ) : null}

      <section className={`${shell} min-h-[320px] p-4 md:p-6`}>
        {loading && !rawOrders ? (
          <div className="flex flex-col items-center justify-center gap-3 py-20 text-zinc-500">
            <RefreshCw className="h-10 w-10 animate-spin text-sky-500" />
            <p className="text-[15px] font-medium">Carregando base da oficina…</p>
          </div>
        ) : activeSection === 'entradas' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Entradas no período</h2>
              <button
                type="button"
                onClick={() => exportOrdersCsv(entradas, 'entradas')}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white/80 px-3 py-2 text-[13px] font-semibold dark:border-white/[0.1] dark:bg-zinc-900/50"
              >
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              Critério: data de criação da OS dentro de {range.shortLabel}. {settings.includeModules ? 'Inclui módulos.' : 'Apenas veículos.'}
            </p>
            <OrderTable orders={entradas} blurPlates={blurPlates} empty="Nenhuma entrada neste período." />
          </div>
        ) : activeSection === 'fluxo' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Entrada e saída no período</h2>
              <button
                type="button"
                onClick={() => exportOrdersCsv(fluxo, 'entrada_saida')}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white/80 px-3 py-2 text-[13px] font-semibold dark:border-white/[0.1] dark:bg-zinc-900/50"
              >
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              Fichas <strong>arquivadas (entregues)</strong> cuja abertura e o arquivamento — pela data de atualização —
              caem neste período. Ideal para medir o fluxo quando entrada e saída ocorrem na mesma janela.
            </p>
            <OrderTable orders={fluxo} blurPlates={blurPlates} empty="Nenhum veículo com esse perfil no período." />
          </div>
        ) : activeSection === 'tecnicos' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Responsabilidade por técnico</h2>
              <button
                type="button"
                onClick={() => {
                  const headers = ['Técnico', 'Quantidade', 'OS (amostra)'];
                  const rows = tecnicos.map((t) => [
                    t.displayName,
                    String(t.count),
                    t.orders
                      .slice(0, 8)
                      .map((o) => (o.os_number != null ? `#${o.os_number}` : o.id.slice(0, 6)))
                      .join(' '),
                  ]);
                  downloadCsv(`rei_abs_tecnicos_${range.shortLabel.replace(/[^\w]+/g, '-')}.csv`, headers, rows);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white/80 px-3 py-2 text-[13px] font-semibold dark:border-white/[0.1] dark:bg-zinc-900/50"
              >
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              Contagem por técnico atribuído na data de <strong>entrada</strong> (criação da OS) no período.
            </p>
            <div className="space-y-3">
              {tecnicos.length === 0 ? (
                <p className="py-12 text-center text-zinc-500">Nenhuma OS com entrada no período.</p>
              ) : (
                tecnicos.map((t) => (
                  <div
                    key={t.technicianKey}
                    className="rounded-2xl border border-zinc-200/70 bg-white/50 p-4 dark:border-white/[0.08] dark:bg-zinc-950/35"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-[15px] font-semibold text-zinc-900 dark:text-white">{t.displayName}</span>
                      <span className="rounded-full bg-sky-500/15 px-3 py-0.5 text-[13px] font-bold text-sky-800 dark:text-sky-200">
                        {t.count} {t.count === 1 ? 'OS' : 'OS'}
                      </span>
                    </div>
                    <OrderTable orders={t.orders} blurPlates={blurPlates} compact empty="" />
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeSection === 'garantia' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Garantia no período</h2>
              <button
                type="button"
                onClick={() => exportOrdersCsv(garantia, 'garantia')}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white/80 px-3 py-2 text-[13px] font-semibold dark:border-white/[0.1] dark:bg-zinc-900/50"
              >
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              OS com <strong>tag de garantia</strong> ou status em etapa <strong>Garantia</strong>, entre as entradas do
              período.
            </p>
            <OrderTable orders={garantia} blurPlates={blurPlates} empty="Nenhuma OS de garantia neste período." />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Modelos mais frequentes</h2>
              <button
                type="button"
                onClick={() => {
                  const headers = ['Marca', 'Modelo', 'Quantidade'];
                  const rows = modelos.map((m) => [m.brand, m.model, String(m.count)]);
                  downloadCsv(`rei_abs_modelos_${range.shortLabel.replace(/[^\w]+/g, '-')}.csv`, headers, rows);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white/80 px-3 py-2 text-[13px] font-semibold dark:border-white/[0.1] dark:bg-zinc-900/50"
              >
                <Download className="h-4 w-4" /> CSV
              </button>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              Ranking entre as <strong>entradas</strong> do período (marca + modelo). Útil para estoque e campanhas.
            </p>
            {modelos.length === 0 ? (
              <p className="py-12 text-center text-zinc-500">Sem dados para o período.</p>
            ) : (
              <ul className="space-y-3">
                {modelos.map((m, idx) => (
                  <li
                    key={m.key}
                    className="rounded-2xl border border-zinc-200/70 bg-white/40 p-3 dark:border-white/[0.08] dark:bg-zinc-950/35"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-[14px] font-medium text-zinc-900 dark:text-white">
                        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-[12px] font-bold text-white dark:bg-white dark:text-zinc-900">
                          {idx + 1}
                        </span>
                        {m.brand} · {m.model}
                      </span>
                      <span className="text-[14px] font-bold tabular-nums text-sky-600 dark:text-sky-400">{m.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-sky-500 to-violet-500 transition-all"
                        style={{ width: `${Math.max(8, (m.count / maxModelCount) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
};

function OrderTable({
  orders,
  blurPlates,
  compact,
  empty,
}: {
  orders: ServiceOrderListItem[];
  blurPlates: boolean;
  compact?: boolean;
  empty: string;
}) {
  if (orders.length === 0 && empty) {
    return <p className="py-10 text-center text-[14px] text-zinc-500">{empty}</p>;
  }
  if (orders.length === 0) return null;
  return (
    <div className={`overflow-x-auto ${compact ? 'mt-2' : ''}`}>
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[13px]">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <th className="border-b border-zinc-200/80 pb-2 pr-3 dark:border-white/[0.08]">OS</th>
            <th className="border-b border-zinc-200/80 pb-2 pr-3 dark:border-white/[0.08]">Cliente</th>
            <th className="border-b border-zinc-200/80 pb-2 pr-3 dark:border-white/[0.08]">Placa / ID</th>
            <th className="border-b border-zinc-200/80 pb-2 pr-3 dark:border-white/[0.08]">Veículo</th>
            <th className="border-b border-zinc-200/80 pb-2 dark:border-white/[0.08]">Status</th>
          </tr>
        </thead>
        <tbody>
          {(compact ? orders.slice(0, 6) : orders).map((o) => {
            const stName = getStageConfig(o.status)?.name ?? o.status;
            const stCls = getStageStyle(o.status);
            const vehicle = [o.vehicle_brand, o.vehicle_model].filter(Boolean).join(' ') || o.module_identification || '—';
            return (
              <tr key={o.id} className="text-zinc-800 dark:text-zinc-200">
                <td className="border-b border-zinc-100/90 py-2 pr-3 font-mono text-[12px] dark:border-white/[0.06]">
                  {o.os_number != null ? `#${o.os_number}` : o.id.slice(0, 8)}
                </td>
                <td className="border-b border-zinc-100/90 py-2 pr-3 dark:border-white/[0.06]">
                  {o.customer_name ?? o.customers?.name ?? '—'}
                </td>
                <td className="border-b border-zinc-100/90 py-2 pr-3 font-mono dark:border-white/[0.06]">
                  {formatPlate(o.plate, blurPlates)}
                </td>
                <td className="border-b border-zinc-100/90 py-2 pr-3 dark:border-white/[0.06]">{vehicle}</td>
                <td className="border-b border-zinc-100/90 py-2 dark:border-white/[0.06]">
                  <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${stCls}`}>
                    {stName}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {compact && orders.length > 6 ? (
        <p className="mt-2 text-center text-[12px] text-zinc-500">+{orders.length - 6} registros neste grupo</p>
      ) : null}
    </div>
  );
}
