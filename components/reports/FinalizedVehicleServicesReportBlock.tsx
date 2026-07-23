import React from 'react';
import { Car, ExternalLink, Trash2, User, Wrench } from 'lucide-react';
import type { TechnicianServiceReportItem } from '../../services/apiService';
import type { FinalizedVehicleReportGroup } from '../../utils/workshopReports';
import {
  formatFinalizedVehicleTitle,
  formatPlateDisplay,
} from '../../utils/workshopReports';

function formatDeliveryLabel(archivedAt: string | null, orderStatus: string): string {
  if (archivedAt) {
    try {
      return new Date(archivedAt).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  }
  if (orderStatus === 'FINALIZADO') return 'Finalizado (não arquivado)';
  return '—';
}

export function FinalizedVehicleServicesReportBlock({
  groups,
  blurPlates,
  onOpenOrder,
  canDelete = false,
  deletingLineId = null,
  onDeleteService,
}: {
  groups: FinalizedVehicleReportGroup[];
  blurPlates: boolean;
  onOpenOrder: (serviceOrderId: string) => void;
  canDelete?: boolean;
  deletingLineId?: string | null;
  onDeleteService?: (service: TechnicianServiceReportItem) => void;
}) {
  if (groups.length === 0) {
    return (
      <p className="py-12 text-center text-[14px] text-zinc-500 dark:text-zinc-400">
        Nenhum veículo entregue ou finalizado com serviços registrados neste período.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => {
        const title = formatFinalizedVehicleTitle(group);
        const plate = formatPlateDisplay(group.plate, blurPlates);
        const osLabel =
          group.osNumber != null && Number.isFinite(group.osNumber)
            ? `#${group.osNumber}`
            : group.serviceOrderId.slice(0, 8).toUpperCase();
        const delivery = formatDeliveryLabel(group.archivedAt, group.orderStatus);

        return (
          <article
            key={group.serviceOrderId}
            className="overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-white via-white to-emerald-500/[0.04] shadow-sm dark:border-emerald-500/15 dark:from-zinc-950/80 dark:via-zinc-950/60 dark:to-emerald-500/[0.06]"
          >
            <header className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-200/70 bg-white/70 px-4 py-3.5 dark:border-white/[0.06] dark:bg-zinc-950/40">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-700 dark:bg-emerald-500/18 dark:text-emerald-300">
                  <Car className="h-5 w-5" strokeWidth={2.1} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-bold text-zinc-900 dark:text-white">{title}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-zinc-600 dark:text-zinc-400">
                    <span className="font-mono font-semibold tracking-wide text-zinc-800 dark:text-zinc-200">
                      {plate}
                    </span>
                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span className="font-semibold tabular-nums">OS {osLabel}</span>
                    <span className="text-zinc-300 dark:text-zinc-600">·</span>
                    <span>
                      Entrega: <strong className="font-semibold text-zinc-800 dark:text-zinc-200">{delivery}</strong>
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onOpenOrder(group.serviceOrderId)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-sky-200/90 bg-sky-500/10 px-3 py-2 text-[12px] font-semibold text-sky-900 transition hover:bg-sky-500/20 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-100"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Abrir OS e orçamentos
              </button>
            </header>

            <div className="px-4 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                <Wrench className="h-3.5 w-3.5" />
                Serviços executados ({group.services.length})
              </p>
              <ul className="divide-y divide-zinc-200/70 rounded-xl border border-zinc-200/60 bg-white/80 dark:divide-white/[0.06] dark:border-white/[0.08] dark:bg-zinc-950/35">
                {group.services.map((svc) => {
                  const isDeleting = deletingLineId === svc.lineId;
                  return (
                    <li
                      key={svc.lineId}
                      className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 sm:gap-4"
                    >
                      <p className="min-w-0 flex-1 text-[14px] font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                        {svc.description || '—'}
                      </p>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-400/30 bg-violet-500/10 px-2.5 py-1 text-[12px] font-semibold text-violet-900 dark:border-violet-400/25 dark:bg-violet-500/15 dark:text-violet-100">
                          <User className="h-3.5 w-3.5 opacity-80" />
                          {svc.technicianName || 'Técnico'}
                        </span>
                        {canDelete && onDeleteService ? (
                          <button
                            type="button"
                            onClick={() => onDeleteService(svc)}
                            disabled={isDeleting || deletingLineId != null}
                            title="Excluir do relatório"
                            aria-label={`Excluir serviço ${svc.description || ''} do relatório`}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200/90 bg-rose-500/10 px-2 py-1 text-[11px] font-semibold text-rose-800 transition hover:bg-rose-500/20 disabled:opacity-50 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-100 dark:hover:bg-rose-500/20"
                          >
                            <Trash2 className={`h-3.5 w-3.5 ${isDeleting ? 'animate-pulse' : ''}`} />
                            Excluir
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </article>
        );
      })}
    </div>
  );
}
