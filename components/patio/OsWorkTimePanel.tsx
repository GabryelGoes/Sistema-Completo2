import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Clock3, Pause, Play, Square, Loader2 } from 'lucide-react';
import {
  finishRdaWorkSession,
  getMyActiveRdaWorkSession,
  getRdaWorkPauseReasons,
  listRdaWorkOsServices,
  listRdaWorkSessions,
  pauseRdaWorkSession,
  resumeRdaWorkSession,
  startRdaWorkSession,
  type RdaWorkOsServiceOption,
  type RdaWorkPauseReason,
  type RdaWorkSession,
} from '../../services/apiService';
import {
  computeLiveTotals,
  createServerClockSync,
  formatDurationHms,
  newClientMutationId,
  type ServerClockSync,
} from '../../services/rdaIntelligence/workSessions/timing';
import {
  aggregateOsTimeIndicators,
  canStartOrResumeTimeKind,
  timeKindAllowedForOsStatus,
  timeKindLabel,
} from '../../services/rdaIntelligence/workSessions/stageRules';
import { OS_GENERAL_SERVICE_LINE_ID } from '../../utils/budgetServiceLineId';

type Props = {
  serviceOrderId: string;
  technicianUserId: string;
  technicianDisplayName: string;
  /** Status atual da OS — define se o apontamento é diagnóstico ou execução. */
  serviceOrderStatus?: string | null;
  /** PC: inicia recolhido. Default true. */
  defaultExpanded?: boolean;
  className?: string;
};

function useTickingLiveMs(session: RdaWorkSession | null): {
  productiveMs: number;
  pausedMs: number;
} {
  const syncRef = useRef<ServerClockSync | null>(null);
  const syncKeyRef = useRef<string>('');
  const [now, setNow] = useState(() => Date.now());

  // Re-sincroniza apenas quando o snapshot do servidor muda (não a cada render).
  const syncKey = session
    ? [
        session.id,
        session.status,
        session.serverNow,
        session.productiveMs,
        session.pausedMs,
        session.segmentStartedAt,
        session.currentPauseStartedAt,
      ].join('|')
    : '';

  if (session && syncKey !== syncKeyRef.current) {
    syncKeyRef.current = syncKey;
    syncRef.current = createServerClockSync(session.serverNow, Date.now());
  }
  if (!session) {
    syncKeyRef.current = '';
    syncRef.current = null;
  }

  useEffect(() => {
    if (!session || (session.status !== 'running' && session.status !== 'paused')) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [session?.id, session?.status]);

  return useMemo(() => {
    if (!session || !syncRef.current) return { productiveMs: 0, pausedMs: 0 };
    const serverNowMs = syncRef.current.serverNowMsAt(now);
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
  serviceOrderStatus = null,
  defaultExpanded = true,
  className = '',
}) => {
  const [session, setSession] = useState<RdaWorkSession | null>(null);
  const [osSessions, setOsSessions] = useState<RdaWorkSession[]>([]);
  const [reasons, setReasons] = useState<RdaWorkPauseReason[]>([]);
  const [serviceOptions, setServiceOptions] = useState<RdaWorkOsServiceOption[]>([]);
  const [generalOption, setGeneralOption] = useState<RdaWorkOsServiceOption | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string>(OS_GENERAL_SERVICE_LINE_ID);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [migrationMissing, setMigrationMissing] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseReasonId, setPauseReasonId] = useState('break');
  const [pauseNote, setPauseNote] = useState('');
  const [otherActiveOsId, setOtherActiveOsId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded, serviceOrderId]);

  const live = useTickingLiveMs(
    session && session.serviceOrderId === serviceOrderId ? session : null
  );

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [mine, listed, pauseReasons, osServices] = await Promise.all([
        getMyActiveRdaWorkSession(),
        listRdaWorkSessions({ serviceOrderId }),
        getRdaWorkPauseReasons(),
        listRdaWorkOsServices(serviceOrderId).catch(() => null),
      ]);
      setReasons(pauseReasons);
      if (osServices) {
        setServiceOptions(osServices.services || []);
        setGeneralOption(osServices.generalOption || null);
      }
      const mineOnThisOs = listed.sessions
        .filter((s) => s.technicianUserId === technicianUserId)
        .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
      setOsSessions(mineOnThisOs);
      setMigrationMissing(false);

      if (mine && mine.serviceOrderId === serviceOrderId) {
        setSession(mine);
        setOtherActiveOsId(null);
        if (mine.budgetServiceLineId) setSelectedLineId(mine.budgetServiceLineId);
        else setSelectedLineId(OS_GENERAL_SERVICE_LINE_ID);
      } else if (mine) {
        setSession(mineOnThisOs[0] ?? null);
        setOtherActiveOsId(mine.serviceOrderId);
      } else {
        const activeHere = mineOnThisOs.find(
          (s) => s.status === 'running' || s.status === 'paused'
        );
        setSession(activeHere ?? mineOnThisOs[0] ?? null);
        setOtherActiveOsId(null);
        if (activeHere?.budgetServiceLineId) setSelectedLineId(activeHere.budgetServiceLineId);
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
        setError('Você já tem uma sessão ativa em outra OS. Finalize-a antes de iniciar nesta.');
      } else if (err.code === 'RDA_ACTIVE_OTHER_SERVICE') {
        setError('Finalize ou pause o apontamento do serviço atual antes de iniciar outro.');
      } else if (err.code === 'RDA_STAGE_NOT_ALLOWED') {
        setError(
          err.message ||
            'Esta etapa da OS não permite apontamento produtivo. Use Avaliação técnica ou Em serviço.'
        );
      } else {
        setError(err.message || 'Operação falhou.');
      }
    } finally {
      setBusy(false);
    }
  };

  const selectedReason = reasons.find((r) => r.id === pauseReasonId);
  const selectedService =
    selectedLineId === OS_GENERAL_SERVICE_LINE_ID
      ? generalOption
      : serviceOptions.find((s) => s.lineId === selectedLineId) || null;

  if (loading) {
    return (
      <div
        className={`mb-4 rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 ${className}`.trim()}
      >
        <div className="flex items-center gap-2 text-[13px] text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando controle de tempo…
        </div>
      </div>
    );
  }

  if (migrationMissing) {
    return (
      <div
        className={`mb-4 rounded-2xl border border-dashed border-amber-400/70 bg-amber-50 px-4 py-3 text-[13px] text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100 ${className}`.trim()}
      >
        Controle de tempo disponível após aplicar as migrations RDA de sessões no ambiente de teste.
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
    : displaySession?.liveProductiveMs ?? displaySession?.productiveMs ?? 0;
  const pausedDisplayMs = mineActiveHere
    ? live.pausedMs
    : displaySession?.livePausedMs ?? displaySession?.pausedMs ?? 0;

  const finishedOnOs = osSessions.filter((s) => s.status === 'finished');
  const allowedKind = timeKindAllowedForOsStatus(serviceOrderStatus);
  const canClockNow = !!allowedKind;
  const activeKind = displaySession?.timeKind || allowedKind || 'execution';
  const canResumeHere =
    displaySession?.status === 'paused' &&
    canStartOrResumeTimeKind(displaySession.timeKind || 'execution', serviceOrderStatus);

  const sessionsForIndicators = new Map(
    osSessions.map((s) => [s.id, s] as const)
  );
  if (displaySession) sessionsForIndicators.set(displaySession.id, displaySession);
  const indicators = aggregateOsTimeIndicators(
    [...sessionsForIndicators.values()].map((s) => {
      const isLive = mineActiveHere && displaySession?.id === s.id;
      return {
        timeKind: s.timeKind || 'execution',
        liveProductiveMs: isLive ? live.productiveMs : s.liveProductiveMs ?? s.productiveMs,
        livePausedMs: isLive ? live.pausedMs : s.livePausedMs ?? s.pausedMs,
      };
    })
  );

  const statusLabel =
    displaySession?.status === 'running'
      ? `Em ${timeKindLabel(activeKind).toLowerCase()}`
      : displaySession?.status === 'paused'
        ? 'Pausado'
        : displaySession?.status === 'finished'
          ? 'Finalizado'
          : 'Sem sessão';

  const statusChipClass =
    displaySession?.status === 'running'
      ? 'bg-emerald-500 text-white'
      : displaySession?.status === 'paused'
        ? 'bg-[#FFD60A] text-zinc-900'
        : displaySession?.status === 'finished'
          ? 'bg-zinc-800 text-white'
          : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200';

  const canChangeService = !mineActiveHere;

  return (
    <div
      className={`mb-4 overflow-hidden rounded-2xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 ${className}`.trim()}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 bg-zinc-950 px-4 py-3 text-left text-white transition-colors hover:bg-zinc-900"
        aria-expanded={expanded}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#FFD60A]">
            Meu tempo nesta OS
          </p>
          <p className="truncate text-[13px] text-zinc-300">{technicianDisplayName}</p>
          {!expanded ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${statusChipClass}`}>
                {statusLabel}
              </span>
              <span className="font-mono text-[13px] tabular-nums text-zinc-200">
                {formatDurationHms(productiveDisplayMs)}
              </span>
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Clock3 className="h-5 w-5 text-[#FFD60A]" aria-hidden />
          <ChevronDown
            className={`h-4 w-4 text-zinc-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
            aria-hidden
          />
        </div>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-zinc-100 p-4 dark:border-zinc-800">
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

          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Serviço
            </label>
            <select
              value={selectedLineId}
              disabled={!canChangeService || busy}
              onChange={(e) => setSelectedLineId(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-[#FAFAFA] px-3 py-2.5 text-[14px] text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
            >
              <option value={OS_GENERAL_SERVICE_LINE_ID}>
                {generalOption?.description || 'Apontamento geral da OS'}
              </option>
              {serviceOptions.map((s) => (
                <option key={s.lineId} value={s.lineId}>
                  {s.description}
                </option>
              ))}
            </select>
            {serviceOptions.length === 0 ? (
              <p className="mt-1 text-[12px] text-zinc-500">
                Sem serviços no orçamento — use o apontamento geral da OS.
              </p>
            ) : null}
            {!canChangeService ? (
              <p className="mt-1 text-[12px] text-zinc-500">
                Pause ou finalize para trocar de serviço.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-zinc-950 px-3 py-3 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#FFD60A]">
                Execução
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums tracking-tight sm:text-xl">
                {formatDurationHms(indicators.executionMs)}
              </p>
            </div>
            <div className="rounded-xl bg-sky-950 px-3 py-3 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-300">
                Diagnóstico
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums tracking-tight sm:text-xl">
                {formatDurationHms(indicators.diagnosticMs)}
              </p>
            </div>
            <div className="rounded-xl bg-[#FAFAFA] px-3 py-3 dark:bg-zinc-950">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Pausas
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-zinc-900 dark:text-white sm:text-xl">
                {formatDurationHms(indicators.pausedMs)}
              </p>
            </div>
            <div className="rounded-xl bg-[#FAFAFA] px-3 py-3 dark:bg-zinc-950">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Total OS
              </p>
              <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-zinc-900 dark:text-white sm:text-xl">
                {formatDurationHms(indicators.totalOsMs)}
              </p>
            </div>
          </div>

          {mineActiveHere ? (
            <p className="text-[12px] text-zinc-500">
              Sessão atual ({timeKindLabel(activeKind)}):{' '}
              <span className="font-mono tabular-nums text-zinc-800 dark:text-zinc-200">
                {formatDurationHms(productiveDisplayMs)}
              </span>
              {' · '}
              pausa{' '}
              <span className="font-mono tabular-nums">{formatDurationHms(pausedDisplayMs)}</span>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-lg px-2.5 py-1 text-[11px] font-bold uppercase ${statusChipClass}`}>
              {statusLabel}
            </span>
            {allowedKind ? (
              <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                Etapa: {timeKindLabel(allowedKind)}
              </span>
            ) : (
              <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                Etapa de espera — sem tempo produtivo
              </span>
            )}
            {displaySession?.budgetServiceDescription ? (
              <span className="truncate text-[12px] text-zinc-500">
                {displaySession.budgetServiceDescription}
              </span>
            ) : null}
          </div>

          <p className="text-[12px] text-zinc-500">
            Diagnóstico só em Avaliação técnica; execução só em Em serviço. Sair da etapa pausa
            automaticamente. Finalizar o cronômetro não muda a etapa da OS.
          </p>

          <div className="flex flex-wrap gap-2">
            {!mineActiveHere ? (
              <button
                type="button"
                disabled={busy || !!otherActiveOsId || !canClockNow}
                onClick={() =>
                  void run(async () => {
                    const res = await startRdaWorkSession({
                      serviceOrderId,
                      budgetId: selectedService?.budgetId ?? null,
                      budgetServiceDescription:
                        selectedLineId === OS_GENERAL_SERVICE_LINE_ID
                          ? null
                          : selectedService?.description ?? null,
                      budgetServiceLineId:
                        selectedLineId === OS_GENERAL_SERVICE_LINE_ID ? null : selectedLineId,
                      clientMutationId: newClientMutationId(),
                    });
                    setSession(res.session);
                  })
                }
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#FFD60A] px-4 text-[14px] font-semibold text-zinc-900 disabled:opacity-50 sm:flex-none"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {allowedKind ? `Iniciar ${timeKindLabel(allowedKind).toLowerCase()}` : 'Iniciar'}
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
                disabled={busy || !canResumeHere}
                title={
                  canResumeHere
                    ? undefined
                    : 'Volte a OS para a etapa correta para retomar sem perder o histórico.'
                }
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
                  if (
                    !window.confirm(
                      'Finalizar seu tempo neste serviço? A etapa do pátio/lab não será alterada.'
                    )
                  ) {
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

          {finishedOnOs.length > 0 ? (
            <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setHistoryOpen((v) => !v)}
                className="flex w-full items-center justify-between text-[13px] font-semibold text-zinc-700 dark:text-zinc-200"
              >
                Histórico nesta OS ({finishedOnOs.length})
                <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
              </button>
              {historyOpen ? (
                <ul className="mt-2 max-h-40 space-y-1.5 overflow-y-auto">
                  {finishedOnOs.slice(0, 12).map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[#FAFAFA] px-2.5 py-2 text-[12px] dark:bg-zinc-950"
                    >
                      <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">
                        {s.budgetServiceDescription || 'Apontamento geral'}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-zinc-900 dark:text-white">
                        {formatDurationHms(s.productiveMs)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
