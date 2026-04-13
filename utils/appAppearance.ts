/**
 * Aparência global do app: cor de destaque (substitui o amarelo padrão em brand-yellow).
 */

export type AppAppearance = {
  /** Cor principal (#RRGGBB) */
  accentHex: string;
};

export const DEFAULT_ACCENT = "#F5D00B";

export const defaultAppAppearance = (): AppAppearance => ({
  accentHex: DEFAULT_ACCENT,
});

/** Normaliza JSON vindo do servidor (ignora campos antigos, ex.: wallpapers). */
export function parseAppAppearance(raw: unknown): AppAppearance {
  const d = defaultAppAppearance();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  if (typeof o.accentHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(o.accentHex.trim())) {
    d.accentHex = o.accentHex.trim().toUpperCase();
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
