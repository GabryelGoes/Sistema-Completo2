import React from 'react';
import type { TabId } from './TabBar';
import type { AppAppearance, WallpaperConfig } from '../utils/appAppearance';

type Props = {
  activeTab: TabId;
  appearance: AppAppearance;
  theme: "dark" | "light";
  /** Brilho suave usando a cor de destaque (pode desativar nas configurações) */
  showAccentOrb?: boolean;
};

function layerFromConfig(
  cfg: WallpaperConfig,
  theme: "light" | "dark",
  className: string
): React.ReactNode {
  const hasUrl = cfg.url.length > 0;
  const fit =
    cfg.fit === "contain"
      ? "contain"
      : cfg.fit === "fill"
        ? "100% 100%"
        : "cover";

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`} aria-hidden>
      <div
        className={`absolute inset-0 ${theme === "dark" ? "bg-black" : "bg-[#f2f2f7]"}`}
      />
      {hasUrl ? (
        <>
          <div
            className="absolute inset-0 overflow-hidden"
            style={{
              filter: cfg.blur > 0 ? `blur(${cfg.blur}px)` : undefined,
              transform: cfg.scalePercent !== 100 ? `scale(${cfg.scalePercent / 100})` : undefined,
              transformOrigin: "center center",
            }}
          >
            <div
              className="h-full w-full bg-center bg-no-repeat"
              style={{
                backgroundImage: `url(${cfg.url})`,
                backgroundSize: fit,
              }}
            />
          </div>
          <div
            className="absolute inset-0 bg-black transition-opacity duration-300"
            style={{ opacity: cfg.dim }}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Fundo em camadas: wallpaper da home vs demais telas (como bloqueio vs início no iPhone).
 */
export function AppWallpaperLayers({ activeTab, appearance, theme, showAccentOrb = true }: Props) {
  const isHome = activeTab === "home";
  const primary = isHome ? appearance.wallpaperHome : appearance.wallpaperApps;

  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {layerFromConfig(primary, theme, "z-0")}
      {showAccentOrb && appearance.accentOrbEnabled ? (
        <div
          className="absolute top-0 left-1/2 z-[1] h-[500px] w-[800px] -translate-x-1/2 rounded-full opacity-40 blur-[120px]"
          style={{ backgroundColor: `rgb(var(--app-accent-rgb) / 0.25)` }}
        />
      ) : null}
    </div>
  );
}
