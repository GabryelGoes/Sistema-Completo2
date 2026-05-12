import React from 'react';
import { User, Wrench, ChevronDown } from 'lucide-react';
import { getStageStyle } from '../../constants/serviceOrderStages';
import { MercosulPlateMockup } from '../ui/MercosulPlateMockup';
import { capitalizeFirst, firstTwoNames } from '../../utils/personNameFormat';
import { getPatioBoardModelTitleClass } from '../../utils/patioBoardModelTitle';
import {
  DESKTOP_LANDSCAPE_CARD_ZOOM,
  patioBoardGlassCardShadow,
  vehicleCardTitleShadow,
} from '../../utils/patioBoardGlassCard';

export type PatioStyleArchiveBoardCardProps = {
  boardPanoramic: boolean;
  isDesktopLandscape: boolean;
  isModuleMode: boolean;
  blurPlates?: boolean;
  model: string;
  /** Placa (veículo) ou identificação do módulo. */
  plateOrModule: string;
  /** Nome completo do cliente (o componente aplica firstTwoNames na linha). */
  customerFullName: string;
  vehicleColor?: string | null;
  /** Data de arquivamento (exibida após "Arquivado ·"). */
  archivedAt: string | Date | null | undefined;
  mechanicName?: string | null;
  /** Classes Tailwind do squircle do ícone (ex.: bg-blue-600 text-white border-blue-600). */
  mechanicSquircleClassName?: string;
  garantiaTag?: boolean;
  onOpen: () => void;
  /** Ações extras abaixo da faixa "Arquivado" (ex.: orçamentos na Recepção) — cliques não abrem a ficha. */
  footerAppend?: React.ReactNode;
};

function formatArchivedDate(archivedAt: string | Date | null | undefined): string {
  if (archivedAt == null) return '—';
  try {
    const d = typeof archivedAt === 'string' ? new Date(archivedAt) : archivedAt;
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
  } catch {
    return '—';
  }
}

/**
 * Cartão de OS arquivada com o mesmo chrome da grade do Pátio (vidro, tipografia, blocos cliente/placa, técnico, faixa inferior).
 */
export function PatioStyleArchiveBoardCard({
  boardPanoramic,
  isDesktopLandscape,
  isModuleMode,
  blurPlates = false,
  model,
  plateOrModule,
  customerFullName,
  vehicleColor,
  archivedAt,
  mechanicName,
  mechanicSquircleClassName = 'bg-zinc-600 text-white border-zinc-600',
  garantiaTag = false,
  onOpen,
  footerAppend,
}: PatioStyleArchiveBoardCardProps) {
  const customerLine = firstTwoNames((customerFullName || '').trim());
  const hasCustomer = Boolean(customerLine);
  const plate = (plateOrModule || '---').trim() || '---';
  const mechanic = (mechanicName || '').trim();
  const hasMechanic = Boolean(mechanic);
  const archivedStyle = getStageStyle('CANCELLED');
  const archivedWhen = formatArchivedDate(archivedAt);
  const isGarantia = garantiaTag === true;

  const shellRound =
    boardPanoramic
      ? 'rounded-[1.85rem] sm:rounded-[2.1rem]'
      : 'rounded-[2rem] sm:rounded-[2.25rem]';
  const bodyPad =
    boardPanoramic
      ? 'px-3 py-[calc(0.75rem*1.6146)] sm:px-3.5 sm:py-[calc(0.875rem*1.6146)]'
      : 'p-4 sm:p-5';
  const footerPad =
    boardPanoramic ? 'px-3 pb-[calc(0.75rem*1.6146)] pt-0 sm:px-3.5 sm:pb-[calc(0.875rem*1.6146)]' : 'px-4 pb-4 pt-0 sm:px-5 sm:pb-5';

  return (
    <div className="h-auto w-full self-start transition-opacity duration-300 ease-out" style={{ transformStyle: 'preserve-3d' }}>
      <div
        className={`
          group relative flex min-h-0 w-full flex-col overflow-hidden border bg-white/70 backdrop-blur-2xl dark:bg-zinc-900/40
          ${patioBoardGlassCardShadow}
          hover:border-[#007AFF]/28 dark:hover:border-white/[0.12]
          motion-safe:transition-[border-radius,box-shadow] motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.34,1.35,0.25,1)]
          ${shellRound}
          ${
            isGarantia
              ? 'border-red-500/40 ring-2 ring-inset ring-red-500 ring-offset-0'
              : 'border-zinc-200/80 dark:border-white/[0.07] ring-1 ring-inset ring-zinc-400/35 ring-offset-0 dark:ring-white/[0.1]'
          }
        `}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={onOpen}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpen();
            }
          }}
          className={`${bodyPad} flex min-h-0 w-full cursor-pointer flex-col active:scale-[0.99] motion-safe:transition-transform motion-safe:duration-200 ${
            boardPanoramic ? 'gap-[calc(0.625rem*1.6146)]' : 'gap-3'
          }`}
        >
          <div
            className={`relative z-10 flex min-h-0 w-full flex-col ${
              boardPanoramic ? 'gap-[calc(0.5rem*1.6146)]' : 'gap-2.5'
            }`}
            style={
              isDesktopLandscape
                ? ({ zoom: DESKTOP_LANDSCAPE_CARD_ZOOM } as React.CSSProperties & { zoom?: number })
                : undefined
            }
          >
            <div className="min-w-0">
              <div className={boardPanoramic ? 'mb-[calc(0.25rem*1.6146)] portrait:mb-1' : 'mb-1.5 portrait:mb-1'}>
                <h3
                  className={`font-vehicle ${getPatioBoardModelTitleClass(model, boardPanoramic, true)} font-bold text-zinc-900 dark:text-white uppercase leading-[0.9] tracking-tight break-words portrait:inline-block portrait:w-full portrait:origin-top-left portrait:scale-[0.85] ${vehicleCardTitleShadow}`}
                >
                  {model}
                </h3>
                {!isModuleMode && (vehicleColor ?? '').trim() ? (
                  <p
                    className="mt-1 max-w-full truncate text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400/75 dark:text-zinc-500/85"
                    title={`Cor: ${(vehicleColor ?? '').trim()}`}
                  >
                    {(vehicleColor ?? '').trim()}
                  </p>
                ) : null}
              </div>

              {hasCustomer ? (
                <div
                  className={`mb-0 flex max-w-full items-center justify-between gap-2 rounded-2xl border border-zinc-200/70 bg-white/55 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05] portrait:rounded-xl portrait:gap-1.5 portrait:border-zinc-200/55 ${
                    boardPanoramic
                      ? 'px-2 py-[calc(0.25rem*1.6146)] portrait:px-1.5 portrait:py-1'
                      : 'px-3 py-1.5 portrait:px-2 portrait:py-1'
                  }`}
                >
                  <div className="min-w-0 flex flex-1 items-center gap-2">
                    <User
                      className={`shrink-0 text-[#007AFF] ${boardPanoramic ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
                      strokeWidth={2}
                    />
                    <span
                      className={`min-w-0 flex-1 truncate font-semibold text-zinc-700 dark:text-zinc-200 tracking-tight ${
                        boardPanoramic
                          ? 'text-[1.049rem] portrait:text-[0.8392rem]'
                          : 'text-[1.199rem] portrait:text-[0.9592rem]'
                      }`}
                    >
                      {customerLine}
                    </span>
                  </div>
                  {!isModuleMode && (
                    <div className="shrink-0">
                      <MercosulPlateMockup
                        plate={plate}
                        blurPlates={blurPlates}
                        size={boardPanoramic ? 'cardCompact' : 'cardGrid'}
                      />
                    </div>
                  )}
                </div>
              ) : !isModuleMode ? (
                <div className="mb-0 flex max-w-full justify-end">
                  <MercosulPlateMockup
                    plate={plate}
                    blurPlates={blurPlates}
                    size={boardPanoramic ? 'cardCompact' : 'cardGrid'}
                  />
                </div>
              ) : null}

              <div className={`flex min-w-0 items-start gap-2 sm:gap-3 ${boardPanoramic ? 'mt-2.5' : 'mt-3.5'}`}>
                <div className="min-w-0 flex-1">
                  <div
                    className={`
                    inline-flex max-w-full cursor-default items-center justify-start gap-1.5 rounded-2xl border px-3 transition-none
                    ${boardPanoramic ? 'py-[calc(0.375rem*1.6146)]' : 'py-1.5'}
                    border-zinc-200/60 dark:border-white/5 bg-light-card/80 dark:bg-white/[0.04] text-zinc-700 dark:text-zinc-200
                  `}
                  >
                    {hasMechanic ? (
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-transparent shadow-md portrait:h-[1.6rem] portrait:w-[1.6rem] portrait:rounded-lg ${mechanicSquircleClassName}`}
                      >
                        <Wrench
                          className="h-4 w-4 text-white opacity-95 [filter:drop-shadow(0_1px_1px_rgba(0,0,0,0.35))] portrait:h-[0.8rem] portrait:w-[0.8rem]"
                          strokeWidth={2.35}
                          aria-hidden
                        />
                      </div>
                    ) : (
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-zinc-200/70 bg-zinc-100/80 dark:border-white/10 dark:bg-white/[0.06] portrait:h-[1.6rem] portrait:w-[1.6rem] portrait:rounded-lg">
                        <Wrench
                          className="h-4 w-4 text-zinc-400 dark:text-zinc-500 portrait:h-[0.8rem] portrait:w-[0.8rem]"
                          strokeWidth={2.35}
                          aria-hidden
                        />
                      </div>
                    )}
                    <span
                      className={`font-bold truncate ${
                        boardPanoramic ? 'text-[1.049rem] portrait:text-[0.8392rem]' : 'text-[1.199rem] portrait:text-[0.9592rem]'
                      }`}
                    >
                      {hasMechanic ? capitalizeFirst(mechanic) : 'Sem técnico'}
                    </span>
                  </div>
                </div>
              </div>

              {isModuleMode ? (
                <div className={`${boardPanoramic ? 'mt-2.5' : 'mt-3'}`}>
                  <div
                    className={`inline-block max-w-full rounded-2xl border border-zinc-200/70 bg-white/55 px-3 py-2 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05] ${
                      boardPanoramic ? 'px-2 py-1.5' : ''
                    }`}
                  >
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">Módulo</p>
                    <p className="truncate font-mono text-sm font-bold text-zinc-900 dark:text-white">{plate}</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div
              className={`relative z-10 w-full shrink-0 ${boardPanoramic ? 'space-y-[calc(0.375rem*1.6146)]' : 'space-y-2'}`}
            >
              <div
                className={`
                flex w-full cursor-pointer items-center gap-2 rounded-2xl transition-all duration-200 ease-out
                shadow-[0_2px_12px_-2px_rgba(0,0,0,0.15)] dark:shadow-[0_2px_16px_-2px_rgba(0,0,0,0.35)]
                border border-black/10 dark:border-white/10
                ${
                  boardPanoramic
                    ? 'min-h-[calc(50px*1.6146)] py-[calc(0.5rem*1.6146)] pl-3.5 pr-2.5 text-[13px]'
                    : 'min-h-[57px] py-2.5 pl-5 pr-3'
                }
                ${archivedStyle}
                group-hover:brightness-105
              `}
              >
                <span className="min-w-0 flex-1 truncate text-left text-[17.6px] font-semibold uppercase leading-snug tracking-wide !text-black dark:!text-black sm:text-[18.7px] portrait:text-[12.67px] portrait:sm:text-[13.46px]">
                  Arquivado · {archivedWhen}
                </span>
                <ChevronDown
                  className={`shrink-0 text-black opacity-90 dark:text-black ${boardPanoramic ? 'h-4 w-4 portrait:h-[10.8px] portrait:w-[10.8px]' : 'h-[18px] w-[18px] portrait:h-[12.96px] portrait:w-[12.96px]'}`}
                  strokeWidth={2.5}
                  aria-hidden
                />
              </div>
            </div>
          </div>
        </div>

        {footerAppend ? (
          <div
            className={`relative z-20 border-t border-zinc-200/55 bg-white/40 dark:border-white/[0.06] dark:bg-zinc-950/25 ${footerPad}`}
          >
            {footerAppend}
          </div>
        ) : null}
      </div>
    </div>
  );
}
