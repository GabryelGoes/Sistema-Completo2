import React, { useState } from 'react';
import { X, Send, Loader2 } from 'lucide-react';
import type { Notification } from '../services/apiService';
import { addServiceOrderComment } from '../services/apiService';

interface CommentPopUpProps {
  notification: Notification;
  onClose: () => void;
  onReplySent?: () => void;
  /** Nome exibido como autor da resposta (admin = "Rei do ABS", técnico = nome do técnico) */
  replyAuthorName: string;
  /** Tema do sistema (preto, amarelo, branco) */
  theme?: 'light' | 'dark';
  /** Modo cinematográfico: embaçar placa no rótulo do veículo */
  blurPlates?: boolean;
}

export const CommentPopUp: React.FC<CommentPopUpProps> = ({ notification, onClose, onReplySent, replyAuthorName, theme = 'dark', blurPlates = false }) => {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const isDark = theme === 'dark';
  const panelClass = isDark
    ? 'bg-zinc-900/95 border border-white/[0.08] backdrop-blur-xl'
    : 'bg-white/95 border border-zinc-200/80 backdrop-blur-xl';
  const headerClass = isDark ? 'bg-white/[0.04] border-white/[0.06]' : 'bg-zinc-50/80 border-zinc-200/80';
  const titleClass = isDark ? 'text-white' : 'text-zinc-900';
  const subtitleClass = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const bubbleClass = isDark
    ? 'bg-white/10 text-zinc-100 border border-white/[0.06]'
    : 'bg-zinc-100 text-zinc-800 border border-zinc-200/80';
  const closeBtnClass = isDark
    ? 'text-zinc-400 hover:text-white hover:bg-white/10'
    : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100';
  const inputClass = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-zinc-500 focus:border-white/20 focus:ring-0'
    : 'bg-zinc-100/80 border-zinc-200 text-zinc-900 placeholder-zinc-400 focus:border-brand-yellow/40 focus:ring-2 focus:ring-brand-yellow/20';
  const sendBtnClass = 'bg-brand-yellow hover:bg-amber-400 active:scale-[0.98] disabled:opacity-50 text-black flex items-center justify-center shrink-0 transition-transform';

  const p = notification.payload;
  const model = p.vehicle_model?.trim() || 'Veículo';
  const customer = p.customer_name?.trim() || p.vehicle_plate || 'Cliente';
  const showBlurredPlate = blurPlates && !!p.vehicle_plate && !p.customer_name?.trim();
  const vehicleLabel = showBlurredPlate ? `${model} · ` : `${model} · ${customer}`;
  const author = p.author_display_name || 'Técnico';
  const authorPhotoUrl = p.author_photo_url?.trim() || null;
  const text = p.text || '';
  const authorInitial = author.slice(0, 1).toUpperCase();

  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const orderId = p.service_order_id;
    if (!orderId || !reply.trim() || sending) return;
    setSending(true);
    try {
      await addServiceOrderComment(orderId, reply.trim(), replyAuthorName.trim() || 'Rei do ABS');
      setReply('');
      onReplySent?.();
      onClose();
    } catch {
      // keep open on error
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-modal="true"
      role="dialog"
    >
      <div
        className={`w-full max-w-[min(560px,calc(100vw-2rem))] min-h-[320px] max-h-[85vh] rounded-[1.75rem] overflow-hidden flex flex-col animate-in zoom-in-95 fade-in duration-200 ${panelClass}`}
        style={{
          boxShadow: isDark
            ? '0 0 0 1px rgba(255,255,255,0.06), 0 25px 80px -20px rgba(0,0,0,0.7), 0 20px 40px -20px rgba(0,0,0,0.4)'
            : '0 0 0 1px rgba(0,0,0,0.04), 0 25px 80px -20px rgba(0,0,0,0.15), 0 20px 40px -20px rgba(0,0,0,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header estilo iOS: barra superior limpa */}
        <div className={`flex items-center justify-between px-5 py-4 border-b ${headerClass}`}>
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 bg-zinc-600/30 flex items-center justify-center ring-2 ring-white/10">
              {authorPhotoUrl ? (
                <img src={authorPhotoUrl} alt={author} className="w-full h-full object-cover" />
              ) : (
                <span className={`text-lg font-semibold ${isDark ? 'text-brand-yellow' : 'text-amber-600'}`}>{authorInitial}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-[15px] font-semibold truncate leading-tight ${titleClass}`}>
                {vehicleLabel}
                {showBlurredPlate && <span className="blur-plate">{p.vehicle_plate}</span>}
              </p>
              <p className={`text-[13px] mt-0.5 ${subtitleClass}`}>{author} comentou</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${closeBtnClass}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Área de mensagem: bubble estilo iMessage */}
        <div className="flex-1 overflow-y-auto px-5 py-5 min-h-[140px]">
          <div className="flex gap-3 items-start">
            <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-zinc-600/20 flex items-center justify-center mt-0.5">
              {authorPhotoUrl ? (
                <img src={authorPhotoUrl} alt={author} className="w-full h-full object-cover" />
              ) : (
                <span className={`text-sm font-semibold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{authorInitial}</span>
              )}
            </div>
            <div className={`flex-1 min-w-0 rounded-2xl rounded-tl-md px-4 py-3.5 max-w-[85%] ${bubbleClass}`}>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                {text}
              </p>
            </div>
          </div>
        </div>

        {/* Campo de resposta estilo iOS Messages */}
        <form onSubmit={handleSendReply} className={`px-4 pb-5 pt-3 border-t ${headerClass}`}>
          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Responder..."
              className={`flex-1 min-w-0 px-4 py-3.5 rounded-2xl border text-[16px] focus:outline-none transition-colors ${inputClass}`}
            />
            <button
              type="submit"
              disabled={sending || !reply.trim()}
              className={`w-12 h-12 rounded-2xl ${sendBtnClass}`}
            >
              {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" strokeWidth={2.2} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
