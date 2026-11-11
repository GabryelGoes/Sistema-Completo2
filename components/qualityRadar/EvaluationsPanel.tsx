import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, Loader2 } from 'lucide-react';
import {
  deferRdaEvalRequest,
  dismissRdaEvalRequest,
  listRdaEvalRequests,
  submitRdaEvaluation,
  type RdaEvalRequest,
  type RdaEvalRequestStatus,
  type RdaEvalScores,
} from '../../services/apiService';
import { newClientMutationId } from '../../services/rdaIntelligence/workSessions/timing';
import { RDA_EVAL_COMPETENCY_LABELS } from '../../services/rdaIntelligence/evaluations/types';
import type { QualityRadarTechnicianOption } from '../../utils/qualityRadarTechnicians';
import { hub } from './hubTheme';
import { HubEmptyState, HubSectionHeader, HubStatCard } from './HubPrimitives';

const STATUS_LABEL: Record<RdaEvalRequestStatus, string> = {
  pending: 'Pendente',
  deferred: 'Adiada',
  evaluated: 'Avaliada',
  dismissed: 'Dispensada',
};

function formatMs(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function emptyScores(): RdaEvalScores {
  return {
    technicalQuality: 0,
    organization: 0,
    procedures: 0,
    autonomy: 0,
    communication: 0,
  };
}

function ScorePicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`${hub.surfaceInset} p-3`}>
      <p className="text-[12px] font-semibold text-zinc-900 dark:text-white">{label}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className={`h-9 w-9 rounded-lg text-[13px] font-bold tabular-nums transition ${
              value === n
                ? 'bg-[#F5D00B] text-zinc-900'
                : 'bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700'
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function EvaluationsPanel({
  employees,
  periodFrom,
  periodTo,
}: {
  employees: QualityRadarTechnicianOption[];
  periodFrom: string;
  periodTo: string;
}) {
  const [requests, setRequests] = useState<RdaEvalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [migrationPending, setMigrationPending] = useState(false);
  const [statusFilter, setStatusFilter] = useState<RdaEvalRequestStatus | ''>('pending');
  const [techFilter, setTechFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scores, setScores] = useState<RdaEvalScores>(emptyScores());
  const [positives, setPositives] = useState('');
  const [improvements, setImprovements] = useState('');
  const [generalNotes, setGeneralNotes] = useState('');
  const [deferNote, setDeferNote] = useState('');
  const [dismissReason, setDismissReason] = useState('');

  const techOptions = useMemo(
    () => employees.filter((e) => e.systemUserId),
    [employees]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { requests: rows } = await listRdaEvalRequests({
        status: statusFilter || undefined,
        technicianUserId: techFilter || undefined,
        from: periodFrom,
        to: periodTo,
      });
      setRequests(rows);
      setMigrationPending(false);
      if (selectedId && !rows.some((r) => r.id === selectedId)) {
        setSelectedId(rows[0]?.id ?? null);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Falha ao carregar avaliações.';
      if (/Migration|RDA_EVAL_MIGRATION/i.test(msg)) {
        setMigrationPending(true);
      }
      setError(msg);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, techFilter, periodFrom, periodTo, selectedId]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh on filters/period only
  }, [statusFilter, techFilter, periodFrom, periodTo]);

  const selected = requests.find((r) => r.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) return;
    if (selected.evaluation) {
      setScores(selected.evaluation.scores);
      setPositives(selected.evaluation.positives);
      setImprovements(selected.evaluation.improvements);
      setGeneralNotes(selected.evaluation.generalNotes);
    } else {
      setScores(emptyScores());
      setPositives('');
      setImprovements('');
      setGeneralNotes('');
    }
    setDeferNote('');
    setDismissReason('');
  }, [selected?.id, selected?.evaluation?.id]);

  const counts = useMemo(() => {
    // Contagens da lista filtrada por período/técnico (status vem do filtro da lista).
    return {
      shown: requests.length,
    };
  }, [requests]);

  const scoresComplete =
    scores.technicalQuality >= 1 &&
    scores.organization >= 1 &&
    scores.procedures >= 1 &&
    scores.autonomy >= 1 &&
    scores.communication >= 1;

  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Operação falhou.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Avaliações"
        subtitle="Fila gerencial após finalização do cronômetro. Dispensar não gera nota negativa. Não altera a etapa da OS."
      />

      {migrationPending ? (
        <p className="rounded-xl border border-dashed border-amber-400/70 bg-amber-50 px-4 py-3 text-[13px] text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-100">
          Aplique a migration{' '}
          <code className="text-[12px]">20261101250000_rda_managerial_evaluations.sql</code> na
          homologação para ativar a fila.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <HubStatCard label="Na lista" value={loading ? '—' : counts.shown} hint="Conforme filtros" />
        <HubStatCard
          label="Filtro"
          value={statusFilter ? STATUS_LABEL[statusFilter] : 'Todas'}
          hint="Situação"
        />
        <HubStatCard
          label="Período"
          value="Ativo"
          hint="Mesmo período do Radar"
        />
        <HubStatCard
          label="Notas"
          value="1–5"
          hint="Somente gerente autorizado"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['pending', 'Pendentes'],
            ['deferred', 'Adiadas'],
            ['evaluated', 'Avaliadas'],
            ['dismissed', 'Dispensadas'],
            ['', 'Todas'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={label}
            type="button"
            className={statusFilter === value ? hub.btnPrimary : hub.btnSecondary}
            onClick={() => setStatusFilter(value)}
          >
            {label}
          </button>
        ))}
        <select
          className={hub.select}
          value={techFilter}
          onChange={(e) => setTechFilter(e.target.value)}
        >
          <option value="">Todos os técnicos</option>
          {techOptions.map((t) => (
            <option key={t.id} value={t.systemUserId || ''}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={`${hub.surface} p-4`}>
          {loading ? (
            <p className={`flex items-center gap-2 text-[13px] ${hub.muted}`}>
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </p>
          ) : requests.length === 0 ? (
            <HubEmptyState
              icon={ClipboardCheck}
              title="Nenhuma solicitação neste filtro"
              description="Quando um mecânico finalizar o cronômetro, a solicitação aparece aqui para avaliação voluntária."
            />
          ) : (
            <ul className="max-h-[32rem] space-y-2 overflow-y-auto">
              {requests.map((r) => {
                const active = selectedId === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(r.id)}
                      className={`w-full rounded-xl px-3 py-3 text-left transition ${
                        active
                          ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                          : 'hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <p className="truncate text-[14px] font-semibold">
                        {r.technicianDisplayName || 'Técnico'}
                      </p>
                      <p
                        className={`mt-0.5 truncate text-[12px] ${
                          active ? 'text-white/70 dark:text-zinc-600' : hub.muted
                        }`}
                      >
                        {r.serviceDescription?.trim() || 'Serviço geral'} ·{' '}
                        {STATUS_LABEL[r.status]} · produtivo {formatMs(r.productiveMs)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className={`${hub.surface} space-y-4 p-4`}>
          {!selected ? (
            <HubEmptyState
              icon={ClipboardCheck}
              title="Selecione uma solicitação"
              description="Avaliar, adiar ou dispensar. Notas não são preenchidas por IA."
            />
          ) : (
            <>
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${hub.muted}`}>
                  {STATUS_LABEL[selected.status]}
                </p>
                <h3 className="mt-1 text-[20px] font-semibold text-zinc-900 dark:text-white">
                  {selected.technicianDisplayName || 'Técnico'}
                </h3>
                <p className={`mt-1 text-[13px] ${hub.muted}`}>
                  {selected.serviceDescription?.trim() || 'Serviço geral'}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <HubStatCard label="Produtivo" value={formatMs(selected.productiveMs)} />
                  <HubStatCard label="Pausado" value={formatMs(selected.pausedMs)} />
                </div>
                <p className={`mt-2 text-[12px] ${hub.muted}`}>
                  Sessão{' '}
                  {new Date(selected.sessionStartedAt).toLocaleString('pt-BR')} →{' '}
                  {new Date(selected.sessionEndedAt).toLocaleString('pt-BR')}
                </p>
              </div>

              {selected.status === 'evaluated' && selected.evaluation ? (
                <div className="space-y-3">
                  <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                    Avaliação de {selected.evaluation.evaluatorDisplayName}
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(RDA_EVAL_COMPETENCY_LABELS) as (keyof typeof RDA_EVAL_COMPETENCY_LABELS)[]).map(
                      (key) => {
                        const scoreKey =
                          key === 'technical_quality'
                            ? 'technicalQuality'
                            : key === 'organization'
                              ? 'organization'
                              : key === 'procedures'
                                ? 'procedures'
                                : key === 'autonomy'
                                  ? 'autonomy'
                                  : 'communication';
                        return (
                          <div key={key} className={`${hub.surfaceInset} px-3 py-2`}>
                            <p className="text-[12px] text-zinc-500">
                              {RDA_EVAL_COMPETENCY_LABELS[key]}
                            </p>
                            <p className="text-[18px] font-semibold tabular-nums">
                              {selected.evaluation!.scores[scoreKey]}/5
                            </p>
                          </div>
                        );
                      }
                    )}
                  </div>
                  {selected.evaluation.positives ? (
                    <div>
                      <p className="text-[12px] font-semibold">Pontos positivos</p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] text-zinc-700 dark:text-zinc-300">
                        {selected.evaluation.positives}
                      </p>
                    </div>
                  ) : null}
                  {selected.evaluation.improvements ? (
                    <div>
                      <p className="text-[12px] font-semibold">Pontos de melhoria</p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] text-zinc-700 dark:text-zinc-300">
                        {selected.evaluation.improvements}
                      </p>
                    </div>
                  ) : null}
                  {selected.evaluation.generalNotes ? (
                    <div>
                      <p className="text-[12px] font-semibold">Observações gerais</p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] text-zinc-700 dark:text-zinc-300">
                        {selected.evaluation.generalNotes}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {selected.status === 'dismissed' ? (
                <p className={`rounded-xl border border-dashed px-3 py-3 text-[13px] ${hub.muted}`}>
                  Dispensada
                  {selected.dismissedReason ? `: ${selected.dismissedReason}` : ''}. Não representa
                  nota negativa.
                </p>
              ) : null}

              {(selected.status === 'pending' || selected.status === 'deferred') && (
                <div className="space-y-3">
                  <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                    Avaliar por competências
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ScorePicker
                      label={RDA_EVAL_COMPETENCY_LABELS.technical_quality}
                      value={scores.technicalQuality}
                      disabled={busy}
                      onChange={(n) => setScores((s) => ({ ...s, technicalQuality: n }))}
                    />
                    <ScorePicker
                      label={RDA_EVAL_COMPETENCY_LABELS.organization}
                      value={scores.organization}
                      disabled={busy}
                      onChange={(n) => setScores((s) => ({ ...s, organization: n }))}
                    />
                    <ScorePicker
                      label={RDA_EVAL_COMPETENCY_LABELS.procedures}
                      value={scores.procedures}
                      disabled={busy}
                      onChange={(n) => setScores((s) => ({ ...s, procedures: n }))}
                    />
                    <ScorePicker
                      label={RDA_EVAL_COMPETENCY_LABELS.autonomy}
                      value={scores.autonomy}
                      disabled={busy}
                      onChange={(n) => setScores((s) => ({ ...s, autonomy: n }))}
                    />
                    <ScorePicker
                      label={RDA_EVAL_COMPETENCY_LABELS.communication}
                      value={scores.communication}
                      disabled={busy}
                      onChange={(n) => setScores((s) => ({ ...s, communication: n }))}
                    />
                  </div>
                  <textarea
                    className={hub.input}
                    rows={2}
                    placeholder="Pontos positivos"
                    value={positives}
                    disabled={busy}
                    onChange={(e) => setPositives(e.target.value)}
                  />
                  <textarea
                    className={hub.input}
                    rows={2}
                    placeholder="Pontos de melhoria"
                    value={improvements}
                    disabled={busy}
                    onChange={(e) => setImprovements(e.target.value)}
                  />
                  <textarea
                    className={hub.input}
                    rows={2}
                    placeholder="Observações gerais"
                    value={generalNotes}
                    disabled={busy}
                    onChange={(e) => setGeneralNotes(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={hub.btnPrimary}
                      disabled={busy || !scoresComplete}
                      onClick={() =>
                        void run(async () => {
                          await submitRdaEvaluation({
                            requestId: selected.id,
                            scores,
                            positives,
                            improvements,
                            generalNotes,
                            clientMutationId: newClientMutationId(),
                          });
                        })
                      }
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Salvar avaliação
                    </button>
                  </div>

                  <div className={`${hub.surfaceInset} space-y-2 p-3`}>
                    <p className="text-[13px] font-semibold">Adiar</p>
                    <input
                      className={hub.input}
                      placeholder="Nota do adiamento (opcional)"
                      value={deferNote}
                      disabled={busy}
                      onChange={(e) => setDeferNote(e.target.value)}
                    />
                    <button
                      type="button"
                      className={hub.btnSecondary}
                      disabled={busy || selected.status === 'deferred'}
                      onClick={() =>
                        void run(async () => {
                          await deferRdaEvalRequest({
                            requestId: selected.id,
                            note: deferNote,
                            clientMutationId: newClientMutationId(),
                          });
                        })
                      }
                    >
                      Adiar avaliação
                    </button>
                  </div>

                  <div className={`${hub.surfaceInset} space-y-2 p-3`}>
                    <p className="text-[13px] font-semibold">Dispensar</p>
                    <p className={`text-[12px] ${hub.muted}`}>
                      Voluntário. Não gera nota negativa nem punição.
                    </p>
                    <input
                      className={hub.input}
                      placeholder="Motivo (opcional)"
                      value={dismissReason}
                      disabled={busy}
                      onChange={(e) => setDismissReason(e.target.value)}
                    />
                    <button
                      type="button"
                      className={hub.btnSecondary}
                      disabled={busy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            'Dispensar esta avaliação? Isso não altera a OS e não gera nota negativa.'
                          )
                        ) {
                          return;
                        }
                        void run(async () => {
                          await dismissRdaEvalRequest({
                            requestId: selected.id,
                            reason: dismissReason,
                            clientMutationId: newClientMutationId(),
                          });
                        });
                      }}
                    >
                      Dispensar
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
