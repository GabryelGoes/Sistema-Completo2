import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  fetchRdaOperationalDashboard,
  proposeRdaKnowledge,
  type RdaOperationalDashboard,
} from '../../services/apiService';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
};

function fmtMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m`;
}

function confidenceLabel(c: string): string {
  if (c === 'high') return 'alta';
  if (c === 'medium') return 'moderada';
  if (c === 'low') return 'baixa';
  return 'insuficiente';
}

export const RdaOperationalIntelligencePanel: React.FC<Props> = ({
  isOpen,
  onClose,
  desktopShell,
}) => {
  const [days, setDays] = useState(30);
  const [service, setService] = useState('');
  const [technicianUserId, setTechnicianUserId] = useState('');
  const [data, setData] = useState<RdaOperationalDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRdaOperationalDashboard({
        days,
        service: service.trim() || undefined,
        technicianUserId: technicianUserId.trim() || undefined,
      });
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar inteligência operacional.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [days, service, technicianUserId]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-[70] flex min-h-0 flex-col bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 ${
        desktopShell ? '' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Inteligência Operacional"
    >
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold tracking-tight">Inteligência Operacional</h1>
            <p className="text-[12px] text-zinc-500">
              Tempos apontados reais — diagnóstico, execução e pausas (não é tempo desde a entrada)
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 dark:border-zinc-700"
            aria-label="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-4 flex flex-wrap items-end gap-3 border-b border-zinc-200 pb-4 dark:border-zinc-800">
          <label className="text-[12px] text-zinc-500">
            Período
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="mt-1 block rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
            >
              <option value={7}>7 dias</option>
              <option value={30}>30 dias</option>
              <option value={90}>90 dias</option>
              <option value={180}>180 dias</option>
            </select>
          </label>
          <label className="min-w-[180px] flex-1 text-[12px] text-zinc-500">
            Serviço
            <input
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder="ex.: módulo ABS"
              className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <label className="min-w-[160px] text-[12px] text-zinc-500">
            Técnico (UUID opcional)
            <input
              value={technicianUserId}
              onChange={(e) => setTechnicianUserId(e.target.value)}
              placeholder="filtrar"
              className="mt-1 block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-900"
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-zinc-900"
          >
            Aplicar
          </button>
        </div>

        {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}
        {msg ? <p className="mb-3 text-[13px] text-emerald-700 dark:text-emerald-400">{msg}</p> : null}

        {loading && !data ? (
          <p className="text-[13px] text-zinc-500">Carregando…</p>
        ) : data ? (
          <div className="space-y-8">
            {data.completeness?.truncated ? (
              <p className="rounded-lg border border-amber-300/80 bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                {data.completeness.note ||
                  'Resultados incompletos — limite de consulta atingido. Refine o período.'}
              </p>
            ) : null}
            <section>
              <h2 className="mb-1 text-[14px] font-semibold">Visão geral</h2>
              <p className="mb-3 text-[12px] text-zinc-500">{data.disclaimer}</p>
              <p className="mb-3 text-[12px] text-zinc-500">{data.overview.confidenceNote}</p>
              <p className="mb-2 text-[12px] font-medium text-zinc-600 dark:text-zinc-400">
                Consolidados (finished)
              </p>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
                <div>
                  <dt className="text-zinc-500">Diagnóstico</dt>
                  <dd className="font-semibold tabular-nums">{data.formatted.diagnostic}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Execução</dt>
                  <dd className="font-semibold tabular-nums">{data.formatted.execution}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Pausas</dt>
                  <dd className="font-semibold tabular-nums">{data.formatted.paused}</dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Total apontado</dt>
                  <dd className="font-semibold tabular-nums">{data.formatted.totalPointed}</dd>
                </div>
              </dl>
              {(data.formatted.openTotalPointed || data.overview.openSessions > 0) && (
                <>
                  <p className="mb-2 mt-4 text-[12px] font-medium text-zinc-600 dark:text-zinc-400">
                    Parciais (abertas/pausadas — não entram no consolidado)
                  </p>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-3">
                    <div>
                      <dt className="text-zinc-500">Produtivo parcial</dt>
                      <dd className="tabular-nums">{data.formatted.openProductive || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Pausas parciais</dt>
                      <dd className="tabular-nums">{data.formatted.openPaused || '—'}</dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Apontado parcial</dt>
                      <dd className="tabular-nums">{data.formatted.openTotalPointed || '—'}</dd>
                    </div>
                  </dl>
                </>
              )}
              <p className="mt-2 text-[12px] text-zinc-500">
                Sessões: {data.overview.finishedSessions} finalizadas · {data.overview.openSessions}{' '}
                abertas/pausadas · {data.overview.cancelledSessions} canceladas ·{' '}
                {data.overview.servicesFinishedCount} ocorrências OS+serviço+kind
              </p>
              {data.overview.reconciliationNote ? (
                <p className="mt-1 text-[11px] text-zinc-400">{data.overview.reconciliationNote}</p>
              ) : null}
            </section>

            <section>
              <h2 className="mb-2 text-[14px] font-semibold">Serviços mais demorados (mediana)</h2>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                      <th className="py-2 pr-2 font-medium">Serviço</th>
                      <th className="py-2 pr-2 font-medium">Kind</th>
                      <th className="py-2 pr-2 font-medium">n</th>
                      <th className="py-2 pr-2 font-medium">Mediana</th>
                      <th className="py-2 pr-2 font-medium">p25–p75</th>
                      <th className="py-2 font-medium">Confiança</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.services.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-3 text-zinc-500">
                          Sem ocorrências finalizadas no filtro.
                        </td>
                      </tr>
                    ) : (
                      data.services.map((row) => (
                        <tr
                          key={`${row.timeKind}:${row.serviceKey}`}
                          className="border-b border-zinc-100 dark:border-zinc-900"
                        >
                          <td className="py-2 pr-2">{row.serviceLabel}</td>
                          <td className="py-2 pr-2 text-zinc-500">{row.timeKind || '—'}</td>
                          <td className="py-2 pr-2 tabular-nums">{row.distribution.sampleCount}</td>
                          <td className="py-2 pr-2 tabular-nums">
                            {fmtMs(row.distribution.medianMs)}
                          </td>
                          <td className="py-2 pr-2 tabular-nums">
                            {fmtMs(row.distribution.p25Ms)} – {fmtMs(row.distribution.p75Ms)}
                          </td>
                          <td className="py-2">{confidenceLabel(row.distribution.confidence)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="grid gap-8 sm:grid-cols-2">
              <div>
                <h2 className="mb-2 text-[14px] font-semibold">Diagnósticos (mediana)</h2>
                <ul className="space-y-1 text-[12px]">
                  {data.diagnostics.length === 0 ? (
                    <li className="text-zinc-500">Sem amostras finalizadas.</li>
                  ) : (
                    data.diagnostics.map((r) => (
                      <li key={`d-${r.serviceKey}`} className="flex justify-between gap-2">
                        <span className="truncate">{r.serviceLabel}</span>
                        <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                          {fmtMs(r.distribution.medianMs)} · n={r.distribution.sampleCount}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div>
                <h2 className="mb-2 text-[14px] font-semibold">Execuções (mediana)</h2>
                <ul className="space-y-1 text-[12px]">
                  {data.executions.length === 0 ? (
                    <li className="text-zinc-500">Sem amostras finalizadas.</li>
                  ) : (
                    data.executions.map((r) => (
                      <li key={`e-${r.serviceKey}`} className="flex justify-between gap-2">
                        <span className="truncate">{r.serviceLabel}</span>
                        <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-400">
                          {fmtMs(r.distribution.medianMs)} · n={r.distribution.sampleCount}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </section>

            <section>
              <h2 className="mb-2 text-[14px] font-semibold">Pausas por motivo</h2>
              <ul className="space-y-1 text-[12px]">
                {data.pauses.length === 0 ? (
                  <li className="text-zinc-500">Nenhum evento de pausa no período.</li>
                ) : (
                  data.pauses.map((p) => (
                    <li key={p.reasonId} className="flex flex-col gap-0.5 sm:flex-row sm:justify-between">
                      <span>{p.label}</span>
                      <span className="tabular-nums text-zinc-600 dark:text-zinc-400">
                        {p.pauseEventCount} eventos
                        {p.pausedMs != null
                          ? ` · ${fmtMs(p.pausedMs)}`
                          : ' · duração desconhecida'}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <section>
              <h2 className="mb-1 text-[14px] font-semibold">Tempo apontado por técnico</h2>
              <p className="mb-2 text-[12px] text-zinc-500">
                Visão descritiva — não é ranking de desempenho.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left text-[12px]">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500 dark:border-zinc-800">
                      <th className="py-2 pr-2 font-medium">Técnico</th>
                      <th className="py-2 pr-2 font-medium">Diagnóstico</th>
                      <th className="py-2 pr-2 font-medium">Execução</th>
                      <th className="py-2 pr-2 font-medium">Pausas</th>
                      <th className="py-2 font-medium">Sessões</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.technicians.map((t) => (
                      <tr
                        key={t.technicianUserId}
                        className="border-b border-zinc-100 dark:border-zinc-900"
                      >
                        <td className="py-2 pr-2">{t.displayName}</td>
                        <td className="py-2 pr-2 tabular-nums">{t.diagnosticFormatted}</td>
                        <td className="py-2 pr-2 tabular-nums">{t.executionFormatted}</td>
                        <td className="py-2 pr-2 tabular-nums">{t.pausedFormatted}</td>
                        <td className="py-2 tabular-nums">
                          {t.finishedSessions} fin. / {t.openSessions} abertas
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="mb-1 text-[14px] font-semibold">Padrões sugeridos → Memória</h2>
              <p className="mb-3 text-[12px] text-zinc-500">
                Hipóteses a partir do histórico. Propor envia para aprovação da gestão — nunca ativa
                sozinho.
              </p>
              {data.patterns.length === 0 ? (
                <p className="text-[12px] text-zinc-500">
                  Sem padrões com amostra mínima no período.
                </p>
              ) : (
                <ul className="space-y-4">
                  {data.patterns.map((p) => (
                    <li
                      key={p.id}
                      className="border-b border-zinc-200 pb-3 dark:border-zinc-800"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-semibold">{p.title}</p>
                          <p className="mt-1 text-[12px] text-zinc-600 dark:text-zinc-400">
                            {p.summary}
                          </p>
                          <p className="mt-1 text-[11px] text-zinc-500">
                            n={p.sampleCount} · confiança {confidenceLabel(p.confidence)} ·{' '}
                            {p.kind}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busyId === p.id}
                          onClick={() => {
                            setBusyId(p.id);
                            setMsg(null);
                            void proposeRdaKnowledge({
                              title: p.proposedKnowledge.title,
                              content: p.proposedKnowledge.content,
                              category: p.proposedKnowledge.category,
                              knowledgeKey: p.proposedKnowledge.knowledgeKeyHint,
                              changeReason: `Padrão operacional detectado (${p.kind}) — aguarda aprovação`,
                              submitForApproval: true,
                            })
                              .then(() => {
                                setMsg(
                                  `Proposta enviada à Memória: “${p.proposedKnowledge.title}”. Aguardando aprovação.`
                                );
                              })
                              .catch((e: unknown) => {
                                setError(
                                  e instanceof Error ? e.message : 'Falha ao propor conhecimento.'
                                );
                              })
                              .finally(() => setBusyId(null));
                          }}
                          className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-[12px] font-semibold dark:border-zinc-600"
                        >
                          {busyId === p.id ? 'Enviando…' : 'Propor à Memória'}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </div>
    </div>
  );
};
