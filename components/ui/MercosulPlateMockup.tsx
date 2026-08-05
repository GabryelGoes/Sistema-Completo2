import React from 'react';
import { BrazilFlagIcon } from './BrazilFlagIcon';

export type MercosulPlateMockupSize =
  | 'card'
  | 'cardCompact'
  | 'cardGrid'
  | 'modal'
  | 'modalPc'
  | 'modalTablet'
  | 'modalMobile';

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
  const isModalPc = size === 'modalPc';
  const isModalTablet = size === 'modalTablet';
  const isModalMobile = size === 'modalMobile';

  const w = isCompact
    ? 'w-[112px]'
    : isCardGrid
      ? 'w-[128px] sm:w-[138px]'
      : isModalMobile
        ? 'w-[118px]'
        : isModalTablet
          ? 'w-[156px]'
          : isModalPc
            ? 'w-[152px] xl:w-[166px]'
            : isModal
              ? 'w-[188px] sm:w-[210px]'
              : 'w-[160px] sm:w-[172px]';

  const bandText = isCompact
    ? 'text-[5.5px] tracking-[0.18em]'
    : isCardGrid
      ? 'text-[7px] tracking-[0.2em] sm:text-[7.5px]'
      : isModalMobile
        ? 'text-[7px] tracking-[0.18em]'
        : isModalTablet
          ? 'text-[8.5px] tracking-[0.2em]'
          : isModalPc
            ? 'text-[7.5px] tracking-[0.2em] xl:text-[8px]'
            : 'text-[8px] tracking-[0.22em] sm:text-[9px]';

  const flagW = isCompact
    ? 11
    : isCardGrid
      ? 13
      : isModalMobile
        ? 11
        : isModalTablet
          ? 14
          : isModalPc
            ? 12
            : 15;
  const flagH = isCompact
    ? 8
    : isCardGrid
      ? 9
      : isModalMobile
        ? 8
        : isModalTablet
          ? 9
          : isModalPc
            ? 8
            : 10;

  const plateText = isCompact
    ? 'text-[19px] tracking-[0.08em]'
    : isCardGrid
      ? 'text-[24px] tracking-[0.1em] sm:text-[26px]'
      : isModalMobile
        ? 'text-[19px] tracking-[0.08em]'
        : isModalTablet
          ? 'text-[26px] tracking-[0.1em]'
          : isModalPc
            ? 'text-[26px] tracking-[0.1em] xl:text-[28px]'
            : isModal
              ? 'text-[30px] tracking-[0.1em] sm:text-[34px]'
              : 'text-[30px] tracking-[0.1em] sm:text-[34px]';

  const mockup = (
    <div
      className={`${w} aspect-[400/130] relative grid grid-rows-[22%_78%] overflow-hidden rounded-[8px] border-[1.5px] border-[#1a1a1a] bg-white shadow-[0_2px_6px_-1px_rgba(0,0,0,0.28),0_1px_2px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.85)] sm:rounded-[9px] ${selectable ? 'select-text' : 'select-none'}`}
      aria-hidden
    >
      {/* Filete interno metálico */}
      <div className="pointer-events-none absolute inset-[1.5px] z-10 rounded-[6.5px] border border-black/15 sm:rounded-[7.5px]" />

      <div
        className={`relative z-[1] flex min-h-0 items-center justify-between bg-[#003399] ${
          isCompact || isModalMobile ? 'px-1.5' : 'px-2 sm:px-2.5'
        }`}
      >
        <span className={`font-semibold uppercase leading-none text-white ${bandText}`}>BRASIL</span>
        <BrazilFlagIcon
          width={flagW}
          height={flagH}
          className="shrink-0 rounded-[2px] border border-white/40 shadow-sm"
        />
      </div>

      <div
        className={`relative z-[1] flex min-h-0 items-center justify-center bg-gradient-to-b from-white to-[#f3f3f3] ${
          isCompact || isModalMobile ? 'px-0.5' : 'px-1'
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
