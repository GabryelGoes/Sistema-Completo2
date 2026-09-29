import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw, Send } from 'lucide-react';

type OsCommentComposerProps = {
  sending: boolean;
  inputClassName: string;
  /** Espelha o rascunho no pai (ref) sem re-render — live-sync pausa enquanto digita. */
  draftRef?: React.MutableRefObject<string>;
  onSend: (text: string) => void | Promise<void>;
};

/**
 * Composer de comentário com estado local.
 * Evita re-render do PatioView (quadro + modal) a cada tecla no Mac/PC.
 */
export function OsCommentComposer({
  sending,
  inputClassName,
  draftRef,
  onSend,
}: OsCommentComposerProps) {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (draftRef) draftRef.current = text;
  }, [text, draftRef]);

  const resetHeight = () => {
    if (textareaRef.current) {
      textareaRef.current.style.height = '44px';
    }
  };

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setText('');
    if (draftRef) draftRef.current = '';
    resetHeight();
    try {
      await onSend(trimmed);
    } catch {
      setText(trimmed);
      if (draftRef) draftRef.current = trimmed;
    }
  };

  return (
    <div className="flex items-end gap-2 border-t border-zinc-200/60 bg-white p-2.5 dark:border-white/[0.06] dark:bg-zinc-950/40 sm:p-3">
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const el = e.currentTarget;
          el.style.height = 'auto';
          el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
        }}
        placeholder="Mensagem"
        rows={1}
        className={`${inputClassName} max-h-[140px] min-h-[44px] min-w-0 flex-1 resize-none overflow-y-auto whitespace-pre-wrap break-words py-2.5 text-[15px] leading-snug [overflow-wrap:anywhere]`}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
      />
      <button
        type="button"
        onClick={() => void submit()}
        disabled={sending || !text.trim()}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#007AFF] text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:opacity-95 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        aria-label="Enviar mensagem"
      >
        {sending ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" strokeWidth={2.2} />}
      </button>
    </div>
  );
}
