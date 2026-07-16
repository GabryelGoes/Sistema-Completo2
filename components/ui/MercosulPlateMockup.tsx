import React from 'react';
import { BrazilFlagIcon } from './BrazilFlagIcon';

export type MercosulPlateMockupSize = 'card' | 'cardCompact' | 'cardGrid' | 'modal';

/**
 * Miniatura da placa Mercosul (proporção ~400×130 mm).
 * Visual reforçado para grade mobile/tablet: borda, faixa azul e tipografia condensada.
 */
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

  const w = isCompact
    ? 'w-[118px]'
    : isCardGrid
      ? 'w-[136px] sm:w-[148px]'
      : isModal
        ? 'w-[188px] sm:w-[210px]'
        : 'w-[168px] sm:w-[180px]';

  const bandText = isCompact
    ? 'text-[5.5px] tracking-[0.18em]'
    : isCardGrid
      ? 'text-[7px] tracking-[0.2em] sm:text-[7.5px]'
      : 'text-[8px] tracking-[0.22em] sm:text-[9px]';

  const flagW = isCompact ? 11 : isCardGrid ? 13 : 15;
  const flagH = isCompact ? 8 : isCardGrid ? 9 : 10;

  const plateText = isCompact
    ? 'text-[20px] tracking-[0.08em]'
    : isCardGrid
      ? 'text-[26px] tracking-[0.1em] sm:text-[28px]'
      : isModal
        ? 'text-[30px] tracking-[0.1em] sm:text-[34px]'
        : 'text-[32px] tracking-[0.1em] sm:text-[36px]';

  const qrBox = isCompact ? 'h-[9px] w-[9px]' : isCardGrid ? 'h-[11px] w-[11px]' : 'h-[12px] w-[12px]';

  const mockup = (
    <div
      className={`${w} aspect-[400/130] relative grid grid-rows-[22%_78%] overflow-hidden rounded-[3px] border-[1.5px] border-[#1a1a1a] bg-white shadow-[0_2px_6px_-1px_rgba(0,0,0,0.28),0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.85)] ${selectable ? 'select-text' : 'select-none'}`}
      aria-hidden
    >
      {/* Filete interno metálico */}
      <div className="pointer-events-none absolute inset-[1.5px] z-10 rounded-[1.5px] border border-black/15" />

      <div
        className={`relative z-[1] flex min-h-0 items-center justify-between bg-[#003399] ${
          isCompact ? 'px-1' : 'px-1.5 sm:px-2'
        }`}
      >
        <div className={`flex shrink-0 items-center justify-center rounded-[1px] bg-white/95 ${qrBox}`}>
          <div
            className="grid h-[70%] w-[70%] grid-cols-3 grid-rows-3 gap-[0.5px]"
            aria-hidden
          >
            {Array.from({ length: 9 }).map((_, i) => (
              <span
                key={i}
                className={`bg-[#003399] ${i % 2 === 0 ? 'opacity-100' : 'opacity-35'}`}
              />
            ))}
          </div>
        </div>
        <span className={`font-semibold uppercase leading-none text-white ${bandText}`}>BRASIL</span>
        <BrazilFlagIcon
          width={flagW}
          height={flagH}
          className="shrink-0 rounded-[1px] border border-white/40 shadow-sm"
        />
      </div>

      <div
        className={`relative z-[1] flex min-h-0 items-center justify-center bg-gradient-to-b from-white to-[#f3f3f3] ${
          isCompact ? 'px-0.5' : 'px-1'
        }`}
      >
        <span
          className={`font-plate max-w-[100%] text-center font-extrabold uppercase leading-none text-[#111] antialiased [text-shadow:0_0.5px_0_rgba(255,255,255,0.8)] ${plateText} ${
            blurPlates ? 'blur-plate' : ''
          }`}
        >
          {display.toUpperCase()}
        </span>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="inline-block origin-center" aria-hidden>
        {mockup}
      </div>
    );
  }

  return (
    <div className="inline-block origin-right" aria-hidden>
      {mockup}
    </div>
  );
}
