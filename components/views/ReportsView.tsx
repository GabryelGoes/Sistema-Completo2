import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CalendarRange,
  Car,
  ChevronLeft,
  ChevronRight,
  CircuitBoard,
  FileText,
  Printer,
  RefreshCw,
  Settings2,
  Shield,
  Trash2,
  Users,
  Wrench,
} from 'lucide-react';
import { DeleteServiceOrderModal } from '../DeleteServiceOrderModal';
import { ReportServiceOrderDetailModal } from '../ReportServiceOrderDetailModal';
import { getServiceOrders, type ServiceOrderListItem } from '../../services/apiService';
import { getStageConfig, getStageStyle, CANCELLED_STATUS } from '../../constants/serviceOrderStages';
import {
  type ReportPeriodMode,
  type ReportWeekStart,
  filterVehicleOrders,
  filterModuleOrders,
  getPeriodRange,
  formatPeriodBounds,
  ordersEnteredAndArchivedInPeriod,
  ordersEnteredInPeriod,
  ordersWarrantyInPeriod,
  reportTechnicianResponsibility,
  formatPlateDisplay,
} from '../../utils/workshopReports';
import {
  downloadFullWorkshopReportPdf,
  downloadOrdersReportPdf,
  downloadTechniciansReportPdf,
  printOrdersReportPdf,
  printTechniciansReportPdf,
  printFullWorkshopReportPdf,
} from '../../utils/workshopReportsPdf';

const REPORTS_SETTINGS_KEY = 'app_reports_settings_v1';
const REPORTS_HIDDEN_ORDERS_KEY = 'app_reports_hidden_order_ids_v1';

type ReportsSettings = {
  weekStartsOn: ReportWeekStart;
};

const DEFAULT_SETTINGS: ReportsSettings = {
  weekStartsOn: 'monday',
};

type ReportSection = 'entradas' | 'fluxo' | 'tecnicos' | 'garantia' | 'laboratorio';

const SECTIONS: { id: ReportSection; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: 'entradas', label: 'Entradas', hint: 'Veículos que entraram no período', icon: <Car className="h-4 w-4" /> },
  {
    id: 'fluxo',
    label: 'Entrada e saída',
    hint: 'Arquivadas (entregues) no período — data de arquivamento',
    icon: <ArrowLeftRight className="h-4 w-4" />,
  },
  { id: 'tecnicos', label: 'Por técnico', hint: 'Responsáveis na data de entrada', icon: <Users className="h-4 w-4" /> },
  { id: 'garantia', label: 'Garantia', hint: 'Marcadas como garantia ou etapa Garantia', icon: <Shield className="h-4 w-4" /> },
  {
    id: 'laboratorio',
    label: 'Laboratório',
    hint: 'Módulos do laboratório no período',
    icon: <CircuitBoard className="h-4 w-4" />,
  },
];

function loadSettings(): ReportsSettings {
  try {
    const raw = localStorage.getItem(REPORTS_SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const p = JSON.parse(raw) as Partial<ReportsSettings>;
    return {
      weekStartsOn: p.weekStartsOn === 'sunday' ? 'sunday' : 'monday',
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

function loadHiddenOrderIds(): Set<string> {
  try {
    const raw = localStorage.getItem(REPORTS_HIDDEN_ORDERS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.length > 0));
  } catch {
    return new Set();
  }
}

function saveHiddenOrderIds(ids: Set<string>): void {
  try {
    localStorage.setItem(REPORTS_HIDDEN_ORDERS_KEY, JSON.stringify([...ids]));
  } catch (_) {}
}

function orderDeleteLabel(o: ServiceOrderListItem, blurPlates: boolean): string {
  const num = o.os_number != null ? `#${o.os_number}` : o.id.slice(0, 8);
  const plate = formatPlateDisplay(o.plate, blurPlates);
  return plate && plate !== '—' ? `${num} · ${plate}` : num;
}

export const ReportsView: React.FC<{ blurPlates?: boolean; canDeleteOrders?: boolean }> = ({
  blurPlates = false,
  canDeleteOrders = false,
}) => {
  const [settings, setSettings] = useState<ReportsSettings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [periodMode, setPeriodMode] = useState<ReportPeriodMode>('month');
  const [referenceDate, setReferenceDate] = useState(() => new Date());
  const [activeSection, setActiveSection] = useState<ReportSection>('entradas');
  const [rawOrders, setRawOrders] = useState<ServiceOrderListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceOrderListItem | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [detailOrder, setDetailOrder] = useState<ServiceOrderListItem | null>(null);
  const [hiddenOrderIds, setHiddenOrderIds] = useState<Set<string>>(() => loadHiddenOrderIds());

  const range = useMemo(
    () => getPeriodRange(periodMode, referenceDate, settings.weekStartsOn),
    [periodMode, referenceDate, settings.weekStartsOn]
  );

  const visibleOrders = useMemo(() => {
    const list = rawOrders ?? [];
    if (hiddenOrderIds.size === 0) return list;
    return list.filter((o) => !hiddenOrderIds.has(o.id));
  }, [rawOrders, hiddenOrderIds]);

  const vehicleOrders = useMemo(() => filterVehicleOrders(visibleOrders, false), [visibleOrders]);
  const moduleOrders = useMemo(() => filterModuleOrders(visibleOrders), [visibleOrders]);

  const entradas = useMemo(
    () => ordersEnteredInPeriod(vehicleOrders, range.start, range.end),
    [vehicleOrders, range.start, range.end]
  );

  const fluxo = useMemo(
    () => ordersEnteredAndArchivedInPeriod(vehicleOrders, range.start, range.end),
    [vehicleOrders, range.start, range.end]
  );

  const tecnicos = useMemo(
    () => reportTechnicianResponsibility(vehicleOrders, range.start, range.end),
    [vehicleOrders, range.start, range.end]
  );

  const garantia = useMemo(
    () => ordersWarrantyInPeriod(vehicleOrders, range.start, range.end),
    [vehicleOrders, range.start, range.end]
  );

  const modulosEntradas = useMemo(
    () => ordersEnteredInPeriod(moduleOrders, range.start, range.end),
    [moduleOrders, range.start, range.end]
  );

  const modulosFluxo = useMemo(
    () => ordersEnteredAndArchivedInPeriod(moduleOrders, range.start, range.end),
    [moduleOrders, range.start, range.end]
  );

  const modulosGarantia = useMemo(
    () => ordersWarrantyInPeriod(moduleOrders, range.start, range.end),
    [moduleOrders, range.start, range.end]
  );

  const sectionCounts = useMemo<Record<ReportSection, number>>(
    () => ({
      entradas: entradas.length,
      fluxo: fluxo.length,
      tecnicos: tecnicos.reduce((sum, t) => sum + t.count, 0),
      garantia: garantia.length,
      laboratorio: modulosEntradas.length + modulosFluxo.length + modulosGarantia.length,
    }),
    [entradas.length, fluxo.length, tecnicos, garantia.length, modulosEntradas.length, modulosFluxo.length, modulosGarantia.length]
  );

  const pdfMeta = useMemo(
    () => ({
      periodLong: range.longLabel,
      periodShort: range.shortLabel,
      scopeNote: 'Veículos nas secções principais; módulos do laboratório na aba Laboratório.',
    }),
    [range.longLabel, range.shortLabel]
  );

  const fullReportPayload = useMemo(
    () => ({
      meta: pdfMeta,
      blurPlates,
      kpis: {
        entradas: entradas.length,
        fluxo: fluxo.length,
        garantia: garantia.length,
        modulosEntradas: modulosEntradas.length,
      },
      entradas,
      fluxo,
      garantia,
      tecnicos,
      modulosEntradas,
      modulosFluxo,
    }),
    [pdfMeta, blurPlates, entradas, fluxo, garantia, tecnicos, modulosEntradas, modulosFluxo]
  );

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

  const goToCurrentPeriod = () => setReferenceDate(new Date());

  const periodBoundsLabel = useMemo(
    () => formatPeriodBounds(range.start, range.end),
    [range.start, range.end]
  );

  const persistSettings = (next: ReportsSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const requestDeleteOrder = useCallback((order: ServiceOrderListItem) => {
    setDeleteError(null);
    setDeleteTarget(order);
  }, []);

  const openOrderDetail = useCallback((order: ServiceOrderListItem) => {
    setDetailOrder(order);
  }, []);

  const handleConfirmHideFromReports = useCallback(() => {
    if (!deleteTarget) return;
    setDeleteSaving(true);
    setDeleteError(null);
    const targetId = deleteTarget.id;
    setHiddenOrderIds((prev) => {
      const next = new Set(prev);
      next.add(targetId);
      saveHiddenOrderIds(next);
      return next;
    });
    setDeleteTarget(null);
    setDeleteSaving(false);
  }, [deleteTarget]);

  const restoreHiddenOrders = useCallback(() => {
    setHiddenOrderIds(new Set());
    try {
      localStorage.removeItem(REPORTS_HIDDEN_ORDERS_KEY);
    } catch (_) {}
  }, []);

  const printSectionBtnClass =
    'inline-flex items-center gap-2 rounded-xl border border-zinc-200/90 bg-white/80 px-3 py-2 text-[13px] font-semibold text-zinc-800 transition hover:bg-zinc-50 dark:border-white/[0.1] dark:bg-zinc-900/50 dark:text-zinc-100 dark:hover:bg-zinc-900/80';

  const shell =
    'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.08] bg-white/75 dark:bg-zinc-900/45 backdrop-blur-2xl ' +
    'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.12)] dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.45)]';

  return (
    <div
      data-reports-print-root
      className="relative flex min-h-full flex-col gap-4 px-4 pb-28 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-8 md:pb-10 md:pt-8"
    >
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
              {range.longLabel}. Entradas e garantia usam a <strong>data de criação</strong> da OS; navegue por mês para
              ver o histórico completo do banco.
              {rawOrders && !loading ? (
                <span className="mt-1 block text-[12px] text-zinc-500 dark:text-zinc-500">
                  Base carregada: {rawOrders.length} ordens no total ({vehicleOrders.length} veículos).
                </span>
              ) : null}
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
              <span
                className="flex min-w-0 flex-col items-center gap-0.5 px-2 text-center"
                title={periodBoundsLabel}
              >
                <span className="flex items-center gap-1.5 text-[13px] font-medium text-zinc-700 dark:text-zinc-200">
                  <CalendarRange className="h-4 w-4 shrink-0 text-sky-500" />
                  {range.shortLabel}
                </span>
                <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">{periodBoundsLabel}</span>
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
              onClick={goToCurrentPeriod}
              className="rounded-2xl border border-zinc-200/90 bg-white/60 px-3 py-2 text-[13px] font-semibold text-zinc-700 transition hover:bg-white dark:border-white/[0.1] dark:bg-zinc-950/40 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
            >
              Hoje
            </button>
            <button
              type="button"
              onClick={() => printFullWorkshopReportPdf(fullReportPayload)}
              disabled={loading || !rawOrders}
              title="Abre o relatório completo para impressão ou «Salvar como PDF»"
              className="inline-flex items-center gap-2 rounded-2xl border border-zinc-200/90 bg-white/70 px-3 py-2 text-[13px] font-semibold text-zinc-800 shadow-sm transition hover:bg-white dark:border-white/[0.1] dark:bg-zinc-900/60 dark:text-zinc-100 dark:hover:bg-zinc-900 disabled:opacity-50"
            >
              <Printer className="h-4 w-4" />
              Imprimir tudo
            </button>
            <button
              type="button"
              onClick={() => downloadFullWorkshopReportPdf(fullReportPayload)}
              disabled={loading || !rawOrders}
              className="inline-flex items-center gap-2 rounded-2xl border border-sky-200/90 bg-sky-500/15 px-3 py-2 text-[13px] font-semibold text-sky-900 shadow-sm transition hover:bg-sky-500/25 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100 dark:hover:bg-sky-500/20 disabled:opacity-50"
            >
              <FileText className="h-4 w-4" />
              PDF completo
            </button>
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
          <div className="relative mt-5 max-w-md border-t border-zinc-200/70 pt-5 dark:border-white/[0.08]">
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
            {hiddenOrderIds.size > 0 ? (
              <div className="mt-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-3 dark:border-amber-500/20 dark:bg-amber-500/10">
                <p className="text-[13px] text-amber-900 dark:text-amber-100">
                  {hiddenOrderIds.size} OS oculta(s) só neste relatório (permanecem no sistema).
                </p>
                <button
                  type="button"
                  onClick={restoreHiddenOrders}
                  className="mt-2 text-[13px] font-semibold text-amber-800 underline-offset-2 hover:underline dark:text-amber-200"
                >
                  Mostrar todas novamente
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: 'Entradas', value: entradas.length, icon: <Car className="h-5 w-5" />, tone: 'from-sky-500/20 to-sky-600/5', lightBorder: 'border-sky-200/90', lightBg: 'from-sky-100 via-sky-50/90 to-white', lightShadow: 'shadow-[0_4px_20px_-6px_rgba(14,165,233,0.35)]', iconLight: 'bg-sky-500/15 text-sky-700' },
          { label: 'Entrega no período', value: fluxo.length, icon: <Wrench className="h-5 w-5" />, tone: 'from-emerald-500/20 to-teal-600/5', lightBorder: 'border-emerald-200/90', lightBg: 'from-emerald-100 via-emerald-50/90 to-white', lightShadow: 'shadow-[0_4px_20px_-6px_rgba(16,185,129,0.35)]', iconLight: 'bg-emerald-500/15 text-emerald-700' },
          { label: 'Garantia', value: garantia.length, icon: <Shield className="h-5 w-5" />, tone: 'from-rose-500/20 to-orange-500/5', lightBorder: 'border-rose-200/90', lightBg: 'from-rose-100 via-orange-50/80 to-white', lightShadow: 'shadow-[0_4px_20px_-6px_rgba(244,63,94,0.3)]', iconLight: 'bg-rose-500/15 text-rose-700' },
          { label: 'Módulos (lab.)', value: modulosEntradas.length, icon: <CircuitBoard className="h-5 w-5" />, tone: 'from-violet-500/20 to-indigo-600/5', lightBorder: 'border-violet-200/90', lightBg: 'from-violet-100 via-indigo-50/80 to-white', lightShadow: 'shadow-[0_4px_20px_-6px_rgba(139,92,246,0.35)]', iconLight: 'bg-violet-500/15 text-violet-700' },
        ].map((k) => (
          <div
            key={k.label}
            className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 ${k.lightBorder} ${k.lightBg} ${k.lightShadow} dark:border-white/[0.08] dark:bg-gradient-to-br ${k.tone}`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-[12px] font-semibold text-zinc-700 dark:font-medium dark:text-zinc-400">{k.label}</span>
              <span
                className={`rounded-xl p-2 shadow-sm ${k.iconLight} dark:bg-zinc-900/70 dark:text-zinc-100 dark:shadow-none`}
              >
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
                <span
                  className={`min-w-[1.5rem] rounded-full px-2 py-0.5 text-center text-[11px] font-bold tabular-nums ${
                    active
                      ? 'bg-white/20 text-white dark:bg-zinc-900/15 dark:text-zinc-900'
                      : 'bg-zinc-200/90 text-zinc-700 dark:bg-white/[0.08] dark:text-zinc-300'
                  }`}
                >
                  {loading ? '—' : sectionCounts[s.id]}
                </span>
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
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Entradas no período
                <span className="ml-2 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[13px] font-bold text-sky-800 dark:text-sky-200">
                  {entradas.length}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadOrdersReportPdf(
                      'Entradas',
                      'Critério: data de criação da OS de veículo dentro do período.',
                      entradas,
                      pdfMeta,
                      blurPlates
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-200/90 bg-sky-500/10 px-3 py-2 text-[13px] font-semibold text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100"
                >
                  <FileText className="h-4 w-4" /> PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    printOrdersReportPdf(
                      'Entradas',
                      'Critério: data de criação da OS de veículo dentro do período.',
                      entradas,
                      pdfMeta,
                      blurPlates
                    )
                  }
                  className={printSectionBtnClass}
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
              </div>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              Critério: data de criação da OS de veículo dentro de {range.shortLabel}.
            </p>
            <OrderTable
              orders={entradas}
              blurPlates={blurPlates}
              empty="Nenhuma entrada neste período."
              canDelete={canDeleteOrders}
              onDelete={requestDeleteOrder}
              onOpenDetail={openOrderDetail}
            />
          </div>
        ) : activeSection === 'fluxo' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Entrada e saída no período
                <span className="ml-2 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[13px] font-bold text-emerald-800 dark:text-emerald-200">
                  {fluxo.length}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadOrdersReportPdf(
                      'Entrada_e_saida',
                      'OS arquivadas (entregues) com data de arquivamento (atualização) no período.',
                      fluxo,
                      pdfMeta,
                      blurPlates
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-200/90 bg-sky-500/10 px-3 py-2 text-[13px] font-semibold text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100"
                >
                  <FileText className="h-4 w-4" /> PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    printOrdersReportPdf(
                      'Entrada_e_saida',
                      'OS arquivadas (entregues) com data de arquivamento (atualização) no período.',
                      fluxo,
                      pdfMeta,
                      blurPlates
                    )
                  }
                  className={printSectionBtnClass}
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
              </div>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              Fichas <strong>arquivadas (entregues)</strong> cuja data de arquivamento (última atualização) cai neste
              período — inclui OS abertas em meses anteriores e finalizadas aqui.
            </p>
            <OrderTable
              orders={fluxo}
              blurPlates={blurPlates}
              empty="Nenhum veículo com esse perfil no período."
              canDelete={canDeleteOrders}
              onDelete={requestDeleteOrder}
              onOpenDetail={openOrderDetail}
            />
          </div>
        ) : activeSection === 'tecnicos' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Responsabilidade por técnico
                <span className="ml-2 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[13px] font-bold text-sky-800 dark:text-sky-200">
                  {sectionCounts.tecnicos}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadTechniciansReportPdf(tecnicos, pdfMeta, blurPlates)}
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-200/90 bg-sky-500/10 px-3 py-2 text-[13px] font-semibold text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100"
                >
                  <FileText className="h-4 w-4" /> PDF
                </button>
                <button
                  type="button"
                  onClick={() => printTechniciansReportPdf(tecnicos, pdfMeta, blurPlates)}
                  className={printSectionBtnClass}
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
              </div>
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
                    <OrderTable
                      orders={t.orders}
                      blurPlates={blurPlates}
                      empty=""
                      canDelete={canDeleteOrders}
                      onDelete={requestDeleteOrder}
                      onOpenDetail={openOrderDetail}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        ) : activeSection === 'garantia' ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                Garantia no período
                <span className="ml-2 rounded-full bg-rose-500/15 px-2.5 py-0.5 text-[13px] font-bold text-rose-800 dark:text-rose-200">
                  {garantia.length}
                </span>
              </h2>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    downloadOrdersReportPdf(
                      'Garantia',
                      'OS com tag de garantia ou em etapa Garantia, entre as entradas do período.',
                      garantia,
                      pdfMeta,
                      blurPlates
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-sky-200/90 bg-sky-500/10 px-3 py-2 text-[13px] font-semibold text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100"
                >
                  <FileText className="h-4 w-4" /> PDF
                </button>
                <button
                  type="button"
                  onClick={() =>
                    printOrdersReportPdf(
                      'Garantia',
                      'OS com tag de garantia ou em etapa Garantia, entre as entradas do período.',
                      garantia,
                      pdfMeta,
                      blurPlates
                    )
                  }
                  className={printSectionBtnClass}
                >
                  <Printer className="h-4 w-4" /> Imprimir
                </button>
              </div>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              OS com <strong>tag de garantia</strong> ou status em etapa <strong>Garantia</strong>, entre as entradas do
              período.
            </p>
            <OrderTable
              orders={garantia}
              blurPlates={blurPlates}
              empty="Nenhuma OS de garantia neste período."
              canDelete={canDeleteOrders}
              onDelete={requestDeleteOrder}
              onOpenDetail={openOrderDetail}
            />
          </div>
        ) : activeSection === 'laboratorio' ? (
          <div className="space-y-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Laboratório — módulos</h2>
              <span className="rounded-full bg-violet-500/15 px-3 py-1 text-[12px] font-bold text-violet-800 dark:text-violet-200">
                {modulosEntradas.length} entradas · {modulosFluxo.length} entrega · {modulosGarantia.length} garantia
              </span>
            </div>
            <p className="text-[13px] text-zinc-600 dark:text-zinc-400">
              Ordens de serviço do tipo <strong>módulo</strong> (laboratório), com os mesmos critérios das abas de veículos.
            </p>

            <LabReportBlock
              title="Entradas no período"
              count={modulosEntradas.length}
              badgeClass="bg-sky-500/15 text-sky-800 dark:text-sky-200"
              orders={modulosEntradas}
              pdfSlug="Lab_entradas"
              pdfNote="Módulos: data de criação no período."
              empty="Nenhum módulo com entrada neste período."
              pdfMeta={pdfMeta}
              blurPlates={blurPlates}
              printBtnClass={printSectionBtnClass}
              canDelete={canDeleteOrders}
              onDelete={requestDeleteOrder}
              onOpenDetail={openOrderDetail}
            />
            <LabReportBlock
              title="Entrada e saída no período"
              count={modulosFluxo.length}
              badgeClass="bg-emerald-500/15 text-emerald-800 dark:text-emerald-200"
              orders={modulosFluxo}
              pdfSlug="Lab_entrada_saida"
              pdfNote="Módulos arquivados com criação e arquivamento no período."
              empty="Nenhum módulo com esse perfil no período."
              pdfMeta={pdfMeta}
              blurPlates={blurPlates}
              printBtnClass={printSectionBtnClass}
              bordered
              canDelete={canDeleteOrders}
              onDelete={requestDeleteOrder}
              onOpenDetail={openOrderDetail}
            />
            <LabReportBlock
              title="Garantia no período"
              count={modulosGarantia.length}
              badgeClass="bg-rose-500/15 text-rose-800 dark:text-rose-200"
              orders={modulosGarantia}
              pdfSlug="Lab_garantia"
              pdfNote="Módulos com tag de garantia ou etapa Garantia."
              empty="Nenhum módulo de garantia neste período."
              pdfMeta={pdfMeta}
              blurPlates={blurPlates}
              printBtnClass={printSectionBtnClass}
              bordered
              canDelete={canDeleteOrders}
              onDelete={requestDeleteOrder}
              onOpenDetail={openOrderDetail}
            />
          </div>
        ) : null}
      </section>

      <ReportServiceOrderDetailModal
        order={detailOrder}
        blurPlates={blurPlates}
        onClose={() => setDetailOrder(null)}
      />

      <DeleteServiceOrderModal
        open={deleteTarget != null}
        orderLabel={deleteTarget ? orderDeleteLabel(deleteTarget, blurPlates) : ''}
        saving={deleteSaving}
        error={deleteError}
        onClose={() => {
          if (deleteSaving) return;
          setDeleteTarget(null);
          setDeleteError(null);
        }}
        onConfirm={handleConfirmHideFromReports}
      />
    </div>
  );
};

type LabReportBlockProps = {
  title: string;
  count: number;
  badgeClass: string;
  orders: ServiceOrderListItem[];
  pdfSlug: string;
  pdfNote: string;
  empty: string;
  pdfMeta: { periodLong: string; periodShort: string; scopeNote: string };
  blurPlates: boolean;
  printBtnClass: string;
  bordered?: boolean;
  canDelete?: boolean;
  onDelete?: (order: ServiceOrderListItem) => void;
  onOpenDetail?: (order: ServiceOrderListItem) => void;
};

function LabReportBlock({
  title,
  count,
  badgeClass,
  orders,
  pdfSlug,
  pdfNote,
  empty,
  pdfMeta,
  blurPlates,
  printBtnClass,
  bordered,
  canDelete,
  onDelete,
  onOpenDetail,
}: LabReportBlockProps) {
  return (
    <div className={`space-y-3 ${bordered ? 'border-t border-zinc-200/70 pt-6 dark:border-white/[0.08]' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white">
          {title}
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[12px] font-bold ${badgeClass}`}>{count}</span>
        </h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => downloadOrdersReportPdf(pdfSlug, pdfNote, orders, pdfMeta, blurPlates)}
            className="inline-flex items-center gap-2 rounded-xl border border-sky-200/90 bg-sky-500/10 px-3 py-2 text-[13px] font-semibold text-sky-900 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-100"
          >
            <FileText className="h-4 w-4" /> PDF
          </button>
          <button
            type="button"
            onClick={() => printOrdersReportPdf(pdfSlug, pdfNote, orders, pdfMeta, blurPlates)}
            className={printBtnClass}
          >
            <Printer className="h-4 w-4" /> Imprimir
          </button>
        </div>
      </div>
      <OrderTable
        orders={orders}
        blurPlates={blurPlates}
        empty={empty}
        canDelete={canDelete}
        onDelete={onDelete}
        onOpenDetail={onOpenDetail}
      />
    </div>
  );
}

function OrderTable({
  orders,
  blurPlates,
  empty,
  canDelete,
  onDelete,
  onOpenDetail,
}: {
  orders: ServiceOrderListItem[];
  blurPlates: boolean;
  empty: string;
  canDelete?: boolean;
  onDelete?: (order: ServiceOrderListItem) => void;
  onOpenDetail?: (order: ServiceOrderListItem) => void;
}) {
  if (orders.length === 0 && empty) {
    return <p className="py-10 text-center text-[14px] text-zinc-500">{empty}</p>;
  }
  if (orders.length === 0) return null;
  return (
    <div className="space-y-2">
      {onOpenDetail ? (
        <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
          Clique na linha para abrir queixa, anexos e orçamentos.
        </p>
      ) : null}
      <div className="max-h-[min(70vh,560px)] overflow-auto rounded-xl border border-zinc-200/60 dark:border-white/[0.06]">
      <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left text-[13px]">
        <thead className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm dark:bg-zinc-900/95">
          <tr className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            <th className="border-b border-zinc-200/80 px-3 pb-2 pt-2 dark:border-white/[0.08]">OS</th>
            <th className="border-b border-zinc-200/80 px-3 pb-2 pt-2 dark:border-white/[0.08]">Cliente</th>
            <th className="border-b border-zinc-200/80 px-3 pb-2 pt-2 dark:border-white/[0.08]">Placa / ID</th>
            <th className="border-b border-zinc-200/80 px-3 pb-2 pt-2 dark:border-white/[0.08]">Veículo / Módulo</th>
            <th className="border-b border-zinc-200/80 px-3 pb-2 pt-2 dark:border-white/[0.08]">Status</th>
            {canDelete ? (
              <th className="border-b border-zinc-200/80 px-3 pb-2 pt-2 text-right dark:border-white/[0.08]">
                Ações
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => {
            const stName =
              getStageConfig(o.status)?.name ?? (o.status === CANCELLED_STATUS ? 'Arquivado' : o.status);
            const stCls = getStageStyle(o.status);
            const vehicle = [o.vehicle_brand, o.vehicle_model].filter(Boolean).join(' ') || o.module_identification || '—';
            return (
              <tr
                key={o.id}
                className={`text-zinc-800 dark:text-zinc-200 ${
                  onOpenDetail
                    ? 'cursor-pointer transition-colors hover:bg-sky-500/[0.06] dark:hover:bg-sky-500/10'
                    : ''
                }`}
                onClick={onOpenDetail ? () => onOpenDetail(o) : undefined}
                title={onOpenDetail ? 'Ver queixa, anexos e orçamentos' : undefined}
              >
                <td className="border-b border-zinc-100/90 px-3 py-2 font-mono text-[12px] dark:border-white/[0.06]">
                  {o.os_number != null ? `#${o.os_number}` : o.id.slice(0, 8)}
                </td>
                <td className="border-b border-zinc-100/90 px-3 py-2 dark:border-white/[0.06]">
                  {o.customer_name ?? o.customers?.name ?? '—'}
                </td>
                <td className="border-b border-zinc-100/90 px-3 py-2 font-mono dark:border-white/[0.06]">
                  {formatPlateDisplay(o.plate, blurPlates)}
                </td>
                <td className="border-b border-zinc-100/90 px-3 py-2 dark:border-white/[0.06]">{vehicle}</td>
                <td className="border-b border-zinc-100/90 px-3 py-2 dark:border-white/[0.06]">
                  <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${stCls}`}>
                    {stName}
                  </span>
                </td>
                {canDelete && onDelete ? (
                  <td className="border-b border-zinc-100/90 px-3 py-2 text-right dark:border-white/[0.06]">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(o);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-red-500/10 hover:text-red-600 dark:hover:bg-red-500/15"
                      title="Remover deste relatório (não apaga do banco)"
                      aria-label="Remover ordem deste relatório"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
