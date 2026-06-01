import React, { useCallback, useMemo, useRef, useState } from 'react';
import type { TrelloCard } from '../../types';
import {
  LAB_BENCH_GROUPS,
  LAB_BENCH_INTAKE_GROUP,
  LAB_BENCH_SLOT_COUNT,
  firstFreeSlotForStatus,
  labGroupForStatus,
  statusInIntakeBenchGroup,
  statusUsesBench,
  type LabBenchGroup,
} from '../../constants/labBench';
import { getStageConfig } from '../../constants/serviceOrderStages';
import { PATIO_CARD_TITLE_SEP } from '../../utils/patioCardTitle';
import { getBenchQueuedCards } from '../../utils/labBenchQueue';

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

const BENCH_DRAG_MIME = 'application/x-lab-bench-card-id';

const LabBenchPanel: React.FC<LabBenchPanelProps> = ({ cards, onOpenCard, onMoveCard }) => {
  const [movingCardId, setMovingCardId] = useState<string | null>(null);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const benchSkipClickRef = useRef(false);

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

  /** Fila automática (compartimentos 1–4 lotados no cadastro). */
  const queued = useMemo(() => {
    const ordered = getBenchQueuedCards(cards);
    const byId = new Map(moduleEntries.map((e) => [e.card.id, e]));
    return ordered.map((c) => byId.get(c.id)).filter((e): e is BenchEntry => !!e);
  }, [cards, moduleEntries]);

  /** Produtos em fluxo na bancada mas sem compartimento (cadastros antigos). */
  const unassigned = useMemo(
    () =>
      moduleEntries.filter(
        (e) =>
          e.card.benchSlot == null &&
          !e.card.benchQueuedAt &&
          statusUsesBench(e.card.idList) &&
          !statusInIntakeBenchGroup(e.card.idList)
      ),
    [moduleEntries]
  );

  /** OS em fluxo, porém sem compartimento (ex.: Em serviço, com o técnico). */
  const offBench = useMemo(
    () =>
      moduleEntries.filter(
        (e) => e.card.benchSlot == null && !statusUsesBench(e.card.idList)
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

  const activeMoveCardId = dragCardId ?? movingCardId;
  const movingCard = activeMoveCardId ? cards.find((c) => c.id === activeMoveCardId) ?? null : null;
  const movingGroup = movingCard ? labGroupForStatus(movingCard.idList) : null;

  const canDropOnSlot = useCallback(
    (cardId: string, slot: number, group: LabBenchGroup): boolean => {
      if (!onMoveCard) return false;
      const card = cards.find((c) => c.id === cardId);
      if (!card) return false;
      const cardGroup = labGroupForStatus(card.idList);
      if (!cardGroup || cardGroup.id !== group.id) return false;
      const occupant = bySlot.get(slot);
      if (occupant && occupant.card.id !== cardId) return false;
      const currentSlot = card.benchSlot;
      if (currentSlot === slot) return false;
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

  const handleSlotClick = (slot: number, group: LabBenchGroup) => {
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
      if (!canDropOnSlot(movingCardId, slot, group)) return;
      finishMove(movingCardId, slot);
      return;
    }
    if (occupant) onOpenCard(occupant.card);
  };

  const handleSlotDragOver = (e: React.DragEvent, slot: number, group: LabBenchGroup) => {
    if (!dragCardId || !canDropOnSlot(dragCardId, slot, group)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverSlot(slot);
  };

  const handleSlotDrop = (e: React.DragEvent, slot: number, group: LabBenchGroup) => {
    e.preventDefault();
    const cardId = e.dataTransfer.getData(BENCH_DRAG_MIME) || dragCardId;
    setDragOverSlot(null);
    setDragCardId(null);
    if (!cardId || !canDropOnSlot(cardId, slot, group)) return;
    finishMove(cardId, slot);
  };

  const handleAutoAssignAll = async () => {
    if (!onMoveCard || unassigned.length === 0) return;
    setAutoAssigning(true);
    const occupied = new Set(bySlot.keys());
    try {
      for (const e of unassigned) {
        const slot = firstFreeSlotForStatus(e.card.idList, occupied);
        if (slot == null) continue;
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
              {onMoveCard ? 'Arraste entre compartimentos do mesmo grupo · ' : ''}
              {occupiedCount}/{LAB_BENCH_SLOT_COUNT} compartimentos ocupados
              {queued.length > 0 ? (
                <span className="ml-1 font-semibold text-violet-600 dark:text-violet-400">
                  · {queued.length} na fila
                </span>
              ) : null}
              {unassigned.length > 0 ? (
                <span className="ml-1 font-semibold text-amber-600 dark:text-amber-400">
                  · {unassigned.length} sem posição
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unassigned.length > 0 && onMoveCard ? (
            <button
              type="button"
              disabled={autoAssigning}
              onClick={() => void handleAutoAssignAll()}
              className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-500 disabled:opacity-60"
            >
              {autoAssigning ? 'Posicionando…' : 'Posicionar todos automaticamente'}
            </button>
          ) : null}
          {intakeSuggestion != null ? (
            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              Entrada de produto → compartimento {intakeSuggestion}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-lg bg-rose-500/15 px-2.5 py-1 text-xs font-medium text-rose-700 dark:text-rose-300">
              &quot;Aguardando avaliação&quot; lotado
            </span>
          )}
        </div>
      </div>

      {queued.length > 0 && (
        <div className="mb-3 rounded-lg border border-violet-300/80 bg-violet-50/90 p-2.5 dark:border-violet-600/40 dark:bg-violet-950/30">
          <p className="mb-1.5 text-[11px] font-semibold text-violet-900 dark:text-violet-100">
            Fila — Aguardando avaliação (compartimentos {LAB_BENCH_INTAKE_GROUP.slots.join('–')})
          </p>
          <p className="mb-2 text-[10px] leading-snug text-violet-800/90 dark:text-violet-200/80">
            Quando um compartimento 1–4 liberar (mudança de etapa, entrega ou arquivamento), o próximo da fila
            ocupa o espaço automaticamente.
          </p>
          <ol className="flex flex-col gap-1.5">
            {queued.map((e, index) => (
              <li
                key={e.card.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-violet-200/80 bg-white px-2 py-1.5 dark:border-violet-800/50 dark:bg-zinc-900/60"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                    <span className="mr-1.5 text-violet-600 dark:text-violet-400">#{index + 1}</span>
                    {e.card.osNumber != null && (
                      <span className="mr-1 text-zinc-500 dark:text-zinc-400">OS {e.card.osNumber}</span>
                    )}
                    {e.identification || e.vehicle || '—'}
                  </p>
                  <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">{e.customer || '—'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenCard(e.card)}
                  className="rounded-md border border-violet-200 px-2 py-0.5 text-[10px] font-medium text-violet-800 hover:bg-violet-50 dark:border-violet-700 dark:text-violet-200 dark:hover:bg-violet-950/50"
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
            Produtos sem compartimento na bancada
          </p>
          <p className="mb-2 text-[10px] leading-snug text-amber-800/90 dark:text-amber-200/80">
            Estes produtos já estavam no sistema antes da bancada digital. Arraste para um compartimento livre
            do grupo da etapa, use <strong>Posicionar</strong> (toque) ou o botão automático acima.
          </p>
          <ul className="flex flex-col gap-1.5">
            {unassigned.map((e) => {
              const stage = getStageConfig(e.card.idList, 'module');
              const group = labGroupForStatus(e.card.idList);
              const isPlacing = movingCardId === e.card.id;
              return (
                <li
                  key={e.card.id}
                  draggable={!!onMoveCard}
                  onDragStart={onMoveCard ? (ev) => beginDrag(e.card.id, ev) : undefined}
                  onDragEnd={onMoveCard ? endDrag : undefined}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-md border px-2 py-1.5 ${
                    isPlacing
                      ? 'border-blue-400 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40'
                      : dragCardId === e.card.id
                        ? 'border-blue-400 bg-blue-50/80 opacity-60 dark:border-blue-700 dark:bg-blue-950/40'
                        : 'border-amber-200/80 bg-white dark:border-amber-800/50 dark:bg-zinc-900/60'
                  } ${onMoveCard ? 'cursor-grab active:cursor-grabbing' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                      {e.card.osNumber != null && (
                        <span className="mr-1 text-zinc-500 dark:text-zinc-400">OS {e.card.osNumber}</span>
                      )}
                      {e.identification || e.vehicle || '—'}
                    </p>
                    <p className="truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                      {e.customer || '—'}
                      {stage ? ` · ${stage.name}` : ''}
                      {group ? ` · compart. ${group.slots.join(', ')}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => onOpenCard(e.card)}
                      className="rounded-md border border-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      Abrir
                    </button>
                    {onMoveCard ? (
                      <button
                        type="button"
                        onClick={() => startMove(e.card.id)}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-semibold text-white ${
                          isPlacing ? 'bg-blue-600' : 'bg-amber-600 hover:bg-amber-500'
                        }`}
                      >
                        {isPlacing ? 'Escolha o compartimento…' : 'Posicionar'}
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {movingCardId && !dragCardId && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-200">
          <span>
            Toque em um compartimento livre{' '}
            {movingGroup ? `do grupo "${movingGroup.label}"` : ''} para posicionar o produto (ou arraste).
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
                const isClickMoveTarget =
                  !!movingCardId &&
                  !dragCardId &&
                  canDropOnSlot(movingCardId, slot, group);
                const isDragDropTarget =
                  !!dragCardId && canDropOnSlot(dragCardId, slot, group);
                const isDropHighlight = dragOverSlot === slot && isDragDropTarget;
                const stage = occupant ? getStageConfig(occupant.card.idList, 'module') : undefined;
                const isDraggingThis = occupant && dragCardId === occupant.card.id;
                return (
                  <div
                    role="button"
                    tabIndex={occupant || isClickMoveTarget ? 0 : -1}
                    key={slot}
                    draggable={!!onMoveCard && !!occupant}
                    onDragStart={
                      occupant && onMoveCard ? (ev) => beginDrag(occupant.card.id, ev) : undefined
                    }
                    onDragEnd={onMoveCard && occupant ? endDrag : undefined}
                    onClick={() => handleSlotClick(slot, group)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        handleSlotClick(slot, group);
                      }
                    }}
                    onDragOver={onMoveCard ? (ev) => handleSlotDragOver(ev, slot, group) : undefined}
                    onDragLeave={(ev) => {
                      const rel = ev.relatedTarget as Node | null;
                      if (rel && ev.currentTarget.contains(rel)) return;
                      setDragOverSlot((prev) => (prev === slot ? null : prev));
                    }}
                    onDrop={onMoveCard ? (ev) => handleSlotDrop(ev, slot, group) : undefined}
                    className={[
                      'group relative flex min-h-[64px] flex-col rounded-lg border p-1.5 text-left transition',
                      occupant
                        ? 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:hover:border-zinc-600'
                        : 'border-dashed border-zinc-200 bg-transparent dark:border-zinc-800',
                      isSuggested ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-white dark:ring-offset-[#111]' : '',
                      isClickMoveTarget ? 'cursor-pointer border-blue-400 bg-blue-50/60 dark:bg-blue-950/30' : '',
                      isDropHighlight ? 'scale-[1.02] border-blue-500 bg-blue-50 ring-2 ring-blue-400/70 dark:border-blue-500 dark:bg-blue-950/50' : '',
                      isDragDropTarget && !occupant && !isDropHighlight
                        ? 'border-blue-300/80 bg-blue-50/40 dark:border-blue-700/50 dark:bg-blue-950/20'
                        : '',
                      occupant && onMoveCard
                        ? 'cursor-grab active:cursor-grabbing'
                        : occupant
                          ? 'cursor-pointer'
                          : isClickMoveTarget || isDragDropTarget
                            ? 'cursor-pointer'
                            : 'cursor-default',
                      isDraggingThis ? 'opacity-50' : '',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-0.5">
                      <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-zinc-200 text-[10px] font-bold text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                        {slot}
                      </span>
                      <div className="flex items-center gap-0.5">
                        {occupant?.card.osNumber != null && (
                          <span className="text-[10px] font-semibold text-zinc-500 dark:text-zinc-400">
                            OS {occupant.card.osNumber}
                          </span>
                        )}
                        {occupant && onMoveCard ? (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(ev) => startMove(occupant.card.id, ev)}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Enter' || ev.key === ' ') startMove(occupant.card.id, ev as unknown as React.MouseEvent);
                            }}
                            className="rounded px-1 text-[9px] font-semibold text-blue-600 opacity-0 transition group-hover:opacity-100 dark:text-blue-400"
                          >
                            Mover
                          </span>
                        ) : null}
                      </div>
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
                        <span
                          className={`text-[10px] font-medium ${
                            isSuggested
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isClickMoveTarget || isDragDropTarget
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-zinc-300 dark:text-zinc-600'
                          }`}
                        >
                          {isSuggested
                            ? 'Sugerido'
                            : isDropHighlight
                              ? 'Soltar aqui'
                              : isClickMoveTarget || isDragDropTarget
                                ? 'Soltar aqui'
                                : 'Vago'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

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
