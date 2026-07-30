import React from 'react';
import { CalendarDays, ChevronRight, User } from 'lucide-react';
import {
  budgetChronologicalNumber,
  type PatioVehicleBudgetAggregateItem,
} from '../../../services/apiService';
import { BudgetVerifiedSeal } from '../../budget/BudgetVerifiedSeal';
import { PatioBoardOriginIcon } from '../../patio/PatioBoardOriginIcon';
import { MercosulPlateMockup } from '../../ui/MercosulPlateMockup';
import { VehicleBrandLogo } from '../../ui/VehicleBrandLogo';
import { getStageConfig, getStageStyle } from '../../../constants/serviceOrderStages';
import { firstTwoNames } from '../../../utils/personNameFormat';
import { getPatioBoardModelTitleClass } from '../../../utils/patioBoardModelTitle';
import {
  DESKTOP_LANDSCAPE_CARD_ZOOM,
  getPatioBoardCardRadiusClass,
  patioBoardGlassCardShadow,
  vehicleCardTitleShadow,
} from '../../../utils/patioBoardGlassCard';
import { budgetOrderFlow } from '../../../utils/budgetsHubViews';

function formatBudgetCreated(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

export type BudgetHubPatioStyleCardProps = {
  row: PatioVehicleBudgetAggregateItem;
  /** Todos os orçamentos da mesma OS (para número cronológico). */
  siblings?: Pick<PatioVehicleBudgetAggregateItem, 'budgetId' | 'createdAt'>[];
  pulse?: 'created' | 'edited';
  needsAttention?: boolean;
  blurPlates?: boolean;
  desktopShell?: boolean;
  compact?: boolean;
  onOpen: () => void;
};

/**
 * Card de orçamento no chrome visual dos veículos do Pátio
 * (vidro, tipografia, placa Mercosul, selo verificado).
 */
export function BudgetHubPatioStyleCard({
  row,
  siblings,
  pulse,
  needsAttention,
  blurPlates = false,
  desktopShell,
  compact,
  onOpen,
}: BudgetHubPatioStyleCardProps) {
  const isLab = row.orderType === 'module';
  const flow = budgetOrderFlow(row.orderType);
  const stage = getStageConfig(row.orderStatus, flow);
  const stageStyle = getStageStyle(row.orderStatus, flow);
  const model =
    [row.vehicleBrand, row.vehicleModel].filter(Boolean).join(' ').trim() ||
    (isLab ? (row.moduleIdentification ?? '').trim() || 'Módulo' : 'Veículo');
  const customerLine = firstTwoNames((row.customerName ?? '').trim());
  const hasCustomer = Boolean(customerLine);
  const plate = (row.plate ?? '').trim() || '---';
  const moduleId = (row.moduleIdentification ?? row.vehicleModel ?? '').trim() || '—';
  const chrono = (siblings ?? [row]).map((x) => ({
    id: String(x.budgetId),
    createdAt: x.createdAt,
  }));
  const budgetNum = budgetChronologicalNumber(chrono, row.budgetId);
  const createdLabel = formatBudgetCreated(row.createdAt);
  const radius = getPatioBoardCardRadiusClass(Boolean(desktopShell), Boolean(compact));
  const pad = compact ? 'gap-2.5 px-3 py-3.5' : 'gap-3 p-4 sm:p-5';
  const titleClass = getPatioBoardModelTitleClass(model, Boolean(compact), true);

  const ringClass = needsAttention
    ? 'border-2 border-red-400/70 ring-2 ring-inset ring-red-400/50 ring-offset-0 dark:border-red-400/55'
    : 'border-zinc-200/80 dark:border-white/[0.07] ring-1 ring-inset ring-zinc-400/35 ring-offset-0 dark:ring-white/[0.1]';

  return (
    <div className="h-auto w-full self-start">
      <button
        type="button"
        onClick={onOpen}
        className={`
          group relative flex min-h-0 w-full flex-col overflow-hidden border bg-white/70 text-left backdrop-blur-2xl
          dark:bg-zinc-900/40
          ${patioBoardGlassCardShadow}
          hover:border-[#007AFF]/28 dark:hover:border-white/[0.12]
          active:scale-[0.99]
          transition-[border-color,transform,box-shadow] duration-200 ease-out
          cursor-pointer
          ${radius}
          ${pad}
          ${ringClass}
        `}
      >
        {needsAttention ? (
          <div
            className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-red-500/[0.08] dark:bg-red-400/[0.12]"
            aria-hidden
          />
        ) : null}

        <div
          className={`relative z-10 flex min-h-0 w-full flex-col ${compact ? 'gap-2' : 'gap-2.5'}`}
          style={
            desktopShell
              ? ({ zoom: DESKTOP_LANDSCAPE_CARD_ZOOM } as React.CSSProperties & { zoom?: number })
              : undefined
          }
        >
          <div className="min-w-0">
            <div className={`flex min-w-0 items-start gap-2 ${compact ? 'mb-1' : 'mb-1.5'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h3
                    className={`font-vehicle ${titleClass} min-w-0 font-bold uppercase leading-[0.9] tracking-tight text-zinc-900 break-words dark:text-white ${vehicleCardTitleShadow}`}
                  >
                    {model}
                  </h3>
                  {row.isVerified ? (
                    <BudgetVerifiedSeal
                      variant="social"
                      size={compact ? 'md' : 'lg'}
                      verifiedAt={row.verifiedAt}
                      verifiedByName={row.verifiedByName}
                    />
                  ) : null}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-zinc-200/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-700 dark:bg-white/[0.1] dark:text-zinc-300">
                    Orç. {budgetNum}
                  </span>
                  {row.osNumber != null ? (
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-400">
                      OS #{row.osNumber}
                    </span>
                  ) : null}
                  {pulse === 'created' ? (
                    <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                      Novo
                    </span>
                  ) : null}
                  {pulse === 'edited' ? (
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-200">
                      Editado
                    </span>
                  ) : null}
                  {!row.isVerified ? (
                    <span className="rounded-full border border-amber-300/70 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.06em] text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                      Pendente
                    </span>
                  ) : null}
                </div>
              </div>
              {!isLab ? (
                <VehicleBrandLogo
                  brand={row.vehicleBrand}
                  size={desktopShell ? 'cardPc' : 'card'}
                  className="shrink-0"
                />
              ) : (
                <PatioBoardOriginIcon kind="laboratorio" size={compact ? 'cardCompact' : 'card'} />
              )}
            </div>

            {hasCustomer ? (
              <div
                className={`mb-0 flex max-w-full items-center gap-2 rounded-2xl border border-zinc-200/70 bg-white/55 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05] ${
                  compact ? 'min-h-[2.1rem] px-2.5 py-1.5' : 'min-h-[2.6rem] px-3 py-2.5'
                }`}
              >
                <User
                  className={`shrink-0 text-[#007AFF] ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
                  strokeWidth={2}
                />
                <span
                  className={`min-w-0 flex-1 truncate font-semibold tracking-tight text-zinc-700 dark:text-zinc-200 ${
                    compact ? 'text-[0.95rem]' : 'text-[1.05rem]'
                  }`}
                >
                  {customerLine}
                </span>
              </div>
            ) : null}

            <div
              className={`flex min-w-0 items-center justify-between gap-2 ${
                hasCustomer ? (compact ? 'mt-1.5' : 'mt-2') : 'mt-1'
              }`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <CalendarDays
                  className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500"
                  strokeWidth={2.2}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Criado em
                  </p>
                  <p className="truncate text-[12px] font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                    {createdLabel}
                  </p>
                </div>
              </div>
              {!isLab ? (
                <MercosulPlateMockup
                  plate={plate}
                  blurPlates={blurPlates}
                  size={compact ? 'cardCompact' : 'cardGrid'}
                />
              ) : (
                <div className="max-w-[55%] rounded-2xl border border-zinc-200/70 bg-white/55 px-2.5 py-1.5 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05]">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Módulo
                  </p>
                  <p className="truncate font-mono text-[12px] font-bold text-zinc-900 dark:text-white">
                    {moduleId}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div
            className={`
              flex w-full items-center gap-2 rounded-2xl border border-black/10
              shadow-[0_2px_12px_-2px_rgba(0,0,0,0.15)] dark:border-white/10 dark:shadow-[0_2px_16px_-2px_rgba(0,0,0,0.35)]
              ${compact ? 'min-h-[44px] py-2 pl-3.5 pr-2.5' : 'min-h-[52px] py-2.5 pl-5 pr-3'}
              ${stageStyle}
            `}
          >
            <span className="min-w-0 flex-1 truncate text-left text-[15px] font-semibold uppercase leading-snug tracking-wide !text-black sm:text-[16px]">
              {stage?.name ?? row.orderStatus}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-black opacity-80" strokeWidth={2.5} aria-hidden />
          </div>
        </div>
      </button>
    </div>
  );
}
