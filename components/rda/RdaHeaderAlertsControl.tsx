import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, ScanSearch, X } from 'lucide-react';
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

const SEVERITY_LABEL: Record<RdaProactiveAlert['severity'], string> = {
  info: 'Informativo',
  warning: 'Atenção',
  critical: 'Crítico',
};

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
  const [detailId, setDetailId] = useState<string | null>(null);
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
    if (!open) {
      setDetailId(null);
      return;
    }
    const place = () => {
      const btn = triggerRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const width = Math.min(380, Math.max(300, window.innerWidth - 24));
      let left = Math.min(r.right - width, window.innerWidth - width - 12);
      left = Math.max(12, left);
      const top = Math.min(r.bottom + 8, window.innerHeight - 120);
      setPanelStyle({
        position: 'fixed',
        top,
        left,
        width,
        zIndex: 220,
        maxHeight: Math.min(520, window.innerHeight - top - 16),
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

  if (!enabled) return null;

  const criticalCount = data?.summary.critical ?? 0;
  const isDesktopTopbar = placement === 'desktopTopbar';
  const isDark = theme === 'dark';

  const act = async (alertId: string, status: RdaProactiveAlert['status']) => {
    setBusyId(alertId);
    setError(null);
    try {
      await transitionRdaProactiveAlert(alertId, status);
      await load(true);
      if (detailId === alertId && (status === 'resolved' || status === 'dismissed')) {
        setDetailId(null);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar alerta.');
    } finally {
      setBusyId(null);
    }
  };

  const detail =
    detailId && data
      ? data.activeAlerts.find((a) => a.id === detailId) ||
        data.criticalAlerts.find((a) => a.id === detailId) ||
        null
      : null;

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
          className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/95 shadow-2xl shadow-black/20 backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/95"
          role="dialog"
          aria-label="Alertas do RDA Intelligence"
        >
          <div className="flex items-center gap-2 border-b border-zinc-200/80 px-3.5 py-2.5 dark:border-white/10">
            <ScanSearch className="h-4 w-4 text-zinc-600 dark:text-zinc-300" strokeWidth={2} />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">RDA Intelligence</p>
              <p className="text-[11px] text-zinc-500">
                {data
                  ? `${data.summary.critical} críticos · ${data.summary.active} ativos`
                  : 'Monitoramento proativo'}
              </p>
            </div>
            <button
              type="button"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 py-3">
            {loading && !data ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-sky-500" />
              </div>
            ) : null}
            {error ? <p className="mb-2 text-[12px] text-red-600">{error}</p> : null}

            {detail ? (
              <div className="space-y-2 text-[12px]">
                <button
                  type="button"
                  className="text-[12px] font-medium text-sky-600 dark:text-sky-400"
                  onClick={() => setDetailId(null)}
                >
                  ← Voltar
                </button>
                <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">{detail.title}</p>
                <p className="text-zinc-500">
                  {CATEGORY_LABEL[detail.category]} · {SEVERITY_LABEL[detail.severity]} · {detail.status}
                </p>
                <p className="text-zinc-700 dark:text-zinc-300">{detail.body}</p>
                {detail.evidence ? (
                  <p className="text-zinc-500">
                    <span className="font-medium">Evidência:</span> {detail.evidence}
                  </p>
                ) : null}
                {detail.recommendation ? (
                  <p className="text-zinc-700 dark:text-zinc-300">
                    <span className="font-medium">Recomendação:</span> {detail.recommendation}
                  </p>
                ) : null}
                {detail.status === 'active' || detail.status === 'acknowledged' ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {detail.status === 'active' ? (
                      <button
                        type="button"
                        disabled={busyId === detail.id}
                        className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-[12px] font-semibold dark:border-zinc-600"
                        onClick={() => void act(detail.id, 'acknowledged')}
                      >
                        Reconhecer
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busyId === detail.id}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-emerald-700 dark:text-emerald-400"
                      onClick={() => void act(detail.id, 'resolved')}
                    >
                      Resolver
                    </button>
                  </div>
                ) : null}
              </div>
            ) : data ? (
              <div className="space-y-4">
                <section>
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Críticos
                  </h3>
                  {data.criticalAlerts.length === 0 ? (
                    <p className="text-[12px] text-zinc-500">Nenhum alerta crítico ativo.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {data.criticalAlerts.map((a) => (
                        <li key={a.id}>
                          <button
                            type="button"
                            className="w-full rounded-xl border border-red-500/20 bg-red-500/5 px-2.5 py-2 text-left hover:bg-red-500/10"
                            onClick={() => setDetailId(a.id)}
                          >
                            <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                              {a.title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-zinc-500">
                              {CATEGORY_LABEL[a.category]}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Ativos
                  </h3>
                  {data.activeAlerts.filter((a) => a.status === 'active').length === 0 ? (
                    <p className="text-[12px] text-zinc-500">Nenhum alerta ativo.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {data.activeAlerts
                        .filter((a) => a.status === 'active')
                        .slice(0, 8)
                        .map((a) => (
                          <li key={a.id}>
                            <button
                              type="button"
                              className="w-full rounded-xl border border-zinc-200/80 bg-zinc-50/80 px-2.5 py-2 text-left hover:bg-zinc-100/90 dark:border-white/10 dark:bg-zinc-800/40 dark:hover:bg-zinc-800"
                              onClick={() => setDetailId(a.id)}
                            >
                              <p className="text-[13px] font-medium text-zinc-900 dark:text-white">
                                {a.title}
                              </p>
                              <p className="mt-0.5 text-[11px] text-zinc-500">
                                {CATEGORY_LABEL[a.category]} · {SEVERITY_LABEL[a.severity]}
                              </p>
                            </button>
                          </li>
                        ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Recomendações
                  </h3>
                  {data.recommendations.length === 0 ? (
                    <p className="text-[12px] text-zinc-500">Sem recomendações no momento.</p>
                  ) : (
                    <ul className="space-y-2">
                      {data.recommendations.slice(0, 5).map((r) => (
                        <li key={r.alertId} className="text-[12px]">
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => setDetailId(r.alertId)}
                          >
                            <p className="font-semibold text-zinc-900 dark:text-white">{r.title}</p>
                            <p className="mt-0.5 text-zinc-600 dark:text-zinc-400 line-clamp-2">
                              {r.recommendation}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>
            ) : null}
          </div>

          <div className="border-t border-zinc-200/80 px-3.5 py-2.5 dark:border-white/10">
            <button
              type="button"
              className="w-full rounded-xl bg-zinc-900 px-3 py-2 text-[13px] font-semibold text-white dark:bg-zinc-100 dark:text-zinc-900"
              onClick={() => {
                setOpen(false);
                onOpenFullPanel?.(detailId);
              }}
            >
              Abrir monitoramento completo
            </button>
          </div>
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
        <ScanSearch className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2} aria-hidden />
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
