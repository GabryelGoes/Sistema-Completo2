import React from 'react';

/**
 * Embaça o conteúdo de orçamentos ainda não verificados e exibe o aviso
 * “Aguardando aprovação”. Desligável nas Configurações.
 */
export function UnverifiedBudgetFrost({
  active,
  className = '',
  compact = false,
  children,
}: {
  /** true = orçamento sem verificação e preferência ligada */
  active: boolean;
  className?: string;
  /** Layout mais baixo (linhas do hub). */
  compact?: boolean;
  children: React.ReactNode;
}) {
  if (!active) return <>{children}</>;

  return (
    <div className={`relative isolate overflow-hidden ${className}`}>
      <div className="blur-[2.75px] opacity-[0.48] saturate-50 contrast-[0.92]">{children}</div>
      <div
        className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-zinc-950/18 dark:bg-black/35"
        aria-hidden
      >
        <span
          className={`inline-flex max-w-[92%] items-center justify-center rounded-full border border-amber-400/55 bg-amber-50/95 px-2.5 font-bold uppercase tracking-[0.08em] text-amber-950 shadow-sm dark:border-amber-300/40 dark:bg-amber-950/90 dark:text-amber-100 ${
            compact ? 'py-0.5 text-[9px]' : 'py-1 text-[10px] sm:text-[11px]'
          }`}
        >
          Aguardando aprovação
        </span>
      </div>
    </div>
  );
}
