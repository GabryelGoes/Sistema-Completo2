import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  fetchRdaPatioIntelDashboard,
  proposeRdaKnowledge,
  type RdaPatioIntelDashboard,
} from '../../services/apiService';
import { RdaSettingsChildShell } from './RdaSettingsChildShell';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
};

export const RdaPatioIntelligencePanel: React.FC<Props> = ({
  isOpen,
  onClose,
  desktopShell,
}) => {
  const [data, setData] = useState<RdaPatioIntelDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRdaPatioIntelDashboard();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar gestão do pátio.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  return (
    <RdaSettingsChildShell
      isOpen={isOpen}
      onClose={onClose}
      desktopShell={desktopShell}
      ariaLabel="Gestão Inteligente do Pátio"
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
            <h1 className="text-[17px] font-semibold tracking-tight">Gestão Inteligente do Pátio</h1>
            <p className="text-[12px] text-zinc-500">
              Gargalos, prioridades e riscos — sem movimentar veículos automaticamente
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
        {error ? <p className="mb-3 text-[13px] text-red-600">{error}</p> : null}
        {msg ? <p className="mb-3 text-[13px] text-emerald-700 dark:text-emerald-400">{msg}</p> : null}

        {loading && !data ? (
          <p className="text-[13px] text-zinc-500">Carregando…</p>
        ) : data ? (
          <div className="space-y-8">
            <section>
              <h2 className="mb-1 text-[14px] font-semibold">Resumo operacional</h2>
              <p className="mb-2 text-[12px] text-zinc-500">{data.disclaimer}</p>
              <p className="mb-3 text-[12px] text-zinc-500">{data.summary.note}</p>
              <p className="text-[13px]">
                <span className="font-semibold tabular-nums">{data.summary.totalActive}</span> OS
                ativas · {data.summary.bottleneckCount} gargalos · {data.summary.priorityCount}{' '}
                prioridades · {data.summary.riskCount} riscos
                {typeof data.summary.unknownStageTimeCount === 'number' &&
                data.summary.unknownStageTimeCount > 0
                  ? ` · ${data.summary.unknownStageTimeCount} sem tempo de etapa`
                  : null}
              </p>
              {data.productiveContext ? (
                <p className="mt-2 text-[12px] text-zinc-500">{data.productiveContext.note}</p>
              ) : null}
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-zinc-600 dark:text-zinc-400">
                {Object.entries(data.summary.byStatus)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([st, n]) => (
                    <li key={st}>
                      {st}: <span className="tabular-nums font-medium text-zinc-900 dark:text-zinc-100">{n}</span>
                    </li>
                  ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-2 text-[14px] font-semibold">Precisam de atenção</h2>
              {data.attention.length === 0 ? (
                <p className="text-[12px] text-zinc-500">Nenhum alerta no momento.</p>
              ) : (
                <ul className="space-y-2 text-[12px]">
                  {data.attention.map((a) => (
                    <li key={a.orderId} className="border-b border-zinc-200 pb-2 dark:border-zinc-800">
                      <span className="font-semibold">{a.plate || a.osNumber || a.orderId.slice(0, 8)}</span>
                      <span className="text-zinc-500"> · {a.statusLabel}</span>
                      <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{a.summary}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-[14px] font-semibold">Gargalos</h2>
              {data.bottlenecks.length === 0 ? (
                <p className="text-[12px] text-zinc-500">Nenhum gargalo acima dos limiares.</p>
              ) : (
                <ul className="space-y-3 text-[12px]">
                  {data.bottlenecks.map((b) => (
                    <li key={b.kind} className="border-b border-zinc-200 pb-2 dark:border-zinc-800">
                      <p className="font-semibold">
                        {b.title}{' '}
                        <span className="font-normal text-zinc-500">
                          ({b.count} · limiar {b.thresholdHours}h)
                        </span>
                      </p>
                      <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{b.evidence}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-[14px] font-semibold">Prioridades sugeridas</h2>
              {data.priorities.length === 0 ? (
                <p className="text-[12px] text-zinc-500">Sem prioridades destacadas.</p>
              ) : (
                <ul className="space-y-3 text-[12px]">
                  {data.priorities.slice(0, 15).map((p) => (
                    <li key={p.orderId} className="border-b border-zinc-200 pb-2 dark:border-zinc-800">
                      <p>
                        <span className="font-semibold">{p.plate || p.osNumber}</span>
                        <span className="text-zinc-500">
                          {' '}
                          · {p.statusLabel} · score {p.score}
                        </span>
                      </p>
                      <p className="mt-0.5 text-zinc-500">
                        {p.stageTimeLabel ||
                          (p.hoursInStage == null
                            ? 'Tempo na etapa desconhecido'
                            : `${p.hoursInStage}h na etapa`)}
                      </p>
                      <ul className="mt-1 list-disc pl-4 text-zinc-600 dark:text-zinc-400">
                        {p.reasons.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h2 className="mb-2 text-[14px] font-semibold">Riscos de atraso</h2>
              {data.risks.length === 0 ? (
                <p className="text-[12px] text-zinc-500">Sem riscos de delivery_date no momento.</p>
              ) : (
                <ul className="space-y-2 text-[12px]">
                  {data.risks.map((r) => (
                    <li key={r.orderId} className="border-b border-zinc-200 pb-2 dark:border-zinc-800">
                      <span className="font-semibold">{r.plate || r.osNumber}</span>
                      <span className="text-zinc-500">
                        {' '}
                        · {r.risk} · entrega {r.deliveryDate}
                      </span>
                      <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{r.reasons.join(' · ')}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {data.knowledgeHints?.length ? (
              <section>
                <h2 className="mb-2 text-[14px] font-semibold">Memória aprovada (referência)</h2>
                <ul className="space-y-2 text-[12px] text-zinc-600 dark:text-zinc-400">
                  {data.knowledgeHints.map((k) => (
                    <li key={k.knowledgeKey}>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{k.title}</span>
                      <span className="text-zinc-400"> · {k.knowledgeKey}</span>
                      <p className="mt-0.5">{k.excerpt}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {data.proposedKnowledgeDrafts?.length ? (
              <section>
                <h2 className="mb-1 text-[14px] font-semibold">Propor à Memória</h2>
                <p className="mb-3 text-[12px] text-zinc-500">
                  Padrões recorrentes — exigem aprovação humana. Não grava OS transitórias.
                </p>
                <ul className="space-y-3">
                  {data.proposedKnowledgeDrafts.map((d) => (
                    <li
                      key={d.knowledgeKeyHint}
                      className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-200 pb-3 dark:border-zinc-800"
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
                        className="shrink-0 rounded-lg border border-zinc-300 px-3 py-1.5 text-[12px] font-semibold dark:border-zinc-600"
                        onClick={() => {
                          setBusyId(d.knowledgeKeyHint);
                          setMsg(null);
                          void proposeRdaKnowledge({
                            title: d.title,
                            content: d.content,
                            category: d.category,
                            knowledgeKey: d.knowledgeKeyHint,
                            changeReason: 'Padrão de pátio — aguarda aprovação',
                            submitForApproval: true,
                          })
                            .then(() => setMsg(`Proposta enviada: “${d.title}”.`))
                            .catch((e: unknown) => {
                              setError(e instanceof Error ? e.message : 'Falha ao propor.');
                            })
                            .finally(() => setBusyId(null));
                        }}
                      >
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
