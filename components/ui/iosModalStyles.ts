/** Overlay e painéis alinhados ao modal TV do pátio (vidro, blur, cantos grandes). */

export const iosModalOverlay =
  'fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/45 backdrop-blur-[20px]';

/** Painel principal do modal (bordas ~2rem). Acrescente max-w-*, h-* conforme necessário. */
export const iosModalShell =
  'relative w-full flex flex-col min-h-0 overflow-hidden rounded-[2rem] sm:rounded-[2.25rem] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

/** Cartões internos (seções de formulário), como no TV do pátio. */
export const iosModalInsetCard =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

export const iosModalClose =
  'absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-white/15 transition-colors';

export const iosInput =
  'w-full rounded-2xl border border-zinc-200/90 dark:border-white/[0.08] bg-white/90 dark:bg-zinc-950/50 px-4 py-3 text-[15px] text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 focus:border-[#007AFF]/50 transition-shadow';

export const iosLabel =
  'block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 mb-2';

export const iosPrimaryButton =
  'rounded-2xl bg-[#007AFF] px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-45';
