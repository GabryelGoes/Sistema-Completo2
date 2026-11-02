import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock3, Pause, Play, Square, Loader2 } from 'lucide-react';
import {
  finishRdaWorkSession,
  getMyActiveRdaWorkSession,
  getRdaWorkPauseReasons,
  listRdaWorkSessions,
  pauseRdaWorkSession,
  resumeRdaWorkSession,
  startRdaWorkSession,
  type RdaWorkPauseReason,
  type RdaWorkSession,
} from '../../services/apiService';
import {
  computeLiveTotals,
  formatDurationHms,
  newClientMutationId,
} from '../../services/rdaIntelligence/workSessions/timing';

type Props = {
  serviceOrderId: string;
  /** Sempre o usuário autenticado — nunca editável na UI. */
  technicianUserId: string;
  technicianDisplayName: string;
};

function useTickingLiveMs(session: RdaWorkSession | null): {
  productiveMs: number;
  pausedMs: number;
} {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!session || (session.status !== 'running' && session.status !== 'paused')) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [session?.id, session?.status]);

  return useMemo(() => {
    if (!session) return { productiveMs: 0, pausedMs: 0 };
    const skew = Date.parse(session.serverNow) - Date.now();
    const serverNowMs = now + (Number.isFinite(skew) ? skew : 0);
    const live = computeLiveTotals({
      status: session.status,
      productiveMs: session.productiveMs,
      pausedMs: session.pausedMs,
      segmentStartedAt: session.segmentStartedAt,
      currentPauseStartedAt: session.currentPauseStartedAt,
      serverNowMs,
    });
    return {
      productiveMs: live.liveProductiveMs,
      pausedMs: live.livePausedMs,
    };
  }, [session, now]);
}

export const OsWorkTimePanel: React.FC<Props> = ({
  serviceOrderId,
  technicianUserId,
  technicianDisplayName,
}) => {
  const [session, setSession] = useState<RdaWorkSession | null>(null);
  const [osSessions, setOsSessions] = useState<RdaWorkSession[]>([]);
  const [reasons, setReasons] = useState<RdaWorkPauseReason[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReasonId, setPauseReasonId] = useState('break');
  const [pauseNote, setPauseNote] = useState('');
  const [otherActiveOsId, setOtherActiveOsId] = useState<string | null>(null);

  const live = useTickingLiveMs(
    session && session.serviceOrderId === serviceOrderId ? session : null
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [mine, listed, pauseReasons] = await Promise.all([
        getMyActiveRdaWorkSession().catch((e: Error & { message?: string }) => {
          if (/Migration|RDA_WORK_MIGRATION/i.test(String(e.message))) throw e;
          throw e;
        }),
        listRdaWorkSessions({ serviceOrderId }),
        getRdaWorkPauseReasons(),
      ]);
      setReasons(pauseReasons);
      // Apenas as próprias sessões (ACL do servidor); mantém histórico local da OS.
      const mineOnThisOs = listed.sessions
        .filter((s) => s.technicianUserId === technicianUserId)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      setOsSessions(mineOnThisOs);
      setMigrationMissing(false);
      if (mine && mine.serviceOrderId === serviceOrderId) {
        setSession(mine);
        setOtherActiveOsId(null);
      } else if (mine) {
        // Sessão ativa em outra OS: ainda mostra o último apontamento desta OS, se houver.
        setSession(mineOnThisOs[0] ?? null);
        setOtherActiveOsId(mine.serviceOrderId);
      } else {
        const activeHere = mineOnThisOs.find(
          (s) => s.status === 'running' || s.status === 'paused'
        );
        setSession(activeHere ?? mineOnThisOs[0] ?? null);
        setOtherActiveOsId(null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar cronômetro.';
      if (/Migration|pendente|RDA_WORK_MIGRATION/i.test(msg)) {
        setMigrationMissing(true);
        setError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [serviceOrderId, technicianUserId]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, [refresh]);

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      const err = e as Error & { activeSession?: RdaWorkSession; code?: string };
      if (err.code === 'RDA_ACTIVE_SESSION_EXISTS' && err.activeSession) {
        setOtherActiveOsId(err.activeSession.serviceOrderId);
        setError(
          'Você já tem uma sessão ativa em outra OS. Finalize-a antes de iniciar nesta.'
        );
      } else {
        setError(err.message || 'Operação falhou.');
      }
    } finally {
      setBusy(false);
    }
  };

  const selectedReason = reasons.find((r) => r.id === pauseReasonId);

  if (loading) {
    return (
      <div className="mb-4 rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2 text-[13px] text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando controle de tempo…
        </div>
      </div>
    );
  }

  if (migrationMissing) {
    return (
      <div className="mb-4 rounded-2xl border border-dashed border-amber-400/70 bg-amber-50 px-4 py-3 text-[13px] text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
        Controle de tempo disponível após aplicar a migration{' '}
        <code className="text-[12px]">20261101220000_rda_work_sessions.sql</code> no ambiente de
        teste.
      </div>
    );
  }

  const mineActiveHere =
    !!session &&
    session.serviceOrderId === serviceOrderId &&
    (session.status === 'running' || session.status === 'paused');

  const displaySession =
    session && session.serviceOrderId === serviceOrderId ? session : null;

  const productiveDisplayMs = mineActiveHere
    ? live.productiveMs
    : displaySession?.liveProductiveMs ?? 0;
  const pausedDisplayMs = mineActiveHere
    ? live.pausedMs
    : displaySession?.livePausedMs ?? 0;

  const finishedCountOnOs = osSessions.filter((s) => s.status === 'finished').length;

  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-950 px-4 py-3 text-white dark:border-zinc-800">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FFD60A]">
            Meu tempo nesta OS
          </p>
          <p className="truncate text-[13px] text-zinc-300">{technicianDisplayName}</p>
        </div>
        <Clock3 className="h-5 w-5 shrink-0 text-[#FFD60A]" aria-hidden />
      </div>

      <div className="space-y-3 p-4">
        {error ? (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {otherActiveOsId ? (
          <p className="rounded-xl border border-amber-300/80 bg-amber-50 px-3 py-2 text-[13px] text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/20 dark:text-amber-100">
            Sessão ativa em outra OS. Finalize-a antes de iniciar aqui.
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-[#FAFAFA] px-3 py-3 dark:bg-zinc-950">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Produtivo
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">
              {formatDurationHms(productiveDisplayMs)}
            </p>
            <p className="mt-1 text-[11px] text-zinc-500">Pausas não entram neste total</p>
          </div>
          <div className="rounded-xl bg-[#FAFAFA] px-3 py-3 dark:bg-zinc-950">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Pausado
            </p>
            <p className="mt-1 font-mono text-2xl font-semibold tabular-nums text-zinc-900 dark:text-white">
              {formatDurationHms(pausedDisplayMs)}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${
              displaySession?.status === 'running'
                ? 'bg-emerald-500 text-white'
                : displaySession?.status === 'paused'
                  ? 'bg-[#FFD60A] text-zinc-900'
                  : displaySession?.status === 'finished'
                    ? 'bg-zinc-800 text-white'
                    : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
            }`}
          >
            {displaySession?.status === 'running'
              ? 'Em execução'
              : displaySession?.status === 'paused'
                ? 'Pausado'
                : displaySession?.status === 'finished'
                  ? 'Finalizado (tempo salvo)'
                  : 'Sem sessão ativa'}
          </span>
          {displaySession?.status === 'paused' && displaySession.currentPauseReasonId ? (
            <span className="text-[12px] text-zinc-500">
              Motivo:{' '}
              {reasons.find((r) => r.id === displaySession.currentPauseReasonId)?.label ||
                displaySession.currentPauseReasonId}
            </span>
          ) : null}
        </div>

        <p className="text-[12px] text-zinc-500">
          Finalizar o cronômetro não muda a etapa da OS no pátio.
          {finishedCountOnOs > 0 && !mineActiveHere
            ? ` Último apontamento nesta OS permanece após atualizar a página.`
            : null}
        </p>

        <div className="flex flex-wrap gap-2">
          {!mineActiveHere ? (
            <button
              type="button"
              disabled={busy || !!otherActiveOsId}
              onClick={() =>
                void run(async () => {
                  const res = await startRdaWorkSession({
                    serviceOrderId,
                    clientMutationId: newClientMutationId(),
                  });
                  setSession(res.session);
                })
              }
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#FFD60A] px-4 text-[14px] font-semibold text-zinc-900 disabled:opacity-50 sm:flex-none"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Iniciar serviço
            </button>
          ) : null}

          {displaySession?.status === 'running' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setPauseOpen(true);
                setPauseReasonId(reasons[0]?.id || 'break');
                setPauseNote('');
              }}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-4 text-[14px] font-semibold text-zinc-900 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white sm:flex-none"
            >
              <Pause className="h-4 w-4" />
              Pausar
            </button>
          ) : null}

          {displaySession?.status === 'paused' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await resumeRdaWorkSession({
                    sessionId: displaySession.id,
                    clientMutationId: newClientMutationId(),
                  });
                  setSession(res.session);
                })
              }
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900 sm:flex-none"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Retomar
            </button>
          ) : null}

          {mineActiveHere ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm('Finalizar seu tempo nesta OS? A etapa do pátio não será alterada.')) {
                  return;
                }
                void run(async () => {
                  const res = await finishRdaWorkSession({
                    sessionId: displaySession!.id,
                    clientMutationId: newClientMutationId(),
                  });
                  setSession(res.session);
                });
              }}
              className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-zinc-900 px-4 text-[14px] font-semibold text-white disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 sm:flex-none"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
              Finalizar
            </button>
          ) : null}
        </div>

        {pauseOpen && displaySession ? (
          <div className="rounded-xl border border-zinc-200 bg-[#FAFAFA] p-3 dark:border-zinc-700 dark:bg-zinc-950">
            <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">Motivo da pausa</p>
            <select
              value={pauseReasonId}
              onChange={(e) => setPauseReasonId(e.target.value)}
              className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
            >
              {reasons.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {selectedReason?.requiresNote || pauseReasonId === 'other' ? (
              <textarea
                value={pauseNote}
                onChange={(e) => setPauseNote(e.target.value)}
                rows={2}
                placeholder="Descreva o motivo…"
                className="mt-2 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[14px] dark:border-zinc-700 dark:bg-zinc-900 dark:text-white"
              />
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="rounded-xl px-3 py-2 text-[13px] font-semibold text-zinc-600"
                onClick={() => setPauseOpen(false)}
                disabled={busy}
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50"
                onClick={() =>
                  void run(async () => {
                    const res = await pauseRdaWorkSession({
                      sessionId: displaySession.id,
                      reasonId: pauseReasonId,
                      note: pauseNote,
                      clientMutationId: newClientMutationId(),
                    });
                    setSession(res.session);
                    setPauseOpen(false);
                  })
                }
              >
                Confirmar pausa
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
