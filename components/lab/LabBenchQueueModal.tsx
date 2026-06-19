import React, { useMemo } from 'react';
import { Clock, ListOrdered, X } from 'lucide-react';
import type { TrelloCard } from '../../types';
import { LAB_BENCH_SLOT_COUNT } from '../../constants/labBench';
import { getStageConfig } from '../../constants/serviceOrderStages';
import { PATIO_CARD_TITLE_SEP } from '../../utils/patioCardTitle';
import { formatBenchQueuedAt, getBenchQueuedCards } from '../../utils/labBenchQueue';
import { ModalPortal } from '../ui/ModalPortal';
import { IosModalHeader } from '../ui/IosModalHeader';

export type LabBenchQueueModalProps = {
  open: boolean;
  onClose: () => void;
  cards: TrelloCard[];
  onOpenCard: (card: TrelloCard) => void;
  /** Abre o painel completo da bancada (opcional). */
  onOpenBenchPanel?: () => void;
};

function cardLines(card: TrelloCard) {
  const parts = (card.name || '').split(PATIO_CARD_TITLE_SEP).map((s) => s.trim());
  return {
    identification: parts[1] ?? parts[0] ?? '—',
    customer: parts.slice(2).join(PATIO_CARD_TITLE_SEP) || '—',
  };
}

export const LabBenchQueueModal: React.FC<LabBenchQueueModalProps> = ({
  open,
  onClose,
  cards,
  onOpenCard,
  onOpenBenchPanel,
}) => {
  const queued = useMemo(() => getBenchQueuedCards(cards), [cards]);

  if (!open) return null;

  const handleOpenCard = (card: TrelloCard) => {
    onClose();
    onOpenCard(card);
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[300] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-bench-queue-title"
        onClick={onClose}
      >
        <div
          className="flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-zinc-200/90 bg-white shadow-xl dark:border-white/[0.1] dark:bg-zinc-900 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200/80 px-5 pb-3 pt-5 dark:border-white/[0.08]">
            <IosModalHeader
              icon={<ListOrdered className="h-6 w-6" strokeWidth={2} aria-hidden />}
              title="Fila da bancada"
              subtitle="Aguardando vaga na bancada (1–24)"
            />
            <button
              type="button"
              onClick={onClose}
              className="mt-1 shrink-0 rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-100 dark:hover:bg-white/[0.08]"
              aria-label="Fechar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <p className="mb-4 text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-400">
              Estes módulos aguardam vaga na bancada (1–24). Quando um compartimento liberar, o primeiro da
              fila ocupa automaticamente.
            </p>

            {queued.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
                <p className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-200">
                  Nenhum módulo na fila
                </p>
                <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                  Todos os produtos na bancada já têm compartimento ou não estão aguardando vaga.
                </p>
              </div>
            ) : (
              <ol className="flex flex-col gap-2">
                {queued.map((card, index) => {
                  const { identification, customer } = cardLines(card);
                  const stage = getStageConfig(card.idList, 'module');
                  return (
                    <li
                      key={card.id}
                      className="rounded-xl border border-violet-200/90 bg-violet-50/50 p-3 dark:border-violet-800/50 dark:bg-violet-950/25"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">
                            <span className="mr-2 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-md bg-violet-600 px-1.5 text-[12px] font-bold text-white">
                              {index + 1}
                            </span>
                            {card.osNumber != null && (
                              <span className="mr-1.5 text-zinc-500 dark:text-zinc-400">
                                OS {card.osNumber}
                              </span>
                            )}
                            {identification}
                          </p>
                          <p className="mt-0.5 truncate text-[12px] text-zinc-600 dark:text-zinc-400">
                            {customer}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {stage ? (
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${stage.style}`}
                              >
                                {stage.name}
                              </span>
                            ) : null}
                            <span className="inline-flex items-center gap-1 text-[11px] text-violet-800/90 dark:text-violet-200/80">
                              <Clock className="h-3 w-3 shrink-0" aria-hidden />
                              Na fila desde {formatBenchQueuedAt(card.benchQueuedAt)}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleOpenCard(card)}
                          className="shrink-0 rounded-lg bg-violet-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-violet-500"
                        >
                          Abrir OS
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          <div className="flex flex-wrap gap-2 border-t border-zinc-200/80 px-5 py-4 dark:border-white/[0.08]">
            {onOpenBenchPanel ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenBenchPanel();
                }}
                className="flex-1 rounded-xl border border-zinc-200/90 py-2.5 text-[14px] font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-white/[0.12] dark:text-zinc-300 dark:hover:bg-white/[0.06]"
              >
                Ver bancada completa
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              className={`rounded-xl bg-zinc-900 py-2.5 text-[14px] font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100 ${
                onOpenBenchPanel ? 'flex-1' : 'w-full'
              }`}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
