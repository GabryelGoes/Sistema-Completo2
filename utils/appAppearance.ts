/**
 * Aparência global do app: cor de destaque (substitui o amarelo padrão em brand-yellow).
 */

/** Abas principais (mesmo conjunto que `TabBar`) — usado para paleta do modo colorido */
export type NavigationTabId = 'home' | 'reception' | 'agenda' | 'patio' | 'laboratorio' | 'orcamentos';

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

/**
 * Cores fixas por tela no modo colorido (recepção azul, agenda verde, início amarelo, pátio teal, laboratório violeta).
 */
export const COLORFUL_TAB_ACCENTS: Record<NavigationTabId, string> = {
  reception: '#2563EB',
  agenda: '#059669',
  home: '#F5D00B',
  patio: '#10B981',
  laboratorio: '#7C3AED',
  orcamentos: '#EA580C',
};

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
