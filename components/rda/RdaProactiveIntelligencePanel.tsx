import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock3,
  History,
  Info,
  Lightbulb,
  Loader2,
  Radar,
  RefreshCw,
  Settings2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  fetchRdaProactiveDashboard,
  proposeRdaKnowledge,
  runRdaProactiveScan,
  saveRdaProactiveConfig,
  transitionRdaProactiveAlert,
  type RdaProactiveAlert,
  type RdaProactiveDashboard,
} from '../../services/apiService';
import { AjustesPcOpsEyebrow } from '../ajustes/AjustesPcOpsEyebrow';
import { RdaSettingsChildShell } from './RdaSettingsChildShell';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
  /** Chrome A4 — só Hub de Ajustes desktop (não header/atalhos). */
  ajustesHubChrome?: boolean;
  /** Destaca/abre o alerta ao abrir (banner / painel rápido). */
  focusAlertId?: string | null;
};

type TabId = 'ativos' | 'criticos' | 'recomendacoes' | 'historico' | 'config';

const CATEGORY_LABEL: Record<RdaProactiveAlert['category'], string> = {
  patio: 'Pátio',
  laboratorio: 'Laboratório',
  estoque: 'Estoque',
  produtividade: 'Produtividade',
};

const SEVERITY_LABEL: Record<RdaProactiveAlert['severity'], string> = {
  info: 'Informativo',
  warning: 'Atenção',
  critical: 'Crítico',
};

const STATUS_LABEL: Record<RdaProactiveAlert['status'], string> = {
  active: 'Ativo',
  acknowledged: 'Reconhecido',
  resolved: 'Resolvido',
  dismissed: 'Descartado',
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function relativeWhen(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const diff = Math.max(0, nowMs - t);
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d}d`;
}

function severityTone(severity: RdaProactiveAlert['severity']): {
  rail: string;
  chip: string;
  icon: string;
  soft: string;
} {
  if (severity === 'critical') {
    return {
      rail: 'bg-rose-500',
      chip: 'bg-rose-500/12 text-rose-700 dark:text-rose-300',
      icon: 'text-rose-600 dark:text-rose-400',
      soft: 'from-rose-500/10 via-transparent to-transparent',
    };
  }
  if (severity === 'warning') {
    return {
      rail: 'bg-amber-500',
      chip: 'bg-amber-500/12 text-amber-800 dark:text-amber-200',
      icon: 'text-amber-600 dark:text-amber-400',
      soft: 'from-amber-500/10 via-transparent to-transparent',
    };
  }
  return {
    rail: 'bg-sky-500',
    chip: 'bg-sky-500/12 text-sky-800 dark:text-sky-200',
    icon: 'text-sky-600 dark:text-sky-400',
    soft: 'from-sky-500/10 via-transparent to-transparent',
  };
}

function SeverityIcon({ severity }: { severity: RdaProactiveAlert['severity'] }) {
  if (severity === 'critical') return <ShieldAlert className="h-4 w-4" />;
  if (severity === 'warning') return <AlertTriangle className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

export const RdaProactiveIntelligencePanel: React.FC<Props> = ({
  isOpen,
  onClose,
  desktopShell,
  ajustesHubChrome = false,
  focusAlertId = null,
}) => {
  const pcChrome = Boolean(ajustesHubChrome && desktopShell);
  const [data, setData] = useState<RdaProactiveDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [severity, setSeverity] = useState<string>('all');
  const [tab, setTab] = useState<TabId>('ativos');
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRdaProactiveDashboard();
      setData(res);
      setNowMs(Date.now());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar Monitoramento Proativo.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !focusAlertId || !data) return;
    const inCritical = data.criticalAlerts.some((a) => a.id === focusAlertId);
    setTab(inCritical ? 'criticos' : 'ativos');
    setHighlightId(focusAlertId);
    const t = window.setTimeout(() => {
      const el = document.getElementById(`rda-proactive-alert-${focusAlertId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [isOpen, focusAlertId, data]);

  const filteredActive = useMemo(() => {
    if (!data) return [];
    return data.activeAlerts.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      if (severity !== 'all' && a.severity !== severity) return false;
      return true;
    });
  }, [data, category, severity]);

  const filteredCritical = useMemo(() => {
    if (!data) return [];
    return data.criticalAlerts.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      return true;
    });
  }, [data, category]);

  const filteredHistory = useMemo(() => {
    if (!data) return [];
    return data.history.filter((a) => {
      if (category !== 'all' && a.category !== category) return false;
      if (severity !== 'all' && a.severity !== severity) return false;
      return true;
    });
  }, [data, category, severity]);

  const filteredRecommendations = useMemo(() => {
    if (!data) return [];
    return data.recommendations.filter((r) => {
      if (category !== 'all' && r.category !== category) return false;
      if (severity !== 'all' && r.severity !== severity) return false;
      return true;
    });
  }, [data, category, severity]);

  const categoryBreakdown = useMemo(() => {
    if (!data?.summary.byCategory) return [];
    return Object.entries(data.summary.byCategory)
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [data]);

  async function act(alertId: string, status: RdaProactiveAlert['status']) {
    setBusyId(alertId);
    setMsg(null);
    setError(null);
    try {
      await transitionRdaProactiveAlert(alertId, status);
      setMsg(
        status === 'acknowledged'
          ? 'Alerta reconhecido.'
          : status === 'resolved'
            ? 'Alerta resolvido.'
            : status === 'dismissed'
              ? 'Alerta descartado.'
              : 'Alerta atualizado.'
      );
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar alerta.');
    } finally {
      setBusyId(null);
    }
  }

  const tabs: Array<{ id: TabId; label: string; count?: number; icon: React.ReactNode }> = [
    {
      id: 'ativos',
      label: 'Ativos',
      count: data?.summary.active,
      icon: <Bell className="h-3.5 w-3.5" />,
    },
    {
      id: 'criticos',
      label: 'Críticos',
      count: data?.summary.critical,
      icon: <ShieldAlert className="h-3.5 w-3.5" />,
    },
    {
      id: 'recomendacoes',
      label: 'Recomendações',
      count: data?.recommendations.length,
      icon: <Lightbulb className="h-3.5 w-3.5" />,
    },
    {
      id: 'historico',
      label: 'Histórico',
      count: data?.history.length,
      icon: <History className="h-3.5 w-3.5" />,
    },
    {
      id: 'config',
      label: 'Config',
      icon: <Settings2 className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <RdaSettingsChildShell
      isOpen={isOpen}
      onClose={onClose}
      desktopShell={desktopShell}
      ajustesHubChrome={ajustesHubChrome}
      ariaLabel="Monitoramento Proativo"
    >
      <header
        className={`shrink-0 border-b border-zinc-200/90 bg-white/95 px-4 py-3 backdrop-blur-xl dark:border-zinc-800 dark:bg-zinc-900/95 ${
          pcChrome ? 'ajustes-pc-rda-header' : ''
        }`}
      >
        <div
          className={`mx-auto flex w-full max-w-[100rem] items-center gap-3 px-1 sm:px-2 ${
            pcChrome ? 'ajustes-pc-rda-inner ajustes-pc-rda-proactive-inner' : ''
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <AjustesPcOpsEyebrow desktop={pcChrome}>Ajustes · RDA · Proativo</AjustesPcOpsEyebrow>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[17px] font-semibold tracking-tight">Monitoramento Proativo</h1>
              {data ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    data.config.enabled
                      ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                      : 'bg-zinc-500/10 text-zinc-500'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      data.config.enabled
                        ? 'animate-pulse bg-emerald-500'
                        : 'bg-zinc-400'
                    }`}
                  />
                  {data.config.enabled ? 'Monitor ligado' : 'Monitor pausado'}
                </span>
              ) : null}
            </div>
            <p className="text-[12px] text-zinc-500">
              Alertas com evidência — o RDA observa; a operação só muda com você
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div
        className={`mx-auto w-full max-w-[100rem] min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 lg:px-8 ${
          pcChrome ? 'ajustes-pc-rda-scroll ajustes-pc-rda-inner ajustes-pc-rda-proactive-inner' : ''
        }`}
      >
        {error ? (
          <p className="mb-3 rounded-xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-[13px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </p>
        ) : null}
        {msg ? (
          <p className="mb-3 rounded-xl border border-emerald-300/70 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
            {msg}
          </p>
        ) : null}

        {loading && !data ? (
          <div className="space-y-3" aria-busy="true">
            <div className="h-24 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
            <div className="grid grid-cols-3 gap-2">
              <div className="h-20 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
              <div className="h-20 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
              <div className="h-20 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
            </div>
            <div className="h-40 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-white/5" />
            <p className="text-center text-[12px] text-zinc-500">Carregando monitoramento…</p>
          </div>
        ) : data ? (
          <div className="space-y-5">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.4fr)_minmax(18rem,0.85fr)] xl:items-stretch">
              <section className="relative overflow-hidden rounded-2xl border border-zinc-200/80 bg-gradient-to-br from-zinc-900 via-zinc-900 to-zinc-800 p-4 text-white shadow-sm sm:p-5 dark:border-white/10 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-900">
                <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-emerald-400/15 blur-2xl" />
                <div className="pointer-events-none absolute -bottom-12 left-1/3 h-36 w-36 rounded-full bg-sky-400/10 blur-2xl" />
                <div className="relative flex h-full flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-400">
                      <Radar className="h-3.5 w-3.5 text-emerald-400" />
                      Radar operacional
                    </div>
                    <p className="max-w-3xl text-[13px] leading-relaxed text-zinc-300 sm:text-[14px]">
                      {data.disclaimer}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1">
                        <Clock3 className="h-3 w-3" />
                        Ciclo {data.config.intervalMinutes} min
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1">
                        <Activity className="h-3 w-3" />
                        Reabre após {data.config.reopenAfterHours}h
                      </span>
                      {data.config.notifyOnCreate ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1">
                          <Sparkles className="h-3 w-3" />
                          Notifica novos
                        </span>
                      ) : null}
                    </div>
                  </div>
                  {data.canConfigure ? (
                    <button
                      type="button"
                      disabled={busyId === 'run-scan'}
                      onClick={() => {
                        setBusyId('run-scan');
                        setMsg(null);
                        void runRdaProactiveScan()
                          .then((r) => {
                            setMsg(
                              r.skipped
                                ? `Varredura ignorada (${r.skipReason || 'skip'}).`
                                : `Varredura: ${r.alertsCreated} novo(s), ${r.alertsUpdated || 0} atualizado(s).`
                            );
                            return load();
                          })
                          .catch((e: unknown) => {
                            setError(e instanceof Error ? e.message : 'Falha na varredura.');
                          })
                          .finally(() => setBusyId(null));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[12px] font-semibold text-zinc-900 transition hover:bg-zinc-100 disabled:opacity-60"
                    >
                      {busyId === 'run-scan' ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Radar className="h-3.5 w-3.5" />
                      )}
                      Varrer agora
                    </button>
                  ) : null}
                </div>
              </section>

              <section className="grid grid-cols-3 gap-2 xl:grid-cols-1 xl:gap-2.5">
                <MetricCard
                  label="Ativos"
                  value={data.summary.active}
                  accent="text-zinc-900 dark:text-white"
                  hint="exigem atenção"
                />
                <MetricCard
                  label="Críticos"
                  value={data.summary.critical}
                  accent="text-rose-600 dark:text-rose-400"
                  hint="prioridade máxima"
                  pulse={data.summary.critical > 0}
                />
                <MetricCard
                  label="Reconhecidos"
                  value={data.summary.acknowledged}
                  accent="text-amber-700 dark:text-amber-300"
                  hint="em acompanhamento"
                />
              </section>
            </div>

            {categoryBreakdown.length > 0 ? (
              <section className="flex flex-wrap gap-2">
                {categoryBreakdown.map(([key, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setCategory(key);
                      setTab('ativos');
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                      category === key
                        ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                        : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300'
                    }`}
                  >
                    {CATEGORY_LABEL[key as RdaProactiveAlert['category']] || key}
                    <span className="tabular-nums opacity-80">{count}</span>
                  </button>
                ))}
                {category !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => setCategory('all')}
                    className="rounded-full border border-dashed border-zinc-300 px-2.5 py-1 text-[11px] text-zinc-500 dark:border-zinc-600"
                  >
                    Limpar filtro
                  </button>
                ) : null}
              </section>
            ) : null}

            <div
              className="flex gap-1 overflow-x-auto rounded-2xl border border-zinc-200/80 bg-zinc-50/80 p-1 dark:border-white/10 dark:bg-white/[0.03]"
              role="tablist"
              aria-label="Seções do monitoramento"
            >
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-[12px] font-semibold transition ${
                    tab === t.id
                      ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  {t.icon}
                  {t.label}
                  {typeof t.count === 'number' ? (
                    <span
                      className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${
                        tab === t.id
                          ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100'
                          : 'bg-zinc-200/70 text-zinc-500 dark:bg-white/10'
                      }`}
                    >
                      {t.count}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>

            {tab !== 'config' ? (
              <div className="flex flex-wrap items-center gap-2">
                <FilterSelect
                  label="Categoria"
                  value={category}
                  onChange={setCategory}
                  options={[
                    { value: 'all', label: 'Todas' },
                    { value: 'patio', label: 'Pátio' },
                    { value: 'laboratorio', label: 'Laboratório' },
                    { value: 'estoque', label: 'Estoque' },
                    { value: 'produtividade', label: 'Produtividade' },
                  ]}
                />
                {tab !== 'criticos' ? (
                  <FilterSelect
                    label="Severidade"
                    value={severity}
                    onChange={setSeverity}
                    options={[
                      { value: 'all', label: 'Todas' },
                      { value: 'critical', label: 'Crítico' },
                      { value: 'warning', label: 'Atenção' },
                      { value: 'info', label: 'Informativo' },
                    ]}
                  />
                ) : null}
              </div>
            ) : null}

            {tab === 'ativos' ? (
              <AlertList
                items={filteredActive}
                busyId={busyId}
                highlightId={highlightId}
                nowMs={nowMs}
                onAcknowledge={(id) => void act(id, 'acknowledged')}
                onResolve={(id) => void act(id, 'resolved')}
                onDismiss={(id) => void act(id, 'dismissed')}
                empty="Nenhum alerta ativo no momento — o radar está limpo."
              />
            ) : null}

            {tab === 'criticos' ? (
              <AlertList
                items={filteredCritical}
                busyId={busyId}
                highlightId={highlightId}
                nowMs={nowMs}
                onAcknowledge={(id) => void act(id, 'acknowledged')}
                onResolve={(id) => void act(id, 'resolved')}
                onDismiss={(id) => void act(id, 'dismissed')}
                empty="Nenhuma situação crítica ativa."
              />
            ) : null}

            {tab === 'recomendacoes' ? (
              <section className="space-y-3">
                {filteredRecommendations.length === 0 ? (
                  <EmptyState text="Sem recomendações no momento." />
                ) : (
                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
                  {filteredRecommendations.map((r) => {
                    const tone = severityTone(r.severity);
                    return (
                      <article
                        key={r.alertId}
                        className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white dark:border-white/10 dark:bg-zinc-950"
                      >
                        <div className={`h-1 w-full ${tone.rail}`} />
                        <div className="p-3.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                              <SeverityIcon severity={r.severity} />
                              {SEVERITY_LABEL[r.severity]}
                            </span>
                            <span className="text-[11px] text-zinc-500">
                              {CATEGORY_LABEL[r.category]}
                            </span>
                          </div>
                          <h3 className="mt-2 text-[14px] font-semibold tracking-tight">{r.title}</h3>
                          <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                            {r.recommendation}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                  </div>
                )}
              </section>
            ) : null}

            {tab === 'historico' ? (
              <AlertList
                items={filteredHistory}
                busyId={busyId}
                nowMs={nowMs}
                empty="Sem histórico recente."
                readOnly
              />
            ) : null}

            {tab === 'config' ? (
              <ConfigSection
                data={data}
                busyId={busyId}
                setBusyId={setBusyId}
                setMsg={setMsg}
                setError={setError}
                onReload={load}
              />
            ) : null}

            {data.knowledgeHints?.length ? (
              <section className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
                <h2 className="mb-1 flex items-center gap-2 text-[14px] font-semibold">
                  <Sparkles className="h-4 w-4 text-zinc-400" />
                  Memória aprovada
                </h2>
                <p className="mb-3 text-[12px] text-zinc-500">Referência humana — não altera operação sozinha.</p>
                <ul className="space-y-3">
                  {data.knowledgeHints.map((k) => (
                    <li key={k.knowledgeKey} className="border-t border-zinc-100 pt-3 first:border-0 first:pt-0 dark:border-white/5">
                      <p className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">{k.title}</p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-500">{k.excerpt}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data.proposedKnowledgeDrafts?.length ? (
              <section className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/70 p-4 dark:border-zinc-700 dark:bg-white/[0.03]">
                <h2 className="mb-1 text-[14px] font-semibold">Propor à Memória</h2>
                <p className="mb-3 text-[12px] text-zinc-500">
                  Padrões recorrentes — exigem aprovação humana. Nada é gravado automaticamente.
                </p>
                <ul className="space-y-3">
                  {data.proposedKnowledgeDrafts.map((d) => (
                    <li
                      key={d.knowledgeKeyHint}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-950"
                    >
                      <div className="min-w-0 flex-1 text-[12px]">
                        <p className="font-semibold text-[13px]">{d.title}</p>
                        <p className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
                          {d.content}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyId === d.knowledgeKeyHint}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
                        onClick={() => {
                          setBusyId(d.knowledgeKeyHint);
                          setMsg(null);
                          void proposeRdaKnowledge({
                            title: d.title,
                            content: d.content,
                            category: d.category,
                            knowledgeKey: d.knowledgeKeyHint,
                            changeReason: 'Padrão proativo — aguarda aprovação',
                            submitForApproval: true,
                          })
                            .then(() => setMsg(`Proposta enviada: “${d.title}”.`))
                            .catch((e: unknown) => {
                              setError(e instanceof Error ? e.message : 'Falha ao propor.');
                            })
                            .finally(() => setBusyId(null));
                        }}
                      >
                        {busyId === d.knowledgeKeyHint ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : null}
                        {busyId === d.knowledgeKeyHint ? 'Enviando…' : 'Propor'}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </RdaSettingsChildShell>
  );
};

function MetricCard(props: {
  label: string;
  value: number;
  accent: string;
  hint: string;
  pulse?: boolean;
}) {
  return (
    <div className="relative flex h-full min-h-[4.5rem] flex-col justify-center overflow-hidden rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-3 xl:min-h-[5.25rem] xl:px-4 dark:border-white/10 dark:bg-white/[0.04]">
      {props.pulse ? (
        <span className="absolute right-2.5 top-2.5 h-2 w-2 animate-pulse rounded-full bg-rose-500" />
      ) : null}
      <p className="text-[11px] font-medium text-zinc-500">{props.label}</p>
      <p className={`mt-0.5 text-[22px] font-semibold tabular-nums tracking-tight xl:text-[26px] ${props.accent}`}>
        {props.value}
      </p>
      <p className="mt-0.5 text-[10px] text-zinc-400">{props.hint}</p>
    </div>
  );
}

function FilterSelect(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-[11px] font-medium text-zinc-500">
      {props.label}
      <select
        className="rounded-xl border border-zinc-200 bg-white px-2.5 py-1.5 text-[12px] text-zinc-800 outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-100"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-10 text-center dark:border-zinc-700 dark:bg-white/[0.02]">
      <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-500/80" />
      <p className="text-[13px] text-zinc-500">{text}</p>
    </div>
  );
}

function AlertList(props: {
  items: RdaProactiveAlert[];
  busyId: string | null;
  empty: string;
  readOnly?: boolean;
  highlightId?: string | null;
  nowMs: number;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
  onDismiss?: (id: string) => void;
}) {
  if (props.items.length === 0) {
    return <EmptyState text={props.empty} />;
  }
  return (
    <ul className="grid grid-cols-1 gap-3 xl:grid-cols-2 2xl:grid-cols-3">
      {props.items.map((a) => {
        const tone = severityTone(a.severity);
        const highlighted = props.highlightId === a.id;
        return (
          <li key={a.id} id={`rda-proactive-alert-${a.id}`}>
            <article
              className={`relative overflow-hidden rounded-2xl border bg-white transition dark:bg-zinc-950 ${
                highlighted
                  ? 'border-sky-400/60 ring-2 ring-sky-400/30'
                  : 'border-zinc-200/80 dark:border-white/10'
              }`}
            >
              <div className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />
              <div className={`bg-gradient-to-r ${tone.soft} p-3.5 pl-4`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone.chip}`}>
                        <span className={tone.icon}>
                          <SeverityIcon severity={a.severity} />
                        </span>
                        {SEVERITY_LABEL[a.severity]}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        {CATEGORY_LABEL[a.category]}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-white/10">
                        {STATUS_LABEL[a.status]}
                      </span>
                    </div>
                    <h3 className="text-[14px] font-semibold tracking-tight text-zinc-900 dark:text-white">
                      {a.title}
                    </h3>
                  </div>
                  <div className="text-right text-[11px] text-zinc-400">
                    <p>{relativeWhen(a.lastSeenAt || a.updatedAt, props.nowMs)}</p>
                    <p className="mt-0.5 tabular-nums">{formatWhen(a.lastSeenAt || a.updatedAt)}</p>
                  </div>
                </div>

                <p className="mt-2 text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300">{a.body}</p>

                {a.evidence ? (
                  <div className="mt-3 rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Evidência</p>
                    <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                      {a.evidence}
                    </p>
                  </div>
                ) : null}

                {a.recommendation ? (
                  <div className="mt-2 flex gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2">
                    <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700/80 dark:text-emerald-300/80">
                        Recomendação
                      </p>
                      <p className="mt-0.5 text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                        {a.recommendation}
                      </p>
                    </div>
                  </div>
                ) : null}

                {!props.readOnly && a.status === 'active' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      primary
                      disabled={props.busyId === a.id}
                      onClick={() => props.onAcknowledge?.(a.id)}
                      label="Reconhecer"
                    />
                    <ActionButton
                      disabled={props.busyId === a.id}
                      onClick={() => props.onResolve?.(a.id)}
                      label="Resolver"
                    />
                    <ActionButton
                      quiet
                      disabled={props.busyId === a.id}
                      onClick={() => props.onDismiss?.(a.id)}
                      label="Descartar"
                    />
                  </div>
                ) : null}

                {!props.readOnly && a.status === 'acknowledged' ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <ActionButton
                      primary
                      disabled={props.busyId === a.id}
                      onClick={() => props.onResolve?.(a.id)}
                      label="Resolver"
                    />
                    <ActionButton
                      quiet
                      disabled={props.busyId === a.id}
                      onClick={() => props.onDismiss?.(a.id)}
                      label="Descartar"
                    />
                  </div>
                ) : null}
              </div>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function ActionButton(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  quiet?: boolean;
}) {
  const base =
    'rounded-xl px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50';
  if (props.primary) {
    return (
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onClick}
        className={`${base} bg-zinc-900 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100`}
      >
        {props.label}
      </button>
    );
  }
  if (props.quiet) {
    return (
      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onClick}
        className={`${base} text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/5`}
      >
        {props.label}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={props.onClick}
      className={`${base} border border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-50 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-100`}
    >
      {props.label}
    </button>
  );
}

function ConfigSection(props: {
  data: RdaProactiveDashboard;
  busyId: string | null;
  setBusyId: (v: string | null) => void;
  setMsg: (v: string | null) => void;
  setError: (v: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const [enabled, setEnabled] = useState(props.data.config.enabled);
  const [intervalMinutes, setIntervalMinutes] = useState(props.data.config.intervalMinutes);
  const [reopenAfterHours, setReopenAfterHours] = useState(props.data.config.reopenAfterHours);
  const [notifyOnCreate, setNotifyOnCreate] = useState(props.data.config.notifyOnCreate);

  useEffect(() => {
    setEnabled(props.data.config.enabled);
    setIntervalMinutes(props.data.config.intervalMinutes);
    setReopenAfterHours(props.data.config.reopenAfterHours);
    setNotifyOnCreate(props.data.config.notifyOnCreate);
  }, [props.data.config]);

  if (!props.data.canConfigure) {
    return (
      <div className="rounded-2xl border border-zinc-200/80 bg-white p-4 text-[13px] dark:border-white/10 dark:bg-zinc-950">
        <p className="text-zinc-500">
          Configuração disponível apenas para gestão.
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
          <div>
            <dt className="text-zinc-400">Estado</dt>
            <dd className="font-semibold">
              {props.data.config.enabled ? 'Monitor ligado' : 'Monitor desligado'}
            </dd>
          </div>
          <div>
            <dt className="text-zinc-400">Intervalo</dt>
            <dd className="font-semibold tabular-nums">{props.data.config.intervalMinutes} min</dd>
          </div>
        </dl>
      </div>
    );
  }

  return (
    <section className="space-y-4 rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-white/10 dark:bg-zinc-950">
      <div>
        <h2 className="text-[14px] font-semibold">Configurações do radar</h2>
        <p className="mt-0.5 text-[12px] text-zinc-500">
          Ajuste o ciclo de observação sem liberar ações automáticas na oficina.
        </p>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200/80 px-3 py-3 dark:border-white/10">
        <span>
          <span className="block text-[13px] font-medium">Monitoramento habilitado</span>
          <span className="text-[11px] text-zinc-500">Liga ou pausa o ciclo de varredura</span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-zinc-900"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[12px] text-zinc-500">
          Intervalo (minutos)
          <input
            type="number"
            min={5}
            max={1440}
            className="mt-1 block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-900 outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            value={intervalMinutes}
            onChange={(e) => setIntervalMinutes(Number(e.target.value) || 30)}
          />
        </label>
        <label className="block text-[12px] text-zinc-500">
          Reabrir após (horas)
          <input
            type="number"
            min={1}
            max={168}
            className="mt-1 block w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] text-zinc-900 outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            value={reopenAfterHours}
            onChange={(e) => setReopenAfterHours(Number(e.target.value) || 24)}
          />
        </label>
      </div>

      <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-zinc-200/80 px-3 py-3 dark:border-white/10">
        <span>
          <span className="block text-[13px] font-medium">Notificar ao criar alerta novo</span>
          <span className="text-[11px] text-zinc-500">Avisa a gestão quando surgir situação nova</span>
        </span>
        <input
          type="checkbox"
          className="h-4 w-4 accent-zinc-900"
          checked={notifyOnCreate}
          onChange={(e) => setNotifyOnCreate(e.target.checked)}
        />
      </label>

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          disabled={props.busyId === 'save-config'}
          className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3.5 py-2 text-[12px] font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-zinc-900"
          onClick={() => {
            props.setBusyId('save-config');
            props.setMsg(null);
            void saveRdaProactiveConfig({
              enabled,
              intervalMinutes,
              reopenAfterHours,
              notifyOnCreate,
            })
              .then(() => {
                props.setMsg('Configuração salva.');
                return props.onReload();
              })
              .catch((e: unknown) => {
                props.setError(e instanceof Error ? e.message : 'Falha ao salvar.');
              })
              .finally(() => props.setBusyId(null));
          }}
        >
          {props.busyId === 'save-config' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Salvar
        </button>
        <button
          type="button"
          disabled={props.busyId === 'run-scan'}
          className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 px-3.5 py-2 text-[12px] font-semibold dark:border-white/10"
          onClick={() => {
            props.setBusyId('run-scan');
            props.setMsg(null);
            void runRdaProactiveScan()
              .then((r) => {
                props.setMsg(
                  r.skipped
                    ? `Varredura ignorada (${r.skipReason || 'skip'}).`
                    : `Varredura: ${r.alertsCreated} novo(s), ${r.alertsUpdated || 0} atualizado(s).`
                );
                return props.onReload();
              })
              .catch((e: unknown) => {
                props.setError(e instanceof Error ? e.message : 'Falha na varredura.');
              })
              .finally(() => props.setBusyId(null));
          }}
        >
          {props.busyId === 'run-scan' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Radar className="h-3.5 w-3.5" />
          )}
          Executar varredura agora
        </button>
      </div>
    </section>
  );
}
