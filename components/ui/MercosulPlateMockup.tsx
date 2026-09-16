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
 * Miniatura da placa Mercosul BR (400×130 mm).
 * Cantos retos, faixa azul oficial, tipografia condensada e bandeira realista.
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
    ? 'w-[104px]'
    : isCardGrid
      ? 'w-[118px] sm:w-[126px]'
      : isModalMobile
        ? 'w-[112px]'
        : isModalTablet
          ? 'w-[148px]'
          : isModalPc
            ? 'w-[144px] xl:w-[156px]'
            : isModal
              ? 'w-[176px] sm:w-[196px]'
              : 'w-[148px] sm:w-[160px]';

  const bandText = isCompact
    ? 'text-[5px] tracking-[0.2em]'
    : isCardGrid
      ? 'text-[6.5px] tracking-[0.22em] sm:text-[7px]'
      : isModalMobile
        ? 'text-[6.5px] tracking-[0.2em]'
        : isModalTablet
          ? 'text-[8px] tracking-[0.22em]'
          : isModalPc
            ? 'text-[7px] tracking-[0.22em] xl:text-[7.5px]'
            : 'text-[7.5px] tracking-[0.24em] sm:text-[8.5px]';

  const flagW = isCompact ? 12 : isCardGrid ? 14 : isModalMobile ? 12 : isModalTablet ? 15 : isModalPc ? 13 : 16;
  const flagH = isCompact ? 8 : isCardGrid ? 10 : isModalMobile ? 8 : isModalTablet ? 10 : isModalPc ? 9 : 11;

  const plateText = isCompact
    ? 'text-[17px] tracking-[0.12em]'
    : isCardGrid
      ? 'text-[22px] tracking-[0.14em] sm:text-[24px]'
      : isModalMobile
        ? 'text-[18px] tracking-[0.12em]'
        : isModalTablet
          ? 'text-[24px] tracking-[0.14em]'
          : isModalPc
            ? 'text-[24px] tracking-[0.14em] xl:text-[26px]'
            : isModal
              ? 'text-[28px] tracking-[0.14em] sm:text-[32px]'
              : 'text-[28px] tracking-[0.14em] sm:text-[32px]';

  const mockup = (
    <div
      className={`${w} aspect-[400/140] relative grid grid-rows-[24%_76%] overflow-hidden rounded-[3px] border-[1.75px] border-[#1a1a1a] bg-white shadow-[0_2px_5px_-1px_rgba(0,0,0,0.3),0_1px_2px_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] ${selectable ? 'select-text' : 'select-none'}`}
      aria-hidden
    >
      <div className="pointer-events-none absolute inset-[1.25px] z-10 rounded-[2px] border border-black/20" />

      <div
        className={`relative z-[1] flex min-h-0 items-center justify-between bg-[#003399] ${
          isCompact || isModalMobile ? 'px-1.5' : 'px-2 sm:px-2.5'
        }`}
      >
        <span className={`font-semibold uppercase leading-none text-white ${bandText}`}>BRASIL</span>
        <BrazilFlagIcon width={flagW} height={flagH} className="shrink-0 rounded-[1px]" />
      </div>

      <div
        className={`relative z-[1] flex min-h-0 items-center justify-center bg-gradient-to-b from-[#fafafa] via-white to-[#ececec] ${
          isCompact || isModalMobile ? 'px-0.5' : 'px-1'
        }`}
      >
        <span
          className={`font-plate max-w-[100%] text-center font-extrabold uppercase leading-none text-[#0a0a0a] antialiased ${plateText} ${
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
