import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Loader2, Plus, RefreshCw } from 'lucide-react';
import {
  createRdaProductivityTask,
  fetchRdaProductivityPeople,
  fetchRdaProductivitySummary,
  fetchRdaProductivityTask,
  fetchRdaProductivityTasks,
  updateRdaProductivityTask,
  type RdaProductivityPerson,
  type RdaProductivitySummary,
  type RdaProductivityTask,
  type RdaProductivityTaskPriority,
  type RdaProductivityTaskStatus,
} from '../../services/apiService';
import { RdaSettingsChildShell } from './RdaSettingsChildShell';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
  focusTaskId?: string | null;
};

const PRIORITY_LABEL: Record<RdaProductivityTaskPriority, string> = {
  low: 'Baixa',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

const STATUS_LABEL: Record<RdaProductivityTaskStatus, string> = {
  pending: 'Pendente',
  in_progress: 'Em andamento',
  done: 'Concluída',
  cancelled: 'Cancelada',
};

function formatDue(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const RdaProductivityPanel: React.FC<Props> = ({
  isOpen,
  onClose,
  desktopShell,
  focusTaskId = null,
}) => {
  const [summary, setSummary] = useState<RdaProductivitySummary | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [tasks, setTasks] = useState<RdaProductivityTask[]>([]);
  const [people, setPeople] = useState<RdaProductivityPerson[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'open' | 'all' | 'done'>('open');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ task: RdaProductivityTask; events: unknown[] } | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftAssignee, setDraftAssignee] = useState('');
  const [draftPriority, setDraftPriority] = useState<RdaProductivityTaskPriority>('normal');
  const [draftDue, setDraftDue] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [sum, list, peeps] = await Promise.all([
        fetchRdaProductivitySummary(),
        fetchRdaProductivityTasks({
          status: statusFilter === 'done' ? 'done' : statusFilter,
          assigneeUserId: assigneeFilter || undefined,
          priority: priorityFilter || undefined,
          overdueOnly: false,
          limit: 60,
        }),
        fetchRdaProductivityPeople(),
      ]);
      setSummary(sum.summary);
      setCanManage(sum.canManage);
      setTasks(list);
      setPeople(peeps);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar produtividade.');
      setSummary(null);
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, assigneeFilter, priorityFilter]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  useEffect(() => {
    if (!isOpen || !focusTaskId) return;
    setSelectedId(focusTaskId);
  }, [isOpen, focusTaskId]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    void fetchRdaProductivityTask(selectedId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Falha ao abrir tarefa.');
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const indicators = useMemo(() => {
    if (!summary) return null;
    return [
      { label: 'Abertas', value: summary.openCount },
      { label: 'Atrasadas', value: summary.overdueCount },
      { label: 'A vencer', value: summary.dueSoonCount },
      { label: 'Concluídas (7d)', value: summary.doneLast7d },
    ];
  }, [summary]);

  const setStatus = async (taskId: string, status: RdaProductivityTaskStatus) => {
    setBusy(true);
    setError(null);
    try {
      const task = await updateRdaProductivityTask(taskId, { status });
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setDetail((prev) => (prev && prev.task.id === task.id ? { ...prev, task } : prev));
      void load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao atualizar.');
    } finally {
      setBusy(false);
    }
  };

  const createTask = async () => {
    if (!draftTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const person = people.find((p) => p.id === draftAssignee);
      await createRdaProductivityTask({
        title: draftTitle.trim(),
        priority: draftPriority,
        assigneeUserId: draftAssignee || null,
        assigneeName: person?.displayName || null,
        dueAt: draftDue ? new Date(draftDue).toISOString() : null,
        clientRequestId: `ui-${Date.now()}`,
      });
      setDraftTitle('');
      setDraftAssignee('');
      setDraftDue('');
      setCreating(false);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao criar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <RdaSettingsChildShell
      isOpen={isOpen}
      onClose={onClose}
      desktopShell={desktopShell}
      ariaLabel="Assistente de Produtividade"
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
            <h1 className="text-[17px] font-semibold tracking-tight">Assistente de Produtividade</h1>
            <p className="text-[12px] text-zinc-500">
              Tarefas, prazos e delegação — sem alterar OS, estoque ou financeiro
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

      <div className="relative mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <button
              type="button"
              onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-2.5 py-1.5 text-[12px] font-semibold text-white dark:bg-amber-500 dark:text-zinc-900"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova tarefa
            </button>
          ) : null}
        </div>

        {indicators ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {indicators.map((it) => (
              <div
                key={it.label}
                className="rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]"
              >
                <p className="text-[11px] font-medium text-zinc-500">{it.label}</p>
                <p className="mt-0.5 text-[20px] font-semibold tabular-nums text-zinc-900 dark:text-white">
                  {it.value}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        {creating ? (
          <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-3 dark:border-white/10 dark:bg-zinc-950">
            <input
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              placeholder="Título da tarefa"
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 text-[13px] outline-none focus:border-zinc-400 dark:border-white/10 dark:bg-zinc-900"
            />
            <div className="flex flex-wrap gap-2">
              <select
                value={draftAssignee}
                onChange={(e) => setDraftAssignee(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 text-[12px] dark:border-white/10 dark:bg-zinc-900"
              >
                <option value="">Responsável (eu)</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.displayName}
                  </option>
                ))}
              </select>
              <select
                value={draftPriority}
                onChange={(e) => setDraftPriority(e.target.value as RdaProductivityTaskPriority)}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 text-[12px] dark:border-white/10 dark:bg-zinc-900"
              >
                {(Object.keys(PRIORITY_LABEL) as RdaProductivityTaskPriority[]).map((k) => (
                  <option key={k} value={k}>
                    {PRIORITY_LABEL[k]}
                  </option>
                ))}
              </select>
              <input
                type="datetime-local"
                value={draftDue}
                onChange={(e) => setDraftDue(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-2 py-2 text-[12px] dark:border-white/10 dark:bg-zinc-900"
              />
            </div>
            <button
              type="button"
              disabled={busy || !draftTitle.trim()}
              onClick={() => void createTask()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-40 dark:bg-amber-500 dark:text-zinc-900"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              Criar
            </button>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-[12px] dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="open">Abertas</option>
            <option value="all">Todas</option>
            <option value="done">Concluídas</option>
          </select>
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-[12px] dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Todos os responsáveis</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-xl border border-zinc-200 bg-white px-2 py-1.5 text-[12px] dark:border-white/10 dark:bg-zinc-900"
          >
            <option value="">Prioridade</option>
            {(Object.keys(PRIORITY_LABEL) as RdaProductivityTaskPriority[]).map((k) => (
              <option key={k} value={k}>
                {PRIORITY_LABEL[k]}
              </option>
            ))}
          </select>
        </div>

        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </p>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto custom-scrollbar">
          {loading && tasks.length === 0 ? (
            <div className="flex justify-center py-10 text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : tasks.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-zinc-500">Nenhuma tarefa neste filtro.</p>
          ) : (
            <ul className="space-y-2">
              {tasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(t.id)}
                    className={`w-full rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                      t.overdue
                        ? 'border-red-300/70 bg-red-50/80 dark:border-red-500/30 dark:bg-red-500/10'
                        : 'border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-white/10 dark:bg-zinc-950 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                        {t.title}
                      </p>
                      <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                        {PRIORITY_LABEL[t.priority]}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-zinc-500">
                      {STATUS_LABEL[t.status]}
                      {t.assigneeName ? ` · ${t.assigneeName}` : ''}
                      {' · '}
                      prazo {formatDue(t.dueAt)}
                      {t.overdue ? ' · atrasada' : ''}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {detail ? (
          <div className="absolute inset-0 z-10 flex flex-col bg-zinc-100 dark:bg-zinc-950">
            <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-white">
                  {detail.task.title}
                </p>
                <p className="text-[11px] text-zinc-500">
                  {STATUS_LABEL[detail.task.status]} · {PRIORITY_LABEL[detail.task.priority]}
                </p>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 custom-scrollbar">
              {detail.task.description ? (
                <p className="text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-200">
                  {detail.task.description}
                </p>
              ) : null}
              <dl className="grid grid-cols-2 gap-2 text-[12px]">
                <div>
                  <dt className="text-zinc-500">Responsável</dt>
                  <dd className="font-medium text-zinc-900 dark:text-white">
                    {detail.task.assigneeName || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Solicitante</dt>
                  <dd className="font-medium text-zinc-900 dark:text-white">
                    {detail.task.requesterName || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Prazo</dt>
                  <dd className="font-medium text-zinc-900 dark:text-white">
                    {formatDue(detail.task.dueAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-zinc-500">Referência</dt>
                  <dd className="font-medium text-zinc-900 dark:text-white">
                    {detail.task.refLabel || '—'}
                  </dd>
                </div>
              </dl>
              {detail.task.notes ? (
                <p className="rounded-xl bg-zinc-50 px-3 py-2 text-[12px] text-zinc-600 dark:bg-white/[0.04] dark:text-zinc-300">
                  {detail.task.notes}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                {detail.task.status !== 'in_progress' && detail.task.status !== 'done' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus(detail.task.id, 'in_progress')}
                    className="rounded-xl border border-zinc-200 px-3 py-1.5 text-[12px] font-semibold dark:border-white/10"
                  >
                    Em andamento
                  </button>
                ) : null}
                {detail.task.status !== 'done' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus(detail.task.id, 'done')}
                    className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white"
                  >
                    Concluir
                  </button>
                ) : null}
                {canManage && detail.task.status !== 'cancelled' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void setStatus(detail.task.id, 'cancelled')}
                    className="rounded-xl border border-red-200 px-3 py-1.5 text-[12px] font-semibold text-red-700 dark:border-red-500/30 dark:text-red-300"
                  >
                    Cancelar
                  </button>
                ) : null}
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                  Histórico
                </p>
                <ul className="space-y-1.5">
                  {(detail.events as Array<Record<string, unknown>>).map((ev) => (
                    <li
                      key={String(ev.id)}
                      className="rounded-lg border border-zinc-100 px-2.5 py-1.5 text-[11px] text-zinc-600 dark:border-white/10 dark:text-zinc-300"
                    >
                      <span className="font-semibold">{String(ev.event_type)}</span>
                      {ev.actor_name ? ` · ${String(ev.actor_name)}` : ''}
                      {ev.to_status ? ` → ${String(ev.to_status)}` : ''}
                      <span className="block text-zinc-400">
                        {ev.created_at ? formatDue(String(ev.created_at)) : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </RdaSettingsChildShell>
  );
};
