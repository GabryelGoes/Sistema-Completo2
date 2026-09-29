import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, Eye, Loader2, Pencil, SmilePlus, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkBreaks from 'remark-breaks';
import type { BoardAction } from '../../types';
import { ModalPortal } from '../ui/ModalPortal';

export const COMMENT_REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '✅'] as const;

export type OsCommentBubbleProps = {
  action: BoardAction;
  mine: boolean;
  avatar: {
    useLogo: boolean;
    photoUrl?: string | null;
    initial: string;
    avatarClass: string;
  };
  currentReaderKey: string;
  requiresExplicitRead: boolean;
  markdownComponents: any;
  busy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMarkRead: () => Promise<void> | void;
  onToggleReaction: (emoji: string) => Promise<void> | void;
  isEditing: boolean;
  onSaveEdit: (text: string) => void;
  onCancelEdit: () => void;
};

function formatViewTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const OsCommentBubble: React.FC<OsCommentBubbleProps> = ({
  action,
  mine,
  avatar,
  currentReaderKey,
  requiresExplicitRead,
  markdownComponents,
  busy,
  onEdit,
  onDelete,
  onMarkRead,
  onToggleReaction,
  isEditing,
  onSaveEdit,
  onCancelEdit,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sheet, setSheet] = useState<'menu' | 'views' | 'react' | null>(null);
  const [marking, setMarking] = useState(false);
  const [reacting, setReacting] = useState(false);
  const [editDraft, setEditDraft] = useState(action.data.text);

  useEffect(() => {
    if (isEditing) setEditDraft(action.data.text);
  }, [isEditing, action.data.text]);

  const views = action.data.views ?? [];
  const reactions = action.data.reactions ?? [];
  const viewedByMe = views.some((v) => v.reader_key === currentReaderKey);
  const readByOthers = views.filter((v) => v.reader_key !== currentReaderKey);
  const isRead = readByOthers.length > 0;

  const reactionGroups = useMemo(() => {
    const map = new Map<string, { emoji: string; count: number; mine: boolean }>();
    for (const r of reactions) {
      const prev = map.get(r.emoji);
      const isMine = r.reactor_key === currentReaderKey;
      if (prev) {
        prev.count += 1;
        if (isMine) prev.mine = true;
      } else {
        map.set(r.emoji, { emoji: r.emoji, count: 1, mine: isMine });
      }
    }
    return [...map.values()];
  }, [currentReaderKey, reactions]);

  const openMenu = () => {
    setSheet('menu');
    setMenuOpen(true);
  };

  const closeMenu = () => {
    setMenuOpen(false);
    setSheet(null);
  };

  const handleMarkRead = async () => {
    if (marking) return;
    setMarking(true);
    try {
      await onMarkRead();
      closeMenu();
    } finally {
      setMarking(false);
    }
  };

  const handleToggleReaction = async (emoji: string) => {
    if (reacting) return;
    setReacting(true);
    try {
      await onToggleReaction(emoji);
      closeMenu();
    } finally {
      setReacting(false);
    }
  };

  return (
    <div className={`group/comment flex w-full gap-2 ${mine ? 'flex-row-reverse' : 'flex-row'}`}>
      {!mine ? (
        <div
          className={`relative mt-0.5 flex h-8 w-8 shrink-0 overflow-hidden rounded-full ${
            avatar.useLogo ? 'bg-brand-yellow' : ''
          }`}
        >
          {avatar.useLogo ? (
            <img
              src="/logo.png"
              alt="Rei do ABS"
              className="absolute inset-0 size-full min-h-0 min-w-0 object-cover object-center"
            />
          ) : avatar.photoUrl ? (
            <img
              src={avatar.photoUrl}
              alt={action.memberCreator.fullName}
              className="absolute inset-0 size-full min-h-0 min-w-0 object-cover object-center"
            />
          ) : (
            <div
              className={`relative z-[1] flex size-full items-center justify-center rounded-full text-[11px] font-bold ${avatar.avatarClass}`}
            >
              {avatar.initial}
            </div>
          )}
        </div>
      ) : (
        <div className="w-1 shrink-0" aria-hidden />
      )}

      <div className={`flex min-w-0 max-w-[min(100%,22rem)] flex-1 flex-col ${mine ? 'items-end' : 'items-start'}`}>
        {!mine ? (
          <div className="mb-0.5 flex max-w-full items-baseline gap-2 px-1">
            <span className="truncate text-[12px] font-semibold text-zinc-700 dark:text-zinc-200">
              {action.memberCreator.fullName}
            </span>
            <span className="shrink-0 text-[10px] text-zinc-500 dark:text-zinc-400">
              {new Date(action.date).toLocaleString('pt-BR', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ) : (
          <span className="mb-0.5 px-1 text-[10px] text-zinc-500 dark:text-zinc-400">
            {new Date(action.date).toLocaleString('pt-BR', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            })}
            {action.data.edited_at ? <span className="ml-1 italic">editada</span> : null}
          </span>
        )}

        {isEditing ? (
          <div className="w-full animate-in fade-in duration-200">
            <textarea
              className="mb-2 min-h-[100px] w-full max-w-full resize-y break-words rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm [overflow-wrap:anywhere] dark:border-white/10 dark:bg-zinc-900"
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              autoFocus
            />
            <div className={`flex items-center gap-2 ${mine ? 'justify-end' : ''}`}>
              <button
                type="button"
                onClick={() => onSaveEdit(editDraft)}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg bg-brand-yellow px-3 py-1.5 text-xs font-bold text-black hover:bg-[#fcd61e]"
              >
                {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                Salvar
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={busy}
                className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={openMenu}
              className={`max-w-full break-words px-3 py-2 text-left text-[14px] leading-relaxed [overflow-wrap:anywhere] transition active:scale-[0.99] ${
                mine
                  ? 'rounded-2xl rounded-br-md bg-[#D6EBFF] text-zinc-900 shadow-sm dark:bg-[#0A84FF] dark:text-white'
                  : 'rounded-2xl rounded-bl-md bg-slate-500 text-white shadow-sm dark:bg-slate-600 dark:text-zinc-50'
              }`}
            >
              <ReactMarkdown remarkPlugins={[remarkBreaks]} components={markdownComponents}>
                {action.data.text}
              </ReactMarkdown>
              {mine ? (
                <span className="mt-1 flex items-center justify-end gap-0.5">
                  <CheckCheck
                    className={`h-3.5 w-3.5 ${
                      isRead
                        ? 'text-[#53BDEB] dark:text-[#7DD3FC]'
                        : 'text-zinc-500/80 dark:text-white/55'
                    }`}
                    strokeWidth={2.4}
                    aria-label={isRead ? 'Lida' : 'Enviada'}
                  />
                </span>
              ) : null}
            </button>

            {reactionGroups.length > 0 ? (
              <div className={`mt-1 flex flex-wrap gap-1 px-0.5 ${mine ? 'justify-end' : 'justify-start'}`}>
                {reactionGroups.map((g) => (
                  <button
                    key={g.emoji}
                    type="button"
                    onClick={() => void handleToggleReaction(g.emoji)}
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[12px] transition ${
                      g.mine
                        ? 'border-[#007AFF]/40 bg-[#007AFF]/15 text-zinc-800 dark:text-zinc-100'
                        : 'border-zinc-200/80 bg-white/90 text-zinc-700 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-200'
                    }`}
                    title="Reagir"
                  >
                    <span>{g.emoji}</span>
                    {g.count > 1 ? (
                      <span className="text-[10px] font-semibold tabular-nums">{g.count}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}

            {!mine && requiresExplicitRead && !viewedByMe ? (
              <button
                type="button"
                disabled={marking || busy}
                onClick={() => void handleMarkRead()}
                className="mt-1 inline-flex items-center gap-1 rounded-lg bg-[#007AFF]/10 px-2 py-1 text-[11px] font-semibold text-[#007AFF] transition hover:bg-[#007AFF]/15 disabled:opacity-50"
              >
                {marking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                Marcar como lida
              </button>
            ) : null}
          </>
        )}
      </div>

      {menuOpen ? (
        <ModalPortal onRequestClose={closeMenu}>
          <div
            className="fixed inset-0 z-[240] flex items-end justify-center bg-black/45 p-3 sm:items-center"
            onClick={closeMenu}
            role="presentation"
          >
            <div
              className="w-full max-w-sm overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-zinc-900"
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Opções da mensagem"
            >
              <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-white/[0.08]">
                <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                  {sheet === 'views'
                    ? 'Visualizações'
                    : sheet === 'react'
                      ? 'Reagir'
                      : 'Mensagem'}
                </p>
                <button
                  type="button"
                  onClick={closeMenu}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-white/10"
                  aria-label="Fechar"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {sheet === 'menu' ? (
                <div className="flex flex-col p-2">
                  {mine ? (
                    <button
                      type="button"
                      onClick={() => setSheet('views')}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                    >
                      <Eye className="h-4 w-4 text-[#007AFF]" />
                      Ver quem visualizou
                      {readByOthers.length > 0 ? (
                        <span className="ml-auto text-[12px] tabular-nums text-zinc-500">
                          {readByOthers.length}
                        </span>
                      ) : null}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setSheet('react')}
                    className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                  >
                    <SmilePlus className="h-4 w-4 text-[#007AFF]" />
                    Reagir
                  </button>
                  {mine ? (
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        onEdit();
                      }}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-medium text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                    >
                      <Pencil className="h-4 w-4 text-[#007AFF]" />
                      Editar mensagem
                    </button>
                  ) : null}
                  {!mine && requiresExplicitRead && !viewedByMe ? (
                    <button
                      type="button"
                      disabled={marking}
                      onClick={() => void handleMarkRead()}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:text-zinc-100 dark:hover:bg-white/[0.06]"
                    >
                      {marking ? (
                        <Loader2 className="h-4 w-4 animate-spin text-[#007AFF]" />
                      ) : (
                        <CheckCheck className="h-4 w-4 text-[#007AFF]" />
                      )}
                      Marcar como lida
                    </button>
                  ) : null}
                  {mine ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        closeMenu();
                        onDelete();
                      }}
                      className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-[14px] font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10"
                    >
                      Excluir
                    </button>
                  ) : null}
                </div>
              ) : null}

              {sheet === 'views' ? (
                <div className="max-h-[50vh] overflow-y-auto p-2">
                  {readByOthers.length === 0 ? (
                    <p className="px-3 py-6 text-center text-[13px] text-zinc-500">
                      Ninguém visualizou ainda.
                    </p>
                  ) : (
                    readByOthers.map((v) => (
                      <div
                        key={`${v.reader_key}-${v.viewed_at}`}
                        className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[14px] font-semibold text-zinc-900 dark:text-white">
                            {v.reader_display_name || 'Usuário'}
                          </p>
                          <p className="text-[11px] text-zinc-500">{formatViewTime(v.viewed_at)}</p>
                        </div>
                        <CheckCheck className="h-4 w-4 shrink-0 text-[#53BDEB]" strokeWidth={2.4} />
                      </div>
                    ))
                  )}
                  <button
                    type="button"
                    onClick={() => setSheet('menu')}
                    className="mt-1 w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold text-[#007AFF] hover:bg-[#007AFF]/10"
                  >
                    Voltar
                  </button>
                </div>
              ) : null}

              {sheet === 'react' ? (
                <div className="p-4">
                  <div className="grid grid-cols-4 gap-2">
                    {COMMENT_REACTION_EMOJIS.map((emoji) => {
                      const active = reactions.some(
                        (r) => r.emoji === emoji && r.reactor_key === currentReaderKey
                      );
                      return (
                        <button
                          key={emoji}
                          type="button"
                          disabled={reacting}
                          onClick={() => void handleToggleReaction(emoji)}
                          className={`flex h-12 items-center justify-center rounded-2xl text-[22px] transition active:scale-95 disabled:opacity-50 ${
                            active
                              ? 'bg-[#007AFF]/15 ring-2 ring-[#007AFF]/35'
                              : 'bg-zinc-50 hover:bg-zinc-100 dark:bg-white/[0.06] dark:hover:bg-white/[0.1]'
                          }`}
                          aria-label={`Reagir ${emoji}`}
                        >
                          {emoji}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSheet('menu')}
                    className="mt-3 w-full rounded-xl px-3 py-2.5 text-[13px] font-semibold text-[#007AFF] hover:bg-[#007AFF]/10"
                  >
                    Voltar
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </ModalPortal>
      ) : null}
    </div>
  );
};
