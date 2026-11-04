import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import {
  ackQualityMeeting,
  createQualityMeeting,
  getQualityMeetings,
} from '../../services/apiService';
import type { QualityRadarTechnicianOption } from '../../utils/qualityRadarTechnicians';
import { hub } from './hubTheme';
import { HubEmptyState, HubPreparedNote, HubSectionHeader } from './HubPrimitives';

const KIND_OPTIONS = [
  { id: 'individual', label: 'Reunião individual' },
  { id: 'feedback_positive', label: 'Feedback positivo' },
  { id: 'feedback_corrective', label: 'Orientação corretiva' },
  { id: 'follow_up', label: 'Acompanhamento' },
  { id: 'other', label: 'Outro' },
] as const;

export function MeetingsPanel({
  employees,
}: {
  employees: QualityRadarTechnicianOption[];
}) {
  const [selectedId, setSelectedId] = useState<string>(employees[0]?.id ?? '');
  const [meetings, setMeetings] = useState<Array<Record<string, unknown>>>([]);
  const [migrationPending, setMigrationPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<string>('individual');
  const [title, setTitle] = useState('');
  const [agenda, setAgenda] = useState('');
  const [observations, setObservations] = useState('');
  const [outcomes, setOutcomes] = useState('');
  const [participants, setParticipants] = useState('');
  const [followUpAt, setFollowUpAt] = useState('');
  const [commitment, setCommitment] = useState('');

  const selected = useMemo(
    () => employees.find((e) => e.id === selectedId) ?? employees[0] ?? null,
    [employees, selectedId]
  );

  const load = useCallback(async () => {
    if (!selected) {
      setMeetings([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getQualityMeetings({
        systemUserId: selected.systemUserId || undefined,
        technicianId: selected.workshopTechnicianId || undefined,
      });
      if (data.code === 'QUALITY_RADAR_PHASE2_MIGRATION_REQUIRED') {
        setMigrationPending(true);
        setMeetings([]);
      } else {
        setMigrationPending(false);
        setMeetings(data.meetings || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar reuniões.');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  useEffect(() => {
    void load();
  }, [load]);

  if (migrationPending) {
    return (
      <div className="space-y-4">
        <HubSectionHeader
          title="Reuniões e Feedbacks"
          subtitle="Registros históricos com pauta, encaminhamentos e ciência."
        />
        <HubPreparedNote>
          Migration Fase 2 pendente. Aplique `20261104190000_quality_radar_phase2_career.sql` em
          homologação com autorização.
        </HubPreparedNote>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HubSectionHeader
        title="Reuniões e Feedbacks"
        subtitle="Individuais, feedbacks, orientações e compromissos — ciência não exige concordância."
      />

      <select
        className={hub.select}
        value={selected?.id || ''}
        onChange={(e) => setSelectedId(e.target.value)}
      >
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
          </option>
        ))}
      </select>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {!selected ? (
        <HubEmptyState
          icon={Calendar}
          title="Selecione um funcionário"
          description="Cada reunião gera histórico com pauta, observações e encaminhamentos."
        />
      ) : (
        <>
          <div className={`${hub.surface} p-4 space-y-3`}>
            <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
              Novo registro
            </p>
            <select className={hub.select} value={kind} onChange={(e) => setKind(e.target.value)}>
              {KIND_OPTIONS.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.label}
                </option>
              ))}
            </select>
            <input
              className={hub.input}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título"
            />
            <textarea
              className={hub.input}
              rows={2}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Pauta"
            />
            <textarea
              className={hub.input}
              rows={2}
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Observações"
            />
            <textarea
              className={hub.input}
              rows={2}
              value={outcomes}
              onChange={(e) => setOutcomes(e.target.value)}
              placeholder="Encaminhamentos / resultados"
            />
            <input
              className={hub.input}
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              placeholder="Participantes"
            />
            <input
              type="date"
              className={hub.input}
              value={followUpAt}
              onChange={(e) => setFollowUpAt(e.target.value)}
            />
            <input
              className={hub.input}
              value={commitment}
              onChange={(e) => setCommitment(e.target.value)}
              placeholder="Compromisso assumido (opcional)"
            />
            <button
              type="button"
              className={hub.btnPrimary}
              disabled={busy || !title.trim()}
              onClick={() => {
                setBusy(true);
                void createQualityMeeting({
                  personName: selected.name,
                  systemUserId: selected.systemUserId,
                  workshopTechnicianId: selected.workshopTechnicianId,
                  kind,
                  title: title.trim(),
                  agenda,
                  observations,
                  outcomes,
                  participants,
                  followUpAt: followUpAt || undefined,
                  commitments: commitment.trim()
                    ? [{ description: commitment.trim(), ownerName: selected.name }]
                    : [],
                })
                  .then(() => {
                    setTitle('');
                    setAgenda('');
                    setObservations('');
                    setOutcomes('');
                    setParticipants('');
                    setFollowUpAt('');
                    setCommitment('');
                    return load();
                  })
                  .catch((e) =>
                    setError(e instanceof Error ? e.message : 'Falha ao salvar reunião.')
                  )
                  .finally(() => setBusy(false));
              }}
            >
              Registrar
            </button>
          </div>

          <div className={`${hub.surface} p-4`}>
            <p className="mb-3 text-[14px] font-semibold text-zinc-900 dark:text-white">
              Histórico
            </p>
            {loading ? (
              <p className={hub.muted}>Carregando…</p>
            ) : meetings.length === 0 ? (
              <p className={`text-[13px] ${hub.muted}`}>Nenhuma reunião registrada.</p>
            ) : (
              <ul className="space-y-3">
                {meetings.map((m) => (
                  <li
                    key={String(m.id)}
                    className="rounded-xl border border-zinc-200 px-3 py-3 dark:border-zinc-800"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[13px] font-semibold text-zinc-900 dark:text-white">
                          {String(m.title || KIND_OPTIONS.find((k) => k.id === m.kind)?.label)}
                        </p>
                        <p className={`text-[12px] ${hub.muted}`}>
                          {KIND_OPTIONS.find((k) => k.id === m.kind)?.label} ·{' '}
                          {m.heldAt
                            ? new Date(String(m.heldAt)).toLocaleString('pt-BR')
                            : ''}
                        </p>
                      </div>
                      {!m.employeeAckAt ? (
                        <button
                          type="button"
                          className={hub.btnGhost}
                          disabled={busy}
                          onClick={() => {
                            setBusy(true);
                            void ackQualityMeeting(String(m.id), 'Ciência registrada pela gestão')
                              .then(() => load())
                              .catch((e) =>
                                setError(
                                  e instanceof Error ? e.message : 'Falha ao registrar ciência.'
                                )
                              )
                              .finally(() => setBusy(false));
                          }}
                        >
                          Registrar ciência
                        </button>
                      ) : (
                        <span className={`${hub.badge} ${hub.accentSoft}`}>Ciência ok</span>
                      )}
                    </div>
                    {m.agenda ? (
                      <p className={`mt-2 text-[12px] ${hub.muted}`}>Pauta: {String(m.agenda)}</p>
                    ) : null}
                    {m.observations ? (
                      <p className={`mt-1 text-[12px] ${hub.muted}`}>
                        Obs.: {String(m.observations)}
                      </p>
                    ) : null}
                    {m.outcomes ? (
                      <p className={`mt-1 text-[12px] ${hub.muted}`}>
                        Encaminhamentos: {String(m.outcomes)}
                      </p>
                    ) : null}
                    {m.followUpAt ? (
                      <p className={`mt-1 text-[12px] ${hub.muted}`}>
                        Revisão: {String(m.followUpAt)}
                      </p>
                    ) : null}
                    {Array.isArray(m.commitments) && (m.commitments as unknown[]).length > 0 ? (
                      <ul className="mt-2 list-disc pl-5 text-[12px] text-zinc-700 dark:text-zinc-300">
                        {(m.commitments as Array<{ description: string; status: string }>).map(
                          (c, idx) => (
                            <li key={`${m.id}-c-${idx}`}>
                              {c.description} ({c.status})
                            </li>
                          )
                        )}
                      </ul>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
