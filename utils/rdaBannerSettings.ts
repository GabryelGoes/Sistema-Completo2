/** Preferências de banners macOS do RDA (localStorage — padrão do sistema). */

export type RdaBannerSettings = {
  /** Master: banners do RDA na tela. */
  enabled: boolean;
  critical: boolean;
  warning: boolean;
  info: boolean;
};

export const DEFAULT_RDA_BANNER_SETTINGS: RdaBannerSettings = {
  enabled: true,
  critical: true,
  warning: true,
  info: false,
};

const STORAGE_KEY = "app_rda_banner_notifications";

export function readRdaBannerSettings(): RdaBannerSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_RDA_BANNER_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<RdaBannerSettings>;
    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_RDA_BANNER_SETTINGS.enabled,
      critical:
        typeof parsed.critical === "boolean"
          ? parsed.critical
          : DEFAULT_RDA_BANNER_SETTINGS.critical,
      warning:
        typeof parsed.warning === "boolean"
          ? parsed.warning
          : DEFAULT_RDA_BANNER_SETTINGS.warning,
      info:
        typeof parsed.info === "boolean" ? parsed.info : DEFAULT_RDA_BANNER_SETTINGS.info,
    };
  } catch {
    return { ...DEFAULT_RDA_BANNER_SETTINGS };
  }
}

export function writeRdaBannerSettings(next: RdaBannerSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function rdaBannerAllowedForSeverity(
  settings: RdaBannerSettings,
  severity: string | null | undefined
): boolean {
  if (!settings.enabled) return false;
  const s = String(severity || "").toLowerCase();
  if (s === "critical") return settings.critical;
  if (s === "warning") return settings.warning;
  if (s === "info") return settings.info;
  return settings.warning;
}
