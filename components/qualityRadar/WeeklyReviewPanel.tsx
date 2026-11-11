import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, Loader2, MessageSquare, Send, Sparkles, Users, X } from 'lucide-react';
import {
  createQualityWeeklyReview,
  decideQualityWeeklyDraft,
  getQualityWeeklyReview,
  listQualityWeeklyReviews,
  postQualityWeeklyReviewChat,
  saveQualityWeeklyDraft,
  type QualityWeeklyDraft,
  type QualityWeeklyReview,
} from '../../services/apiService';
import type { QualityRadarTechnicianOption } from '../../utils/qualityRadarTechnicians';
import { hub } from './hubTheme';
import { INTERVIEW_TOPICS } from '../../services/qualityRadar/weeklyReviewDefaults';

type ChatLine = { role: 'user' | 'assistant'; content: string };

type Props = {
  employees: QualityRadarTechnicianOption[];
};

/**
 * Revisão Semanal com RDA — conversa gerencial no Radar.
 * Amarelo / preto / branco; tablet e desktop.
 */
export function WeeklyReviewPanel({ employees }: Props) {
  const [reviews, setReviews] = useState<QualityWeeklyReview[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    review: QualityWeeklyReview;
    messages: ChatLine[];
    drafts: QualityWeeklyDraft[];
    progress: { covered: string[]; remaining: string[]; progressPct: number };
  } | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [draftForm, setDraftForm] = useState({
    weekSummary: '',
    strengths: '',
    difficulties: '',
    observedSkills: '',
    evolution: '',
    recommendedActions: '',
    proposedGoals: '',
    followUps: '',
  });
  const [showDraft, setShowDraft] = useState(false);
  const [startPersonKey, setStartPersonKey] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await listQualityWeeklyReviews();
      setReviews(res.reviews || []);
      if (res.code === 'MIGRATION_PENDING') {
        setListError(res.error || 'Migration da Fase 3 pendente.');
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : 'Falha ao listar revisões.');
      setReviews([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const loadReviewDetail = useCallback(async (id: string) => {
    const data = await getQualityWeeklyReview(id);
    setActiveId(id);
    setDetail({
      review: data.review,
      messages: (data.messages || []).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: String(m.content || ''),
      })),
      drafts: data.drafts || [],
      progress: data.progress,
    });
    const d = data.drafts?.[0];
    if (d) {
      setDraftForm({
        weekSummary: d.weekSummary || '',
        strengths: d.strengths || '',
        difficulties: d.difficulties || '',
        observedSkills: d.observedSkills || '',
        evolution: d.evolution || '',
        recommendedActions: d.recommendedActions || '',
        proposedGoals: d.proposedGoals || '',
        followUps: d.followUps || '',
      });
      setShowDraft(true);
    } else {
      setShowDraft(false);
    }
    return data;
  }, []);

  const openReview = useCallback(
    async (id: string) => {
      setBusy(true);
      setChatError(null);
      try {
        await loadReviewDetail(id);
      } catch (e) {
        setChatError(e instanceof Error ? e.message : 'Falha ao abrir revisão.');
      } finally {
        setBusy(false);
      }
    },
    [loadReviewDetail]
  );

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [detail?.messages, busy]);

  const startReview = async (scope: 'person' | 'team') => {
    setBusy(true);
    setChatError(null);
    try {
      const emp =
        scope === 'person' ? employees.find((e) => e.id === startPersonKey) : null;
      if (scope === 'person' && !emp) {
        setChatError('Selecione um funcionário.');
        setBusy(false);
        return;
      }
      const created = await createQualityWeeklyReview({
        scope,
        personName: emp?.name,
        systemUserId: emp?.systemUserId ?? null,
        workshopTechnicianId: emp?.workshopTechnicianId ?? null,
      });
      await loadList();
      await loadReviewDetail(created.review.id);
      const kick =
        scope === 'team'
          ? 'Vamos iniciar a revisão semanal da equipe. Quais pontos gerais você vê nesta semana e por quem devemos começar?'
          : `Vamos revisar o desempenho de ${emp!.name} nesta semana. Consulte o dossiê e comece com um resumo objetivo + a primeira pergunta.`;
      setDetail((prev) =>
        prev
          ? { ...prev, messages: [...prev.messages, { role: 'user', content: kick }] }
          : prev
      );
      try {
        const res = await postQualityWeeklyReviewChat(created.review.id, { message: kick });
        setDetail((prev) =>
          prev
            ? {
                ...prev,
                messages: [
                  ...prev.messages,
                  { role: 'assistant', content: res.assistantMessage || '' },
                ],
                progress: res.progress || prev.progress,
                review: {
                  ...prev.review,
                  progressPct: res.progress?.progressPct ?? prev.review.progressPct,
                },
              }
            : prev
        );
      } catch (chatErr) {
        setChatError(
          chatErr instanceof Error
            ? chatErr.message
            : 'Revisão criada, mas a RDA não respondeu (verifique se a flag está ativa).'
        );
      }
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Falha ao iniciar revisão.');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!activeId || !input.trim() || busy) return;
    const message = input.trim();
    setInput('');
    setBusy(true);
    setChatError(null);
    setDetail((prev) =>
      prev
        ? { ...prev, messages: [...prev.messages, { role: 'user', content: message }] }
        : prev
    );
    try {
      const res = await postQualityWeeklyReviewChat(activeId, { message });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              messages: [
                ...prev.messages,
                { role: 'assistant', content: res.assistantMessage || '' },
              ],
              progress: res.progress || prev.progress,
              review: {
                ...prev.review,
                progressPct: res.progress?.progressPct ?? prev.review.progressPct,
              },
            }
          : prev
      );
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Falha no chat.');
    } finally {
      setBusy(false);
    }
  };

  const saveDraft = async () => {
    if (!activeId) return;
    setBusy(true);
    try {
      const res = await saveQualityWeeklyDraft(activeId, { ...draftForm, generatedBy: 'leader' });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              drafts: [res.draft, ...prev.drafts.filter((d) => d.id !== res.draft.id)],
              review: { ...prev.review, status: 'draft_ready' },
            }
          : prev
      );
      setShowDraft(true);
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Falha ao salvar rascunho.');
    } finally {
      setBusy(false);
    }
  };

  const decide = async (decision: 'approve' | 'reject') => {
    if (!activeId) return;
    setBusy(true);
    try {
      const res = await decideQualityWeeklyDraft(activeId, { decision });
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              drafts: [res.draft, ...prev.drafts.filter((d) => d.id !== res.draft.id)],
              review: {
                ...prev.review,
                status: decision === 'approve' ? 'approved' : 'rejected',
              },
            }
          : prev
      );
      await loadList();
    } catch (e) {
      setChatError(e instanceof Error ? e.message : 'Falha na decisão.');
    } finally {
      setBusy(false);
    }
  };

  const inProgress = useMemo(
    () => reviews.filter((r) => r.status === 'in_progress' || r.status === 'draft_ready'),
    [reviews]
  );

  if (activeId && detail) {
    const pct = detail.progress?.progressPct ?? detail.review.progressPct ?? 0;
    return (
      <div className="flex min-h-[70vh] flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={hub.btnGhost} onClick={() => setActiveId(null)}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          <div className="min-w-0 flex-1">
            <h2 className={`truncate text-[17px] font-semibold ${hub.ink}`}>
              {detail.review.personName || 'Revisão'}
            </h2>
            <p className={`text-[12px] ${hub.muted}`}>
              {detail.review.weekFrom} → {detail.review.weekTo} · {detail.review.status}
            </p>
          </div>
          <button type="button" className={hub.btnSecondary} onClick={() => setShowDraft((v) => !v)}>
            Rascunho
          </button>
        </div>

        <div className={`${hub.surface} p-3`}>
          <div className="mb-1.5 flex items-center justify-between text-[12px] font-semibold">
            <span>Progresso da entrevista</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className={`h-full ${hub.accentBar} transition-all`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {INTERVIEW_TOPICS.map((t) => {
              const done = (detail.progress?.covered || []).includes(t.id);
              return (
                <span
                  key={t.id}
                  className={`${hub.badge} ${
                    done
                      ? 'bg-[#F5D00B]/35 text-zinc-900'
                      : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {t.label}
                </span>
              );
            })}
          </div>
        </div>

        {(detail.review.incompleteSignals || []).length > 0 && (
          <div className={`${hub.surfaceInset} px-3 py-2 text-[12px] text-zinc-600 dark:text-zinc-300`}>
            <strong className="font-semibold text-zinc-800 dark:text-zinc-100">Lacunas: </strong>
            {(detail.review.incompleteSignals || []).join(' · ')}
          </div>
        )}

        <div className="grid flex-1 gap-3 lg:grid-cols-[1fr_minmax(280px,360px)]">
          <div className={`${hub.surface} flex min-h-[420px] flex-col overflow-hidden`}>
            <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto p-4">
              {detail.messages.length === 0 && (
                <p className={`text-[13px] ${hub.muted}`}>
                  Envie a primeira mensagem para a RDA consultar o dossiê e iniciar a conversa — uma
                  pergunta por vez.
                </p>
              )}
              {detail.messages.map((m, i) => (
                <div
                  key={`${m.role}-${i}`}
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
                    m.role === 'user'
                      ? 'ml-auto bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                      : 'mr-auto border border-zinc-200 bg-[#FAFAFA] text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100'
                  }`}
                >
                  {m.role === 'assistant' && (
                    <div className="mb-1 flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide text-zinc-500">
                      <Sparkles className="h-3 w-3 text-[#F5D00B]" /> RDA
                    </div>
                  )}
                  <div className="whitespace-pre-wrap">{m.content}</div>
                </div>
              ))}
              {busy && (
                <div className={`flex items-center gap-2 text-[13px] ${hub.muted}`}>
                  <Loader2 className="h-4 w-4 animate-spin" /> RDA consultando registros…
                </div>
              )}
            </div>
            {chatError && (
              <div className="border-t border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                {chatError}
              </div>
            )}
            <div className="flex gap-2 border-t border-zinc-200 p-3 dark:border-zinc-800">
              <input
                className={hub.input}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Responda à RDA…"
                disabled={busy || detail.review.status === 'approved'}
              />
              <button
                type="button"
                className={hub.btnPrimary}
                disabled={busy || !input.trim()}
                onClick={() => void send()}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>

          {showDraft && (
            <div className={`${hub.surface} flex max-h-[70vh] flex-col overflow-hidden p-3`}>
              <h3 className="mb-2 text-[14px] font-semibold">Rascunho semanal</h3>
              <p className={`mb-3 text-[11px] ${hub.muted}`}>
                Editável. Aprovar não promove nem pune automaticamente.
              </p>
              <div className="flex-1 space-y-2 overflow-y-auto pr-1">
                {(
                  [
                    ['weekSummary', 'Resumo'],
                    ['strengths', 'Pontos fortes'],
                    ['difficulties', 'Dificuldades'],
                    ['observedSkills', 'Habilidades'],
                    ['evolution', 'Evolução'],
                    ['recommendedActions', 'Ações'],
                    ['proposedGoals', 'Metas'],
                    ['followUps', 'Acompanhamentos'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-[11px] font-semibold text-zinc-500">
                    {label}
                    <textarea
                      className={`${hub.input} mt-1 min-h-[64px] text-[13px]`}
                      value={draftForm[key]}
                      onChange={(e) => setDraftForm((f) => ({ ...f, [key]: e.target.value }))}
                    />
                  </label>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={hub.btnSecondary} disabled={busy} onClick={() => void saveDraft()}>
                  Salvar rascunho
                </button>
                <button type="button" className={hub.btnPrimary} disabled={busy} onClick={() => void decide('approve')}>
                  <Check className="h-4 w-4" /> Aprovar
                </button>
                <button type="button" className={hub.btnGhost} disabled={busy} onClick={() => void decide('reject')}>
                  <X className="h-4 w-4" /> Rejeitar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`${hub.surface} p-4 md:p-5`}>
        <div className="flex items-start gap-3">
          <div className={`rounded-xl ${hub.accent} p-2.5`}>
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-semibold tracking-tight">Revisão Semanal com RDA</h2>
            <p className={`mt-1 text-[13px] ${hub.muted}`}>
              A RDA consulta o histórico do Radar, conversa com você uma pergunta por vez e gera um
              rascunho para editar e aprovar. Decisões continuam humanas.
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
          <label className="min-w-0 flex-1 text-[12px] font-semibold text-zinc-500">
            Funcionário
            <select
              className={`${hub.select} mt-1 w-full`}
              value={startPersonKey}
              onChange={(e) => setStartPersonKey(e.target.value)}
            >
              <option value="">Selecione…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={hub.btnPrimary}
            disabled={busy || !startPersonKey}
            onClick={() => void startReview('person')}
          >
            <Sparkles className="h-4 w-4" /> Iniciar revisão
          </button>
          <button
            type="button"
            className={hub.btnSecondary}
            disabled={busy}
            onClick={() => void startReview('team')}
          >
            <Users className="h-4 w-4" /> Equipe inteira
          </button>
        </div>
        {listError && (
          <p className="mt-3 text-[12px] text-amber-700 dark:text-amber-300">{listError}</p>
        )}
      </div>

      <div className={`${hub.surface} overflow-hidden`}>
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h3 className="text-[14px] font-semibold">Em andamento / recentes</h3>
        </div>
        {loadingList ? (
          <div className={`flex items-center gap-2 p-4 text-[13px] ${hub.muted}`}>
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : reviews.length === 0 ? (
          <p className={`p-4 text-[13px] ${hub.muted}`}>Nenhuma revisão ainda.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {(inProgress.length ? inProgress : reviews).map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-zinc-50 dark:hover:bg-zinc-900/60"
                  onClick={() => void openReview(r.id)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{r.personName}</div>
                    <div className={`text-[12px] ${hub.muted}`}>
                      {r.weekFrom} → {r.weekTo} · {r.status}
                    </div>
                  </div>
                  <div className="w-20">
                    <div className="mb-1 text-right text-[11px] font-bold">{r.progressPct}%</div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className={`h-full ${hub.accentBar}`} style={{ width: `${r.progressPct}%` }} />
                    </div>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
