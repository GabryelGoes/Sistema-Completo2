import React, { useMemo, useState } from 'react';
import { Wrench, X, Truck, CalendarClock, DollarSign, StickyNote, PackageCheck } from 'lucide-react';
import type { TrelloCard } from '../../types';
import { PATIO_CARD_TITLE_SEP } from '../../utils/patioCardTitle';
import { ModalPortal } from '../ui/ModalPortal';
import { IosModalHeader } from '../ui/IosModalHeader';

export type LabExternalRepairModalProps = {
  open: boolean;
  onClose: () => void;
  /** Módulos atualmente em conserto externo (status EM_CONSERTO_EXTERNO). */
  cards: TrelloCard[];
  onOpenCard: (card: TrelloCard) => void;
  /** Registra o retorno do conserto → move para "Chegada conserto". */
  onRegisterReturn: (cardId: string) => void | Promise<void>;
};

function cardLines(card: TrelloCard) {
  const parts = (card.name || '').split(PATIO_CARD_TITLE_SEP).map((s) => s.trim());
  return {
    identification: parts[1] ?? parts[0] ?? '—',
    customer: parts.slice(2).join(PATIO_CARD_TITLE_SEP) || '—',
  };
}

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const v = String(value).trim();
  // yyyy-mm-dd -> dd/mm/yyyy
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return v;
}

export const LabExternalRepairModal: React.FC<LabExternalRepairModalProps> = ({
  open,
  onClose,
  cards,
  onOpenCard,
  onRegisterReturn,
}) => {
  const [busyId, setBusyId] = useState<string | null>(null);
  const list = useMemo(
    () =>
      [...cards].sort(
        (a, b) => new Date(b.dateLastActivity).getTime() - new Date(a.dateLastActivity).getTime()
      ),
    [cards]
  );

  if (!open) return null;

  const handleOpenCard = (card: TrelloCard) => {
    onClose();
    onOpenCard(card);
  };

  const handleReturn = async (cardId: string) => {
    setBusyId(cardId);
    try {
      await onRegisterReturn(cardId);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[300] flex items-end justify-center bg-black/45 p-0 backdrop-blur-sm sm:items-center sm:p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="lab-external-repair-title"
        onClick={onClose}
      >
        <div
          className="flex max-h-[min(94vh,1000px)] w-full max-w-5xl flex-col overflow-hidden rounded-t-2xl border border-zinc-200/90 bg-white shadow-xl dark:border-white/[0.1] dark:bg-zinc-900 sm:rounded-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-3 border-b border-zinc-200/80 px-5 pb-3 pt-5 dark:border-white/[0.08]">
            <IosModalHeader
              icon={<Wrench className="h-6 w-6" strokeWidth={2} aria-hidden />}
              title="Conserto externo"
              subtitle="Módulos enviados a terceiros para reparo"
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
              Estes módulos saíram da bancada e estão sendo consertados em outro local. Quando um
              retornar, clique em <span className="font-semibold">Registrar chegada</span> para movê-lo
              à coluna &quot;Chegada conserto&quot;.
            </p>

            {list.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-10 text-center dark:border-zinc-700 dark:bg-zinc-950/40">
                <p className="text-[15px] font-semibold text-zinc-800 dark:text-zinc-200">
                  Nenhum módulo em conserto externo
                </p>
                <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                  Ao enviar um produto da coluna &quot;Envio conserto&quot;, ele aparece aqui.
                </p>
              </div>
            ) : (
              <ul className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
                {list.map((card) => {
                  const { identification, customer } = cardLines(card);
                  const er = card.externalRepair ?? null;
                  const busy = busyId === card.id;
                  return (
                    <li
                      key={card.id}
                      className="rounded-xl border border-purple-200/90 bg-purple-50/50 p-3 dark:border-purple-800/50 dark:bg-purple-950/25"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">
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
                          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-700 dark:text-zinc-300">
                              <Truck className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-300" aria-hidden />
                              {er?.vendor?.trim() || 'Fornecedor não informado'}
                            </span>
                            <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-700 dark:text-zinc-300">
                              <CalendarClock className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-300" aria-hidden />
                              Enviado {formatDate(er?.sentAt)}
                              {er?.expectedAt ? ` · prev. ${formatDate(er.expectedAt)}` : ''}
                            </span>
                            {er?.cost?.trim() ? (
                              <span className="inline-flex items-center gap-1.5 text-[12px] text-zinc-700 dark:text-zinc-300">
                                <DollarSign className="h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-300" aria-hidden />
                                {er.cost}
                              </span>
                            ) : null}
                            {er?.notes?.trim() ? (
                              <span className="inline-flex items-start gap-1.5 text-[12px] text-zinc-700 dark:text-zinc-300 sm:col-span-2">
                                <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-purple-600 dark:text-purple-300" aria-hidden />
                                <span className="min-w-0">{er.notes}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 border-t border-purple-200/70 pt-2.5 dark:border-purple-800/40">
                        <button
                          type="button"
                          onClick={() => handleReturn(card.id)}
                          disabled={busy}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 text-[13px] font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-60"
                        >
                          <PackageCheck className="h-4 w-4" strokeWidth={2.2} aria-hidden />
                          {busy ? 'Registrando…' : 'Registrar chegada'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCard(card)}
                          className="shrink-0 rounded-lg border border-zinc-200/90 px-3 py-2 text-[13px] font-semibold text-zinc-700 transition hover:bg-white dark:border-white/[0.12] dark:text-zinc-200 dark:hover:bg-white/[0.06]"
                        >
                          Abrir OS
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="border-t border-zinc-200/80 px-5 py-4 dark:border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-xl bg-zinc-900 py-2.5 text-[14px] font-semibold text-white transition hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
