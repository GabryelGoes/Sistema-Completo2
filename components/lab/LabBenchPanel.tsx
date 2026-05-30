import React, { useMemo, useState } from 'react';
import type { TrelloCard } from '../../types';
import {
  LAB_BENCH_GROUPS,
  LAB_BENCH_SLOT_COUNT,
  labGroupForStatus,
  type LabBenchGroup,
} from '../../constants/labBench';
import { getStageConfig } from '../../constants/serviceOrderStages';
import { PATIO_CARD_TITLE_SEP } from '../../utils/patioCardTitle';

interface BenchEntry {
  card: TrelloCard;
  vehicle: string;
  identification: string;
  customer: string;
}

interface LabBenchPanelProps {
  /** Cards de módulo (laboratório) atualmente em fluxo. */
  cards: TrelloCard[];
  /** Abre o modal da OS ao clicar num compartimento ocupado. */
  onOpenCard: (card: TrelloCard) => void;
  /** Move manualmente uma OS para um compartimento (ou null para liberar). */
  onMoveCard?: (cardId: string, slot: number | null) => void | Promise<void>;
}

function toEntry(card: TrelloCard): BenchEntry {
  const parts = (card.name || '').split(PATIO_CARD_TITLE_SEP).map((s) => s.trim());
  return {
    card,
    vehicle: parts[0] ?? '',
    identification: parts[1] ?? '',
    customer: parts.slice(2).join(PATIO_CARD_TITLE_SEP),
  };
}

const LabBenchPanel: React.FC<LabBenchPanelProps> = ({ cards, onOpenCard, onMoveCard }) => {
  const [movingCardId, setMovingCardId] = useState<string | null>(null);

  const moduleEntries = useMemo(() => cards.map(toEntry), [cards]);

  /** Compartimento (1..24) -> OS que o ocupa. */
  const bySlot = useMemo(() => {
    const map = new Map<number, BenchEntry>();
    for (const e of moduleEntries) {
      const slot = e.card.benchSlot;
      if (typeof slot === 'number' && slot >= 1 && slot <= LAB_BENCH_SLOT_COUNT) {
        map.set(slot, e);
      }
    }
    return map;
  }, [moduleEntries]);

  /** OS em fluxo, porém sem compartimento (ex.: Em serviço, com o técnico). */
  const offBench = useMemo(
    () =>
      moduleEntries.filter(
        (e) => (e.card.benchSlot == null) && !labGroupForStatus(e.card.idList)
      ),
    [moduleEntries]
  );

  const occupiedCount = bySlot.size;

  /** Primeiro compartimento livre por grupo (para destacar a sugestão). */
  const suggestionByGroup = useMemo(() => {
    const map = new Map<string, number | null>();
    for (const g of LAB_BENCH_GROUPS) {
      const free = g.slots.find((s) => !bySlot.has(s)) ?? null;
      map.set(g.id, free);
    }
    return map;
  }, [bySlot]);

  /** Sugestão de entrada de novo produto = primeiro livre no grupo "Aguardando avaliação". */
  const intakeSuggestion = suggestionByGroup.get(LAB_BENCH_GROUPS[0].id) ?? null;

  const movingCard = movingCardId ? cards.find((c) => c.id === movingCardId) ?? null : null;
  const movingGroup = movingCard ? labGroupForStatus(movingCard.idList) : null;

  const handleSlotClick = (slot: number, group: LabBenchGroup) => {
    const occupant = bySlot.get(slot);
    // Modo "mover": clicar num compartimento de destino do mesmo grupo.
    if (movingCardId && onMoveCard) {
      if (occupant && occupant.card.id === movingCardId) {
        setMovingCardId(null);
        return;
      }
      if (occupant) return; // ocupado por outro
      if (movingGroup && movingGroup.id !== group.id) return; // só dentro do grupo do status
      void onMoveCard(movingCardId, slot);
      setMovingCardId(null);
      return;
    }
    if (occupant) onOpenCard(occupant.card);
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-[#111]">
      {/* Cabeçalho + resumo / sugestão */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="7" width="18" height="13" rx="1.5" />
              <path d="M3 11h18M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
            </svg>
          </span>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Bancada do laboratório</p>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              {occupiedCount}/{LAB_BENCH_SLOT_COUNT} compartimentos ocupados
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {intakeSuggestion != null ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Entrada de produto → compartimento {intakeSuggestion}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300">
              "Aguardando avaliação" lotado
            </span>
          )}
        </div>
      </div>

      {movingCardId && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          <span>
            Escolha um compartimento livre {movingGroup ? `do grupo "${movingGroup.label}"` : ''} para mover a OS.
          </span>
          <button
            type="button"
            onClick={() => setMovingCardId(null)}
            className="rounded-md px-2 py-0.5 font-medium hover:bg-blue-100 dark:hover:bg-blue-900"
          >
            Cancelar
          </button>
        </div>
      )}

      {/* Linha dos 2 compartimentos grandes (apenas representação física, sem organização) */}
      <div className="mb-2 grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div
            key={`big-${i}`}
            className="flex h-12 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-[11px] font-medium text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40"
          >
            Compartimento grande {i + 1}
          </div>
        ))}
      </div>

      {/* 6 colunas (etapas) × 4 compartimentos */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {LAB_BENCH_GROUPS.map((group) => {
          const suggestion = suggestionByGroup.get(group.id) ?? null;
          return (
            <div key={group.id} className="flex flex-col gap-1.5">
              <div className={`rounded-md px-2 py-1 text-center text-[11px] font-semibold text-white ${group.accent}`}>
                {group.label}
              </div>
              {group.slots.map((slot) => {
                const occupant = bySlot.get(slot);
                const isSuggested = suggestion === slot && !occupant;
                const isMoveTarget =
                  !!movingCardId &&
                  !occupant &&
                  (!movingGroup || movingGroup.id === group.id);
                const stage = occupant ? getStageConfig(occupant.card.idList, 'module') : undefined;
                return (
                  <button
                    type="button"
                    key={slot}
                    onClick={() => handleSlotClick(slot, group)}
                    disabled={!occupant && !isMoveTarget}
                    className={[
                      'group relative flex min-h-[64px] flex-col rounded-lg border p-1.5 text-left transition',
                      occupant
                        ? 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                        : 'border-dashed border-zinc-200 bg-transparent dark:border-zinc-800',
                      isSuggested ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-white dark:ring-offset-[#111]' : '',
                      isMoveTarget ? 'cursor-pointer border-blue-400 bg-blue-50/60 dark:bg-blue-950/30' : '',
                      !occupant && !isMoveTarget ? 'cursor-default' : 'cursor-pointer',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-zinc-200 text-[10px] font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                        {slot}
                      </span>
                      {occupant?.card.osNumber != null && (
                        <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                          OS {occupant.card.osNumber}
                        </span>
                      )}
                    </div>
                    {occupant ? (
                      <div className="mt-1 min-w-0">
                        <p className="truncate text-[11px] font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
                          {occupant.identification || occupant.vehicle || '—'}
                        </p>
                        <p className="truncate text-[10px] leading-tight text-zinc-500 dark:text-zinc-400">
                          {occupant.customer || '—'}
                        </p>
                        {stage && (
                          <span className={`mt-1 inline-block rounded px-1 py-0.5 text-[9px] font-medium leading-none ${stage.style}`}>
                            {stage.name}
                          </span>
                        )}
                        {occupant.card.externalRepair?.vendor && (
                          <p className="mt-0.5 truncate text-[9px] italic text-indigo-500 dark:text-indigo-300">
                            ↪ {occupant.card.externalRepair.vendor}
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="mt-auto">
                        <span className={`text-[10px] font-medium ${isSuggested ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-300 dark:text-zinc-600'}`}>
                          {isSuggested ? 'Sugerido' : 'Vago'}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* OS fora da bancada (com o técnico / em serviço) */}
      {offBench.length > 0 && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="mb-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
            Fora da bancada (com o técnico)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offBench.map((e) => {
              const stage = getStageConfig(e.card.idList, 'module');
              return (
                <button
                  type="button"
                  key={e.card.id}
                  onClick={() => onOpenCard(e.card)}
                  className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                  title={stage?.name}
                >
                  {e.card.osNumber != null && <span className="font-semibold">OS {e.card.osNumber}</span>}
                  <span className="max-w-[120px] truncate">{e.identification || e.vehicle || '—'}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default LabBenchPanel;
