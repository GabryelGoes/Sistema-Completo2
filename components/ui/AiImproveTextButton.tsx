import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Undo2 } from 'lucide-react';
import {
  improveTextWithAi,
  type AiImproveTextKind,
} from '../../services/apiService';

type AiImproveTextButtonProps = {
  value: string;
  onChange: (next: string) => void;
  kind?: AiImproveTextKind;
  /** Classe extra no wrapper (ex.: alinhar no header). */
  className?: string;
  /** Desabilita o botão (ex.: formulário enviando). */
  disabled?: boolean;
};

/**
 * Botão discreto para melhorar o texto com IA + opção de desfazer a última melhoria.
 */
export function AiImproveTextButton({
  value,
  onChange,
  kind = 'general',
  className = '',
  disabled = false,
}: AiImproveTextButtonProps) {
  const [busy, setBusy] = useState(false);
  const [undoText, setUndoText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const errorTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (errorTimerRef.current != null) window.clearTimeout(errorTimerRef.current);
    };
  }, []);

  const showError = (msg: string) => {
    setError(msg);
    if (errorTimerRef.current != null) window.clearTimeout(errorTimerRef.current);
    errorTimerRef.current = window.setTimeout(() => setError(null), 4500);
  };

  const canImprove = value.trim().length > 0 && !busy && !disabled;
  const canUndo = undoText != null && !busy && !disabled;

  const handleImprove = async () => {
    if (!canImprove) return;
    const previous = value;
    setBusy(true);
    setError(null);
    try {
      const result = await improveTextWithAi(previous, kind);
      if (result.text === previous.trim()) {
        setUndoText(null);
        showError('O texto já estava claro — sem mudanças.');
        return;
      }
      setUndoText(previous);
      onChange(result.text);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Não foi possível melhorar o texto.');
    } finally {
      setBusy(false);
    }
  };

  const handleUndo = () => {
    if (!canUndo || undoText == null) return;
    onChange(undoText);
    setUndoText(null);
    setError(null);
  };

  return (
    <div className={`inline-flex items-center gap-1 ${className}`}>
      {error ? (
        <span
          className="mr-1 max-w-[11rem] truncate text-[10px] font-medium text-amber-700 dark:text-amber-300"
          title={error}
        >
          {error}
        </span>
      ) : null}
      {canUndo ? (
        <button
          type="button"
          onClick={handleUndo}
          className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"
          title="Desfazer melhoria da IA"
          aria-label="Desfazer melhoria da IA"
        >
          <Undo2 className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
          Desfazer
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => void handleImprove()}
        disabled={!canImprove}
        className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#007AFF]/80 transition hover:bg-[#007AFF]/10 hover:text-[#007AFF] disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#64B5FF]/85 dark:hover:bg-[#007AFF]/15"
        title={
          value.trim()
            ? 'Melhorar texto com IA'
            : 'Digite o diagnóstico para poder melhorar'
        }
        aria-label="Melhorar texto com IA"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
        )}
        {busy ? 'Melhorando…' : 'Melhorar'}
      </button>
    </div>
  );
}
