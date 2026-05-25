/**
 * Aparência global do app: cor de destaque (substitui o amarelo padrão em brand-yellow).
 */

/** Abas principais (mesmo conjunto que `TabBar`) — usado para paleta do modo colorido */
export type NavigationTabId =
  | 'home'
  | 'reception'
  | 'agenda'
  | 'patio'
  | 'laboratorio'
  | 'orcamentos'
  | 'relatorios'
  | 'boletim_erros'
  | 'radar_qualidade';

/**
 * Cores fixas por módulo (barra superior modo PC, navegação colorida, etc.).
 */
export const COLORFUL_TAB_ACCENTS: Record<NavigationTabId, string> = {
  home: '#F5D00B',
  reception: '#2563EB',
  agenda: '#DC2626',
  patio: '#F5D00B',
  laboratorio: '#7C3AED',
  orcamentos: '#D4D4D4',
  relatorios: '#0284C7',
  boletim_erros: '#D97706',
  radar_qualidade: '#E11D48',
};

/** Módulos com fundo claro na barra superior → texto e ícones escuros. */
const TOPBAR_DARK_TEXT_TABS = new Set<NavigationTabId>(['home', 'patio', 'orcamentos']);

/** Cor de destaque do módulo (barra superior no modo PC, etc.). */
export function moduleAccentColor(tab: NavigationTabId): string {
  return COLORFUL_TAB_ACCENTS[tab] ?? COLORFUL_TAB_ACCENTS.home;
}

/** Contraste do texto na barra superior chapada do modo PC. */
export function moduleTopbarTextTone(tab: NavigationTabId): 'light' | 'dark' {
  return TOPBAR_DARK_TEXT_TABS.has(tab) ? 'dark' : 'light';
}

export type AppAppearance = {
  /** Cor principal (#RRGGBB) — usada no modo único; no modo colorido é fallback se uma aba não tiver entrada */
  accentHex: string;
  /**
   * Modo colorido: cada aba de navegação tem cor própria (como versões anteriores do app).
   * A cor ativa no `:root` (botões, `brand-yellow`, etc.) segue a aba em foco.
   */
  colorfulNavigation: boolean;
};

export const DEFAULT_ACCENT = "#F5D00B";

export const defaultAppAppearance = (): AppAppearance => ({
  accentHex: DEFAULT_ACCENT,
  colorfulNavigation: false,
});

/** Cor efetiva aplicada em `--app-accent` consoante modo único vs colorido e aba atual. */
export function resolveEffectiveAccentHex(
  appearance: AppAppearance,
  currentTab: NavigationTabId
): string {
  if (appearance.colorfulNavigation) {
    return COLORFUL_TAB_ACCENTS[currentTab] ?? appearance.accentHex;
  }
  return appearance.accentHex;
}

/** Normaliza JSON vindo do servidor (ignora campos antigos, ex.: wallpapers). */
export function parseAppAppearance(raw: unknown): AppAppearance {
  const d = defaultAppAppearance();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  if (typeof o.accentHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(o.accentHex.trim())) {
    d.accentHex = o.accentHex.trim().toUpperCase();
  }
  if (typeof o.colorfulNavigation === 'boolean') {
    d.colorfulNavigation = o.colorfulNavigation;
  }
  return d;
}

export function hexToRgbSpaceSeparated(hex: string): string {
  const h = hex.trim().replace(/^#/, "");
  if (h.length !== 6) return "245 208 11";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((x) => Number.isNaN(x))) return "245 208 11";
  return `${r} ${g} ${b}`;
}

/** Aplica cor de destaque no :root (Tailwind `brand-yellow` usa `--app-accent-rgb`). */
export function applyAccentToRoot(root: HTMLElement, accentHex: string): void {
  const hex = /^#[0-9A-Fa-f]{6}$/.test(accentHex.trim()) ? accentHex.trim().toUpperCase() : DEFAULT_ACCENT;
  const rgb = hexToRgbSpaceSeparated(hex);
  root.style.setProperty("--app-accent", hex);
  root.style.setProperty("--app-accent-rgb", rgb);
  root.style.setProperty("--app-accent-hover", `color-mix(in srgb, ${hex} 82%, white)`);
}
