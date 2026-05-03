/**
 * Tipografia única da interface (font-sans no index.html = stack Apple/Segoe).
 * Nomes de veículo nos cards/modais usam `font-vehicle` (Playfair Display + ajustes em index.html).
 */
export const fontUi = "font-sans antialiased";

/** Labels de seção (Queixa, Orçamentos, Anexos, etc.) */
export const uiModalSectionLabel =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-950 dark:text-zinc-400 mb-2";

/** Título de seção em linha (ícone + texto), modais */
export const uiSectionTitleRow =
  "mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-950 dark:text-zinc-400";

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
