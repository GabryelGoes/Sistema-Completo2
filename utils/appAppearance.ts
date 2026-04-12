/**
 * Aparência global do app (cor de destaque + wallpapers estilo iPhone:
 * tela inicial separada das demais telas).
 */

export type WallpaperFit = "cover" | "contain" | "fill";

export type WallpaperConfig = {
  /** URL https ou data:; vazio = sem imagem */
  url: string;
  /** Escurecer sobre a imagem (0 = nenhum, 1 = quase preto) — como "escurecer papel de parede" no iOS */
  dim: number;
  /** Desfoque na própria imagem (0–24 px) */
  blur: number;
  /** Escala da imagem (100–140%) */
  scalePercent: number;
  fit: WallpaperFit;
};

export type AppAppearance = {
  /** Cor principal (#RRGGBB), ex.: amarelo da marca */
  accentHex: string;
  /** Brilho difuso com a cor de destaque (como “vignette” da marca) */
  accentOrbEnabled: boolean;
  wallpaperHome: WallpaperConfig;
  wallpaperApps: WallpaperConfig;
};

export const DEFAULT_ACCENT = "#F5D00B";

export const defaultWallpaper = (): WallpaperConfig => ({
  url: "",
  dim: 0.35,
  blur: 0,
  scalePercent: 100,
  fit: "cover",
});

export const defaultAppAppearance = (): AppAppearance => ({
  accentHex: DEFAULT_ACCENT,
  accentOrbEnabled: true,
  wallpaperHome: defaultWallpaper(),
  wallpaperApps: { ...defaultWallpaper(), dim: 0.45 },
});

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Normaliza JSON vindo do servidor ou versões antigas. */
export function parseAppAppearance(raw: unknown): AppAppearance {
  const d = defaultAppAppearance();
  if (!raw || typeof raw !== "object") return d;
  const o = raw as Record<string, unknown>;
  if (typeof o.accentHex === "string" && /^#[0-9A-Fa-f]{6}$/.test(o.accentHex.trim())) {
    d.accentHex = o.accentHex.trim().toUpperCase();
  }
  if (typeof o.accentOrbEnabled === "boolean") {
    d.accentOrbEnabled = o.accentOrbEnabled;
  }
  const parseLayer = (x: unknown, fallback: WallpaperConfig): WallpaperConfig => {
    if (!x || typeof x !== "object") return { ...fallback };
    const w = x as Record<string, unknown>;
    const url = typeof w.url === "string" ? w.url.trim() : "";
    const dim = typeof w.dim === "number" && Number.isFinite(w.dim) ? clamp(w.dim, 0, 0.92) : fallback.dim;
    const blur = typeof w.blur === "number" && Number.isFinite(w.blur) ? clamp(w.blur, 0, 24) : fallback.blur;
    const scalePercent =
      typeof w.scalePercent === "number" && Number.isFinite(w.scalePercent)
        ? clamp(w.scalePercent, 100, 140)
        : fallback.scalePercent;
    const fit = w.fit === "contain" || w.fit === "fill" ? w.fit : "cover";
    return { url, dim, blur, scalePercent, fit };
  };
  d.wallpaperHome = parseLayer(o.wallpaperHome, d.wallpaperHome);
  d.wallpaperApps = parseLayer(o.wallpaperApps, d.wallpaperApps);
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

/**
 * Aplica cor de destaque e variáveis auxiliares no :root.
 * Wallpapers são aplicados pelo componente React `AppWallpaperLayers`.
 */
export function applyAccentToRoot(root: HTMLElement, accentHex: string): void {
  const hex = /^#[0-9A-Fa-f]{6}$/.test(accentHex.trim()) ? accentHex.trim().toUpperCase() : DEFAULT_ACCENT;
  const rgb = hexToRgbSpaceSeparated(hex);
  root.style.setProperty("--app-accent", hex);
  root.style.setProperty("--app-accent-rgb", rgb);
  root.style.setProperty("--app-accent-hover", `color-mix(in srgb, ${hex} 82%, white)`);
}
