import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  fetchRdaProactiveDashboard,
  proposeRdaKnowledge,
  runRdaProactiveScan,
  saveRdaProactiveConfig,
  transitionRdaProactiveAlert,
  type RdaProactiveAlert,
  type RdaProactiveDashboard,
} from '../../services/apiService';
import { RdaSettingsChildShell } from './RdaSettingsChildShell';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
};

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

export const RdaProactiveIntelligencePanel: React.FC<Props> = ({
  isOpen,
  onClose,
  desktopShell,
}) => {
  const [data, setData] = useState<RdaProactiveDashboard | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [severity, setSeverity] = useState<string>('all');
  const [tab, setTab] = useState<'ativos' | 'criticos' | 'recomendacoes' | 'historico' | 'config'>(
    'ativos'
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRdaProactiveDashboard();
      setData(res);
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

  return (
    <RdaSettingsChildShell
      isOpen={isOpen}
      onClose={onClose}
      desktopShell={desktopShell}
      ariaLabel="Monitoramento Proativo"
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
            <h1 className="text-[17px] font-semibold tracking-tight">Monitoramento Proativo</h1>
            <p className="text-[12px] text-zinc-500">
              Alertas confiáveis com evidência — sem alterar operação automaticamente
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
          <div className="space-y-6">
            <section>
              <p className="mb-2 text-[12px] text-zinc-500">{data.disclaimer}</p>
              <p className="text-[13px]">
                <span className="font-semibold tabular-nums">{data.summary.active}</span> ativos
                {' · '}
                <span className="font-semibold tabular-nums">{data.summary.critical}</span> críticos
                {' · '}
                <span className="tabular-nums">{data.summary.acknowledged}</span> reconhecidos
              </p>
            </section>

            <div className="flex flex-wrap gap-2 text-[12px]">
              {(
                [
                  ['ativos', 'Alertas ativos'],
                  ['criticos', 'Críticos'],
                  ['recomendacoes', 'Recomendações'],
                  ['historico', 'Histórico'],
                  ['config', 'Configurações'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`rounded-lg border px-3 py-1.5 ${
                    tab === id
                      ? 'border-zinc-800 bg-zinc-900 text-white dark:border-zinc-200 dark:bg-zinc-100 dark:text-zinc-900'
                      : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab !== 'config' ? (
              <div className="flex flex-wrap gap-3 text-[12px]">
                <label className="inline-flex items-center gap-1.5">
                  Categoria
                  <select
                    className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    <option value="all">Todas</option>
                    <option value="patio">Pátio</option>
                    <option value="laboratorio">Laboratório</option>
                    <option value="estoque">Estoque</option>
                    <option value="produtividade">Produtividade</option>
                  </select>
                </label>
                {tab !== 'criticos' ? (
                  <label className="inline-flex items-center gap-1.5">
                    Severidade
                    <select
                      className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
                      value={severity}
                      onChange={(e) => setSeverity(e.target.value)}
                    >
                      <option value="all">Todas</option>
                      <option value="critical">Crítico</option>
                      <option value="warning">Atenção</option>
                      <option value="info">Informativo</option>
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            {tab === 'ativos' ? (
              <AlertList
                items={filteredActive}
                busyId={busyId}
                onAcknowledge={(id) => void act(id, 'acknowledged')}
                onResolve={(id) => void act(id, 'resolved')}
                onDismiss={(id) => void act(id, 'dismissed')}
                empty="Nenhum alerta ativo no momento."
              />
            ) : null}

            {tab === 'criticos' ? (
              <AlertList
                items={filteredCritical}
                busyId={busyId}
                onAcknowledge={(id) => void act(id, 'acknowledged')}
                onResolve={(id) => void act(id, 'resolved')}
                onDismiss={(id) => void act(id, 'dismissed')}
                empty="Nenhuma situação crítica ativa."
              />
            ) : null}

            {tab === 'recomendacoes' ? (
              <section>
                {data.recommendations.length === 0 ? (
                  <p className="text-[12px] text-zinc-500">Sem recomendações no momento.</p>
                ) : (
                  <ul className="space-y-3 text-[12px]">
                    {data.recommendations
                      .filter((r) => category === 'all' || r.category === category)
                      .filter((r) => severity === 'all' || r.severity === severity)
                      .map((r) => (
                        <li
                          key={r.alertId}
                          className="border-b border-zinc-200 pb-2 dark:border-zinc-800"
                        >
                          <p className="font-semibold text-[13px]">{r.title}</p>
                          <p className="mt-0.5 text-zinc-500">
                            {CATEGORY_LABEL[r.category]} · {SEVERITY_LABEL[r.severity]}
                          </p>
                          <p className="mt-1 text-zinc-700 dark:text-zinc-300">{r.recommendation}</p>
                        </li>
                      ))}
                  </ul>
                )}
              </section>
            ) : null}

            {tab === 'historico' ? (
              <AlertList
                items={filteredHistory}
                busyId={busyId}
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
                  Padrões recorrentes — exigem aprovação humana. Nada é gravado automaticamente.
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

function AlertList(props: {
  items: RdaProactiveAlert[];
  busyId: string | null;
  empty: string;
  readOnly?: boolean;
  onAcknowledge?: (id: string) => void;
  onResolve?: (id: string) => void;
  onDismiss?: (id: string) => void;
}) {
  if (props.items.length === 0) {
    return <p className="text-[12px] text-zinc-500">{props.empty}</p>;
  }
  return (
    <ul className="space-y-3 text-[12px]">
      {props.items.map((a) => (
        <li key={a.id} className="border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold text-[13px]">{a.title}</p>
            <span className="text-zinc-500">
              {CATEGORY_LABEL[a.category]} · {SEVERITY_LABEL[a.severity]} · {a.status}
            </span>
          </div>
          <p className="mt-1 text-zinc-700 dark:text-zinc-300">{a.body}</p>
          {a.evidence ? (
            <p className="mt-1 text-zinc-500">
              <span className="font-medium text-zinc-600 dark:text-zinc-400">Evidência:</span>{' '}
              {a.evidence}
            </p>
          ) : null}
          {a.recommendation ? (
            <p className="mt-1 text-zinc-700 dark:text-zinc-300">
              <span className="font-medium">Recomendação:</span> {a.recommendation}
            </p>
          ) : null}
          {!props.readOnly && a.status === 'active' ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={props.busyId === a.id}
                className="rounded border border-zinc-300 px-2.5 py-1 text-[11px] font-semibold dark:border-zinc-600"
                onClick={() => props.onAcknowledge?.(a.id)}
              >
                Reconhecer
              </button>
              <button
                type="button"
                disabled={props.busyId === a.id}
                className="rounded border border-zinc-300 px-2.5 py-1 text-[11px] font-semibold dark:border-zinc-600"
                onClick={() => props.onResolve?.(a.id)}
              >
                Resolver
              </button>
              <button
                type="button"
                disabled={props.busyId === a.id}
                className="rounded border border-zinc-300 px-2.5 py-1 text-[11px] dark:border-zinc-600"
                onClick={() => props.onDismiss?.(a.id)}
              >
                Descartar
              </button>
            </div>
          ) : null}
          {!props.readOnly && a.status === 'acknowledged' ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={props.busyId === a.id}
                className="rounded border border-zinc-300 px-2.5 py-1 text-[11px] font-semibold dark:border-zinc-600"
                onClick={() => props.onResolve?.(a.id)}
              >
                Resolver
              </button>
              <button
                type="button"
                disabled={props.busyId === a.id}
                className="rounded border border-zinc-300 px-2.5 py-1 text-[11px] dark:border-zinc-600"
                onClick={() => props.onDismiss?.(a.id)}
              >
                Descartar
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
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
      <p className="text-[12px] text-zinc-500">
        Configuração disponível apenas para gestão. Intervalo atual:{' '}
        {props.data.config.intervalMinutes} min ·{' '}
        {props.data.config.enabled ? 'monitor ligado' : 'monitor desligado'}.
      </p>
    );
  }

  return (
    <section className="space-y-4 text-[13px]">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Monitoramento habilitado
      </label>
      <label className="flex flex-wrap items-center gap-2">
        Intervalo (minutos)
        <input
          type="number"
          min={5}
          max={1440}
          className="w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          value={intervalMinutes}
          onChange={(e) => setIntervalMinutes(Number(e.target.value) || 30)}
        />
      </label>
      <label className="flex flex-wrap items-center gap-2">
        Reabrir após (horas)
        <input
          type="number"
          min={1}
          max={168}
          className="w-24 rounded border border-zinc-300 px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          value={reopenAfterHours}
          onChange={(e) => setReopenAfterHours(Number(e.target.value) || 24)}
        />
      </label>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={notifyOnCreate}
          onChange={(e) => setNotifyOnCreate(e.target.checked)}
        />
        Notificar ao criar alerta novo
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={props.busyId === 'save-config'}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[12px] font-semibold dark:border-zinc-600"
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
          Salvar
        </button>
        <button
          type="button"
          disabled={props.busyId === 'run-scan'}
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-[12px] font-semibold dark:border-zinc-600"
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
          Executar varredura agora
        </button>
      </div>
    </section>
  );
}
