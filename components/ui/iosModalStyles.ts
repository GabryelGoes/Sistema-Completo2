import { uiModalSectionLabel } from "./appTypography";

/** Overlay e painéis alinhados ao modal TV do pátio (vidro, blur, cantos grandes). */

export const iosModalOverlay =
  'fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/45 backdrop-blur-[20px]';

/** Painel principal do modal (bordas ~2rem). Acrescente max-w-*, h-* conforme necessário. */
export const iosModalShell =
  'relative w-full flex flex-col min-h-0 overflow-hidden rounded-[2rem] sm:rounded-[2.25rem] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

/** Mesmo vidro, raio interno para combinar com o aro aurora (2px) do modal da Zaya. */
export const iosModalShellZayaInner =
  'relative w-full flex flex-col min-h-0 overflow-hidden rounded-[calc(2rem-2px)] sm:rounded-[calc(2.25rem-2px)] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

/** Mesmo vidro em páginas (formulários), sem overflow hidden — permite brilhos decorativos. */
export const iosPageGlass =
  'relative w-full rounded-[2rem] sm:rounded-[2.25rem] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

/** Cartões internos (seções de formulário), como no TV do pátio. */
export const iosModalInsetCard =
  'rounded-[22px] border border-zinc-200/80 dark:border-white/[0.07] bg-white/70 dark:bg-zinc-900/40 backdrop-blur-2xl shadow-[0_2px_24px_-4px_rgba(0,0,0,0.08)] dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

/**
 * Modal de veículo (Pátio) — tema claro estilo Ajustes iOS: fundo opaco cinza-claro, grupos brancos sólidos.
 * Tema escuro mantém o vidro existente.
 */
export const iosVehicleModalShell =
  'relative w-full flex flex-col min-h-0 overflow-hidden rounded-[2rem] sm:rounded-[2.25rem] border border-zinc-300/90 bg-[#F2F2F7] shadow-[0_2px_16px_-4px_rgba(0,0,0,0.1)] backdrop-blur-none dark:border-white/[0.07] dark:bg-zinc-900/40 dark:backdrop-blur-2xl dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

export const iosVehicleModalInsetCard =
  'rounded-[22px] border border-zinc-300/70 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] dark:border-white/[0.07] dark:bg-zinc-900/40 dark:backdrop-blur-2xl dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

/** Campos dentro do modal de veículo — claro: cinza suave; escuro: igual ao iosInput. */
export const iosVehicleModalInput =
  'w-full rounded-2xl border border-zinc-300/85 bg-zinc-50 px-4 py-3 text-[15px] text-zinc-950 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 focus:border-[#007AFF]/50 transition-shadow dark:border-white/[0.08] dark:bg-zinc-950/50 dark:text-white dark:placeholder:text-zinc-500';

export const iosModalClose =
  'absolute top-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 hover:bg-black/10 dark:hover:bg-white/15 transition-colors';

export const iosInput =
  'w-full rounded-2xl border border-zinc-200/90 dark:border-white/[0.08] bg-white/90 dark:bg-zinc-950/50 px-4 py-3 text-[15px] text-zinc-950 dark:text-white placeholder:text-zinc-500 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-[#007AFF]/35 focus:border-[#007AFF]/50 transition-shadow';

export const iosLabel = uiModalSectionLabel;

export const iosPrimaryButton =
  'rounded-2xl bg-[#007AFF] px-6 py-3.5 text-[15px] font-semibold text-white shadow-lg shadow-blue-500/25 hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-45';

/** Cor de destaque da oficina (Configurações → Aparência, --app-accent-rgb). */
export const iosAccentPrimaryButton =
  'rounded-2xl bg-brand-yellow border border-black/10 dark:border-black/25 px-6 py-3.5 text-[15px] font-semibold text-zinc-950 shadow-lg shadow-brand-yellow/30 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-45';

/**
 * Ícone antes do título (Recepção, Agenda, Pátio, Laboratório): material em `--app-accent-rgb` + borda luminosa e sombras no estilo iOS (vidro / squircle).
 * Use com {@link iosPageTitleIconGlass} (span interno) e pictograma com {@link iosPageTitleIconGlyph}.
 */
export const iosPageTitleIconShell =
  'relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[1.35rem] ' +
  'border border-white/45 bg-gradient-to-br from-brand-yellow via-brand-yellow to-brand-yellow/85 ' +
  'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.55),inset_0_-14px_26px_-10px_rgba(0,0,0,0.07),0_10px_34px_-8px_rgba(0,0,0,0.2),0_0_0_1px_rgba(0,0,0,0.04)] ' +
  'ring-1 ring-inset ring-white/30 dark:border-white/25 dark:from-brand-yellow dark:via-brand-yellow/92 dark:to-brand-yellow/72 ' +
  'dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.16),inset_0_-18px_34px_-12px_rgba(0,0,0,0.38),0_14px_48px_-10px_rgba(0,0,0,0.5)]';

/** Brilho superior (gloss) — camada atrás do pictograma. */
export const iosPageTitleIconGlass =
  'pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-white/45 via-white/[0.08] to-transparent dark:from-white/20 dark:via-transparent';

/** Pictograma (Lucide / PatioCarIcon) — traço escuro com leve destaque no vidro. */
export const iosPageTitleIconGlyph =
  'relative z-10 h-7 w-7 text-zinc-950 [filter:drop-shadow(0_1px_0_rgba(255,255,255,0.45))]';
