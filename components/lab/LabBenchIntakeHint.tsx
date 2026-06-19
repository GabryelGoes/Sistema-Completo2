import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, LayoutGrid, Loader2 } from 'lucide-react';
import {
  ALL_BENCH_SLOTS,
  LAB_BENCH_SLOT_COUNT,
  LAB_BENCH_STAGE_LEGEND,
  firstFreeBenchSlot,
  statusUsesBench,
} from '../../constants/labBench';
import { getServiceOrders } from '../../services/apiService';
import { getStageConfig } from '../../constants/serviceOrderStages';
import type { ServiceOrderStatus } from '../../constants/serviceOrderStages';

type LabBenchIntakeHintProps = {
  refreshKey?: number;
  intakeStatus?: ServiceOrderStatus;
  className?: string;
  collapsible?: boolean;
};

export function LabBenchIntakeHint({
  refreshKey = 0,
  intakeStatus = 'AGUARDANDO_AVALIACAO',
  className = '',
  collapsible = false,
}: LabBenchIntakeHintProps) {
  const [loading, setLoading] = useState(true);
  const [occupiedSlots, setOccupiedSlots] = useState<number[]>([]);
  const [queueCount, setQueueCount] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [open, setOpen] = useState(!collapsible);
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
        setQueueCount(active.filter((o) => o.bench_queued_at && o.bench_slot == null).length);
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
  const onBench = statusUsesBench(intakeStatus);
  const intakeSuggestion = useMemo(
    () => (onBench ? firstFreeBenchSlot(occupiedSlots) : null),
    [intakeStatus, onBench, occupiedSlots]
  );
  const occupiedCount = occupiedSlots.length;

  return (
    <section
      className={`rounded-[1.25rem] border border-violet-200/80 bg-gradient-to-br from-violet-50/95 via-white to-zinc-50/90 p-4 shadow-[0_8px_28px_-12px_rgba(124,58,237,0.18)] dark:border-violet-500/25 dark:from-violet-950/35 dark:via-zinc-950/40 dark:to-zinc-950/20 sm:p-5 ${className}`}
      aria-labelledby="lab-bench-intake-title"
    >
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-violet-600/12 text-violet-700 dark:bg-violet-400/15 dark:text-violet-200">
          <LayoutGrid className="h-5 w-5" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 id="lab-bench-intake-title" className="text-[15px] font-bold tracking-tight text-zinc-900 dark:text-white">
              Bancada do laboratório
            </h3>
            <div ref={helpRef} className={`relative shrink-0 ${collapsible && !open ? 'hidden' : ''}`}>
              <button
                type="button"
                onClick={() => setHelpOpen((o) => !o)}
                aria-label="Como funciona a organização da bancada?"
                aria-expanded={helpOpen}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#007AFF] text-[12px] font-bold text-white shadow-sm hover:bg-[#0058c7]"
              >
                ?
              </button>
              {helpOpen ? (
                <div className="absolute left-0 z-30 mt-2 w-72 rounded-xl border bg-white p-3 text-left shadow-lg dark:border-white/12 dark:bg-zinc-900">
                  <p className="text-[12px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                    Cada produto recebe um compartimento fixo (1–24) na entrada e{' '}
                    <strong>não muda de lugar</strong> ao mudar de etapa — só a cor do card muda.
                    Se a bancada estiver cheia, o produto entra na fila até liberar uma vaga.
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full text-violet-700 hover:bg-violet-500/10 dark:text-violet-200"
          >
            <ChevronDown className={`h-5 w-5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        ) : null}
      </div>

      {open ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {loading ? (
              <span className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[13px] text-zinc-600 dark:text-zinc-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Consultando bancada…
              </span>
            ) : !onBench ? (
              <span className="rounded-xl border px-3 py-2 text-[13px] text-zinc-600 dark:text-zinc-300">
                Esta etapa não usa compartimento na bancada
              </span>
            ) : intakeSuggestion != null ? (
              <span className="rounded-xl border border-emerald-300/80 bg-emerald-50 px-3 py-2 text-[13px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
                Próxima entrada → compartimento {intakeSuggestion}
                <span className="font-normal text-emerald-700/90"> ({intakeStage?.name})</span>
              </span>
            ) : (
              <span className="rounded-xl border border-violet-300/80 bg-violet-50 px-3 py-2 text-[13px] font-semibold text-violet-900 dark:bg-violet-950/40 dark:text-violet-200">
                Bancada cheia — novo produto entra na fila
                {queueCount > 0 ? ` (${queueCount} aguardando)` : ''}
              </span>
            )}
            {!loading ? (
              <span className="rounded-xl border px-3 py-2 text-[12px] font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                {occupiedCount}/{LAB_BENCH_SLOT_COUNT} ocupados
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-6 gap-1">
            {ALL_BENCH_SLOTS.map((slot) => {
              const taken = occupiedSlots.includes(slot);
              return (
                <div
                  key={slot}
                  className={`flex h-7 items-center justify-center rounded text-[10px] font-bold ${
                    taken
                      ? 'bg-violet-600 text-white'
                      : 'border border-dashed border-zinc-300 text-zinc-400 dark:border-zinc-600'
                  }`}
                >
                  {slot}
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap gap-1">
            {LAB_BENCH_STAGE_LEGEND.map((leg) => (
              <span key={leg.id} className={`rounded px-1.5 py-0.5 text-[9px] font-semibold text-white ${leg.accent}`}>
                {leg.label}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}
