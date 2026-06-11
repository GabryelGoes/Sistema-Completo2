/** Visual compartilhado dos modais de leitura de orçamento (tema claro, sem papel envelhecido). */

export const budgetReadModalBackdropClass =
  'fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/55 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] backdrop-blur-sm animate-modal-backdrop';

export const budgetReadModalShellClass =
  'relative flex min-h-0 w-full max-w-2xl max-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom)-2rem)] flex-col overflow-hidden rounded-2xl border border-sky-100/95 bg-[#fafcfe] shadow-[0_28px_90px_-32px_rgba(14,116,144,0.38),0_12px_32px_-16px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,1)] animate-modal-sheet';

export const budgetReadModalHeaderClass =
  'relative z-10 flex shrink-0 items-start justify-between gap-3 border-b border-sky-100/90 bg-gradient-to-b from-white to-[#f5fbff] px-6 py-4';

export const budgetReadModalFooterClass =
  'relative z-10 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-sky-100/90 bg-[#f8fcfe] px-6 py-4';

export const budgetReadModalScrollClass =
  'relative z-10 min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] [-webkit-overflow-scrolling:touch]';

export const budgetReadSectionTitleClass =
  'mb-2 text-xs font-semibold uppercase tracking-wider text-sky-800/80';

export const budgetReadBodyTextClass = 'text-sm leading-relaxed text-slate-800';

export const budgetReadFooterBtnClass =
  'inline-flex items-center gap-2 rounded-xl border border-sky-200/90 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-sky-300 hover:bg-sky-50/80 disabled:opacity-50';

export const budgetReadFooterPrimaryClass =
  'inline-flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50';
