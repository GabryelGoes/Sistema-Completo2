import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, RotateCcw, Search, Trash2, X } from 'lucide-react';
import {
  approveRdaKnowledge,
  fetchRdaKnowledgeDetail,
  fetchRdaKnowledgeList,
  fetchRdaKnowledgeMeta,
  proposeRdaKnowledge,
  purgeRdaKnowledge,
  rejectRdaKnowledgePending,
  restoreRdaKnowledge,
  retireRdaKnowledge,
  type RdaKnowledgeListItem,
} from '../../services/apiService';

type TabId = 'approved' | 'pending_approval' | 'draft' | 'retired';

const TABS: { id: TabId; label: string }[] = [
  { id: 'approved', label: 'Aprovados' },
  { id: 'pending_approval', label: 'Aguardando' },
  { id: 'draft', label: 'Rascunhos' },
  { id: 'retired', label: 'Retirados' },
];

type Props = {
  isOpen: boolean;
  onClose: () => void;
  desktopShell?: boolean;
};

function lifecycleQuery(tab: TabId): string {
  return tab;
}

export const RdaKnowledgeMemoryPanel: React.FC<Props> = ({
  isOpen,
  onClose,
  desktopShell,
}) => {
  const [tab, setTab] = useState<TabId>('approved');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<RdaKnowledgeListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof fetchRdaKnowledgeDetail>> | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formContent, setFormContent] = useState('');
  const [formCategory, setFormCategory] = useState('managerial_guidance');
  const [categories, setCategories] = useState<string[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchRdaKnowledgeList({
        lifecycle: lifecycleQuery(tab),
        q: q.trim() || undefined,
        includeContent: true,
      });
      setItems(res.items || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar memória.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [tab, q]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
    void fetchRdaKnowledgeMeta()
      .then((m) => setCategories(m.categories || []))
      .catch(() => undefined);
  }, [isOpen, load]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    void fetchRdaKnowledgeDetail(selectedId)
      .then(setDetail)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : 'Falha ao abrir item.');
      });
  }, [selectedId]);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) || detail?.item || null,
    [items, selectedId, detail]
  );

  if (!isOpen) return null;

  async function runAction(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      await fn();
      setMsg(okMsg);
      await load();
      if (selectedId) {
        const d = await fetchRdaKnowledgeDetail(selectedId);
        setDetail(d);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha na operação.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={`fixed inset-0 z-[70] flex min-h-0 flex-col bg-zinc-100 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-100 ${
        desktopShell ? '' : ''
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="Memória do RDA"
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
            <h1 className="text-[17px] font-semibold tracking-tight">Memória do RDA</h1>
            <p className="text-[12px] text-zinc-500">
              Conhecimentos versionados — só o aprovado vale como regra oficial
            </p>
          </div>
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="rounded-lg bg-zinc-900 px-3 py-2 text-[13px] font-semibold text-white dark:bg-white dark:text-zinc-900"
          >
            Nova proposta
          </button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-5xl min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-3 lg:flex-row">
        <section className="flex min-h-0 w-full flex-col lg:w-[42%]">
          <div className="mb-2 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setSelectedId(null);
                }}
                className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold ${
                  tab === t.id
                    ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                    : 'bg-white text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mb-2 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <Search className="h-4 w-4 text-zinc-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void load();
              }}
              placeholder="Buscar título ou chave"
              className="w-full bg-transparent text-[14px] outline-none"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {loading ? (
              <p className="p-4 text-[13px] text-zinc-500">Carregando…</p>
            ) : items.length === 0 ? (
              <p className="p-4 text-[13px] text-zinc-500">Nenhum item nesta lista.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className={`w-full px-3 py-3 text-left transition-colors ${
                        selectedId === item.id ? 'bg-zinc-50 dark:bg-zinc-800/60' : ''
                      }`}
                    >
                      <p className="text-[14px] font-semibold">{item.title}</p>
                      <p className="mt-0.5 text-[11px] text-zinc-500">
                        {item.knowledgeKey} · v{item.approvedVersion || 0}
                        {item.pendingVersion ? ` · proposta v${item.pendingVersion}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
          {error ? <p className="mb-2 text-[13px] text-red-600">{error}</p> : null}
          {msg ? <p className="mb-2 text-[13px] text-emerald-700 dark:text-emerald-400">{msg}</p> : null}
          {!selected ? (
            <p className="text-[13px] text-zinc-500">Selecione um conhecimento.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-[18px] font-semibold tracking-tight">{selected.title}</h2>
                <p className="text-[12px] text-zinc-500">
                  {selected.knowledgeKey} · {selected.category} · {selected.lifecycle}
                </p>
              </div>

              {selected.approvedContent ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Versão aprovada (v{selected.approvedVersion})
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed">
                    {selected.approvedContent}
                  </p>
                </div>
              ) : (
                <p className="text-[13px] text-zinc-500">Sem versão aprovada vigente.</p>
              )}

              {selected.pendingContent ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                    Aguardando aprovação (v{selected.pendingVersion})
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed">
                    {selected.pendingContent}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {selected.lifecycle === 'pending_approval' || selected.pendingVersion ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          () =>
                            approveRdaKnowledge(selected.id, {
                              expectedUpdatedAt: selected.updatedAt,
                            }),
                          'Aprovado.'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-[12px] font-semibold text-white"
                    >
                      <Check className="h-3.5 w-3.5" /> Aprovar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          () =>
                            rejectRdaKnowledgePending(selected.id, {
                              expectedUpdatedAt: selected.updatedAt,
                              reason: 'Rejeitado na Memória do RDA',
                            }),
                          'Proposta rejeitada.'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-[12px] font-semibold dark:border-zinc-600"
                    >
                      <X className="h-3.5 w-3.5" /> Rejeitar proposta
                    </button>
                  </>
                ) : null}
                {selected.lifecycle !== 'retired' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void runAction(
                        () =>
                          retireRdaKnowledge(selected.id, {
                            expectedUpdatedAt: selected.updatedAt,
                            reason: 'Retirado na Memória do RDA',
                          }),
                        'Retirado de uso.'
                      )
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-[12px] font-semibold dark:border-zinc-600"
                  >
                    Retirar
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void runAction(
                          () =>
                            restoreRdaKnowledge(selected.id, {
                              expectedUpdatedAt: selected.updatedAt,
                              reason: 'Restaurado',
                            }),
                          'Restaurado.'
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-2 text-[12px] font-semibold dark:border-zinc-600"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const key = window.prompt(
                          'Exclusão definitiva. Digite o knowledge_key para confirmar:',
                          selected.knowledgeKey
                        );
                        const reason = window.prompt('Motivo da exclusão (obrigatório):');
                        if (!key || !reason) return;
                        void runAction(
                          () =>
                            purgeRdaKnowledge(selected.id, {
                              confirmKey: key,
                              reason,
                              expectedUpdatedAt: selected.updatedAt,
                            }),
                          'Excluído definitivamente.'
                        ).then(() => setSelectedId(null));
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-2 text-[12px] font-semibold text-red-700 dark:border-red-800 dark:text-red-300"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Excluir
                    </button>
                  </>
                )}
              </div>

              {detail?.versions?.length ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
                    Histórico de versões
                  </p>
                  <ul className="mt-2 space-y-2">
                    {detail.versions.map((v) => (
                      <li
                        key={v.id}
                        className="rounded-lg border border-zinc-100 px-3 py-2 text-[12px] dark:border-zinc-800"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">v{v.version_number}</span>
                          <span className="text-zinc-500">
                            {new Date(v.created_at).toLocaleString('pt-BR', {
                              timeZone: 'America/Sao_Paulo',
                            })}
                          </span>
                        </div>
                        {v.change_reason ? (
                          <p className="mt-1 text-zinc-500">{v.change_reason}</p>
                        ) : null}
                        {selected.lifecycle === 'retired' || selected.approvedVersion > 0 ? (
                          <button
                            type="button"
                            disabled={busy}
                            className="mt-2 text-[11px] font-semibold text-zinc-700 underline dark:text-zinc-300"
                            onClick={() =>
                              void runAction(
                                () =>
                                  restoreRdaKnowledge(selected.id, {
                                    fromVersion: v.version_number,
                                    expectedUpdatedAt: selected.updatedAt,
                                    reason: `Restaurar conteúdo da v${v.version_number}`,
                                  }),
                                `Proposta criada a partir da v${v.version_number}.`
                              )
                            }
                          >
                            Propor restauração desta versão
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {composeOpen ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl dark:bg-zinc-900">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[16px] font-semibold">Nova proposta</h3>
              <button type="button" onClick={() => setComposeOpen(false)} aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Título"
                className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-[14px] dark:border-zinc-700"
              />
              <select
                value={formCategory}
                onChange={(e) => setFormCategory(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-[14px] dark:border-zinc-700"
              >
                {(categories.length
                  ? categories
                  : ['managerial_guidance', 'operational_rule', 'procedure_technical']
                ).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                placeholder="Conteúdo da orientação / procedimento"
                rows={6}
                className="w-full rounded-lg border border-zinc-200 bg-transparent px-3 py-2 text-[14px] dark:border-zinc-700"
              />
              <button
                type="button"
                disabled={busy || !formTitle.trim() || !formContent.trim()}
                onClick={() =>
                  void runAction(async () => {
                    await proposeRdaKnowledge({
                      title: formTitle.trim(),
                      content: formContent.trim(),
                      category: formCategory,
                      submitForApproval: true,
                      provenance: { source: 'admin_ui' },
                    });
                    setComposeOpen(false);
                    setFormTitle('');
                    setFormContent('');
                    setTab('pending_approval');
                  }, 'Proposta enviada para aprovação.')
                }
                className="w-full rounded-lg bg-zinc-900 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-zinc-900"
              >
                Enviar para aprovação
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
