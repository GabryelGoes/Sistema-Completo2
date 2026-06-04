import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutGrid, Loader2 } from 'lucide-react';
import {
  LAB_BENCH_GROUPS,
  LAB_BENCH_SLOT_COUNT,
  firstFreeSlotForStatus,
  labGroupForStatus,
  statusInIntakeBenchGroup,
  statusUsesBench,
} from '../../constants/labBench';
import { getServiceOrders } from '../../services/apiService';
import { getStageConfig } from '../../constants/serviceOrderStages';
import type { ServiceOrderStatus } from '../../constants/serviceOrderStages';

type LabBenchIntakeHintProps = {
  /** Recarregar ocupação (ex.: ao focar a aba). */
  refreshKey?: number;
  /** Etapa escolhida no cadastro (define grupo da bancada sugerido). */
  intakeStatus?: ServiceOrderStatus;
  className?: string;
};

/**
 * Resumo da bancada para o cadastro de produto no Laboratório:
 * onde o novo item será colocado e como funciona a organização por compartimentos.
 */
export function LabBenchIntakeHint({
  refreshKey = 0,
  intakeStatus = 'AGUARDANDO_AVALIACAO',
  className = '',
}: LabBenchIntakeHintProps) {
  const [loading, setLoading] = useState(true);
  const [occupiedSlots, setOccupiedSlots] = useState<number[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const helpRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!helpOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) setHelpOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHelpOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [helpOpen]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getServiceOrders(undefined, 'module')
      .then((orders) => {
        if (cancelled) return;
        const active = orders.filter((o) => o.status !== 'CANCELLED');
        const slots = active
          .map((o) => o.bench_slot)
          .filter((s): s is number => typeof s === 'number' && s >= 1 && s <= LAB_BENCH_SLOT_COUNT);
        setOccupiedSlots(slots);
        setQueueCount(
          active.filter((o) => o.bench_queued_at && o.bench_slot == null).length
        );
      })
      .catch(() => {
        if (!cancelled) setOccupiedSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const intakeStage = getStageConfig(intakeStatus, 'module');
  const intakeGroup = labGroupForStatus(intakeStatus);
  const onBench = statusUsesBench(intakeStatus);

  const intakeSuggestion = useMemo(
    () => (onBench ? firstFreeSlotForStatus(intakeStatus, occupiedSlots) : null),
    [intakeStatus, onBench, occupiedSlots]
  );

  const occupiedCount = occupiedSlots.length;

  return (
    <section
      className={`rounded-[1.25rem] border border-violet-200/80 bg-gradient-to-br from-violet-50/95 via-white to-zinc-50/90 p-4 shadow-[0_8px_28px_-12px_rgba(124,58,237,0.18)] dark:border-violet-500/25 dark:from-violet-950/35 dark:via-zinc-950/40 dark:to-zinc-950/20 dark:shadow-[0_12px_40px_-16px_rgba(124,58,237,0.22)] sm:p-5 ${className}`}
      aria-labelledby="lab-bench-intake-title"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200">
          <LayoutGrid className="h-5 w-5" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3
              id="lab-bench-intake-title"
              className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white"
            >
              Bancada do laboratório
            </h3>
            <div ref={helpRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setHelpOpen((o) => !o)}
                aria-label="Como funciona a organização da bancada?"
                aria-expanded={helpOpen}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#007AFF] text-[12px] font-bold text-white shadow-sm transition-colors hover:bg-[#0058c7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#007AFF]/45 focus-visible:ring-offset-1"
              >
                ?
              </button>
              {helpOpen ? (
                <div className="absolute left-0 z-30 mt-2 w-72 rounded-xl border border-zinc-200/90 bg-white p-3 text-left shadow-[0_12px_40px_-8px_rgba(0,0,0,0.25)] dark:border-white/[0.12] dark:bg-zinc-900 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.55)]">
                  <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                    A ficha entra em{' '}
                    <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {intakeStage?.name ?? intakeStatus}
                    </span>
                    {onBench && intakeGroup
                      ? ` e o sistema reserva o primeiro compartimento livre do grupo (${intakeGroup.slots.join('–')})${
                          statusInIntakeBenchGroup(intakeStatus)
                            ? ', ou entra na fila se estiver lotado.'
                            : '.'
                        }`
                      : onBench
                        ? ' e recebe compartimento na bancada quando houver vaga no grupo da etapa.'
                        : ' (fora da bancada física — ex.: em serviço com o técnico).'}{' '}
                    Ao mudar a etapa no quadro, o compartimento acompanha o grupo correspondente.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {loading ? (
          <span className="inline-flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-white/80 px-3 py-2 text-[13px] font-medium text-zinc-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Consultando bancada…
          </span>
        ) : !onBench ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-zinc-50 px-3 py-2 text-[13px] font-medium text-zinc-600 dark:border-white/10 dark:bg-white/[0.06] dark:text-zinc-300">
            Esta etapa não usa compartimento na bancada
          </span>
        ) : intakeSuggestion != null ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/80 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800 dark:border-emerald-500/35 dark:bg-emerald-950/40 dark:text-emerald-200">
            Próxima entrada → compartimento {intakeSuggestion}
            {intakeGroup ? (
              <span className="font-normal text-emerald-700/90 dark:text-emerald-300/90">
                ({intakeGroup.label})
              </span>
            ) : null}
          </span>
        ) : statusInIntakeBenchGroup(intakeStatus) ? (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-violet-300/80 bg-violet-50 px-3 py-2 text-[13px] font-semibold text-violet-900 dark:border-violet-500/35 dark:bg-violet-950/40 dark:text-violet-200">
            Compartimentos {intakeGroup?.slots.join('–') ?? '1–4'} lotados — novo produto entra na fila
            {queueCount > 0 ? ` (${queueCount} aguardando)` : ''}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/80 bg-rose-50 px-3 py-2 text-[13px] font-semibold text-rose-800 dark:border-rose-500/35 dark:bg-rose-950/40 dark:text-rose-200">
            {intakeGroup
              ? `${intakeGroup.label} lotado — libere um compartimento ${intakeGroup.slots.join('–')}`
              : 'Grupo da bancada lotado para esta etapa'}
          </span>
        )}
        {!loading ? (
          <span className="inline-flex items-center rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-2 text-[12px] font-semibold tabular-nums text-zinc-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-300">
            {occupiedCount}/{LAB_BENCH_SLOT_COUNT} ocupados
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
        {LAB_BENCH_GROUPS.map((group) => {
          const groupOccupied = group.slots.filter((s) => occupiedSlots.includes(s)).length;
          const freeInGroup = group.slots.length - groupOccupied;
          return (
            <div
              key={group.id}
              className="rounded-lg border border-zinc-200/70 bg-white/60 px-2 py-1.5 dark:border-white/[0.08] dark:bg-white/[0.04]"
            >
              <p className={`truncate text-[10px] font-bold uppercase tracking-wide text-white rounded px-1 py-0.5 ${group.accent}`}>
                {group.label}
              </p>
              <p className="mt-1 text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                {group.slots[0]}–{group.slots[group.slots.length - 1]} · {freeInGroup} vago{freeInGroup === 1 ? '' : 's'}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
