import React, { useRef } from 'react';
import { Palette, Image as ImageIcon, Smartphone, Layers2 } from 'lucide-react';
import { iosModalInsetCard } from './ui/iosModalStyles';
import type { AppAppearance, WallpaperConfig, WallpaperFit } from '../utils/appAppearance';

type Props = {
  value: AppAppearance;
  onChange: (next: AppAppearance) => void;
  disabled?: boolean;
};

function WallpaperEditor({
  label,
  icon,
  cfg,
  onChange,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  cfg: WallpaperConfig;
  onChange: (w: WallpaperConfig) => void;
  disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const pickFile = () => fileRef.current?.click();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f || !f.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === "string" ? reader.result : "";
      if (data) onChange({ ...cfg, url: data });
    };
    reader.readAsDataURL(f);
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {icon}
        {label}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="url"
          value={cfg.url.startsWith("data:") ? "" : cfg.url}
          onChange={(e) => onChange({ ...cfg, url: e.target.value.trim() })}
          disabled={disabled}
          placeholder="https://… (URL da imagem)"
          className="min-w-0 flex-1 rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-[14px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--app-accent-rgb)/0.45)] dark:border-white/10 dark:bg-zinc-900 dark:text-white"
        />
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        <button
          type="button"
          onClick={pickFile}
          disabled={disabled}
          className="shrink-0 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-[13px] font-medium text-zinc-800 hover:bg-zinc-100 dark:border-white/10 dark:bg-white/5 dark:text-zinc-200 dark:hover:bg-white/10"
        >
          Escolher arquivo…
        </button>
      </div>
      {cfg.url ? (
        <div className="relative h-24 w-full overflow-hidden rounded-xl border border-zinc-200/80 dark:border-white/10">
          <div
            className="h-full w-full bg-cover bg-center"
            style={{ backgroundImage: `url(${cfg.url})` }}
          />
          <div className="absolute inset-0 bg-black/40" style={{ opacity: Math.min(1, cfg.dim + 0.2) }} />
        </div>
      ) : null}

      <div>
        <div className="mb-1 flex justify-between text-[12px] text-zinc-500 dark:text-zinc-400">
          <span>Escurecer sobre a imagem</span>
          <span>{Math.round(cfg.dim * 100)}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(cfg.dim * 100)}
          disabled={disabled}
          onChange={(e) => onChange({ ...cfg, dim: Number(e.target.value) / 100 })}
          className="w-full accent-[var(--app-accent)]"
        />
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[12px] text-zinc-500 dark:text-zinc-400">
          <span>Desfoque</span>
          <span>{cfg.blur}px</span>
        </div>
        <input
          type="range"
          min={0}
          max={24}
          value={cfg.blur}
          disabled={disabled}
          onChange={(e) => onChange({ ...cfg, blur: Number(e.target.value) })}
          className="w-full accent-[var(--app-accent)]"
        />
      </div>

      <div>
        <div className="mb-1 flex justify-between text-[12px] text-zinc-500 dark:text-zinc-400">
          <span>Zoom</span>
          <span>{cfg.scalePercent}%</span>
        </div>
        <input
          type="range"
          min={100}
          max={140}
          value={cfg.scalePercent}
          disabled={disabled}
          onChange={(e) => onChange({ ...cfg, scalePercent: Number(e.target.value) })}
          className="w-full accent-[var(--app-accent)]"
        />
      </div>

      <div>
        <label className="mb-1 block text-[12px] text-zinc-500 dark:text-zinc-400">Ajuste da imagem</label>
        <select
          value={cfg.fit}
          disabled={disabled}
          onChange={(e) => onChange({ ...cfg, fit: e.target.value as WallpaperFit })}
          className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-[14px] text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--app-accent-rgb)/0.45)] dark:border-white/10 dark:bg-zinc-900 dark:text-white"
        >
          <option value="cover">Preencher (cortar bordas)</option>
          <option value="contain">Ajustar (mostrar inteira)</option>
          <option value="fill">Esticar</option>
        </select>
      </div>
    </div>
  );
}

export function AppearanceSettingsSection({ value, onChange, disabled }: Props) {
  return (
    <div className="space-y-5">
      <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
        <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          <Palette className="h-4 w-4" />
          Cor de destaque
        </div>
        <p className="mb-3 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          Substitui o amarelo padrão em botões, destaques e ícones da marca em todo o app.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="color"
            value={value.accentHex}
            disabled={disabled}
            onChange={(e) => onChange({ ...value, accentHex: e.target.value.toUpperCase() })}
            className="h-12 w-20 cursor-pointer rounded-xl border border-zinc-200 bg-transparent p-1 dark:border-white/15"
          />
          <input
            type="text"
            value={value.accentHex}
            disabled={disabled}
            onChange={(e) => {
              const v = e.target.value.trim();
              if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) onChange({ ...value, accentHex: v.length === 7 ? v.toUpperCase() : v });
            }}
            className="min-w-[7.5rem] rounded-xl border border-zinc-200 bg-white px-3 py-2 font-mono text-[14px] text-zinc-900 dark:border-white/10 dark:bg-zinc-900 dark:text-white"
            placeholder="#F5D00B"
          />
          <span
            className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-black"
            style={{ backgroundColor: value.accentHex }}
          >
            Prévia
          </span>
        </div>
      </div>

      <div className={`${iosModalInsetCard} p-4 sm:p-5`}>
        <div className="mb-2 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-zinc-500" />
          <span className="text-[15px] font-semibold text-zinc-900 dark:text-white">Brilho da marca</span>
        </div>
        <p className="mb-3 text-[12px] text-zinc-500 dark:text-zinc-400">
          Efeito de luz suave com a cor de destaque (similar ao brilho de fundo do app).
        </p>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[15px] text-zinc-800 dark:text-zinc-200">Ativar brilho de destaque</span>
          <button
            type="button"
            role="switch"
            aria-checked={value.accentOrbEnabled}
            disabled={disabled}
            onClick={() => onChange({ ...value, accentOrbEnabled: !value.accentOrbEnabled })}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              value.accentOrbEnabled ? "bg-[var(--app-accent)]" : "bg-zinc-300 dark:bg-zinc-600"
            }`}
          >
            <span
              className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                value.accentOrbEnabled ? "translate-x-6" : "translate-x-0.5"
              } left-0.5`}
            />
          </button>
        </div>
      </div>

      <div className={`${iosModalInsetCard} p-4 sm:p-5 space-y-8`}>
        <div className="flex items-start gap-2 border-b border-zinc-200/80 pb-2 dark:border-white/10">
          <Layers2 className="mt-0.5 h-5 w-5 shrink-0 text-zinc-500" />
          <div>
            <h3 className="text-[15px] font-semibold text-zinc-900 dark:text-white">Papéis de parede</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
              Como no iPhone: um fundo para a{' '}
              <span className="font-semibold text-zinc-600 dark:text-zinc-300">tela inicial</span> (grade de apps) e outro
              para as{' '}
              <span className="font-semibold text-zinc-600 dark:text-zinc-300">demais telas</span> (Recepção, Agenda, Pátio,
              etc.). Use URL pública ou envie uma imagem do dispositivo.
            </p>
          </div>
        </div>

        <WallpaperEditor
          label="Tela inicial (grade)"
          icon={<ImageIcon className="h-4 w-4 text-amber-500" />}
          cfg={value.wallpaperHome}
          disabled={disabled}
          onChange={(wallpaperHome) => onChange({ ...value, wallpaperHome })}
        />

        <WallpaperEditor
          label="Demais telas"
          icon={<ImageIcon className="h-4 w-4 text-sky-500" />}
          cfg={value.wallpaperApps}
          disabled={disabled}
          onChange={(wallpaperApps) => onChange({ ...value, wallpaperApps })}
        />
      </div>
    </div>
  );
}
