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
}

export const CommentPopUp: React.FC<CommentPopUpProps> = ({ notification, onClose, onReplySent, replyAuthorName, theme = 'dark' }) => {
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const isDark = theme === 'dark';
  const panelClass = isDark ? 'bg-[#0A0A0A] border-white/10' : 'bg-light-elevated border-light-border';
  const headerClass = isDark ? 'bg-white/[0.06] border-white/10' : 'bg-light-card border-light-border';
  const titleClass = isDark ? 'text-white' : 'text-zinc-900';
  const subtitleClass = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const bodyClass = isDark ? 'text-zinc-300' : 'text-zinc-700';
  const closeBtnClass = isDark ? 'bg-white/10 text-zinc-400 hover:text-white' : 'bg-light-border text-zinc-600 hover:text-zinc-900';
  const inputClass = isDark
    ? 'bg-white/5 border-white/10 text-white placeholder-zinc-500 focus:ring-brand-yellow/30'
    : 'bg-light-card border-light-border text-zinc-900 placeholder-zinc-500 focus:ring-brand-yellow/30';
  const sendBtnClass = 'bg-brand-yellow hover:bg-amber-400 disabled:opacity-50 text-black flex items-center justify-center shrink-0';

  const p = notification.payload;
  const model = p.vehicle_model?.trim() || 'Veículo';
  const customer = p.customer_name?.trim() || p.vehicle_plate || 'Cliente';
  const vehicleLabel = `${model} · ${customer}`;
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
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      aria-modal="true"
      role="dialog"
    >
      <div
        className={`w-full max-w-[min(400px,calc(100vw-32px))] rounded-2xl border shadow-2xl overflow-hidden flex flex-col animate-in fade-in duration-200 ${panelClass}`}
        style={{ boxShadow: isDark ? '0 20px 60px -20px rgba(0,0,0,0.6)' : '0 20px 60px -20px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
      <div className={`flex items-center justify-between px-4 py-3 border-b ${headerClass}`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 bg-brand-yellow/20 flex items-center justify-center border border-white/10">
            {authorPhotoUrl ? (
              <img src={authorPhotoUrl} alt={author} className="w-full h-full object-cover" />
            ) : (
              <span className={`text-sm font-bold ${isDark ? 'text-brand-yellow' : 'text-amber-600'}`}>{authorInitial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className={`text-[13px] font-semibold truncate ${titleClass}`}>{vehicleLabel}</p>
            <p className={`text-[11px] ${subtitleClass}`}>{author} comentou</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${closeBtnClass}`}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-4 max-h-28 overflow-y-auto flex gap-3">
        <div className="w-8 h-8 rounded-full overflow-hidden flex-shrink-0 bg-zinc-600/30 flex items-center justify-center mt-0.5">
          {authorPhotoUrl ? (
            <img src={authorPhotoUrl} alt={author} className="w-full h-full object-cover" />
          ) : (
            <span className={`text-xs font-bold ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{authorInitial}</span>
          )}
        </div>
        <p className={`text-[14px] leading-snug whitespace-pre-wrap break-words flex-1 min-w-0 ${bodyClass}`}>
          {text}
        </p>
      </div>
      <form onSubmit={handleSendReply} className={`p-3 border-t flex gap-2 ${headerClass}`}>
        <input
          type="text"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          placeholder="Responder..."
          className={`flex-1 min-w-0 px-4 py-2.5 rounded-xl border text-[14px] focus:outline-none focus:ring-2 ${inputClass}`}
        />
        <button
          type="submit"
          disabled={sending || !reply.trim()}
          className={`w-11 h-11 rounded-xl ${sendBtnClass}`}
        >
          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
        </button>
      </form>
      </div>
    </div>
  );
}
