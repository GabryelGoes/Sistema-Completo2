import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Cog,
  Loader2,
  Package,
  RefreshCw,
  Wrench,
} from 'lucide-react';
import type { VehicleMaintenanceHistory } from '../../services/apiService';
import { uiOsModalCardSectionTitle, uiOsModalSectionAppIcon } from '../ui/appTypography';

export type PatioOsModalHistoricoTabProps = {
  history: VehicleMaintenanceHistory | null;
  loading: boolean;
  error: string | null;
  onRetry?: () => void;
  insetCardClass: string;
};

type ListFilter = 'todos' | 'servicos' | 'pecas';

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatLaborHours(hours: number | null | undefined): string | null {
  if (typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) return null;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace(/\.0$/, '');
  return `${label}h`;
}

export const PatioOsModalHistoricoTab: React.FC<PatioOsModalHistoricoTabProps> = ({
  history,
  loading,
  error,
  onRetry,
  insetCardClass,
}) => {
  const [filter, setFilter] = useState<ListFilter>('todos');

  const summary = history?.summary ?? { visits: 0, services: 0, parts: 0 };
  const visits = history?.visits ?? [];
  const hasAnything = summary.services > 0 || summary.parts > 0 || visits.length > 0;

  const filteredVisits = useMemo(() => {
    if (filter === 'todos') return visits;
    if (filter === 'servicos') return visits.filter((v) => v.services.length > 0);
    return visits.filter((v) => v.parts.length > 0);
  }, [visits, filter]);

  return (
    <div className={`${insetCardClass} min-w-0 overflow-hidden shadow-none`}>
      <div className="relative min-w-0">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.08),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(52,199,89,0.08),transparent_50%)] dark:bg-[radial-gradient(ellipse_120%_80%_at_100%_-20%,rgba(0,122,255,0.12),transparent_55%),radial-gradient(ellipse_90%_70%_at_-10%_120%,rgba(52,199,89,0.1),transparent_52%)]"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -right-10 top-8 h-24 w-24 rounded-full bg-gradient-to-br from-emerald-500/14 to-transparent opacity-80 blur-2xl dark:from-emerald-400/20"
          aria-hidden
        />

        <div className="relative flex items-center justify-between gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 backdrop-blur-[2px] dark:border-white/[0.08] dark:bg-zinc-950/35 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4">
          <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
            <div className={uiOsModalSectionAppIcon}>
              <img src="/icons/servicos-oficina-ios.png" alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0">
              <p className={uiOsModalCardSectionTitle}>Histórico de Manutenções</p>
              {history?.plate ? (
                <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Placa {history.plate}
                  {history.vehicleModel ? ` · ${history.vehicleModel}` : ''}
                  {' · '}
                  todas as passagens desta placa
                  {(history.summary.owners ?? 0) > 1
                    ? ` · ${history.summary.owners} proprietários`
                    : ''}
                </p>
              ) : (
                <p className="mt-0.5 truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                  Busca sempre pela placa do veículo
                </p>
              )}
            </div>
          </div>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={loading}
              className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-zinc-200/90 bg-white px-2.5 py-1 text-[11px] font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-40 dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              aria-label="Atualizar histórico"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} strokeWidth={2.4} />
              Atualizar
            </button>
          ) : null}
        </div>

        <div className="relative space-y-4 border-t border-zinc-200/60 bg-zinc-50/90 px-3 py-3 dark:border-white/[0.06] dark:bg-white/[0.02] sm:px-4 sm:py-4">
          {loading && !history ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[14px] font-medium text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-5 w-5 animate-spin text-[#007AFF]" />
              Carregando histórico do veículo…
            </div>
          ) : error && !history ? (
            <div className="rounded-2xl border border-red-200/80 bg-red-50/90 px-4 py-5 text-center dark:border-red-500/25 dark:bg-red-950/30">
              <p className="text-[14px] font-semibold text-red-800 dark:text-red-200">{error}</p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white"
                >
                  Tentar de novo
                </button>
              ) : null}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
                {[
                  {
                    label: 'Passagens',
                    value: summary.visits,
                    icon: Clock3,
                    tone: 'from-[#007AFF]/12 to-[#007AFF]/[0.03] text-[#007AFF] dark:from-[#007AFF]/20 dark:to-transparent dark:text-[#7ab8ff]',
                  },
                  {
                    label: 'Serviços',
                    value: summary.services,
                    icon: Wrench,
                    tone: 'from-violet-500/12 to-violet-500/[0.03] text-violet-700 dark:from-violet-400/20 dark:to-transparent dark:text-violet-300',
                  },
                  {
                    label: 'Peças',
                    value: summary.parts,
                    icon: Package,
                    tone: 'from-emerald-500/12 to-emerald-500/[0.03] text-emerald-700 dark:from-emerald-400/20 dark:to-transparent dark:text-emerald-300',
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className={`rounded-2xl border border-white/70 bg-gradient-to-br p-3 shadow-sm dark:border-white/[0.08] ${stat.tone}`}
                  >
                    <stat.icon className="mb-1.5 h-4 w-4 opacity-80" strokeWidth={2.3} aria-hidden />
                    <p className="text-[22px] font-semibold tabular-nums leading-none tracking-tight text-zinc-900 dark:text-white">
                      {stat.value}
                    </p>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-500 dark:text-zinc-400">
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-1.5 rounded-2xl bg-white/90 p-1 dark:bg-zinc-950/50">
                {(
                  [
                    { id: 'todos', label: 'Tudo' },
                    { id: 'servicos', label: 'Serviços' },
                    { id: 'pecas', label: 'Peças' },
                  ] as const
                ).map((opt) => {
                  const active = filter === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setFilter(opt.id)}
                      className={`rounded-xl px-3 py-1.5 text-[12px] font-semibold transition ${
                        active
                          ? 'bg-[#007AFF] text-white shadow-sm shadow-blue-500/25'
                          : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-white/[0.06]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>

              {!hasAnything ? (
                <div className="rounded-2xl border border-dashed border-zinc-300/90 bg-white/70 px-4 py-10 text-center dark:border-white/[0.12] dark:bg-zinc-950/40">
                  <Cog className="mx-auto mb-3 h-8 w-8 text-zinc-300 dark:text-zinc-600" strokeWidth={1.6} />
                  <p className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-100">
                    Nenhuma manutenção registrada
                  </p>
                  <p className="mx-auto mt-1 max-w-sm text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    O histórico é reunido pela placa. Quando serviços e peças forem aprovados em
                    qualquer cadastro desta placa (mesmo com outro proprietário), eles aparecem aqui.
                  </p>
                </div>
              ) : filteredVisits.length === 0 ? (
                <p className="py-8 text-center text-[14px] text-zinc-500 dark:text-zinc-400">
                  Nada neste filtro.
                </p>
              ) : (
                <ul className="space-y-3">
                  {filteredVisits.map((visit) => {
                    const showServices = filter !== 'pecas' && visit.services.length > 0;
                    const showParts = filter !== 'servicos' && visit.parts.length > 0;
                    const emptyForFilter =
                      (filter === 'servicos' && visit.services.length === 0) ||
                      (filter === 'pecas' && visit.parts.length === 0);
                    if (emptyForFilter) return null;

                    return (
                      <li
                        key={visit.serviceOrderId}
                        className={`overflow-hidden rounded-2xl border bg-white shadow-sm dark:bg-zinc-950/70 ${
                          visit.isCurrent
                            ? 'border-[#007AFF]/35 ring-1 ring-[#007AFF]/15 dark:border-[#007AFF]/40'
                            : 'border-zinc-200/80 dark:border-white/[0.08]'
                        }`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/80 px-3.5 py-2.5 dark:border-white/[0.06] dark:bg-white/[0.03]">
                          <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-zinc-900 dark:text-white">
                              {visit.osNumber != null ? `OS ${visit.osNumber}` : 'Ordem de serviço'}
                              {visit.isCurrent ? (
                                <span className="ml-2 rounded-full bg-[#007AFF]/12 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#007AFF] dark:bg-[#007AFF]/20 dark:text-[#9ec9ff]">
                                  Atual
                                </span>
                              ) : null}
                            </p>
                            <p className="mt-0.5 text-[12px] text-zinc-500 dark:text-zinc-400">
                              {visit.customerName ? `${visit.customerName} · ` : ''}
                              {formatWhen(visit.createdAt)}
                              {visit.mileageKm ? ` · ${visit.mileageKm} km` : ''}
                            </p>
                          </div>
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              visit.finalized
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200'
                                : visit.archived
                                  ? 'bg-zinc-300/80 text-zinc-700 dark:bg-zinc-700/60 dark:text-zinc-200'
                                  : 'bg-zinc-200/80 text-zinc-700 dark:bg-white/10 dark:text-zinc-200'
                            }`}
                          >
                            {visit.finalized ? (
                              <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                            ) : (
                              <Clock3 className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                            )}
                            {visit.statusLabel}
                          </span>
                        </div>

                        <div className="space-y-3 px-3.5 py-3">
                          {showServices ? (
                            <div>
                              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-violet-600 dark:text-violet-300">
                                <Wrench className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                                Serviços aprovados
                                {visit.finalized ? ' · realizados' : ''}
                              </p>
                              <ul className="space-y-1.5">
                                {visit.services.map((svc) => {
                                  const hours = formatLaborHours(svc.laborHours);
                                  return (
                                    <li
                                      key={`${visit.serviceOrderId}-svc-${svc.description}`}
                                      className="flex items-start gap-2 rounded-xl bg-violet-50/70 px-2.5 py-2 dark:bg-violet-500/10"
                                    >
                                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />
                                      <div className="min-w-0 flex-1">
                                        <p className="text-[13px] font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                                          {svc.description}
                                        </p>
                                        <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                          {[svc.technicianName, hours].filter(Boolean).join(' · ') ||
                                            'Aprovado no orçamento'}
                                        </p>
                                      </div>
                                    </li>
                                  );
                                })}
                              </ul>
                            </div>
                          ) : null}

                          {showParts ? (
                            <div>
                              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-emerald-700 dark:text-emerald-300">
                                <Package className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
                                Peças aprovadas
                                {visit.finalized ? ' · trocadas' : ''}
                              </p>
                              <ul className="space-y-1.5">
                                {visit.parts.map((part) => (
                                  <li
                                    key={`${visit.serviceOrderId}-part-${part.description}`}
                                    className="flex items-start gap-2 rounded-xl bg-emerald-50/70 px-2.5 py-2 dark:bg-emerald-500/10"
                                  >
                                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                                    <div className="min-w-0 flex-1">
                                      <p className="text-[13px] font-medium leading-snug text-zinc-900 dark:text-zinc-100">
                                        {part.description}
                                      </p>
                                      <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                                        Qtd. {part.quantity}
                                        {part.fromStock ? ' · Estoque' : ''}
                                      </p>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ) : null}

                          {!showServices && !showParts ? (
                            <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                              Passagem registrada sem itens aprovados ainda.
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
