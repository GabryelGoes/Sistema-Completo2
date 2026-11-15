import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Info,
  Lightbulb,
  Loader2,
  Radar,
  ShieldAlert,
  Sparkles,
  X,
} from 'lucide-react';
import {
  fetchRdaProactiveSummary,
  transitionRdaProactiveAlert,
  type RdaProactiveAlert,
  type RdaProactiveSummary,
} from '../../services/apiService';
import { useBrowserBackLayer } from '../ui/BackNavigationContext';
import { useRegisterModalOpen } from '../ui/ModalLayerContext';

const CATEGORY_LABEL: Record<RdaProactiveAlert['category'], string> = {
  patio: 'Pátio',
  laboratorio: 'Laboratório',
  estoque: 'Estoque',
  produtividade: 'Produtividade',
};

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

const SEVERITY_ORDER: RdaProactiveAlert['severity'][] = ['critical', 'warning', 'info'];

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
  if (severity === 'critical') return <ShieldAlert className="h-3.5 w-3.5" />;
  if (severity === 'warning') return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Info className="h-3.5 w-3.5" />;
}

function CategoryModuleIcon({
  category,
  size = 'md',
}: {
  category: RdaProactiveAlert['category'];
  size?: 'sm' | 'md';
}) {
  const px = size === 'sm' ? 'h-7 w-7' : 'h-9 w-9';
  return (
    <span
      className={`inline-flex ${px} shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-zinc-100 shadow-sm ring-1 ring-black/5 dark:bg-zinc-800 dark:ring-white/10`}
      title={CATEGORY_LABEL[category]}
      aria-hidden
    >
      <img
        src={CATEGORY_ICON[category]}
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

function alertTimeMs(a: Pick<RdaProactiveAlert, 'lastSeenAt' | 'updatedAt' | 'createdAt'>): number {
  const raw = a.lastSeenAt || a.updatedAt || a.createdAt;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
}

function sortBySeverityThenRecent(items: RdaProactiveAlert[]): RdaProactiveAlert[] {
  return [...items].sort((a, b) => {
    const bySev = SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity);
    if (bySev !== 0) return bySev;
    return alertTimeMs(b) - alertTimeMs(a);
  });
}

type PanelTab = 'avisos' | 'recomendacoes';

export type RdaHeaderAlertsControlProps = {
  enabled: boolean;
  theme?: 'light' | 'dark';
  placement?: 'desktopTopbar' | 'headerInline';
  /** Abre o painel completo do Monitoramento Proativo. */
  onOpenFullPanel?: (focusAlertId?: string | null) => void;
  /** Poll interval ms (default 45s). */
  pollMs?: number;
  /** Força recarregar (ex.: após banner). */
  refreshToken?: number;
};

export const RdaHeaderAlertsControl: React.FC<RdaHeaderAlertsControlProps> = ({
  enabled,
  theme = 'light',
  placement = 'headerInline',
  onOpenFullPanel,
  pollMs = 45_000,
  refreshToken = 0,
}) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RdaProactiveSummary | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tab, setTab] = useState<PanelTab>('avisos');
  const [nowMs, setNowMs] = useState(() => Date.now());
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  useRegisterModalOpen(open);
  useBrowserBackLayer(open, () => setOpen(false));

  const load = useCallback(async (silent = false) => {
    if (!enabled) return;
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await fetchRdaProactiveSummary();
      setData(res);
      setNowMs(Date.now());
      setError(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar alertas.';
      // Não desmonta o botão do cabeçalho (ex.: 403/rede) — o painel mostra o erro.
      setData(null);
      if (!silent) setError(msg);
      else setError(msg);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void load(true);
    const id = window.setInterval(() => void load(true), pollMs);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, load, pollMs, refreshToken]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const id = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setExpandedId(null);
      setTab('avisos');
      return;
    }
    const place = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = Math.min(420, Math.max(320, window.innerWidth - 24));
      let left = Math.min(r.right - width, window.innerWidth - width - 12);
      left = Math.max(12, left);
      const top = Math.min(r.bottom + 8, window.innerHeight - 120);
      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 220,
        maxHeight: Math.min(560, window.innerHeight - top - 16),
      });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (ev: MouseEvent) => {
      const t = ev.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const activeSorted = useMemo(() => {
    if (!data) return [];
    return sortBySeverityThenRecent(
      data.activeAlerts.filter((a) => a.status === 'active' || a.status === 'acknowledged')
    ).slice(0, 10);
  }, [data]);

  const criticalSorted = useMemo(() => {
    if (!data) return [];
    return sortBySeverityThenRecent(data.criticalAlerts).slice(0, 6);
  }, [data]);

  if (!enabled) return null;

  const criticalCount = data?.summary.critical ?? 0;
  const activeCount = data?.summary.active ?? 0;
  const recCount = data?.recommendations.length ?? 0;
  const isDesktopTopbar = placement === 'desktopTopbar';
  const isDark = theme === 'dark';

  const act = async (alertId: string, status: RdaProactiveAlert['status']) => {
    setBusyId(alertId);
    setError(null);
    try {
      await transitionRdaProactiveAlert(alertId, status);
      await load(true);
      if (expandedId === alertId && (status === 'resolved' || status === 'dismissed')) {
        setExpandedId(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar alerta.');
    } finally {
      setBusyId(null);
    }
  };

  const btnClass = isDesktopTopbar
    ? 'desktop-shell-topbar-btn relative !w-auto min-w-8 gap-1 px-1.5'
    : `relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border-0 transition-colors active:scale-95 ${
        isDark
          ? 'bg-zinc-900/75 text-zinc-200 hover:bg-zinc-800 hover:text-sky-300'
          : 'bg-white text-zinc-600 hover:bg-zinc-100 hover:text-[#007AFF] shadow-[0_2px_10px_-3px_rgba(0,0,0,0.1)]'
      }`;

  const panel = open
    ? createPortal(
        <div
          ref={panelRef}
          style={panelStyle}
          className="flex flex-col overflow-hidden rounded-[1.35rem] border border-zinc-200/90 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95"
          role="dialog"
          aria-label="Alertas do RDA Intelligence"
        >
          {/* Atmosphere */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-sky-500/[0.07] via-transparent to-transparent dark:from-sky-400/[0.08]"
            aria-hidden
          />

          <header className="relative flex shrink-0 items-start gap-2.5 border-b border-zinc-200/80 px-3.5 pb-3 pt-3.5 dark:border-white/10">
            <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900">
              <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold tracking-tight text-zinc-900 dark:text-white">
                RDA Intelligence
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    criticalCount > 0
                      ? 'bg-rose-500/12 text-rose-700 dark:text-rose-300'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  <ShieldAlert className="h-3 w-3" />
                  {criticalCount} crítico{criticalCount === 1 ? '' : 's'}
                </span>
                <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {activeCount} ativo{activeCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:hover:bg-zinc-800"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <div
            className="relative mx-3.5 mt-2.5 flex shrink-0 gap-1 rounded-xl border border-zinc-200/80 bg-zinc-50/80 p-1 dark:border-white/10 dark:bg-white/[0.03]"
            role="tablist"
            aria-label="Seções rápidas"
          >
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'avisos'}
              onClick={() => setTab('avisos')}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                tab === 'avisos'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Radar className="h-3.5 w-3.5" />
              Avisos
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'recomendacoes'}
              onClick={() => setTab('recomendacoes')}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                tab === 'recomendacoes'
                  ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-white'
                  : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <Lightbulb className="h-3.5 w-3.5" />
              Recomendações
              {recCount > 0 ? (
                <span className="tabular-nums text-[10px] opacity-70">{recCount}</span>
              ) : null}
            </button>
          </div>

          <div className="relative min-h-0 flex-1 overflow-y-auto px-3.5 py-3 custom-scrollbar">
            {loading && !data ? (
              <div className="space-y-2" aria-busy="true">
                <div className="h-14 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-white/5" />
                <div className="h-14 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-white/5" />
                <div className="h-14 animate-pulse rounded-xl bg-zinc-200/70 dark:bg-white/5" />
              </div>
            ) : null}

            {error ? (
              <p className="mb-2 rounded-xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                {error}
              </p>
            ) : null}

            {data && tab === 'avisos' ? (
              <div className="space-y-4">
                <QuickSection
                  title="Críticos"
                  severity="critical"
                  count={criticalSorted.length}
                  empty="Nenhum alerta crítico ativo."
                >
                  {criticalSorted.map((a) => (
                    <QuickAlertCard
                      key={a.id}
                      alert={a}
                      nowMs={nowMs}
                      busyId={busyId}
                      expanded={expandedId === a.id}
                      onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      onAcknowledge={(id) => void act(id, 'acknowledged')}
                      onResolve={(id) => void act(id, 'resolved')}
                      onDismiss={(id) => void act(id, 'dismissed')}
                    />
                  ))}
                </QuickSection>

                <QuickSection
                  title="Ativos"
                  count={activeSorted.length}
                  empty="Nenhum alerta ativo."
                >
                  {activeSorted.map((a) => (
                    <QuickAlertCard
                      key={a.id}
                      alert={a}
                      nowMs={nowMs}
                      busyId={busyId}
                      expanded={expandedId === a.id}
                      onToggle={() => setExpandedId(expandedId === a.id ? null : a.id)}
                      onAcknowledge={(id) => void act(id, 'acknowledged')}
                      onResolve={(id) => void act(id, 'resolved')}
                      onDismiss={(id) => void act(id, 'dismissed')}
                    />
                  ))}
                </QuickSection>
              </div>
            ) : null}

            {data && tab === 'recomendacoes' ? (
              data.recommendations.length === 0 ? (
                <EmptyState text="Sem recomendações no momento." />
              ) : (
                <ul className="space-y-2">
                  {data.recommendations.slice(0, 8).map((r) => {
                    const tone = severityTone(r.severity);
                    return (
                      <li key={r.alertId}>
                        <button
                          type="button"
                          className="relative w-full overflow-hidden rounded-xl border border-zinc-200/80 bg-white text-left transition hover:border-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 dark:border-white/10 dark:bg-zinc-950 dark:hover:border-white/20"
                          onClick={() => {
                            setTab('avisos');
                            setExpandedId(r.alertId);
                          }}
                        >
                          <div className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />
                          <div className={`bg-gradient-to-r ${tone.soft} flex items-start gap-2.5 pl-3.5 pr-3 py-2.5`}>
                            <CategoryModuleIcon category={r.category} size="sm" />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tone.chip}`}
                                >
                                  <span className={tone.icon}>
                                    <SeverityIcon severity={r.severity} />
                                  </span>
                                  {SEVERITY_LABEL[r.severity]}
                                </span>
                                <span className="text-[11px] font-medium text-zinc-500">
                                  {CATEGORY_LABEL[r.category]}
                                </span>
                              </div>
                              <p className="mt-1 text-[13px] font-semibold leading-snug text-zinc-900 dark:text-white">
                                {r.title}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-zinc-600 dark:text-zinc-400">
                                {r.recommendation}
                              </p>
                            </div>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </div>

          <footer className="relative shrink-0 border-t border-zinc-200/80 px-3.5 py-2.5 dark:border-white/10">
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 px-3 py-2.5 text-[13px] font-semibold text-white transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 dark:bg-white dark:text-zinc-900"
              onClick={() => {
                setOpen(false);
                onOpenFullPanel?.(expandedId);
              }}
            >
              <Radar className="h-4 w-4" />
              Abrir monitoramento completo
            </button>
          </footer>
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        className={btnClass}
        aria-label={
          criticalCount > 0
            ? `RDA Intelligence, ${criticalCount} alerta${criticalCount === 1 ? '' : 's'} crítico${criticalCount === 1 ? '' : 's'}`
            : 'RDA Intelligence'
        }
        title="Central de avisos · RDA Intelligence"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Sparkles className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2} aria-hidden />
        {isDesktopTopbar ? (
          <span className="hidden text-[11px] font-semibold tracking-wide text-current sm:inline">
            RDA
          </span>
        ) : null}
        {criticalCount > 0 ? (
          <span
            className={`absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ${
              isDesktopTopbar ? 'right-0 top-0' : ''
            }`}
            aria-hidden
          >
            {criticalCount > 99 ? '99+' : criticalCount}
          </span>
        ) : null}
      </button>
      {panel}
    </div>
  );
};

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-8 text-center dark:border-zinc-700 dark:bg-white/[0.02]">
      <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-emerald-500/80" />
      <p className="text-[12px] text-zinc-500">{text}</p>
    </div>
  );
}

function QuickSection(props: {
  title: string;
  count: number;
  empty: string;
  severity?: RdaProactiveAlert['severity'];
  children: React.ReactNode;
}) {
  const tone = props.severity ? severityTone(props.severity) : null;
  return (
    <section aria-label={props.title}>
      <div className="mb-2 flex items-center gap-2">
        {tone && props.severity ? (
          <span
            className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-bold ${tone.chip}`}
          >
            <span className={tone.icon}>
              <SeverityIcon severity={props.severity} />
            </span>
            {props.title}
          </span>
        ) : (
          <span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-200">
            {props.title}
          </span>
        )}
        <span className="text-[11px] tabular-nums text-zinc-400">{props.count}</span>
        <div className="h-px flex-1 bg-zinc-200/80 dark:bg-white/10" />
      </div>
      {props.count === 0 ? (
        <EmptyState text={props.empty} />
      ) : (
        <ul className="space-y-2">{props.children}</ul>
      )}
    </section>
  );
}

function QuickAlertCard(props: {
  alert: RdaProactiveAlert;
  nowMs: number;
  busyId: string | null;
  expanded: boolean;
  onToggle: () => void;
  onAcknowledge: (id: string) => void;
  onResolve: (id: string) => void;
  onDismiss: (id: string) => void;
}) {
  const a = props.alert;
  const tone = severityTone(a.severity);
  const when = relativeWhen(a.lastSeenAt || a.updatedAt, props.nowMs);
  const busy = props.busyId === a.id;

  return (
    <li>
      <article
        className={`relative overflow-hidden rounded-xl border border-zinc-200/80 bg-white transition dark:border-white/10 dark:bg-zinc-950 ${
          props.expanded ? 'ring-2 ring-sky-400/25' : ''
        }`}
      >
        <div className={`absolute inset-y-0 left-0 w-1 ${tone.rail}`} />
        <div className={`bg-gradient-to-r ${tone.soft} pl-3.5`}>
          <button
            type="button"
            onClick={props.onToggle}
            className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left focus-visible:outline-none"
            aria-expanded={props.expanded}
          >
            <CategoryModuleIcon category={a.category} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${tone.chip}`}
                >
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
              className={`mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform duration-200 ${
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
              {a.status === 'active' || a.status === 'acknowledged' ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {a.status === 'active' ? (
                    <ActionChip
                      primary
                      disabled={busy}
                      onClick={() => props.onAcknowledge(a.id)}
                      label="Reconhecer"
                    />
                  ) : null}
                  <ActionChip
                    disabled={busy}
                    onClick={() => props.onResolve(a.id)}
                    label={busy ? '…' : 'Resolver'}
                  />
                  <ActionChip quiet disabled={busy} onClick={() => props.onDismiss(a.id)} label="Descartar" />
                </div>
              ) : null}
            </div>
          ) : a.status === 'active' || a.status === 'acknowledged' ? (
            <div className="flex flex-wrap gap-1.5 px-3 pb-2.5">
              {a.status === 'active' ? (
                <ActionChip
                  primary
                  disabled={busy}
                  onClick={() => props.onAcknowledge(a.id)}
                  label={busy ? '…' : 'Reconhecer'}
                />
              ) : null}
              <ActionChip disabled={busy} onClick={() => props.onResolve(a.id)} label="Resolver" />
            </div>
          ) : null}
        </div>
      </article>
    </li>
  );
}

function ActionChip(props: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
  quiet?: boolean;
}) {
  const base =
    'inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold transition active:scale-[0.97] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500';
  if (props.primary) {
    return (
      <button
        type="button"
        disabled={props.disabled}
        onClick={(e) => {
          e.stopPropagation();
          props.onClick();
        }}
        className={`${base} bg-zinc-900 text-white dark:bg-white dark:text-zinc-900`}
      >
        {props.disabled ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
        {props.label}
      </button>
    );
  }
  if (props.quiet) {
    return (
      <button
        type="button"
        disabled={props.disabled}
        onClick={(e) => {
          e.stopPropagation();
          props.onClick();
        }}
        className={`${base} text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800`}
      >
        {props.label}
      </button>
    );
  }
  return (
    <button
      type="button"
      disabled={props.disabled}
      onClick={(e) => {
        e.stopPropagation();
        props.onClick();
      }}
      className={`${base} border border-zinc-200 bg-white text-zinc-700 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-200`}
    >
      {props.label}
    </button>
  );
}
