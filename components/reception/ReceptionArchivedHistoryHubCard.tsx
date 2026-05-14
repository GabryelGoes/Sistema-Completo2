import React from 'react';
import { ChevronRight, FileText } from 'lucide-react';
import { getStageStyle } from '../../constants/serviceOrderStages';
import type { BoardCard } from '../../types';
import { parsePatioCardTitle } from '../../utils/patioCardTitle';

/** Mesmo chrome visual do hub Orçamentos (`iosPageGlassOrcamentosVehicleCard`), com fundo branco sólido no claro. */
const receptionHistoryVehicleCardShell =
  'relative w-full rounded-[2rem] sm:rounded-[2.25rem] border border-zinc-200/80 dark:border-white/[0.07] bg-white backdrop-blur-2xl ' +
  'shadow-[0_18px_50px_-12px_rgba(0,0,0,0.18),0_10px_32px_-10px_rgba(63,63,70,0.14),0_4px_14px_-4px_rgba(63,63,70,0.10),0_1px_4px_rgba(0,0,0,0.06)] ' +
  'dark:bg-zinc-900/40 dark:shadow-[0_8px_40px_-12px_rgba(0,0,0,0.45)]';

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

/** Dados mínimos — API (`ServiceOrderListItem`) ou quadro do Pátio (`BoardCard` mapeado). */
export type ArchivedHistoryHubOrderLike = {
  id: string;
  vehicle_model: string | null;
  vehicle_brand?: string | null;
  module_identification?: string | null;
  plate: string | null;
  os_number?: number | null;
  customer_name?: string | null;
  customers?: { id: string; name: string; phone: string | null } | null;
  updated_at: string;
  garantia_tag?: boolean;
};

export function boardCardToArchivedHistoryHubOrder(card: BoardCard, isModuleMode: boolean): ArchivedHistoryHubOrderLike {
  const t = parsePatioCardTitle(card.name);
  const rawPm = (t.plateOrModule || '').trim();
  return {
    id: card.id,
    vehicle_model: (t.vehicle || card.name || '').trim() || null,
    vehicle_brand: card.vehicleBrand ?? null,
    module_identification: isModuleMode ? (rawPm || null) : null,
    plate: isModuleMode ? null : (rawPm || null),
    os_number: card.osNumber ?? null,
    customer_name: (t.customer || '').trim() || null,
    customers: null,
    updated_at: card.dateLastActivity,
    garantia_tag: card.garantiaTag === true,
  };
}

function plateDisplay(plate: string | null, blurPlates: boolean): React.ReactNode {
  const p = (plate ?? '').trim();
  if (!p) return '—';
  if (blurPlates) {
    return (
      <span className="blur-plate" aria-hidden>
        {p.toUpperCase()}
      </span>
    );
  }
  return p.toUpperCase();
}

export type ReceptionArchivedHistoryHubCardProps = {
  order: ArchivedHistoryHubOrderLike;
  isModuleMode: boolean;
  blurPlates?: boolean;
  onOpenDetail: () => void;
  footerAppend?: React.ReactNode;
};

/**
 * Cartão de veículo/módulo arquivado no mesmo chrome da página Orçamentos (hub),
 * com fundo branco sólido no modo claro.
 */
export function ReceptionArchivedHistoryHubCard({
  order,
  isModuleMode,
  blurPlates = false,
  onOpenDetail,
  footerAppend,
}: ReceptionArchivedHistoryHubCardProps) {
  const model = (order.vehicle_model || (isModuleMode ? 'Módulo' : 'Veículo')).trim();
  const moduleId = (order.module_identification || '—').trim();
  const customerFull = (order.customer_name || order.customers?.name || '').trim();
  const archivedStyle = getStageStyle('CANCELLED');
  const archivedWhen = formatArchivedDate(order.updated_at);
  const garantia = order.garantia_tag === true;

  const titleLine = [order.vehicle_brand, order.vehicle_model].filter(Boolean).join(' ').trim() || model;

  return (
    <section
      className={`${receptionHistoryVehicleCardShell} overflow-hidden ${
        garantia
          ? '!border-2 !border-red-400/65 !bg-red-50/95 !shadow-[0_12px_36px_-10px_rgba(239,68,68,0.14)] dark:!border-red-400/50 dark:!bg-red-950/[0.34] dark:!shadow-[0_12px_40px_-12px_rgba(248,113,113,0.12)]'
          : ''
      }`}
    >
      <button
        type="button"
        onClick={onOpenDetail}
        className={`flex w-full items-start gap-3 border-b px-4 py-4 text-left transition-colors sm:px-5 ${
          garantia
            ? 'border-red-200/75 hover:!bg-red-50/92 dark:border-red-500/22 dark:hover:!bg-red-950/38'
            : 'border-zinc-200/70 hover:bg-zinc-50/80 dark:border-white/[0.06] dark:hover:bg-white/[0.04]'
        }`}
      >
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
            garantia ? '!bg-red-100/88 dark:!bg-red-500/12' : 'bg-zinc-100 dark:bg-white/[0.08]'
          }`}
        >
          <FileText
            className={garantia ? 'h-5 w-5 text-red-700 dark:text-red-300' : 'h-5 w-5 text-[#007AFF] dark:text-[#7ab8ff]'}
            strokeWidth={2}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[14px] font-bold tracking-wide text-zinc-900 dark:text-white">
              {isModuleMode ? moduleId : plateDisplay(order.plate, blurPlates)}
            </span>
            {order.os_number != null ? (
              <span className="rounded-full bg-zinc-200/90 px-2 py-0.5 text-[11px] font-semibold text-zinc-700 dark:bg-white/[0.1] dark:text-zinc-300">
                OS #{order.os_number}
              </span>
            ) : null}
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${archivedStyle}`}>
              Arquivado · {archivedWhen}
            </span>
          </div>
          <p className="mt-1 truncate text-[15px] font-semibold text-zinc-900 dark:text-white">{titleLine}</p>
          {customerFull ? (
            <p className="mt-0.5 truncate text-[13px] text-zinc-600 dark:text-zinc-400">{customerFull}</p>
          ) : null}
          <p className="mt-2 text-[12px] font-medium text-zinc-500 dark:text-zinc-500">Toque para abrir a ficha completa</p>
        </div>
        <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-zinc-400" strokeWidth={2} aria-hidden />
      </button>
      {footerAppend ? (
        <div className="border-t border-zinc-200/60 bg-zinc-50/90 px-4 py-4 dark:border-white/[0.06] dark:bg-zinc-950/35 sm:px-5">
          {footerAppend}
        </div>
      ) : null}
    </section>
  );
}
