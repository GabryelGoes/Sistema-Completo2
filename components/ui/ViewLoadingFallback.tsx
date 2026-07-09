import React from 'react';
import { Loader2 } from 'lucide-react';

/** Fallback leve para `React.lazy` — não bloqueia a thread com blur ou animações pesadas. */
export function ViewLoadingFallback({ label }: { label?: string }) {
  return (
    <div
      className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 py-12 text-zinc-500 dark:text-zinc-400"
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-7 w-7 animate-spin text-[#007AFF]" aria-hidden />
      <p className="text-[14px] font-medium">{label ? `Abrindo ${label}…` : 'Carregando…'}</p>
    </div>
  );
}
