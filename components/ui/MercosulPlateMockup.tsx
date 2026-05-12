import React from 'react';
import { BrazilFlagIcon } from './BrazilFlagIcon';

export type MercosulPlateMockupSize = 'card' | 'cardCompact' | 'cardGrid' | 'modal';

/** Miniatura Mercosul — proporção ~400×130 mm (placa traseira veículo). */
export function MercosulPlateMockup(props: {
  plate: string;
  blurPlates?: boolean;
  size: MercosulPlateMockupSize;
  selectable?: boolean;
}) {
  const { plate, blurPlates = false, size, selectable = false } = props;
  const display = (plate || '—').trim() || '—';

  const isCompact = size === 'cardCompact';
  const isCardGrid = size === 'cardGrid';
  const isModal = size === 'modal';

  const w = isCompact ? 'w-[122px]' : isCardGrid ? 'w-[148px]' : 'w-[174px]';

  const shadow = isCompact ? 'shadow-md shadow-black/15' : 'shadow-xl shadow-black/25';

  const bandText = isCompact ? 'text-[6.2px]' : isCardGrid ? 'text-[9.4px]' : 'text-[11px]';

  const flagW = isCompact ? 12 : isCardGrid ? 14 : 16;
  const flagH = isCompact ? 9 : isCardGrid ? 9 : 10;

  const plateText = isCompact
    ? 'text-[21.5px] sm:text-[22.9px]'
    : isCardGrid
      ? 'text-[32px] sm:text-[35.2px]'
      : isModal
        ? 'text-[31.8px] sm:text-[34.8px]'
        : 'text-[37.6px] sm:text-[41.5px]';

  const mockup = (
    <div
      className={`${w} aspect-[400/130] grid grid-rows-[20%_80%] overflow-hidden rounded-[7px] border-[2px] border-black bg-white ${shadow} ${selectable ? 'select-text' : 'select-none'} sm:rounded-[9px]`}
      aria-hidden
    >
      <div
        className={`flex min-h-0 items-center justify-between gap-1 bg-[#003399] ${isCompact ? 'px-1.5' : 'px-2 sm:px-3'}`}
      >
        <span className={`font-semibold uppercase leading-none tracking-wide text-white ${bandText}`}>BRASIL</span>
        <BrazilFlagIcon width={flagW} height={flagH} className="shrink-0 rounded-sm border border-white/35" />
      </div>
      <div className={`flex min-h-0 items-center justify-center bg-white ${isCompact ? 'px-1' : 'px-1.5 sm:px-2'}`}>
        <span
          className={`font-plate max-w-[100%] text-center font-extrabold uppercase leading-[0.95] tracking-[0.06em] text-black antialiased ${plateText} ${blurPlates ? 'blur-plate' : ''}`}
        >
          {display.toUpperCase()}
        </span>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="inline-block origin-center [zoom:0.9]" aria-hidden>
        {mockup}
      </div>
    );
  }

  const isBoardCardSize = size === 'card' || size === 'cardGrid' || size === 'cardCompact';
  if (isBoardCardSize) {
    return (
      <div className="inline-block origin-right portrait:scale-[0.85]" aria-hidden>
        {mockup}
      </div>
    );
  }

  return mockup;
}
