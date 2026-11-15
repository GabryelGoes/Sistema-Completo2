import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  ChevronDown,
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
/** Como a lista é organizada — sempre visível na UI. */
type OrganizeBy = 'priority' | 'module' | 'recent';

const CATEGORY_LABEL: Record<RdaProactiveAlert['category'], string> = {
  patio: 'Pátio',
  laboratorio: 'Laboratório',
  estoque: 'Estoque',
  produtividade: 'Produtividade',
};

/** Ícones dos módulos (mesmos PNGs da home) — leitura rápida por área. */
const CATEGORY_ICON: Record<RdaProactiveAlert['category'], string> = {
  patio: '/icons/patio-ios.png',
  laboratorio: '/icons/laboratorio-ios.png',
  estoque: '/icons/estoque-ios.png',
  produtividade: '/icons/checklist-patio-ios.png',
};

const SEVERITY_LABEL: Record<RdaProactiveAlert['severity'], string> = {
  info: 'Informativo',
  warning: 'Atenção',
  critical: 'Crítico',
};

const CATEGORY_ORDER: RdaProactiveAlert['category'][] = [
  'patio',
  'laboratorio',
  'estoque',
  'produtividade',
];

const SEVERITY_ORDER: RdaProactiveAlert['severity'][] = ['critical', 'warning', 'info'];

const ORGANIZE_HINT: Record<OrganizeBy, string> = {
  priority: 'Prioridade: Crítico → Atenção → Info · dentro de cada grupo, mais recentes primeiro',
  module: 'Módulo: Pátio → Lab → Estoque → Produtividade · dentro, prioridade e depois tempo',
  recent: 'Tempo: mais recentes primeiro · a cor do card mostra a prioridade',
};

type AlertSection = {
  key: string;
  title: string;
  count: number;
  kind: 'severity' | 'module' | 'flat';
  severity?: RdaProactiveAlert['severity'];
  category?: RdaProactiveAlert['category'];
  items: RdaProactiveAlert[];
};

function alertTimeMs(a: Pick<RdaProactiveAlert, 'lastSeenAt' | 'updatedAt' | 'createdAt'>): number {
  const raw = a.lastSeenAt || a.updatedAt || a.createdAt;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortByRecent<T extends Pick<RdaProactiveAlert, 'lastSeenAt' | 'updatedAt' | 'createdAt'>>(
  items: T[]
): T[] {
  return [...items].sort((a, b) => alertTimeMs(b) - alertTimeMs(a));
}

function sortBySeverityThenRecent(items: RdaProactiveAlert[]): RdaProactiveAlert[] {
  return [...items].sort((a, b) => {
    const bySev =
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (bySev !== 0) return bySev;
    return alertTimeMs(b) - alertTimeMs(a);
  });
}

function groupAlerts(items: RdaProactiveAlert[], organizeBy: OrganizeBy): AlertSection[] {
  if (items.length === 0) return [];

  if (organizeBy === 'recent') {
    return [
      {
        key: 'recent',
        title: 'Mais recentes',
        count: items.length,
        kind: 'flat',
        items: sortByRecent(items),
      },
    ];
  }

  if (organizeBy === 'module') {
    const out: AlertSection[] = [];
    for (const cat of CATEGORY_ORDER) {
      const group = sortBySeverityThenRecent(items.filter((a) => a.category === cat));
      if (group.length === 0) continue;
      out.push({
        key: `mod-${cat}`,
        title: CATEGORY_LABEL[cat],
        count: group.length,
        kind: 'module',
        category: cat,
        items: group,
      });
    }
    return out;
  }

  // priority (padrão)
  const out: AlertSection[] = [];
  for (const sev of SEVERITY_ORDER) {
    const group = sortByRecent(items.filter((a) => a.severity === sev));
    if (group.length === 0) continue;
    out.push({
      key: `sev-${sev}`,
      title: SEVERITY_LABEL[sev],
      count: group.length,
      kind: 'severity',
      severity: sev,
      items: group,
    });
  }
  return out;
}

function CategoryModuleIcon(props: {
  category: RdaProactiveAlert['category'];
  size?: 'sm' | 'md';
}) {
  const px = props.size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  return (
    <span
      className={`inline-flex ${px} shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-zinc-100 shadow-sm ring-1 ring-black/5 dark:bg-zinc-800 dark:ring-white/10`}
      title={CATEGORY_LABEL[props.category]}
      aria-hidden
    >
      <img
        src={CATEGORY_ICON[props.category]}
        alt=""
        className="h-full w-full object-fill"
        draggable={false}
      />
    </span>
  );
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
  const [organizeBy, setOrganizeBy] = useState<OrganizeBy>('priority');
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

  const activeSections = useMemo(
    () => groupAlerts(filteredActive, organizeBy),
    [filteredActive, organizeBy]
  );
  const criticalSections = useMemo(
    // Na aba Críticos todos têm a mesma prioridade — usa tempo/módulo conforme o controle.
    () => groupAlerts(filteredCritical, organizeBy === 'priority' ? 'recent' : organizeBy),
    [filteredCritical, organizeBy]
  );
  const historySections = useMemo(
    () => groupAlerts(filteredHistory, organizeBy),
    [filteredHistory, organizeBy]
  );

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
            <h1 className="text-[17px] font-semibold tracking-tight">Monitoramento Proativo</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {data?.canConfigure ? (
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
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-[12px] font-semibold transition-colors hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
              >
                {busyId === 'run-scan' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Radar className="h-3.5 w-3.5" />
                )}
                Varrer
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800"
              aria-label="Atualizar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
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
          <div className="space-y-2" aria-busy="true">
            <div className="h-10 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-white/5" />
            <div className="h-16 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-white/5" />
            <div className="h-16 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-white/5" />
            <p className="text-center text-[12px] text-zinc-500">Carregando…</p>
          </div>
        ) : data ? (
          <div className="space-y-4">
            {categoryBreakdown.length > 0 ? (
              <section className="flex flex-wrap gap-2">
                {categoryBreakdown.map(([key, count]) => {
                  const cat = key as RdaProactiveAlert['category'];
                  const active = category === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setCategory(key);
                        setTab('ativos');
                      }}
                      className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-2.5 text-[11px] font-medium transition ${
                        active
                          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-zinc-900'
                          : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-300'
                      }`}
                    >
                      <CategoryModuleIcon category={cat} size="sm" />
                      {CATEGORY_LABEL[cat] || key}
                      <span className="tabular-nums opacity-80">{count}</span>
                    </button>
                  );
                })}
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
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div
                  className="inline-flex w-fit gap-0.5 rounded-xl border border-zinc-200/80 bg-zinc-50 p-0.5 dark:border-white/10 dark:bg-white/[0.03]"
                  role="group"
                  aria-label="Organizar lista"
                >
                  {(
                    [
                      ['priority', 'Prioridade'],
                      ['module', 'Módulo'],
                      ['recent', 'Recentes'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setOrganizeBy(id)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition ${
                        organizeBy === id
                          ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                          : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
              </div>
            ) : null}

            {tab !== 'config' ? (
              <p className="text-[11px] leading-snug text-zinc-500">{ORGANIZE_HINT[organizeBy]}</p>
            ) : null}

            {tab === 'ativos' ? (
              <AlertList
                sections={activeSections}
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
                sections={criticalSections}
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
              <RecommendationList
                items={filteredRecommendations}
                organizeBy={organizeBy}
                empty="Sem recomendações no momento."
              />
            ) : null}

            {tab === 'historico' ? (
              <AlertList
                sections={historySections}
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

function SectionHeader(props: { section: AlertSection }) {
  const { section } = props;
  if (section.kind === 'severity' && section.severity) {
    const tone = severityTone(section.severity);
    return (
      <div className="mb-2 flex items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold ${tone.chip}`}>
          <span className={tone.icon}>
            <SeverityIcon severity={section.severity} />
          </span>
          {section.title}
        </span>
        <span className="text-[11px] tabular-nums text-zinc-400">{section.count}</span>
        <div className="h-px flex-1 bg-zinc-200/80 dark:bg-white/10" />
      </div>
    );
  }
  if (section.kind === 'module' && section.category) {
    return (
      <div className="mb-2 flex items-center gap-2">
        <CategoryModuleIcon category={section.category} size="sm" />
        <span className="text-[12px] font-semibold text-zinc-800 dark:text-zinc-100">{section.title}</span>
        <span className="text-[11px] tabular-nums text-zinc-400">{section.count}</span>
        <div className="h-px flex-1 bg-zinc-200/80 dark:bg-white/10" />
      </div>
    );
  }
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-200">{section.title}</span>
      <span className="text-[11px] tabular-nums text-zinc-400">{section.count}</span>
      <div className="h-px flex-1 bg-zinc-200/80 dark:bg-white/10" />
    </div>
  );
}

function AlertCard(props: {
  alert: RdaProactiveAlert;
  busyId: string | null;
  readOnly?: boolean;
  highlightId?: string | null;
  nowMs: number;
  expanded: boolean;
  onToggle: () => void;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
  onDismiss?: (id: string) => void;
}) {
  const a = props.alert;
  const tone = severityTone(a.severity);
  const highlighted = props.highlightId === a.id;
  const when = relativeWhen(a.lastSeenAt || a.updatedAt, props.nowMs);
  return (
    <article
      id={`rda-proactive-alert-${a.id}`}
      className={`relative overflow-hidden rounded-xl border bg-white transition dark:bg-zinc-950 ${
        highlighted
          ? 'border-sky-400/60 ring-2 ring-sky-400/30'
          : 'border-zinc-200/80 dark:border-white/10'
      }`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />
      <div className={`bg-gradient-to-r ${tone.soft} pl-3.5`}>
        <button
          type="button"
          onClick={props.onToggle}
          className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left"
        >
          <CategoryModuleIcon category={a.category} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tone.chip}`}>
                <span className={tone.icon}>
                  <SeverityIcon severity={a.severity} />
                </span>
                {SEVERITY_LABEL[a.severity]}
              </span>
              <span className="truncate text-[11px] font-medium text-zinc-500">
                {CATEGORY_LABEL[a.category]}
                {when ? ` · ${when}` : ''}
                {a.status === 'acknowledged' ? ' · reconhecido' : ''}
              </span>
            </div>
            <p className="mt-1 truncate text-[13px] font-semibold leading-snug text-zinc-900 dark:text-white">
              {a.title}
            </p>
          </div>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform ${
              props.expanded ? 'rotate-180' : ''
            }`}
          />
        </button>

        {props.expanded ? (
          <div className="space-y-2 border-t border-zinc-200/70 px-3 pb-3 pt-2 dark:border-white/10">
            {a.body ? (
              <p className="text-[12px] leading-snug text-zinc-600 dark:text-zinc-300">{a.body}</p>
            ) : null}
            {a.recommendation ? (
              <p className="text-[12px] leading-snug text-zinc-700 dark:text-zinc-200">
                <span className="font-semibold text-emerald-700 dark:text-emerald-300">Ação: </span>
                {a.recommendation}
              </p>
            ) : null}
            {a.evidence ? (
              <p className="text-[11px] leading-snug text-zinc-500">
                <span className="font-medium">Evidência: </span>
                {a.evidence}
              </p>
            ) : null}

            {!props.readOnly && a.status === 'active' ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
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
              <div className="flex flex-wrap gap-1.5 pt-1">
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
        ) : !props.readOnly && (a.status === 'active' || a.status === 'acknowledged') ? (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
            {a.status === 'active' ? (
              <ActionButton
                primary
                disabled={props.busyId === a.id}
                onClick={() => props.onAcknowledge?.(a.id)}
                label="Reconhecer"
              />
            ) : null}
            <ActionButton
              disabled={props.busyId === a.id}
              onClick={() => props.onResolve?.(a.id)}
              label="Resolver"
            />
          </div>
        ) : null}
      </div>
    </article>
  );
}

function AlertList(props: {
  sections: AlertSection[];
  busyId: string | null;
  empty: string;
  readOnly?: boolean;
  highlightId?: string | null;
  nowMs: number;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
  onDismiss?: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(props.highlightId || null);

  useEffect(() => {
    if (props.highlightId) setExpandedId(props.highlightId);
  }, [props.highlightId]);

  if (props.sections.length === 0) {
    return <EmptyState text={props.empty} />;
  }

  return (
    <div className="space-y-5">
      {props.sections.map((section) => (
        <section key={section.key} aria-label={section.title}>
          <SectionHeader section={section} />
          <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
            {section.items.map((a) => (
              <li key={a.id}>
                <AlertCard
                  alert={a}
                  busyId={props.busyId}
                  readOnly={props.readOnly}
                  highlightId={props.highlightId}
                  nowMs={props.nowMs}
                  expanded={expandedId === a.id}
                  onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  onAcknowledge={props.onAcknowledge}
                  onResolve={props.onResolve}
                  onDismiss={props.onDismiss}
                />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

type RecItem = RdaProactiveDashboard['recommendations'][number];

function RecommendationList(props: {
  items: RecItem[];
  organizeBy: OrganizeBy;
  empty: string;
}) {
  const sections = useMemo(() => {
    if (props.items.length === 0) return [] as Array<{
      key: string;
      title: string;
      kind: 'severity' | 'module' | 'flat';
      severity?: RdaProactiveAlert['severity'];
      category?: RdaProactiveAlert['category'];
      items: RecItem[];
    }>;

    if (props.organizeBy === 'module') {
      return CATEGORY_ORDER.map((cat) => {
        const group = props.items
          .filter((r) => r.category === cat)
          .sort(
            (a, b) =>
              SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
          );
        if (!group.length) return null;
        return {
          key: `rec-mod-${cat}`,
          title: CATEGORY_LABEL[cat],
          kind: 'module' as const,
          category: cat,
          items: group,
        };
      }).filter((s): s is NonNullable<typeof s> => s != null);
    }

    if (props.organizeBy === 'recent') {
      return [
        {
          key: 'rec-recent',
          title: 'Recomendações',
          kind: 'flat' as const,
          items: props.items,
        },
      ];
    }

    return SEVERITY_ORDER.map((sev) => {
      const group = props.items.filter((r) => r.severity === sev);
      if (!group.length) return null;
      return {
        key: `rec-sev-${sev}`,
        title: SEVERITY_LABEL[sev],
        kind: 'severity' as const,
        severity: sev,
        items: group,
      };
    }).filter((s): s is NonNullable<typeof s> => s != null);
  }, [props.items, props.organizeBy]);

  if (sections.length === 0) {
    return <EmptyState text={props.empty} />;
  }

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.key} aria-label={section.title}>
          <SectionHeader
            section={{
              key: section.key,
              title: section.title,
              count: section.items.length,
              kind: section.kind,
              severity: section.severity,
              category: section.category,
              items: [],
            }}
          />
          <ul className="grid grid-cols-1 gap-2 xl:grid-cols-2 2xl:grid-cols-3">
            {section.items.map((r) => {
              const tone = severityTone(r.severity);
              return (
                <li key={r.alertId}>
                  <article className="relative overflow-hidden rounded-xl border border-zinc-200/80 bg-white dark:border-white/10 dark:bg-zinc-950">
                    <div className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />
                    <div className={`flex items-start gap-2.5 bg-gradient-to-r ${tone.soft} px-3 py-2.5 pl-3.5`}>
                      <CategoryModuleIcon category={r.category} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tone.chip}`}>
                            <span className={tone.icon}>
                              <SeverityIcon severity={r.severity} />
                            </span>
                            {SEVERITY_LABEL[r.severity]}
                          </span>
                          <span className="truncate text-[11px] font-medium text-zinc-500">
                            {CATEGORY_LABEL[r.category]}
                          </span>
                        </div>
                        <p className="mt-1 truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                          {r.title}
                        </p>
                        {r.recommendation ? (
                          <p className="mt-0.5 line-clamp-2 text-[12px] text-zinc-600 dark:text-zinc-300">
                            {r.recommendation}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
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
    'rounded-lg px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50';
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
