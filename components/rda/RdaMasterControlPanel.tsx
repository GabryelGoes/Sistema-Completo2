import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Power, Sparkles } from 'lucide-react';
import {
  fetchRdaProactiveDashboard,
  getRdaStatus,
  saveRdaProactiveConfig,
  setRdaIntelligenceEnabled,
  type AuthSession,
  type RdaStatusDto,
} from '../../services/apiService';
import { AjustesPcOpsEyebrow } from '../ajustes/AjustesPcOpsEyebrow';
import { RdaSettingsChildShell } from './RdaSettingsChildShell';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
  ajustesHubChrome?: boolean;
  authSession: AuthSession | null;
};

function canManage(session: AuthSession | null): boolean {
  if (!session) return false;
  if (session.role === 'admin') return true;
  return !!session.permissions?.full_access;
}

function formatTokens(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '—';
  return n.toLocaleString('pt-BR');
}

/**
 * Interruptor mestre do RDA Intelligence (Ajustes → RDA).
 * Desligar grava workshop_settings e interrompe chat/LLM e scans proativos.
 */
export const RdaMasterControlPanel: React.FC<Props> = ({
  isOpen,
  onClose,
  desktopShell,
  ajustesHubChrome = false,
  authSession,
}) => {
  const pcChrome = Boolean(ajustesHubChrome && desktopShell);
  const manage = canManage(authSession);
  const [status, setStatus] = useState<RdaStatusDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await getRdaStatus();
    setStatus(next);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setError(null);
    setNote(null);
    void getRdaStatus()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch((e) => {
        if (!cancelled) {
          setStatus(null);
          setError(e instanceof Error ? e.message : 'Falha ao ler status do RDA.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const enabled = !!status?.feature.enabled;
  const usage = status?.usage;

  const toggle = async () => {
    if (!manage || busy) return;
    const next = !enabled;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await setRdaIntelligenceEnabled(next);
      if (!next) {
        try {
          const dash = await fetchRdaProactiveDashboard();
          if (dash.config?.enabled) {
            await saveRdaProactiveConfig({
              enabled: false,
              intervalMinutes: dash.config.intervalMinutes,
              reopenAfterHours: dash.config.reopenAfterHours,
              notifyOnCreate: dash.config.notifyOnCreate,
            });
            setNote('Monitoramento proativo também foi desligado.');
          }
        } catch {
          /* master off já bloqueia o scan; config é reforço */
        }
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RdaSettingsChildShell
      isOpen={isOpen}
      onClose={onClose}
      desktopShell={desktopShell}
      ajustesHubChrome={ajustesHubChrome}
      ariaLabel="Ligar ou desligar RDA Intelligence"
    >
      <header
        className={`shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 ${
          pcChrome ? 'ajustes-pc-rda-header' : ''
        }`}
      >
        <div className={`mx-auto flex max-w-3xl items-center gap-3 ${pcChrome ? 'ajustes-pc-rda-inner' : ''}`}>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0 flex-1">
            <AjustesPcOpsEyebrow desktop={pcChrome}>Ajustes · RDA</AjustesPcOpsEyebrow>
            <h1 className="text-[17px] font-semibold tracking-tight">Ligar / desligar RDA</h1>
            <p className="text-[12px] text-zinc-500">
              Controle o consumo de tokens da OpenAI nesta oficina
            </p>
          </div>
          <Sparkles className="h-5 w-5 shrink-0 text-zinc-400" aria-hidden />
        </div>
      </header>

      <div
        className={`mx-auto w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 py-4 ${
          pcChrome ? 'ajustes-pc-rda-inner' : ''
        }`}
      >
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                Estado
              </p>
              <p className="mt-1 text-[18px] font-semibold text-zinc-900 dark:text-white">
                {status == null ? 'Carregando…' : enabled ? 'Ligado' : 'Desligado'}
              </p>
              <p className="mt-1 text-[13px] leading-snug text-zinc-500">
                {enabled
                  ? 'Chat, insights e varreduras podem chamar a OpenAI e consumir tokens.'
                  : 'Nenhuma chamada de IA. Chat e scans ficam bloqueados até religar.'}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              disabled={!manage || busy || status == null}
              onClick={() => void toggle()}
              className={`relative inline-flex h-9 w-[3.75rem] shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                enabled ? 'bg-emerald-600' : 'bg-zinc-300 dark:bg-zinc-700'
              }`}
              aria-label={enabled ? 'Desligar RDA Intelligence' : 'Ligar RDA Intelligence'}
            >
              <span
                className={`inline-flex h-7 w-7 items-center justify-center rounded-full bg-white shadow transition-transform ${
                  enabled ? 'translate-x-8' : 'translate-x-1'
                }`}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" />
                ) : (
                  <Power
                    className={`h-3.5 w-3.5 ${enabled ? 'text-emerald-700' : 'text-zinc-500'}`}
                  />
                )}
              </span>
            </button>
          </div>

          {!manage ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[12px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              Só gerência / acesso total pode alterar este interruptor.
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            Uso de tokens (hoje)
          </p>
          {usage ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
              <div>
                <dt className="text-zinc-500">Tokens</dt>
                <dd className="text-[16px] font-semibold tabular-nums">
                  {formatTokens(usage.totalTokens)}
                  <span className="text-[12px] font-normal text-zinc-400">
                    {' '}
                    / {formatTokens(usage.dailyTokenLimit)}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">Requisições</dt>
                <dd className="text-[16px] font-semibold tabular-nums">
                  {formatTokens(usage.requestCount)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-[13px] text-zinc-500">
              {enabled
                ? 'Sem uso registrado hoje (ou indisponível).'
                : 'Com o RDA desligado, novos tokens não são consumidos.'}
            </p>
          )}
        </section>

        {status?.feature.envWouldEnable && status.feature.source === 'setting' && !enabled ? (
          <p className="rounded-xl bg-sky-50 px-3 py-2 text-[12px] text-sky-900 dark:bg-sky-950/40 dark:text-sky-100">
            O servidor ainda tem RDA_INTELLIGENCE_ENABLED no ambiente, mas o ajuste desta oficina
            está desligado e prevalece — a IA permanece off.
          </p>
        ) : null}

        {note ? (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-[12px] text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">
            {note}
          </p>
        ) : null}
        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-[12px] text-red-800 dark:bg-red-950/40 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <p className="text-[12px] leading-relaxed text-zinc-500">
          Desligar aqui é o caminho recomendado para economizar tokens sem mexer no .env. Os
          módulos de memória/pátio/lab continuam acessíveis, mas o assistente e as varreduras com
          IA ficam inativos.
        </p>
      </div>
    </RdaSettingsChildShell>
  );
};
