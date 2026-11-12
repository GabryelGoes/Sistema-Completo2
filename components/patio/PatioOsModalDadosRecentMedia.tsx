import React, { useMemo } from 'react';
import { ChevronRight, ImageIcon } from 'lucide-react';
import { StorageThumbImg } from '../ui/StorageThumbImg';
import { uiOsModalCardSectionTitle, uiOsModalSectionAppIcon } from '../ui/appTypography';

export type PatioOsDadosRecentPhoto = {
  url: string;
  name: string;
  path: string;
};

export type PatioOsModalDadosRecentMediaProps = {
  insetCardClass: string;
  photos: PatioOsDadosRecentPhoto[];
  loading: boolean;
  /** Quantidade máxima de miniaturas na faixa (default 8). */
  maxVisible?: number;
  onPreview: (photos: PatioOsDadosRecentPhoto[], index: number) => void;
  onOpenArquivos: () => void;
};

/**
 * Faixa “Mídia recente” da aba Dados (PC): reutiliza anexos já carregados
 * e os mesmos handlers de lightbox / aba Arquivos — sem novas APIs.
 */
export const PatioOsModalDadosRecentMedia: React.FC<PatioOsModalDadosRecentMediaProps> = ({
  insetCardClass,
  photos,
  loading,
  maxVisible = 8,
  onPreview,
  onOpenArquivos,
}) => {
  const visible = useMemo(() => photos.slice(0, maxVisible), [photos, maxVisible]);
  const extra = Math.max(0, photos.length - visible.length);

  return (
    <div className={`${insetCardClass} patio-vm-dados-media min-w-0 overflow-hidden shadow-none`}>
      <div className="relative min-w-0">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.07),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.11),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(245,208,11,0.1),transparent_52%)]"
          aria-hidden
        />

        <div className="patio-vm-dados-section-head relative flex items-center justify-between gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 backdrop-blur-[2px] dark:border-white/[0.08] dark:bg-zinc-950/35 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            <div className={uiOsModalSectionAppIcon}>
              <img src="/icons/arquivos-ios.png" alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className={uiOsModalCardSectionTitle}>Mídia recente</p>
              {!loading && photos.length > 0 ? (
                <p className="mt-0.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  {photos.length} {photos.length === 1 ? 'foto' : 'fotos'} na OS
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenArquivos}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-xl bg-[#007AFF] px-2.5 py-1 text-[11px] font-semibold text-white transition-colors hover:bg-[#0066d6] dark:bg-[#0A84FF] dark:hover:bg-[#0070e0]"
          >
            Ver todas
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>

        <div className="relative border-t border-zinc-200/60 bg-zinc-50/90 px-3 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-4 sm:py-3.5">
          {loading && photos.length === 0 ? (
            <div className="flex items-center gap-2 py-2 text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#007AFF]/30 border-t-[#007AFF]" />
              Carregando anexos…
            </div>
          ) : photos.length === 0 ? (
            <button
              type="button"
              onClick={onOpenArquivos}
              className="flex w-full items-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-white px-3 py-3 text-left transition-colors hover:border-[#007AFF]/40 hover:bg-white dark:border-zinc-600 dark:bg-zinc-950/50 dark:hover:border-[#007AFF]/45"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                <ImageIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-semibold text-zinc-800 dark:text-zinc-100">
                  Nenhuma foto nesta OS
                </span>
                <span className="mt-0.5 block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Abra Arquivos para enviar ou organizar anexos
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" strokeWidth={2.25} aria-hidden />
            </button>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-0.5 custom-scrollbar">
              {visible.map((photo, index) => (
                <button
                  key={photo.path || `${photo.url}-${index}`}
                  type="button"
                  onClick={() => onPreview(photos, index)}
                  className="patio-vm-dados-media-thumb group relative h-[4.75rem] w-[4.75rem] shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 transition-transform duration-150 ease-out hover:border-[#007AFF]/45 active:scale-[0.97] dark:border-zinc-600 dark:bg-zinc-800"
                  title={photo.name || 'Foto'}
                  aria-label={`Abrir foto ${index + 1} de ${photos.length}`}
                >
                  <StorageThumbImg
                    src={photo.url}
                    alt=""
                    className="h-full w-full object-cover"
                    thumbMaxWidth={160}
                    thumbMaxHeight={160}
                    thumbResize="cover"
                  />
                </button>
              ))}
              {extra > 0 ? (
                <button
                  type="button"
                  onClick={onOpenArquivos}
                  className="flex h-[4.75rem] w-[4.75rem] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-zinc-200 bg-white text-zinc-700 transition-colors hover:border-[#007AFF]/40 hover:text-[#007AFF] dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:text-[#7ab8ff]"
                  aria-label={`Ver mais ${extra} fotos em Arquivos`}
                >
                  <span className="text-[15px] font-bold tabular-nums">+{extra}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide">Arquivos</span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
