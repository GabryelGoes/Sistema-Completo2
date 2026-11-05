import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  fetchRdaLabEstoqueIntelDashboard,
  proposeRdaKnowledge,
  type RdaLabEstoqueIntelDashboard,
} from '../../services/apiService';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
};

export const RdaLabEstoqueIntelligencePanel: React.FC<Props> = ({ isOpen, onClose }) => {
  const [data, setData] = useState<RdaLabEstoqueIntelDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRdaLabEstoqueIntelDashboard();
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar Lab/Estoque.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex min-h-0 flex-col bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100"
      role="dialog"
      aria-modal="true"
      aria-label="Inteligência do Laboratório e Estoque"
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
            <h1 className="text-[17px] font-semibold tracking-tight">
              Inteligência do Laboratório e Estoque
            </h1>
            <p className="text-[12px] text-zinc-500">
              Gargalos do lab, bancada e disponibilidade ABS — sem movimentar automaticamente
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
              <h2 className="mb-1 text-[14px] font-semibold">Resumo</h2>
              <p className="mb-2 text-[12px] text-zinc-500">{data.disclaimer}</p>
              <p className="mb-3 text-[12px] text-zinc-500">{data.summary.note}</p>
              {data.scopes.lab ? (
                <p className="text-[13px]">
                  <span className="font-semibold tabular-nums">{data.summary.labActive}</span> OS
                  lab · {data.summary.labBottleneckCount} gargalos · bancada{' '}
                  {data.summary.benchOccupied}/{data.summary.benchOccupied + data.summary.benchFree}{' '}
                  · {data.summary.readyForPickup} prontos pra entrega
                  {data.summary.labUnknownStageTimeCount
                    ? ` · ${data.summary.labUnknownStageTimeCount} sem tempo de etapa`
                    : null}
                </p>
              ) : null}
              {data.scopes.stock && data.stockSummary ? (
                <p className="mt-1 text-[13px] text-zinc-700 dark:text-zinc-300">
                  ABS disponíveis{' '}
                  <span className="font-semibold tabular-nums">
                    {data.stockSummary.absAvailable}
                  </span>
                  {' · '}
                  reservados {data.stockSummary.absReserved}
                  {' · '}
                  estoque baixo {data.stockSummary.partsLowStock}
                </p>
              ) : null}
            </section>

            {data.scopes.lab ? (
              <>
                <section>
                  <h2 className="mb-2 text-[14px] font-semibold">Precisam de atenção (Lab)</h2>
                  {data.labAttention.length === 0 ? (
                    <p className="text-[12px] text-zinc-500">Nenhum alerta no momento.</p>
                  ) : (
                    <ul className="space-y-2 text-[12px]">
                      {data.labAttention.map((a) => (
                        <li
                          key={a.orderId}
                          className="border-b border-zinc-200 pb-2 dark:border-zinc-800"
                        >
                          <span className="font-semibold">
                            {a.moduleIdentification || a.osNumber || a.orderId.slice(0, 8)}
                          </span>
                          <span className="text-zinc-500">
                            {' '}
                            · {a.statusLabel}
                            {a.benchSlot != null ? ` · bancada ${a.benchSlot}` : ''}
                          </span>
                          <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">{a.summary}</p>
                          <p className="text-zinc-500">{a.stageTimeLabel}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                <section>
                  <h2 className="mb-2 text-[14px] font-semibold">Gargalos do laboratório</h2>
                  {data.labBottlenecks.length === 0 ? (
                    <p className="text-[12px] text-zinc-500">Nenhum gargalo acima dos limiares.</p>
                  ) : (
                    <ul className="space-y-3 text-[12px]">
                      {data.labBottlenecks.map((b) => (
                        <li
                          key={b.kind}
                          className="border-b border-zinc-200 pb-2 dark:border-zinc-800"
                        >
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

                {data.bench ? (
                  <section>
                    <h2 className="mb-2 text-[14px] font-semibold">Bancada</h2>
                    <p className="mb-2 text-[12px] text-zinc-500">
                      {data.bench.occupied} ocupadas · {data.bench.free} livres
                      {data.bench.queuedEstimate
                        ? ` · ~${data.bench.queuedEstimate} sem slot`
                        : ''}
                    </p>
                    <ul className="grid grid-cols-4 gap-2 text-[11px] sm:grid-cols-6 md:grid-cols-8">
                      {data.bench.slots.map((s) => (
                        <li
                          key={s.slot}
                          className={`rounded border px-1.5 py-1 ${
                            s.occupied
                              ? 'border-zinc-400 bg-white dark:border-zinc-600 dark:bg-zinc-900'
                              : 'border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-700'
                          }`}
                          title={s.moduleIdentification || undefined}
                        >
                          <span className="font-semibold tabular-nums">{s.slot}</span>
                          {s.occupied ? (
                            <span className="mt-0.5 block truncate text-zinc-600 dark:text-zinc-400">
                              {s.statusLabel || s.status}
                            </span>
                          ) : (
                            <span className="mt-0.5 block">livre</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </>
            ) : null}

            {data.scopes.stock ? (
              <section>
                <h2 className="mb-2 text-[14px] font-semibold">Estoque baixo (peças)</h2>
                {data.lowStockParts.length === 0 ? (
                  <p className="text-[12px] text-zinc-500">Nenhuma peça abaixo do mínimo.</p>
                ) : (
                  <ul className="space-y-2 text-[12px]">
                    {data.lowStockParts.slice(0, 20).map((p) => (
                      <li
                        key={p.id}
                        className="border-b border-zinc-200 pb-2 dark:border-zinc-800"
                      >
                        <span className="font-semibold">{p.name}</span>
                        <span className="text-zinc-500">
                          {' '}
                          · qtd {p.quantity}
                          {p.minQuantity != null ? ` / mín ${p.minQuantity}` : ''}
                          {p.location ? ` · ${p.location}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {data.stockSummary ? (
                  <p className="mt-3 text-[12px] text-zinc-500">{data.stockSummary.note}</p>
                ) : null}
              </section>
            ) : null}

            {data.knowledgeHints?.length ? (
              <section>
                <h2 className="mb-2 text-[14px] font-semibold">Memória aprovada (referência)</h2>
                <ul className="space-y-2 text-[12px] text-zinc-600 dark:text-zinc-400">
                  {data.knowledgeHints.map((k) => (
                    <li key={k.knowledgeKey}>
                      <span className="font-medium text-zinc-900 dark:text-zinc-100">{k.title}</span>
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
                  Padrões recorrentes — exigem aprovação humana.
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
                            changeReason: 'Padrão Lab/Estoque — aguarda aprovação',
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
    </div>
  );
};
