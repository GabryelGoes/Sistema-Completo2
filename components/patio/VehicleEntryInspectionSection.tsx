import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronRight, ClipboardCheck, Loader2, ShieldAlert } from 'lucide-react';
import {
  getVehicleEntryInspection,
  type VehicleEntryInspectionDto,
} from '../../services/apiService';
import {
  ENTRY_ROAD_TEST_LABELS,
  ENTRY_STATUS_LABELS,
} from '../../utils/vehicleEntryInspection';
import { uiOsModalCardSectionTitle, uiOsModalSectionAppIcon } from '../ui/appTypography';

export type VehicleEntryInspectionSectionProps = {
  serviceOrderId: string;
  insetCardClass: string;
  canEdit: boolean;
  onOpen: () => void;
  /** Incrementar para forçar reload após fechar o modal. */
  refreshToken?: number;
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const VehicleEntryInspectionSection: React.FC<VehicleEntryInspectionSectionProps> = ({
  serviceOrderId,
  insetCardClass,
  canEdit,
  onOpen,
  refreshToken = 0,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inspection, setInspection] = useState<VehicleEntryInspectionDto | null>(null);

  const load = useCallback(async () => {
    if (!serviceOrderId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getVehicleEntryInspection(serviceOrderId);
      setInspection(res.inspection);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Falha ao carregar inspeção.');
      setInspection(null);
    } finally {
      setLoading(false);
    }
  }, [serviceOrderId]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const status = inspection?.status ?? 'pending';
  const progress = inspection?.progress ?? { answered: 0, total: 14, percent: 0 };
  const anomalies = inspection?.anomalySummary ?? [];
  const blocks = !!inspection?.safety?.blocksRoadTest;
  const cta =
    !inspection || status === 'pending'
      ? 'Iniciar'
      : status === 'completed'
        ? 'Revisar'
        : 'Continuar';

  return (
    <div className={`${insetCardClass} min-w-0 overflow-hidden shadow-none`}>
      <div className="relative flex items-center justify-between gap-2 border-b border-black/[0.06] bg-white/85 px-2.5 py-2 pl-3 backdrop-blur-[2px] dark:border-white/[0.08] dark:bg-zinc-950/35 sm:gap-3 sm:px-3 sm:py-2.5 sm:pl-4">
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-2.5">
          <div className={uiOsModalSectionAppIcon}>
            <img src="/icons/checklist-patio-ios.png" alt="" className="h-full w-full object-cover" />
          </div>
          <p className={uiOsModalCardSectionTitle}>Inspeção de Entrada</p>
        </div>
      </div>

      <div className="space-y-3 px-3 py-3 sm:px-4">
        {loading ? (
          <div className="flex items-center gap-2 text-[12px] text-zinc-500">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
          </div>
        ) : null}

        {error ? (
          <p className="rounded-xl border border-rose-300/70 bg-rose-50 px-3 py-2 text-[12px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
            {error}
          </p>
        ) : null}

        {!loading ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                      status === 'completed'
                        ? 'bg-emerald-500/12 text-emerald-700 dark:text-emerald-300'
                        : status === 'in_progress'
                          ? 'bg-amber-500/12 text-amber-800 dark:text-amber-200'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {ENTRY_STATUS_LABELS[status]}
                  </span>
                  {blocks ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/12 px-1.5 py-0.5 text-[10px] font-bold text-rose-700 dark:text-rose-300">
                      <ShieldAlert className="h-3 w-3" />
                      Rodagem bloqueada
                    </span>
                  ) : inspection ? (
                    <span className="inline-flex items-center rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {ENTRY_ROAD_TEST_LABELS[inspection.roadTestStatus]}
                    </span>
                  ) : null}
                </div>
                <p className="text-[12px] text-zinc-500">
                  {progress.answered}/{progress.total} · {progress.percent}%
                  {inspection?.responsibleName ? ` · ${inspection.responsibleName}` : ''}
                  {inspection?.updatedAt || inspection?.startedAt
                    ? ` · ${formatWhen(inspection.updatedAt || inspection.startedAt)}`
                    : ''}
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-zinc-900 transition-[width] duration-300 dark:bg-white"
                    style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={onOpen}
                disabled={!canEdit && !inspection}
                className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-zinc-900 px-3 py-2 text-[12px] font-semibold text-white transition active:scale-[0.98] disabled:opacity-40 dark:bg-white dark:text-zinc-900"
              >
                <ClipboardCheck className="h-3.5 w-3.5" />
                {cta}
                <ChevronRight className="h-3.5 w-3.5 opacity-70" />
              </button>
            </div>

            {anomalies.length > 0 ? (
              <div className="rounded-xl border border-amber-300/50 bg-amber-50/80 px-3 py-2 dark:border-amber-800/50 dark:bg-amber-950/30">
                <p className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-900 dark:text-amber-100">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Anomalias registradas
                </p>
                <ul className="space-y-0.5">
                  {anomalies.slice(0, 4).map((a) => (
                    <li key={a} className="text-[11px] leading-snug text-amber-900/90 dark:text-amber-100/85">
                      · {a}
                    </li>
                  ))}
                  {anomalies.length > 4 ? (
                    <li className="text-[11px] text-amber-800/70 dark:text-amber-200/70">
                      +{anomalies.length - 4} mais
                    </li>
                  ) : null}
                </ul>
                <p className="mt-1.5 text-[10px] text-amber-800/70 dark:text-amber-200/60">
                  Registro de inspeção — não é diagnóstico confirmado.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-zinc-500">
                Preencha antes do diagnóstico. Atendimento e inspeção estática não são bloqueados.
              </p>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
};
