import React from 'react';
import { X } from 'lucide-react';
import { Handshake } from 'lucide-react';

type BudgetOutsourcedTextReplaceHintProps = {
  /** Trecho detectado no texto (ex.: "terceirizado"). */
  matchedWord: string;
  onAccept: () => void;
  onDismiss: () => void;
  className?: string;
};

/**
 * Barra compacta estilo substituição de texto do iOS:
 * toque aplica a etiqueta e remove a palavra; X mantém só a palavra.
 */
export const BudgetOutsourcedTextReplaceHint: React.FC<BudgetOutsourcedTextReplaceHintProps> = ({
  matchedWord,
  onAccept,
  onDismiss,
  className = '',
}) => (
  <div
    className={`mb-1 mt-0.5 flex items-center gap-1.5 rounded-lg border border-orange-500/25 bg-orange-50/95 px-1.5 py-1 dark:border-orange-400/35 dark:bg-orange-500/15 ${className}`}
    role="status"
    aria-live="polite"
  >
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onAccept}
      className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition-colors hover:bg-white/70 active:bg-white/90 dark:hover:bg-white/10"
      title="Substituir pela etiqueta Terceirizado"
    >
      <span className="truncate text-[11px] font-medium text-slate-500 dark:text-zinc-400">
        “{matchedWord}” →
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-orange-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm ring-1 ring-orange-950/40 dark:bg-orange-700 dark:text-white dark:ring-orange-950/50">
        <Handshake className="h-3 w-3 text-white" strokeWidth={2.2} aria-hidden />
        Terceirizado
      </span>
    </button>
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onDismiss}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-white/80 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      aria-label="Manter a palavra sem etiqueta"
      title="Usar só a palavra, sem etiqueta"
    >
      <X className="h-3.5 w-3.5" strokeWidth={2.4} />
    </button>
  </div>
);
