import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { TrelloCard } from '../../types';
import {
  ALL_BENCH_SLOTS,
  LAB_BENCH_SLOT_COUNT,
  LAB_BENCH_STAGE_LEGEND,
  firstFreeBenchSlot,
  statusUsesBench,
} from '../../constants/labBench';
import { getStageConfig } from '../../constants/serviceOrderStages';
import { parsePatioCardTitle } from '../../utils/patioCardTitle';
import { getBenchQueuedCards } from '../../utils/labBenchQueue';

interface BenchEntry {
  card: TrelloCard;
  vehicle: string;
  identification: string;
  customer: string;
}

interface LabBenchPanelProps {
  cards: TrelloCard[];
  onOpenCard: (card: TrelloCard) => void;
  onMoveCard?: (cardId: string, slot: number | null) => void | Promise<void>;
}

function toEntry(card: TrelloCard): BenchEntry {
  const { vehicle, plateOrModule, customer } = parsePatioCardTitle(card.name || '');
  return { card, vehicle, identification: plateOrModule, customer };
}

function BenchProductDetails({
  entry,
  size = 'slot',
}: {
  entry: BenchEntry;
  size?: 'slot' | 'list';
}) {
  const stage = getStageConfig(entry.card.idList, 'module');
  const isSlot = size === 'slot';
  const valueClass = isSlot
    ? 'truncate text-[9px] font-medium leading-snug text-zinc-800 dark:text-zinc-200'
    : 'truncate text-[10px] font-medium leading-snug text-zinc-800 dark:text-zinc-200';
  const vehicleClass = isSlot
    ? 'truncate text-[10px] font-bold leading-snug text-zinc-900 dark:text-zinc-100'
    : 'truncate text-[11px] font-bold leading-snug text-zinc-900 dark:text-zinc-100';

  return (
    <div className="min-w-0 space-y-0.5">
      <p className={vehicleClass} title={entry.vehicle}>{entry.vehicle || '—'}</p>
      <p className={valueClass} title={entry.customer}>{entry.customer || '—'}</p>
      <p className={valueClass}>
        {entry.card.osNumber != null ? `OS ${entry.card.osNumber}` : '—'}
      </p>
      {stage ? (
        <span
          className={`inline-block max-w-full truncate rounded px-1 py-0.5 text-[8px] font-semibold leading-tight ${stage.style}`}
          title={stage.name}
        >
          {stage.name}
        </span>
      ) : (
        <p className={valueClass}>—</p>
      )}
    </div>
  );
}

const BENCH_DRAG_MIME = 'application/x-lab-bench-card-id';

const LabBenchPanel: React.FC<LabBenchPanelProps> = ({ cards, onOpenCard, onMoveCard }) => {
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [search, setSearch] = useState('');
  const benchSkipClickRef = useRef(false);

  const moduleEntries = useMemo(() => cards.map(toEntry), [cards]);

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

  const queued = useMemo(() => {
    const ordered = getBenchQueuedCards(cards);
    const byId = new Map(moduleEntries.map((e) => [e.card.id, e]));
    return ordered.map((c) => byId.get(c.id)).filter((e): e is BenchEntry => !!e);
  }, [cards, moduleEntries]);

  const unassigned = useMemo(
    () =>
      moduleEntries.filter(
        (e) =>
          e.card.benchSlot == null &&
          !e.card.benchQueuedAt &&
          statusUsesBench(e.card.idList)
      ),
    [moduleEntries]
  );

  const offBench = useMemo(
    () => moduleEntries.filter((e) => e.card.benchSlot == null && !statusUsesBench(e.card.idList)),
    [moduleEntries]
  );

  const occupiedCount = bySlot.size;
  const nextFreeSlot = useMemo(() => firstFreeBenchSlot(bySlot.keys()), [bySlot]);

  const searchLower = search.trim().toLowerCase();
  const matchesSearch = useCallback(
    (e: BenchEntry) => {
      if (!searchLower) return true;
      const hay = [
        e.vehicle,
        e.customer,
        e.identification,
        e.card.osNumber != null ? String(e.card.osNumber) : '',
        getStageConfig(e.card.idList, 'module')?.name ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(searchLower);
    },
    [searchLower]
  );

  const canDropOnSlot = useCallback(
    (cardId: string, slot: number): boolean => {
      if (!onMoveCard) return false;
      const card = cards.find((c) => c.id === cardId);
      if (!card || !statusUsesBench(card.idList)) return false;
      const occupant = bySlot.get(slot);
      if (occupant && occupant.card.id !== cardId) return false;
      if (card.benchSlot === slot) return false;
      return true;
    },
    [cards, bySlot, onMoveCard]
  );

  const startMove = (cardId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!onMoveCard) return;
    setDragCardId(null);
    setDragOverSlot(null);
    setMovingCardId(cardId);
  };

  const beginDrag = (cardId: string, e: React.DragEvent) => {
    if (!onMoveCard) return;
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(BENCH_DRAG_MIME, cardId);
    setDragCardId(cardId);
    setMovingCardId(null);
    setDragOverSlot(null);
  };

  const endDrag = () => {
    setDragCardId(null);
    setDragOverSlot(null);
    benchSkipClickRef.current = true;
  };

  const finishMove = (cardId: string, slot: number) => {
    if (!onMoveCard) return;
    void onMoveCard(cardId, slot);
    setMovingCardId(null);
    setDragCardId(null);
    setDragOverSlot(null);
    benchSkipClickRef.current = true;
  };

  const handleSlotClick = (slot: number) => {
    if (benchSkipClickRef.current) {
      benchSkipClickRef.current = false;
      return;
    }
    const occupant = bySlot.get(slot);
    if (movingCardId && onMoveCard) {
      if (occupant && occupant.card.id === movingCardId) {
        setMovingCardId(null);
        return;
      }
      if (!canDropOnSlot(movingCardId, slot)) return;
      finishMove(movingCardId, slot);
      return;
    }
    if (occupant) onOpenCard(occupant.card);
  };

  const handleAutoAssignAll = async () => {
    if (!onMoveCard || unassigned.length === 0) return;
    setAutoAssigning(true);
    const occupied = new Set(bySlot.keys());
    try {
      for (const e of unassigned) {
        const slot = firstFreeBenchSlot(occupied);
        if (slot == null) break;
        await onMoveCard(e.card.id, slot);
        occupied.add(slot);
      }
    } finally {
      setAutoAssigning(false);
      setMovingCardId(null);
      setDragCardId(null);
      setDragOverSlot(null);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-[#111]">
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
              Vaga fixa 1–24 · a etapa muda só no sistema
              {onMoveCard ? ' · arraste para trocar vaga' : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar OS, cliente, produto…"
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-800 outline-none focus:border-violet-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
          {unassigned.length > 0 && onMoveCard ? (
            <button
              type="button"
              disabled={autoAssigning}
              onClick={() => void handleAutoAssignAll()}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
            >
              {autoAssigning ? 'Posicionando…' : 'Posicionar todos'}
            </button>
          ) : null}
          <span className="text-xs font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">
            {occupiedCount}/{LAB_BENCH_SLOT_COUNT} ocupados
          </span>
          {nextFreeSlot != null ? (
            <span className="inline-flex rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Próxima vaga → {nextFreeSlot}
            </span>
          ) : (
            <span className="inline-flex rounded-lg bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300">
              Bancada cheia
            </span>
          )}
        </div>
      </div>

      {queued.length > 0 && (
        <div className="mb-3 rounded-lg border border-violet-300/80 bg-violet-50/90 p-2.5 dark:border-violet-600/40 dark:bg-violet-950/30">
          <p className="mb-1.5 text-[11px] font-semibold text-violet-900 dark:text-violet-100">
            Fila — aguardando vaga na bancada ({queued.length})
          </p>
          <p className="mb-2 text-[10px] leading-snug text-violet-800/90 dark:text-violet-200/80">
            Quando um compartimento liberar, o próximo da fila ocupa automaticamente.
          </p>
          <ol className="flex flex-col gap-1.5">
            {queued.map((e, index) => (
              <li
                key={e.card.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-violet-200/80 bg-white px-2 py-1.5 dark:border-violet-800/50 dark:bg-zinc-900/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-[10px] font-bold text-violet-700 dark:text-violet-300">Fila #{index + 1}</p>
                  <BenchProductDetails entry={e} size="list" />
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCard(e.card)}
                  className="rounded-md border border-violet-200 px-2 py-0.5 text-[10px] font-medium text-violet-800 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-200"
                >
                  Abrir
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}

      {unassigned.length > 0 && (
        <div className="mb-3 rounded-lg border border-amber-300/80 bg-amber-50/90 p-2.5 dark:border-amber-600/40 dark:bg-amber-950/30">
          <p className="mb-1.5 text-[11px] font-semibold text-amber-900 dark:text-amber-100">
            Sem compartimento ({unassigned.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {unassigned.map((e) => (
              <li
                key={e.card.id}
                draggable={!!onMoveCard}
                onDragStart={onMoveCard ? (ev) => beginDrag(e.card.id, ev) : undefined}
                onDragEnd={onMoveCard ? endDrag : undefined}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-200/80 bg-white px-2 py-1.5 dark:border-amber-800/50 dark:bg-zinc-900/60"
              >
                <BenchProductDetails entry={e} size="list" />
                <div className="flex shrink-0 gap-1">
                  <button type="button" onClick={() => onOpenCard(e.card)} className="rounded-md border px-2 py-0.5 text-[10px] font-medium">
                    Abrir
                  </button>
                  {onMoveCard ? (
                    <button
                      type="button"
                      onClick={() => startMove(e.card.id)}
                      className="rounded-md bg-amber-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                    >
                      Posicionar
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {movingCardId && !dragCardId && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          <span>Toque em um compartimento vago ou arraste o produto.</span>
          <button type="button" onClick={() => setMovingCardId(null)} className="rounded-md px-2 py-0.5 font-medium">
            Cancelar
          </button>
        </div>
      )}

      <div className="mb-2 grid grid-cols-2 gap-2">
        {[0, 1].map((i) => (
          <div
            key={`big-${i}`}
            className="flex h-10 items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 text-[10px] font-medium text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/40"
          >
            Compartimento grande {i + 1}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
        {ALL_BENCH_SLOTS.map((slot) => {
          const occupant = bySlot.get(slot);
          const dimmed = occupant && searchLower && !matchesSearch(occupant);
          const isClickMoveTarget = !!movingCardId && !dragCardId && canDropOnSlot(movingCardId, slot);
          const isDragDropTarget = !!dragCardId && canDropOnSlot(dragCardId, slot);
          const isDropHighlight = dragOverSlot === slot && isDragDropTarget;
          const isSuggested = nextFreeSlot === slot && !occupant;
          const isDraggingThis = occupant && dragCardId === occupant.card.id;
          const stageStyle = occupant ? getStageConfig(occupant.card.idList, 'module')?.style : '';

          return (
            <div
              role="button"
              tabIndex={occupant || isClickMoveTarget ? 0 : -1}
              key={slot}
              draggable={!!onMoveCard && !!occupant}
              onDragStart={occupant && onMoveCard ? (ev) => beginDrag(occupant.card.id, ev) : undefined}
              onDragEnd={onMoveCard && occupant ? endDrag : undefined}
              onClick={() => handleSlotClick(slot)}
              onDragOver={
                onMoveCard
                  ? (ev) => {
                      if (!dragCardId || !canDropOnSlot(dragCardId, slot)) return;
                      ev.preventDefault();
                      ev.dataTransfer.dropEffect = 'move';
                      setDragOverSlot(slot);
                    }
                  : undefined
              }
              onDragLeave={(ev) => {
                const rel = ev.relatedTarget as Node | null;
                if (rel && ev.currentTarget.contains(rel)) return;
                setDragOverSlot((prev) => (prev === slot ? null : prev));
              }}
              onDrop={
                onMoveCard
                  ? (ev) => {
                      ev.preventDefault();
                      const cardId = ev.dataTransfer.getData(BENCH_DRAG_MIME) || dragCardId;
                      setDragOverSlot(null);
                      setDragCardId(null);
                      if (!cardId || !canDropOnSlot(cardId, slot)) return;
                      finishMove(cardId, slot);
                    }
                  : undefined
              }
              className={[
                'group relative flex min-h-[100px] flex-col rounded-lg border p-1.5 text-left transition',
                occupant
                  ? `border-zinc-200 bg-zinc-50 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${dimmed ? 'opacity-25' : ''}`
                  : 'border-dashed border-zinc-200 bg-transparent dark:border-zinc-800',
                isSuggested ? 'ring-2 ring-emerald-400/70 ring-offset-1 dark:ring-offset-[#111]' : '',
                isClickMoveTarget ? 'border-blue-400 bg-blue-50/60 dark:bg-blue-950/30' : '',
                isDropHighlight ? 'scale-[1.02] border-blue-500 bg-blue-50 ring-2 ring-blue-400/70' : '',
                occupant && onMoveCard ? 'cursor-grab active:cursor-grabbing' : occupant ? 'cursor-pointer' : '',
                isDraggingThis ? 'opacity-50' : '',
              ].join(' ')}
            >
              <div className="flex items-center justify-between gap-0.5">
                <span
                  className={`inline-flex h-5 min-w-[20px] items-center justify-center rounded-md px-1 text-[10px] font-bold ${
                    stageStyle && occupant ? stageStyle : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                  }`}
                >
                  {slot}
                </span>
                {occupant && onMoveCard ? (
                  <button
                    type="button"
                    onClick={(ev) => startMove(occupant.card.id, ev)}
                    className="rounded px-1 text-[9px] font-semibold text-blue-600 opacity-0 group-hover:opacity-100 dark:text-blue-400"
                  >
                    Mover
                  </button>
                ) : null}
              </div>
              {occupant ? (
                <div className="mt-1 min-w-0 flex-1">
                  <BenchProductDetails entry={occupant} size="slot" />
                </div>
              ) : (
                <span className="mt-auto text-[10px] font-medium text-zinc-400">
                  {isSuggested ? 'Próxima vaga' : isClickMoveTarget || isDragDropTarget ? 'Soltar' : 'Vago'}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {LAB_BENCH_STAGE_LEGEND.map((leg) => (
          <span
            key={leg.id}
            className={`rounded px-2 py-0.5 text-[10px] font-semibold text-white ${leg.accent}`}
          >
            {leg.label}
          </span>
        ))}
      </div>

      {offBench.length > 0 && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-900/40">
          <p className="mb-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300">
            Fora da bancada (com o técnico / conserto externo)
          </p>
          <div className="flex flex-wrap gap-1.5">
            {offBench.map((e) => (
              <button
                type="button"
                key={e.card.id}
                onClick={() => onOpenCard(e.card)}
                className="max-w-[200px] rounded-md border bg-white px-2 py-1.5 text-left dark:border-zinc-700 dark:bg-zinc-900"
              >
                <BenchProductDetails entry={e} size="list" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LabBenchPanel;
