import React, { useEffect, useState } from 'react';
import { Package } from 'lucide-react';
import {
  getLabProductKindPhotoUrl,
  LAB_PRODUCT_KINDS_CHANGED_EVENT,
  labProductDisplayLabel,
} from '../../utils/moduleMetadata';
import { storageThumbnailUrl } from '../../utils/storageThumbnailUrl';

export type LabOsModalPartHeroProps = {
  moduleKind?: string | null;
  moduleProductOther?: string | null;
  vehicleModel?: string | null;
  moduleIdentification?: string | null;
  /** Classes do título principal (herda tipografia do modal). */
  titleClassName: string;
  titleShadowClassName?: string;
  /** Conteúdo à direita do título (ex.: badge Garantia). */
  titleTrailing?: React.ReactNode;
  /** Tamanho da foto do tipo. */
  photoSizeClass?: string;
};

/**
 * Cabeçalho de OS do laboratório: tipo de peça em destaque + foto + veículo.
 * Mantém a tipografia/ritmo dos modais de OS do pátio.
 */
export function LabOsModalPartHero({
  moduleKind,
  moduleProductOther,
  vehicleModel,
  moduleIdentification,
  titleClassName,
  titleShadowClassName = '',
  titleTrailing,
  photoSizeClass = 'h-14 w-14 sm:h-16 sm:w-16',
}: LabOsModalPartHeroProps) {
  const [, bump] = useState(0);
  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    window.addEventListener(LAB_PRODUCT_KINDS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LAB_PRODUCT_KINDS_CHANGED_EVENT, onChange);
  }, []);

  const partLabel =
    labProductDisplayLabel(moduleKind, moduleProductOther).trim() || 'Peça';
  const vehicle = (vehicleModel || '').trim();
  const moduleId = (moduleIdentification || '').trim();
  const rawPhoto = getLabProductKindPhotoUrl(moduleKind);
  const photoUrl = rawPhoto
    ? storageThumbnailUrl(rawPhoto, { maxWidth: 160, maxHeight: 160, resize: 'cover' }) ||
      rawPhoto
    : null;

  const subtitleParts = [vehicle || null, moduleId || null].filter(Boolean) as string[];

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-3.5">
      <div
        className={`relative shrink-0 overflow-hidden rounded-[1.05rem] border border-zinc-200/90 bg-zinc-100 shadow-[0_10px_24px_-14px_rgba(0,0,0,0.35)] dark:border-white/[0.1] dark:bg-zinc-900 ${photoSizeClass}`}
        aria-hidden
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[#007AFF]/12 to-violet-500/10 text-[#007AFF] dark:from-[#007AFF]/20 dark:to-violet-400/15 dark:text-[#7ab8ff]">
            <Package className="h-7 w-7" strokeWidth={1.7} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <h1
            className={`${titleClassName} min-w-0 truncate ${titleShadowClassName}`}
            title={partLabel}
          >
            {partLabel}
          </h1>
          {titleTrailing}
        </div>
        {subtitleParts.length > 0 ? (
          <p
            className="mt-1 truncate text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-500/95 dark:text-zinc-400 sm:text-[13px] sm:tracking-[0.14em]"
            title={subtitleParts.join(' · ')}
          >
            {vehicle ? (
              <>
                <span className="text-zinc-600 dark:text-zinc-300">Veículo</span>
                <span className="mx-1.5 text-zinc-400 dark:text-zinc-500">·</span>
                <span className="normal-case tracking-normal text-zinc-700 dark:text-zinc-200">
                  {vehicle}
                </span>
              </>
            ) : null}
            {vehicle && moduleId ? (
              <span className="mx-1.5 text-zinc-400 dark:text-zinc-500">·</span>
            ) : null}
            {moduleId ? (
              <span className="normal-case tracking-normal font-medium text-zinc-500 dark:text-zinc-400">
                {moduleId}
              </span>
            ) : null}
          </p>
        ) : (
          <p className="mt-1 text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
            Peça do laboratório
          </p>
        )}
      </div>
    </div>
  );
}
