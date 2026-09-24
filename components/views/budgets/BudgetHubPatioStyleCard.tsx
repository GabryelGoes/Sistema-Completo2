import React, { useState } from 'react';
import { ChevronRight, User } from 'lucide-react';
import {
  budgetChronologicalNumber,
} from '../../../services/apiService';
import { BudgetVerifiedSeal } from '../../budget/BudgetVerifiedSeal';
import { MercosulPlateMockup } from '../../ui/MercosulPlateMockup';
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
  type VehicleBudgetGroup,
} from '../../../utils/budgetsHubViews';
import { BudgetHubBudgetPickerModal } from './BudgetHubBudgetPickerModal';

/** Zoom dos cards no quadro Trello do hub (~28% menor). */
export const BUDGET_HUB_TRELLO_CARD_ZOOM = 0.72;
/** Zoom dos cards nas grades dos atalhos (exceto por etapa). */
export const BUDGET_HUB_GRID_CARD_ZOOM = 0.7;
/** Zoom um pouco menos agressivo no PC. */
export const BUDGET_HUB_GRID_CARD_ZOOM_PC = 0.82;

/** Abrevia modelo longo para caber em uma linha sem empurrar a logo. */
function abbreviateVehicleModelName(name: string, maxChars: number): string {
  const t = name.trim().replace(/\s+/g, ' ');
  if (!t || t.length <= maxChars) return t;
  const words = t.split(' ');
  if (words.length === 1) {
    return `${t.slice(0, Math.max(4, maxChars - 1)).trimEnd()}…`;
  }
  let out = words[0];
  for (let i = 1; i < words.length; i++) {
    const next = `${out} ${words[i]}`;
    if (next.length > maxChars) break;
    out = next;
  }
  if (out.length >= t.length) return t;
  return `${out}…`;
}

export type BudgetHubPatioStyleCardProps = {
  group: VehicleBudgetGroup;
  pulseByBudgetId?: Record<string, 'created' | 'edited'>;
  /** IDs de orçamentos novos ainda não abertos — badge no card. */
  pendingNewBudgetIds?: Set<string>;
  blurPlates?: boolean;
  desktopShell?: boolean;
  compact?: boolean;
  /** Escala reduzida para colunas do modo por etapa. */
  trelloScale?: boolean;
  /** Escala reduzida nas grades dos atalhos (exceto por etapa). */
  gridScale?: boolean;
  /** No Trello a etapa já está na coluna — não repetir no card. */
  hideStageFooter?: boolean;
  /** Preferência de zoom do usuário (multiplicador). */
  userZoomScale?: number;
  onOpenBudget: (serviceOrderId: string, budgetId: string) => void;
};

/**
 * Card de veículo/módulo no hub: um card por OS, com a lista de orçamentos
 * e status evidentes (verificado, aprovado, pendente).
 */
export function BudgetHubPatioStyleCard({
  group,
  pulseByBudgetId = {},
  pendingNewBudgetIds,
  blurPlates = false,
  desktopShell,
  compact,
  trelloScale,
  gridScale,
  hideStageFooter,
  userZoomScale = 1,
  onOpenBudget,
}: BudgetHubPatioStyleCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const dense = Boolean(trelloScale || compact || gridScale);
  const baseZoom = trelloScale
    ? BUDGET_HUB_TRELLO_CARD_ZOOM
    : gridScale
      ? desktopShell
        ? BUDGET_HUB_GRID_CARD_ZOOM_PC
        : BUDGET_HUB_GRID_CARD_ZOOM
      : 1;
  const cardZoom = baseZoom * (Number.isFinite(userZoomScale) && userZoomScale > 0 ? userZoomScale : 1);

  const head = group.head;
  const items = [...group.items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const isLab = head.orderType === 'module';
  const flow = budgetOrderFlow(head.orderType);
  const stage = getStageConfig(head.orderStatus, flow);
  const stageStyle = getStageStyle(head.orderStatus, flow);
  const modelFull =
    (head.vehicleModel ?? '').trim() ||
    (isLab ? (head.moduleIdentification ?? '').trim() || 'Módulo' : 'Veículo');
  const modelMaxChars = dense ? 16 : desktopShell ? 22 : 20;
  const model = abbreviateVehicleModelName(modelFull, modelMaxChars);
  const customerLine = firstTwoNames((head.customerName ?? '').trim());
  const hasCustomer = Boolean(customerLine);
  const plate = (head.plate ?? '').trim() || '---';
  const moduleId = (head.moduleIdentification ?? head.vehicleModel ?? '').trim() || '—';
  const chrono = items.map((x) => ({ id: x.budgetId, createdAt: x.createdAt }));
  const newBudgetCount = items.filter((row) =>
    pendingNewBudgetIds?.has(String(row.budgetId).trim())
  ).length;
  const radius = getPatioBoardCardRadiusClass(Boolean(desktopShell), dense);
  const pad = dense ? 'gap-1.5 px-2.5 py-2.5' : 'gap-3 p-4 sm:p-5';
  /** Por etapa: fonte um pouco menor que a grade / Pátio. */
  const titleClass = getPatioBoardModelTitleClass(model, Boolean(trelloScale), true);
  const titleScaleClass = trelloScale ? 'origin-top-left scale-[0.86]' : '';

  const shellClass = `
    group relative flex min-h-0 w-full cursor-pointer flex-col overflow-hidden bg-white text-left
    dark:bg-zinc-900/70
    ${patioBoardGlassCardShadow}
    ${radius}
    ${pad}
    border-0
  `;

  const openPicker = () => setPickerOpen(true);

  return (
    <div
      className="h-auto w-full self-start"
      style={
        ({ zoom: cardZoom } as React.CSSProperties & { zoom?: number })
      }
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={`Abrir lista de orçamentos de ${modelFull}`}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openPicker();
          }
        }}
        className={shellClass}
      >
        {newBudgetCount > 0 ? (
          <span
            className={`absolute z-20 inline-flex items-center justify-center rounded-full bg-[#007AFF] font-bold uppercase tracking-[0.06em] text-white shadow-[0_4px_12px_-2px_rgba(0,122,255,0.55)] ${
              dense
                ? 'right-1.5 top-1.5 min-w-[1.35rem] px-1.5 py-0.5 text-[9px]'
                : 'right-2.5 top-2.5 min-w-[1.5rem] px-2 py-0.5 text-[10px]'
            }`}
            aria-label={
              newBudgetCount === 1
                ? '1 orçamento novo'
                : `${newBudgetCount} orçamentos novos`
            }
          >
            {newBudgetCount > 1 ? newBudgetCount : 'Novo'}
          </span>
        ) : null}

        <div className={`relative z-10 flex min-h-0 w-full flex-col ${dense ? 'gap-1.5' : 'gap-2.5'}`}>
          <div className={`flex min-w-0 flex-col ${dense ? 'gap-1' : 'gap-1.5'}`}>
            {/* Linha 1 — só o nome do veículo (+ logo à direita, sem empurrar/cortar) */}
            <div className="flex min-w-0 items-center gap-1.5">
              <h3
                title={modelFull !== model ? modelFull : undefined}
                className={`font-vehicle ${titleClass} ${titleScaleClass} min-w-0 flex-1 truncate whitespace-nowrap font-bold uppercase leading-none tracking-tight text-zinc-900 dark:text-white ${vehicleCardTitleShadow}`}
              >
                {model}
              </h3>
              {!isLab ? (
                <VehicleBrandLogo
                  brand={head.vehicleBrand}
                  size={dense ? 'card' : desktopShell ? 'cardPc' : 'card'}
                  className={`shrink-0 ${dense ? 'scale-90' : ''}`}
                />
              ) : (
                <PatioBoardOriginIcon kind="laboratorio" size={dense ? 'cardCompact' : 'card'} className="shrink-0" />
              )}
            </div>

            {/* Linha 2 — cliente */}
            {hasCustomer ? (
              <div
                className={`flex max-w-full items-center gap-1.5 border-0 bg-zinc-100/90 dark:bg-white/[0.06] ${
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

            {/* Linha 3 — qtd. orçamentos | placa */}
            <div className="flex min-w-0 items-center justify-between gap-2">
              <span
                className={`shrink-0 rounded-full bg-zinc-200/90 font-bold uppercase tracking-[0.06em] text-zinc-700 dark:bg-white/[0.1] dark:text-zinc-300 ${
                  dense ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
                }`}
              >
                {items.length} orç.
              </span>
              {!isLab ? (
                <MercosulPlateMockup
                  plate={plate}
                  blurPlates={blurPlates}
                  size={dense ? 'cardCompact' : 'cardGrid'}
                />
              ) : (
                <div
                  className={`min-w-0 max-w-[70%] border-0 bg-zinc-100/90 dark:bg-white/[0.06] ${
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

          {/* Lista de orçamentos do veículo — clique abre direto; clique no card abre o seletor */}
          <ul className={`flex flex-col ${dense ? 'gap-1' : 'gap-1.5'}`}>
            {items.map((row) => {
              const bid = String(row.budgetId).trim();
              const budgetNum = budgetChronologicalNumber(chrono, row.budgetId);
              const pulse = pulseByBudgetId[bid];
              return (
                <li key={row.budgetId}>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBudget(row.serviceOrderId, row.budgetId);
                    }}
                    className={`flex w-full items-center gap-1.5 rounded-xl border-0 text-left shadow-none transition-colors ${
                      dense ? 'px-2 py-1.5' : 'px-2.5 py-2'
                    } ${
                      row.hasApprovedItems
                        ? 'bg-sky-50/90 hover:bg-sky-100/90 dark:bg-sky-500/10 dark:hover:bg-sky-500/15'
                        : row.isVerified
                          ? 'bg-emerald-50/80 hover:bg-emerald-100/80 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/15'
                          : 'bg-amber-50/70 hover:bg-amber-100/80 dark:bg-amber-500/10 dark:hover:bg-amber-500/15'
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
                      <span className="shrink-0 rounded-full border-0 bg-amber-100/80 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-amber-900 shadow-none dark:bg-amber-500/15 dark:text-amber-200">
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
                    {pulse === 'edited' ? (
                      <span className="shrink-0 rounded-full bg-amber-500/20 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.06em] text-amber-900 dark:text-amber-200">
                        Editado
                      </span>
                    ) : null}
                    <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={2.4} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>

          {!hideStageFooter ? (
            <div
              className={`
                flex w-full items-center gap-1.5 border-0 shadow-none
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

      <BudgetHubBudgetPickerModal
        open={pickerOpen}
        group={group}
        blurPlates={blurPlates}
        onClose={() => setPickerOpen(false)}
        onOpenBudget={onOpenBudget}
      />
    </div>
  );
}
