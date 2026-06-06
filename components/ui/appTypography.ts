/**
 * Tipografia única da interface (font-sans no index.html = stack Apple/Segoe).
 * Nomes de veículo nos cards/modais usam `font-vehicle` (= stack sistema / SF no Apple, ver index.html).
 */
export const fontUi = "font-sans antialiased";

/** Labels de seção (Queixa, Orçamentos, Anexos, etc.) */
export const uiModalSectionLabel =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-950 dark:text-zinc-400 mb-2";

/** Título de seção em linha (ícone + texto), modais */
export const uiSectionTitleRow =
  "mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-950 dark:text-zinc-400";

/** Ícone nos cabeçalhos de seção do modal de OS (Queixa, Orçamentos, etc.) */
export const uiOsModalSectionIconWrap =
  "flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-200/95 bg-gradient-to-b from-white to-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_2px_8px_-4px_rgba(0,0,0,0.1)] dark:border-white/[0.1] dark:from-white/[0.12] dark:to-white/[0.04]";

/** Título no cabeçalho de card de seção do modal de OS */
export const uiOsModalCardSectionTitle =
  "text-[12px] font-bold uppercase tracking-[0.12em] text-zinc-800 dark:text-zinc-200 sm:text-[13px]";

/** Corpo de leitura: queixa, textos longos em caixas */
export const uiReadBody =
  "text-[15px] font-normal leading-relaxed text-zinc-950 dark:text-zinc-200";

/** Parágrafos / lista em cards e modais */
export const uiBody =
  "text-[15px] font-normal leading-snug text-zinc-950 dark:text-zinc-200";

/** Subtítulo / meta linha */
export const uiSubtitle =
  "text-[13px] font-normal leading-relaxed text-zinc-950 dark:text-zinc-400";

/** Chat — bolhas e área de rolagem */
export const uiChatScrollArea = "text-[15px] font-normal leading-relaxed text-zinc-950 dark:text-zinc-200";

/** Chat — mensagem assistente / texto secundário */
export const uiChatBubbleAssistant =
  "text-[15px] font-normal leading-relaxed text-zinc-950 dark:text-zinc-100";

/** Chat — estado vazio / meta */
export const uiChatMeta =
  "text-[13px] font-normal text-zinc-950 dark:text-zinc-400";
