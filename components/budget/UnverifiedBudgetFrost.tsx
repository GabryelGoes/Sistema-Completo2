import React from 'react';

/**
 * Embaça o conteúdo de orçamentos ainda não verificados e exibe o aviso
 * “Aguardando aprovação”. Usado só no hub de Orçamentos (não para admin /
 * acesso total). Desligável nas Configurações.
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
      <div className="blur-[1.25px] opacity-[0.72] saturate-[0.85]">{children}</div>
      <div
        className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center bg-gradient-to-b from-white/45 via-white/28 to-white/40 dark:from-zinc-950/50 dark:via-zinc-950/35 dark:to-zinc-950/55"
        aria-hidden
      >
        <span
          className={`inline-flex max-w-[92%] items-center justify-center rounded-full border border-zinc-300/70 bg-white/88 font-semibold tracking-[0.04em] text-zinc-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] backdrop-blur-[6px] dark:border-white/12 dark:bg-zinc-900/88 dark:text-zinc-200 dark:shadow-[0_1px_2px_rgba(0,0,0,0.35)] ${
            compact
              ? 'px-2 py-0.5 text-[9px] uppercase'
              : 'px-2.5 py-1 text-[10px] uppercase sm:text-[11px]'
          }`}
        >
          Aguardando aprovação
        </span>
      </div>
    </div>
  );
}
