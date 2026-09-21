import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bug, Loader2, Send, Trash2, X } from 'lucide-react';
import {
  deleteSupportChatMessage,
  getSupportChatMessages,
  markSupportChatRead,
  postSupportChatMessage,
  type SupportChatMe,
  type SupportChatMessage,
} from '../services/apiService';
import { ModalPortal } from './ui/ModalPortal';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { resolveIosModalOverlayClass } from './ui/iosModalStyles';
import { useDesktopShellLayout } from './ui/DesktopShellContext';

type SupportBugsChatModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onUnreadChange?: (count: number) => void;
};

function isMine(msg: SupportChatMessage, me: SupportChatMe | null): boolean {
  if (!me) return false;
  if (me.readerKey === 'admin') return msg.authorKind === 'admin';
  return !!msg.authorUserId && msg.authorUserId === me.readerKey;
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return 'Hoje';
  if (sameDay(d, yesterday)) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
}

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function SupportBugsChatModal({ isOpen, onClose, onUnreadChange }: SupportBugsChatModalProps) {
  const isDesktopShell = useDesktopShellLayout();
  const [messages, setMessages] = useState<SupportChatMessage[]>([]);
  const [me, setMe] = useState<SupportChatMe | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useRegisterModalOpen(isOpen);

  const scrollToBottom = useCallback((smooth = true) => {
    endRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
  }, []);

  const loadMessages = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      setError(null);
      try {
        const data = await getSupportChatMessages();
        setMessages(data.messages);
        setMe(data.me);
        await markSupportChatRead().catch(() => {});
        onUnreadChange?.(0);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Não foi possível carregar o chat.');
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [onUnreadChange]
  );

  useEffect(() => {
    if (!isOpen) return;
    void loadMessages();
  }, [isOpen, loadMessages]);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setInterval(() => {
      void loadMessages({ silent: true });
    }, 8000);
    return () => window.clearInterval(t);
  }, [isOpen, loadMessages]);

  useEffect(() => {
    if (!isOpen || loading) return;
    scrollToBottom(messages.length > 8);
  }, [isOpen, loading, messages.length, scrollToBottom]);

  useEffect(() => {
    if (!isOpen) return;
    const t = window.setTimeout(() => textareaRef.current?.focus(), 180);
    return () => window.clearTimeout(t);
  }, [isOpen]);

  const grouped = useMemo(() => {
    const out: Array<{ key: string; label: string; items: SupportChatMessage[] }> = [];
    for (const msg of messages) {
      const key = dayKey(msg.createdAt);
      const last = out[out.length - 1];
      if (last && last.key === key) {
        last.items.push(msg);
      } else {
        out.push({ key, label: formatDayLabel(msg.createdAt), items: [msg] });
      }
    }
    return out;
  }, [messages]);

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const created = await postSupportChatMessage(text);
      setDraft('');
      setMessages((prev) => (prev.some((m) => m.id === created.id) ? prev : [...prev, created]));
      onUnreadChange?.(0);
      window.setTimeout(() => scrollToBottom(true), 40);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao enviar.');
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleDelete = async (id: string) => {
    if (!me?.canDelete || deletingId) return;
    if (!window.confirm('Apagar este registro permanentemente?')) return;
    setDeletingId(id);
    setError(null);
    try {
      await deleteSupportChatMessage(id);
      setMessages((prev) => prev.filter((m) => m.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao apagar.');
    } finally {
      setDeletingId(null);
    }
  };

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  if (!isOpen) return null;

  const canReply = !!me?.canReply;
  const placeholder = canReply
    ? 'Responder sobre o bug ou erro…'
    : 'Descreva o bug ou erro do sistema…';

  return (
    <ModalPortal manageBackLayer onRequestClose={onClose}>
      <div
        className={resolveIosModalOverlayClass(isDesktopShell, 'z-[130]')}
        role="dialog"
        aria-modal="true"
        aria-label="Bugs e erros do sistema"
        onClick={onClose}
      >
        <div
          className={`flex w-full flex-col overflow-hidden border-0 bg-[#ECE5DD] shadow-none dark:bg-zinc-950 ${
            isDesktopShell
              ? 'h-[min(720px,88vh)] max-w-lg rounded-[1.75rem]'
              : 'h-[min(860px,94vh)] max-w-lg rounded-[1.75rem]'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <header className="flex shrink-0 items-center gap-3 border-b border-black/5 bg-[#075E54] px-4 py-3.5 text-white dark:border-white/10 dark:bg-emerald-950">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/15">
              <Bug className="h-5 w-5" strokeWidth={2.2} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[17px] font-semibold leading-tight tracking-tight">
                Bugs e erros
              </h2>
              <p className="truncate text-[12px] text-white/75">
                {canReply
                  ? 'Você pode responder e apagar registros'
                  : 'Registre falhas para a equipe analisar'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </header>

          <div
            ref={listRef}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 custom-scrollbar"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, rgba(255,255,255,0.35) 0, transparent 42%), radial-gradient(circle at 80% 0%, rgba(0,0,0,0.04) 0, transparent 40%)',
            }}
          >
            {loading && messages.length === 0 ? (
              <div className="flex h-full min-h-[12rem] items-center justify-center gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando conversa…
              </div>
            ) : null}

            {!loading && messages.length === 0 && !error ? (
              <div className="mx-auto mt-10 max-w-sm rounded-2xl bg-white/80 px-4 py-5 text-center shadow-sm dark:bg-zinc-900/80">
                <p className="text-[14px] font-semibold text-zinc-800 dark:text-zinc-100">
                  Nenhum registro ainda
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Use o campo abaixo para reportar bugs, travamentos ou comportamentos estranhos do
                  sistema.
                </p>
              </div>
            ) : null}

            {grouped.map((group) => (
              <div key={group.key} className="mb-3 space-y-2">
                <div className="sticky top-0 z-[1] flex justify-center py-1">
                  <span className="rounded-full bg-white/90 px-3 py-1 text-[11px] font-semibold capitalize text-zinc-600 shadow-sm dark:bg-zinc-800/95 dark:text-zinc-300">
                    {group.label}
                  </span>
                </div>
                {group.items.map((msg) => {
                  const mine = isMine(msg, me);
                  const color = msg.authorColor || '#64748b';
                  return (
                    <div
                      key={msg.id}
                      className={`group flex items-end gap-2 ${mine ? 'justify-end' : 'justify-start'}`}
                    >
                      {!mine ? (
                        <div
                          className="mb-0.5 flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-bold text-white shadow-sm"
                          style={{ backgroundColor: color }}
                          title={msg.authorName}
                        >
                          {msg.authorPhotoUrl ? (
                            <img src={msg.authorPhotoUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            initials(msg.authorName)
                          )}
                        </div>
                      ) : null}

                      <div className={`max-w-[78%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                        <div
                          className={`relative rounded-2xl px-3 py-2 shadow-sm ${
                            mine ? 'rounded-br-md text-white' : 'rounded-bl-md bg-white text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                          }`}
                          style={mine ? { backgroundColor: color } : undefined}
                        >
                          {!mine ? (
                            <div className="mb-0.5 flex items-center gap-1.5">
                              <span className="text-[12px] font-bold" style={{ color }}>
                                {msg.authorName}
                              </span>
                              {msg.isStaffReply ? (
                                <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                                  Equipe
                                </span>
                              ) : (
                                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
                                  Bug
                                </span>
                              )}
                            </div>
                          ) : msg.isStaffReply ? (
                            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-white/80">
                              Resposta da equipe
                            </div>
                          ) : null}

                          <p className="whitespace-pre-wrap break-words text-[14px] leading-snug">
                            {msg.body}
                          </p>
                          <div
                            className={`mt-1 flex items-center gap-2 ${
                              mine ? 'justify-end text-white/80' : 'justify-end text-zinc-400'
                            }`}
                          >
                            <time className="text-[10px] tabular-nums" dateTime={msg.createdAt}>
                              {formatMessageTime(msg.createdAt)}
                            </time>
                          </div>

                          {me?.canDelete ? (
                            <button
                              type="button"
                              onClick={() => void handleDelete(msg.id)}
                              disabled={deletingId === msg.id}
                              className={`absolute -top-2 ${mine ? '-left-2' : '-right-2'} flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/90 text-white opacity-0 shadow transition group-hover:opacity-100 disabled:opacity-60`}
                              title="Apagar registro"
                              aria-label="Apagar registro"
                            >
                              {deletingId === msg.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            <div ref={endRef} />
          </div>

          {error ? (
            <div className="shrink-0 border-t border-red-200/70 bg-red-50 px-4 py-2 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-950/40 dark:text-red-200">
              {error}
            </div>
          ) : null}

          <form
            onSubmit={(e) => void handleSend(e)}
            className="shrink-0 border-t border-black/5 bg-[#F0F2F5] px-3 py-3 dark:border-white/10 dark:bg-zinc-900"
          >
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={onComposerKeyDown}
                rows={1}
                maxLength={4000}
                placeholder={placeholder}
                className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border-0 bg-white px-3.5 py-2.5 text-[14px] text-zinc-900 shadow-sm outline-none ring-0 placeholder:text-zinc-400 focus:ring-2 focus:ring-[#075E54]/25 dark:bg-zinc-800 dark:text-zinc-50 dark:placeholder:text-zinc-500"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#075E54] text-white shadow-md transition hover:bg-[#0b7a6d] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-emerald-700"
                aria-label="Enviar"
              >
                {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1.5 px-1 text-[10px] text-zinc-500 dark:text-zinc-400">
              Enter envia · Shift+Enter quebra linha
              {me?.canDelete ? ' · Passe o mouse na mensagem para apagar' : ''}
            </p>
          </form>
        </div>
      </div>
    </ModalPortal>
  );
}
