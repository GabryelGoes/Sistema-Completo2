import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Sparkles, RefreshCw } from 'lucide-react';
import { getRdaOsInsight, refreshRdaOsInsight } from '../../services/apiService';

type Insight = {
  status?: string;
  summary?: string;
  facts?: Array<{ text: string; source: string }>;
  hypotheses?: Array<{ text: string; confidence: string }>;
  sources?: string[];
  error_message?: string | null;
};

type Props = {
  serviceOrderId: string;
};

/** Card de insight técnico RDA na ficha da OS. */
export const RdaOsInsightCard: React.FC<Props> = ({ serviceOrderId }) => {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getRdaOsInsight(serviceOrderId);
      setInsight((res.insight as Insight) || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Insight indisponível');
      setInsight(null);
    } finally {
      setLoading(false);
    }
  }, [serviceOrderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-700 dark:bg-zinc-900/60">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
          <Sparkles className="h-3.5 w-3.5" />
          RDA — análise técnica
        </h3>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-zinc-600 hover:bg-zinc-200/80 dark:hover:bg-zinc-800"
          onClick={async () => {
            setLoading(true);
            try {
              const res = await refreshRdaOsInsight(serviceOrderId);
              setInsight((res.insight as Insight) || null);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Falha ao atualizar');
            } finally {
              setLoading(false);
            }
          }}
        >
          <RefreshCw className="h-3 w-3" />
          Atualizar
        </button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      ) : error ? (
        <p className="text-[12px] text-zinc-500">{error}</p>
      ) : !insight ? (
        <p className="text-[12px] text-zinc-500">
          Ainda sem insight. Ative o RDA e clique em Atualizar (ou recadastre a OS).
        </p>
      ) : (
        <div className="space-y-2 text-[12px] text-zinc-700 dark:text-zinc-200">
          <p className="leading-relaxed">{insight.summary}</p>
          {(insight.facts || []).length > 0 ? (
            <div>
              <p className="mb-1 font-medium text-zinc-900 dark:text-white">Fatos (fontes internas)</p>
              <ul className="list-disc space-y-1 pl-4">
                {(insight.facts || []).map((f, i) => (
                  <li key={i}>
                    {f.text}{' '}
                    <span className="text-zinc-400">[{f.source}]</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(insight.hypotheses || []).length > 0 ? (
            <div>
              <p className="mb-1 font-medium text-zinc-900 dark:text-white">Hipóteses</p>
              <ul className="list-disc space-y-1 pl-4">
                {(insight.hypotheses || []).map((h, i) => (
                  <li key={i}>
                    {h.text}{' '}
                    <span className="text-zinc-400">({h.confidence})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
};
