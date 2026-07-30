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
  getPatioBoardCardRadiusClass,
  patioBoardGlassCardShadow,
  vehicleCardTitleShadow,
} from '../../../utils/patioBoardGlassCard';
import {
  budgetOrderFlow,
  isBudgetRecentlyCreated,
  type VehicleBudgetGroup,
} from '../../../utils/budgetsHubViews';

/** Zoom dos cards no quadro Trello do hub (~28% menor). */
export const BUDGET_HUB_TRELLO_CARD_ZOOM = 0.72;
/** Zoom dos cards nas grades (tablet/mobile), fora do modo por etapa. */
export const BUDGET_HUB_MOBILE_GRID_CARD_ZOOM = 0.78;

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
  group: VehicleBudgetGroup;
  pulseByBudgetId?: Record<string, 'created' | 'edited'>;
  needsAttention?: boolean;
  blurPlates?: boolean;
  desktopShell?: boolean;
  compact?: boolean;
  /** Escala reduzida para colunas do modo por etapa. */
  trelloScale?: boolean;
  /** Escala reduzida nas grades em tablet/mobile (não PC). */
  mobileScale?: boolean;
  /** No Trello a etapa já está na coluna — não repetir no card. */
  hideStageFooter?: boolean;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
};

/**
 * Card de veículo/módulo no hub: um card por OS, com a lista de orçamentos
 * e status evidentes (verificado, aprovado, novo, pendente).
 */
export function BudgetHubPatioStyleCard({
  group,
  pulseByBudgetId = {},
  needsAttention,
  blurPlates = false,
  desktopShell,
  compact,
  trelloScale,
  mobileScale,
  hideStageFooter,
  onOpenBudget,
}: BudgetHubPatioStyleCardProps) {
  const dense = Boolean(trelloScale || compact || mobileScale);
  const cardZoom = trelloScale
    ? BUDGET_HUB_TRELLO_CARD_ZOOM
    : mobileScale
      ? BUDGET_HUB_MOBILE_GRID_CARD_ZOOM
      : undefined;

  const head = group.head;
  const items = [...group.items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const isLab = head.orderType === 'module';
  const flow = budgetOrderFlow(head.orderType);
  const stage = getStageConfig(head.orderStatus, flow);
  const stageStyle = getStageStyle(head.orderStatus, flow);
  const model =
    [head.vehicleBrand, head.vehicleModel].filter(Boolean).join(' ').trim() ||
    (isLab ? (head.moduleIdentification ?? '').trim() || 'Módulo' : 'Veículo');
  const customerLine = firstTwoNames((head.customerName ?? '').trim());
  const hasCustomer = Boolean(customerLine);
  const plate = (head.plate ?? '').trim() || '---';
  const moduleId = (head.moduleIdentification ?? head.vehicleModel ?? '').trim() || '—';
  const chrono = items.map((x) => ({ id: x.budgetId, createdAt: x.createdAt }));
  const latestCreated = items.reduce((best, it) => {
    const t = new Date(it.createdAt).getTime();
    return t > best ? t : best;
  }, 0);
  const createdLabel = formatBudgetCreated(
    Number.isFinite(latestCreated) && latestCreated > 0
      ? new Date(latestCreated).toISOString()
      : head.createdAt
  );
  const anyVerified = items.some((i) => i.isVerified);
  const radius = getPatioBoardCardRadiusClass(Boolean(desktopShell), dense);
  const pad = dense ? 'gap-1.5 px-2.5 py-2.5' : 'gap-3 p-4 sm:p-5';
  const titleClass = getPatioBoardModelTitleClass(model, dense, true);

  const ringClass = needsAttention
    ? 'border-2 border-red-400/70 ring-2 ring-inset ring-red-400/50 ring-offset-0 dark:border-red-400/55'
    : 'border-zinc-200/80 dark:border-white/[0.07] ring-1 ring-inset ring-zinc-400/35 ring-offset-0 dark:ring-white/[0.1]';

  const shellClass = `
    group relative flex min-h-0 w-full flex-col overflow-hidden border bg-white/70 text-left backdrop-blur-2xl
    dark:bg-zinc-900/40
    ${patioBoardGlassCardShadow}
    hover:border-[#007AFF]/28 dark:hover:border-white/[0.12]
    ${radius}
    ${pad}
    ${ringClass}
  `;

  return (
    <div
      className="h-auto w-full self-start"
      style={
        cardZoom != null
          ? ({ zoom: cardZoom } as React.CSSProperties & { zoom?: number })
          : undefined
      }
    >
      <div className={shellClass}>
        {needsAttention ? (
          <div
            className="pointer-events-none absolute inset-0 z-[1] rounded-[inherit] bg-red-500/[0.08] dark:bg-red-400/[0.12]"
            aria-hidden
          />
        ) : null}

        <div className={`relative z-10 flex min-h-0 w-full flex-col ${dense ? 'gap-1.5' : 'gap-2.5'}`}>
          <div className="min-w-0">
            <div className={`flex min-w-0 items-start gap-1.5 ${dense ? 'mb-0.5' : 'mb-1.5'}`}>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h3
                    className={`font-vehicle ${titleClass} min-w-0 font-bold uppercase leading-[0.9] tracking-tight text-zinc-900 break-words dark:text-white ${vehicleCardTitleShadow}`}
                  >
                    {model}
                  </h3>
                  {anyVerified ? (
                    <BudgetVerifiedSeal
                      variant="social"
                      size={dense ? 'lg' : 'xl'}
                      verifiedAt={items.find((i) => i.isVerified)?.verifiedAt}
                      verifiedByName={items.find((i) => i.isVerified)?.verifiedByName}
                    />
                  ) : null}
                </div>
                <div className={`mt-1 flex flex-wrap items-center ${dense ? 'gap-1' : 'gap-1.5'}`}>
                  <span
                    className={`rounded-full bg-zinc-200/90 font-bold uppercase tracking-[0.06em] text-zinc-700 dark:bg-white/[0.1] dark:text-zinc-300 ${
                      dense ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
                    }`}
                  >
                    {items.length} orç.
                  </span>
                  {head.osNumber != null ? (
                    <span
                      className={`rounded-full bg-zinc-100 font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-400 ${
                        dense ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
                      }`}
                    >
                      OS #{head.osNumber}
                    </span>
                  ) : null}
                </div>
              </div>
              {!isLab ? (
                <VehicleBrandLogo
                  brand={head.vehicleBrand}
                  size={dense ? 'card' : desktopShell ? 'cardPc' : 'card'}
                  className={`shrink-0 ${dense ? 'scale-90' : ''}`}
                />
              ) : (
                <PatioBoardOriginIcon kind="laboratorio" size={dense ? 'cardCompact' : 'card'} />
              )}
            </div>

            {hasCustomer ? (
              <div
                className={`mb-0 flex max-w-full items-center gap-1.5 border border-zinc-200/70 bg-white/55 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05] ${
                  dense ? 'rounded-xl px-2 py-1.5' : 'rounded-2xl px-3 py-2.5'
                }`}
              >
                <User className={`shrink-0 text-[#007AFF] ${dense ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} strokeWidth={2} />
                <span
                  className={`min-w-0 flex-1 truncate font-semibold tracking-tight text-zinc-700 dark:text-zinc-200 ${
                    dense ? 'text-[0.85rem]' : 'text-[1.05rem]'
                  }`}
                >
                  {customerLine}
                </span>
              </div>
            ) : null}

            <div className={`flex min-w-0 items-center justify-between gap-1.5 ${hasCustomer ? 'mt-1.5' : 'mt-1'}`}>
              <div className="flex min-w-0 items-center gap-1">
                <CalendarDays
                  className={`shrink-0 text-zinc-400 dark:text-zinc-500 ${dense ? 'h-3 w-3' : 'h-3.5 w-3.5'}`}
                  strokeWidth={2.2}
                  aria-hidden
                />
                <div className="min-w-0">
                  <p
                    className={`font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400 ${
                      dense ? 'text-[8px]' : 'text-[9px]'
                    }`}
                  >
                    Último orç.
                  </p>
                  <p
                    className={`truncate font-semibold tabular-nums text-zinc-800 dark:text-zinc-200 ${
                      dense ? 'text-[11px]' : 'text-[12px]'
                    }`}
                  >
                    {createdLabel}
                  </p>
                </div>
              </div>
              {!isLab ? (
                <MercosulPlateMockup
                  plate={plate}
                  blurPlates={blurPlates}
                  size={dense ? 'cardCompact' : 'cardGrid'}
                />
              ) : (
                <div
                  className={`max-w-[55%] border border-zinc-200/70 bg-white/55 backdrop-blur-sm dark:border-white/[0.08] dark:bg-white/[0.05] ${
                    dense ? 'rounded-xl px-2 py-1' : 'rounded-2xl px-2.5 py-1.5'
                  }`}
                >
                  <p className="text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-500 dark:text-zinc-400">
                    Módulo
                  </p>
                  <p className="truncate font-mono text-[11px] font-bold text-zinc-900 dark:text-white">{moduleId}</p>
                </div>
              )}
            </div>
          </div>

          {/* Lista de orçamentos do veículo — status evidentes */}
          <ul className={`flex flex-col ${dense ? 'gap-1' : 'gap-1.5'}`}>
            {items.map((row) => {
              const bid = String(row.budgetId).trim();
              const budgetNum = budgetChronologicalNumber(chrono, row.budgetId);
              const pulse = pulseByBudgetId[bid];
              const isNew = pulse === 'created' || isBudgetRecentlyCreated(row);
              return (
                <li key={row.budgetId}>
                  <button
                    type="button"
                    onClick={() => onOpenBudget(row.serviceOrderId, row.budgetId)}
                    className={`flex w-full items-center gap-1.5 rounded-xl border text-left transition-colors ${
                      dense ? 'px-2 py-1.5' : 'px-2.5 py-2'
                    } ${
                      row.hasApprovedItems
                        ? 'border-sky-300/70 bg-sky-50/90 hover:bg-sky-100/90 dark:border-sky-400/30 dark:bg-sky-500/10 dark:hover:bg-sky-500/15'
                        : row.isVerified
                          ? 'border-emerald-300/60 bg-emerald-50/80 hover:bg-emerald-100/80 dark:border-emerald-400/25 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15'
                          : 'border-amber-300/55 bg-amber-50/70 hover:bg-amber-100/80 dark:border-amber-500/25 dark:bg-amber-500/10 dark:hover:bg-amber-500/15'
                    }`}
                  >
                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.06em] text-zinc-600 dark:text-zinc-300">
                      Orç. {budgetNum}
                    </span>
                    {row.isVerified ? (
                      <BudgetVerifiedSeal
                        variant="social"
                        size="md"
                        verifiedAt={row.verifiedAt}
                        verifiedByName={row.verifiedByName}
                      />
                    ) : (
                      <span className="shrink-0 rounded-full border border-amber-400/50 bg-amber-100/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-amber-900 dark:border-amber-500/35 dark:bg-amber-500/15 dark:text-amber-200">
                        Não verif.
                      </span>
                    )}
                    {row.hasApprovedItems ? (
                      <span className="shrink-0 rounded-full bg-sky-600/15 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-sky-800 dark:bg-sky-400/20 dark:text-sky-200">
                        Aprovado
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-zinc-500/10 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                        Sem aprov.
                      </span>
                    )}
                    {isNew ? (
                      <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-emerald-800 dark:text-emerald-300">
                        Novo
                      </span>
                    ) : null}
                    {pulse === 'edited' ? (
                      <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-amber-900 dark:text-amber-200">
                        Editado
                      </span>
                    ) : null}
                    <span className="ml-auto shrink-0 text-[10px] font-medium tabular-nums text-zinc-500 dark:text-zinc-400">
                      {formatBudgetCreated(row.createdAt)}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={2.4} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>

          {!hideStageFooter ? (
            <div
              className={`
                flex w-full items-center gap-1.5 border border-black/10
                shadow-[0_2px_12px_-2px_rgba(0,0,0,0.15)] dark:border-white/10 dark:shadow-[0_2px_16px_-2px_rgba(0,0,0,0.35)]
                ${dense ? 'min-h-[38px] rounded-xl py-1.5 pl-3 pr-2' : 'min-h-[52px] rounded-2xl py-2.5 pl-5 pr-3'}
                ${stageStyle}
              `}
            >
              <span
                className={`min-w-0 flex-1 truncate text-left font-semibold uppercase leading-snug tracking-wide !text-black ${
                  dense ? 'text-[13px]' : 'text-[15px] sm:text-[16px]'
                }`}
              >
                {stage?.name ?? head.orderStatus}
              </span>
              <ChevronRight
                className={`shrink-0 text-black opacity-80 ${dense ? 'h-3.5 w-3.5' : 'h-4 w-4'}`}
                strokeWidth={2.5}
                aria-hidden
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
