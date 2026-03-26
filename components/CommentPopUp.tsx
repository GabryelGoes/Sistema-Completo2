import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Sparkles } from 'lucide-react';
import type { Notification } from '../services/apiService';
import { addServiceOrderComment, getServiceOrderComments, getWorkshopSettings, type ServiceOrderComment } from '../services/apiService';
import {
  iosModalClose,
  iosModalInsetCard,
  iosModalShell,
  iosInput,
} from './ui/iosModalStyles';

interface CommentPopUpProps {
  notification: Notification;
  onClose: () => void;
  onReplySent?: () => void;
  /** Nome exibido como autor da resposta (admin = "Rei do ABS", técnico = nome do técnico) */
  replyAuthorName: string;
  /** Quem está respondendo: define para quem a notificação vai (admin → técnico do veículo; técnico → admin) */
  replyActor?: 'admin' | 'technician';
  /** Tema do sistema (preto, amarelo, branco) */
  theme?: 'light' | 'dark';
  /** Modo cinematográfico: embaçar placa no rótulo do veículo */
  blurPlates?: boolean;
}

function isReiDoAbs(name: string): boolean {
  return /rei\s*do\s*abs/i.test((name ?? '').trim());
}

/** Normaliza nome para comparação (quem enviou vs usuário atual). */
function normalizeAuthorName(name: string | null | undefined): string {
  return (name ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\u0300-\u036f/g, '');
}

export const CommentPopUp: React.FC<CommentPopUpProps> = ({ notification, onClose, onReplySent, replyAuthorName, replyActor, theme = 'dark', blurPlates = false }) => {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [conversation, setConversation] = useState<ServiceOrderComment[]>([]);
  const [loadingConversation, setLoadingConversation] = useState(true);
  const [adminPhotoUrlFallback, setAdminPhotoUrlFallback] = useState<string | null>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  const isDark = theme === 'dark';
  const titleClass = isDark ? 'text-white' : 'text-zinc-900';
  const subtitleClass = isDark ? 'text-zinc-400' : 'text-zinc-500';
  /** Bolha “outro” — vidro / cartão inset (estilo Mensagens iOS). */
  const bubbleIncoming = isDark
    ? 'border border-white/[0.08] bg-white/[0.07] text-zinc-100 shadow-[0_1px_0_rgba(255,255,255,0.06)_inset]'
    : 'border border-zinc-200/90 bg-white/90 text-zinc-900 shadow-sm';
  /** Bolha “eu” — azul iOS. */
  const bubbleOutgoing = 'bg-[#007AFF] text-white shadow-md shadow-blue-500/20';

  const p = notification.payload;
  const orderId = p.service_order_id;
  const model = p.vehicle_model?.trim() || 'Veículo';
  const customer = p.customer_name?.trim() || p.vehicle_plate || 'Cliente';
  const showBlurredPlate = blurPlates && !!p.vehicle_plate && !p.customer_name?.trim();
  const vehicleLabel = showBlurredPlate ? `${model} · ` : `${model} · ${customer}`;

  useEffect(() => {
    if (!orderId) {
      setConversation([]);
      setLoadingConversation(false);
      return;
    }
    setLoadingConversation(true);
    Promise.all([
      getServiceOrderComments(orderId),
      getWorkshopSettings().then((s) => s.adminPhotoUrl ?? null).catch(() => null),
    ]).then(([comments, adminPhoto]) => {
      setConversation(comments ?? []);
      setAdminPhotoUrlFallback(adminPhoto?.trim() || null);
    }).catch(() => setConversation([])).finally(() => setLoadingConversation(false));
  }, [orderId]);

  // Sempre exibir a última mensagem: rolar para o fim quando a conversa carrega ou atualiza
  useEffect(() => {
    if (loadingConversation || conversation.length === 0) return;
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [loadingConversation, conversation.length]);

  const getPhotoForAuthor = (c: ServiceOrderComment): string | null => {
    const url = c.author_photo_url?.trim() || null;
    if (url) return url;
    if (isReiDoAbs(c.author_display_name)) return adminPhotoUrlFallback;
    return null;
  };

  const lastComment = conversation.length > 0 ? conversation[conversation.length - 1] : null;
  const headerAuthor = lastComment?.author_display_name || p.author_display_name || 'Técnico';
  const headerPhotoUrl = lastComment ? getPhotoForAuthor(lastComment) : (p.author_photo_url?.trim() || (isReiDoAbs(p.author_display_name ?? '') ? adminPhotoUrlFallback : null));
  const headerInitial = headerAuthor.slice(0, 1).toUpperCase();

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId || !reply.trim() || sending) return;
    setSending(true);
    try {
      await addServiceOrderComment(orderId, reply.trim(), replyAuthorName.trim() || 'Rei do ABS', replyActor);
      setReply('');
      onReplySent?.();
      const updated = await getServiceOrderComments(orderId);
      setConversation(updated ?? []);
    } catch {
      // keep open on error
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 backdrop-blur-[20px] p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-6 sm:p-6 animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-modal="true"
      role="dialog"
      aria-labelledby="comment-popup-title"
    >
      <div
        className={`relative flex min-h-[min(480px,85vh)] max-h-[min(90vh,calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-1.5rem))] w-full max-w-[min(640px,calc(100vw-1.5rem))] flex-col overflow-hidden ${iosModalShell} animate-in zoom-in-95 fade-in duration-200`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} className={iosModalClose} aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>

        <div className="shrink-0 border-b border-zinc-200/60 px-6 pb-5 pt-7 dark:border-white/[0.07] sm:px-8 sm:pt-8">
          <div className="flex items-start gap-3 pr-10">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[#007AFF]/20 to-[#5856D6]/25 ring-2 ring-[#007AFF]/20 dark:from-[#007AFF]/25 dark:to-[#5856D6]/30 dark:ring-[#64B5FF]/25">
              {headerPhotoUrl ? (
                <img src={headerPhotoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-lg font-semibold text-[#007AFF] dark:text-[#64B5FF]">{headerInitial}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
                Comentário na OS
              </p>
              <p id="comment-popup-title" className={`mt-0.5 text-[17px] font-semibold leading-snug tracking-tight sm:text-[19px] ${titleClass}`}>
                {vehicleLabel}
                {showBlurredPlate && <span className="blur-plate">{p.vehicle_plate}</span>}
              </p>
              <p className={`mt-1 flex flex-wrap items-center gap-1.5 text-[13px] ${subtitleClass}`}>
                <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500/90" strokeWidth={2} />
                {conversation.length > 0
                  ? `${conversation.length} mensagem${conversation.length !== 1 ? 'ns' : ''} · ${headerAuthor}`
                  : `${headerAuthor} comentou`}
              </p>
            </div>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 custom-scrollbar sm:px-8">
          {loadingConversation ? (
            <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 py-8">
              <Loader2 className="h-8 w-8 animate-spin text-[#007AFF]" />
              <p className="text-[15px] text-zinc-500 dark:text-zinc-400">Carregando conversa…</p>
            </div>
          ) : conversation.length > 0 ? (
            <div className="space-y-4">
              {conversation.map((c) => {
                const photoUrl = getPhotoForAuthor(c);
                const name = c.author_display_name || 'Usuário';
                const initial = name.slice(0, 1).toUpperCase();
                const isFromCurrentUser =
                  normalizeAuthorName(c.author_display_name) === normalizeAuthorName(replyAuthorName);
                return (
                  <div key={c.id} className={`flex items-start gap-3 ${isFromCurrentUser ? 'flex-row-reverse' : ''}`}>
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200/80 bg-zinc-100/80 dark:border-white/[0.08] dark:bg-white/[0.06]">
                      {photoUrl ? (
                        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{initial}</span>
                      )}
                    </div>
                    <div className={`min-w-0 max-w-[min(85%,28rem)] flex-1 ${isFromCurrentUser ? 'flex flex-col items-end' : ''}`}>
                      <div className={`mb-1 flex flex-wrap items-center gap-2 ${isFromCurrentUser ? 'flex-row-reverse' : ''}`}>
                        <span className={`text-[13px] font-semibold ${titleClass}`}>{name}</span>
                        <span className={`text-[11px] tabular-nums ${subtitleClass}`}>
                          {new Date(c.created_at).toLocaleString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <div
                        className={`rounded-[1.35rem] px-4 py-3 ${
                          isFromCurrentUser ? `${bubbleOutgoing} rounded-tr-md` : `${bubbleIncoming} rounded-tl-md`
                        }`}
                      >
                        <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{c.text}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            (() => {
              const isFromCurrentUser =
                normalizeAuthorName(p.author_display_name) === normalizeAuthorName(replyAuthorName);
              return (
                <div className={`flex items-start gap-3 ${isFromCurrentUser ? 'flex-row-reverse' : ''}`}>
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-zinc-200/80 bg-zinc-100/80 dark:border-white/[0.08] dark:bg-white/[0.06]">
                    {headerPhotoUrl ? (
                      <img src={headerPhotoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">{headerInitial}</span>
                    )}
                  </div>
                  <div
                    className={`min-w-0 max-w-[min(85%,28rem)] flex-1 rounded-[1.35rem] px-4 py-3 ${
                      isFromCurrentUser ? `${bubbleOutgoing} rounded-tr-md` : `${bubbleIncoming} rounded-tl-md`
                    }`}
                  >
                    <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{p.text || '—'}</p>
                  </div>
                </div>
              );
            })()
          )}
          <div ref={conversationEndRef} />
        </div>

        <form
          onSubmit={handleSendReply}
          className="shrink-0 border-t border-zinc-200/50 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 dark:border-white/[0.06] sm:px-8"
        >
          <div className={`${iosModalInsetCard} p-3 sm:p-4`}>
            <div className="flex items-center gap-2 sm:gap-3">
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Mensagem…"
                className={`${iosInput} min-w-0 flex-1 border-0 bg-transparent py-2.5 shadow-none focus:ring-0 dark:bg-transparent`}
              />
              <button
                type="submit"
                disabled={sending || !reply.trim()}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-white shadow-lg shadow-blue-500/25 transition-transform active:scale-[0.98] disabled:opacity-45 sm:h-12 sm:w-12"
                aria-label="Enviar resposta"
              >
                {sending ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" strokeWidth={2.2} />
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
