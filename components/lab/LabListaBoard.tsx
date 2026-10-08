import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Package } from 'lucide-react';
import type { TrelloCard } from '../../types';
import { parsePatioCardTitle } from '../../utils/patioCardTitle';
import { isLabModuleFromPatio } from '../../utils/externalRepair';
import {
  labProductDisplayLabel,
  getLabProductKindPhotoUrl,
  LAB_PRODUCT_KINDS_CHANGED_EVENT,
} from '../../utils/moduleMetadata';
import { resolveLabLocation, type LabLocationKind } from '../../utils/labLocation';
import { storageThumbnailUrl } from '../../utils/storageThumbnailUrl';
import { LAB_BENCH_FIRST_SLOT, LAB_BENCH_LAST_SLOT } from '../../constants/labBench';

export type LabListaUiLocation = 'oficina' | 'laboratorio';

export type LabListaStageConfig = {
  style: string;
  label: string;
};

type LabListaBoardProps = {
  cards: TrelloCard[];
  getStatusConfig: (listName: string, listId?: string) => LabListaStageConfig;
  lists: { id: string; name: string }[];
  locationBusyId: string | null;
  stageBusyId: string | null;
  onOpenCard: (card: TrelloCard) => void;
  onChangeStage: (card: TrelloCard, e: React.MouseEvent) => void;
  onChangeLocation: (card: TrelloCard, target: LabListaUiLocation) => void;
};

function uiLocationFromKind(kind: LabLocationKind): LabListaUiLocation | null {
  if (kind === 'oficina') return 'oficina';
  if (kind === 'deposito' || kind === 'fila') return 'laboratorio';
  return null;
}

/** Número do compartimento da bancada (1–24), formatado. */
function formatBenchComp(slot: number | null | undefined): string | null {
  if (typeof slot !== 'number') return null;
  if (slot < LAB_BENCH_FIRST_SLOT || slot > LAB_BENCH_LAST_SLOT) return null;
  return String(slot).padStart(2, '0');
}

function LocationPicker({
  current,
  busy,
  onPick,
}: {
  current: LabListaUiLocation | null;
  busy: boolean;
  onPick: (target: LabListaUiLocation) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const label =
    current === 'oficina' ? 'Oficina' : current === 'laboratorio' ? 'Laboratório' : 'Definir';

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex min-h-[2.5rem] w-full max-w-[11.5rem] items-center gap-2 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-left text-[13px] font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-55 dark:border-white/[0.12] dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Localização: ${label}`}
      >
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" strokeWidth={2.4} aria-hidden />
      </button>
      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-[calc(100%+6px)] z-40 min-w-[12rem] overflow-hidden rounded-2xl border border-zinc-200/90 bg-white py-1 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.28)] dark:border-white/[0.1] dark:bg-zinc-950"
        >
          {(
            [
              { id: 'oficina' as const, title: 'Oficina' },
              { id: 'laboratorio' as const, title: 'Laboratório' },
            ] as const
          ).map((opt) => {
            const active = current === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="option"
                aria-selected={active}
                className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] font-semibold transition-colors ${
                  active
                    ? 'bg-[#007AFF]/12 text-[#007AFF] dark:bg-[#0A84FF]/18 dark:text-[#64B5FF]'
                    : 'text-zinc-800 hover:bg-zinc-100/90 dark:text-zinc-100 dark:hover:bg-white/[0.06]'
                }`}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setOpen(false);
                  if (!active) onPick(opt.id);
                }}
              >
                <span className="flex-1">{opt.title}</span>
                {active ? <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.6} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export const LabListaBoard: React.FC<LabListaBoardProps> = ({
  cards,
  getStatusConfig,
  lists,
  locationBusyId,
  stageBusyId,
  onOpenCard,
  onChangeStage,
  onChangeLocation,
}) => {
  const [, bumpKinds] = useState(0);
  useEffect(() => {
    const onChange = () => bumpKinds((n) => n + 1);
    window.addEventListener(LAB_PRODUCT_KINDS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LAB_PRODUCT_KINDS_CHANGED_EVENT, onChange);
  }, []);

  return (
    <div className="overflow-x-auto rounded-[1.35rem] border border-zinc-200/70 bg-white/70 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.18)] dark:border-white/[0.08] dark:bg-zinc-950/45 dark:shadow-none">
      <table className="w-full min-w-[64rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-zinc-200/80 dark:border-white/[0.08]">
            {[
              { key: 'comp', label: 'Comp.', className: 'w-[4.5rem]' },
              { key: 'peca', label: 'Peça', className: 'min-w-[14rem]' },
              { key: 'origem', label: 'Origem', className: 'w-[8.5rem]' },
              { key: 'veiculo', label: 'Veículo / Cliente', className: 'min-w-[12rem]' },
              { key: 'local', label: 'Localização', className: 'w-[12rem]' },
              { key: 'etapa', label: 'Etapa', className: 'min-w-[14rem]' },
            ].map((col) => (
              <th
                key={col.key}
                className={`px-3 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500 sm:px-4 ${col.className}`}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => {
            const titleParts = parsePatioCardTitle(card.name);
            const vehicle = titleParts.vehicle || '—';
            const customer = titleParts.customer || '—';
            const moduleId = (card.moduleIdentification || titleParts.plateOrModule || '').trim();
            const partLabel = labProductDisplayLabel(card.moduleKind, card.moduleProductOther);
            const photoRaw = getLabProductKindPhotoUrl(card.moduleKind);
            const photoUrl = photoRaw
              ? storageThumbnailUrl(photoRaw, { maxWidth: 128, maxHeight: 128, resize: 'cover' }) || photoRaw
              : null;
            const fromPatio = isLabModuleFromPatio(card.desc);
            const listName = lists.find((l) => l.id === card.idList)?.name ?? '—';
            const statusConfig = getStatusConfig(listName, card.idList);
            const loc = resolveLabLocation(card);
            const uiLoc = uiLocationFromKind(loc.kind);
            const compLabel = formatBenchComp(card.benchSlot);
            const busyLoc = locationBusyId === card.id;
            const busyStage = stageBusyId === card.id;

            return (
              <tr
                key={card.id}
                className="group border-b border-zinc-100/90 transition-colors last:border-b-0 hover:bg-zinc-50/80 dark:border-white/[0.05] dark:hover:bg-white/[0.035]"
              >
                <td className="px-3 py-3.5 sm:px-4">
                  {compLabel ? (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200/90 bg-zinc-100 text-[12px] font-bold tabular-nums text-zinc-700 dark:border-white/[0.12] dark:bg-white/[0.06] dark:text-zinc-200">
                      {compLabel}
                    </span>
                  ) : (
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-dashed border-zinc-200/80 text-[11px] font-semibold text-zinc-400 dark:border-white/[0.1] dark:text-zinc-600">
                      —
                    </span>
                  )}
                </td>
                <td className="px-3 py-3.5 sm:px-4">
                  <button
                    type="button"
                    onClick={() => onOpenCard(card)}
                    className="flex max-w-[20rem] items-center gap-3 text-left transition active:scale-[0.99]"
                  >
                    <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100 dark:border-white/[0.1] dark:bg-zinc-900">
                      {photoUrl ? (
                        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-600">
                          <Package className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold leading-snug text-zinc-900 dark:text-white">
                        {partLabel}
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                        {moduleId || '—'}
                      </span>
                    </span>
                  </button>
                </td>
                <td className="px-3 py-3.5 sm:px-4">
                  {fromPatio ? (
                    <span className="inline-flex items-center rounded-md bg-[#F5D00B] px-2.5 py-1 text-[11px] font-bold text-black">
                      Pátio
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-md bg-sky-200 px-2.5 py-1 text-[11px] font-bold text-sky-950 dark:bg-sky-300/90 dark:text-sky-950">
                      Cliente
                    </span>
                  )}
                </td>
                <td className="px-3 py-3.5 sm:px-4">
                  <button
                    type="button"
                    onClick={() => onOpenCard(card)}
                    className="max-w-[16rem] text-left transition active:scale-[0.99]"
                  >
                    <span className="block truncate text-[14px] font-semibold leading-snug text-zinc-900 dark:text-white">
                      {vehicle}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                      {customer}
                    </span>
                  </button>
                </td>
                <td className="px-3 py-3.5 sm:px-4">
                  <LocationPicker
                    current={uiLoc}
                    busy={busyLoc}
                    onPick={(target) => onChangeLocation(card, target)}
                  />
                </td>
                <td className="px-3 py-3.5 sm:px-4">
                  <button
                    type="button"
                    disabled={busyStage}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onChangeStage(card, e);
                    }}
                    className={`inline-flex min-h-[2.65rem] w-full max-w-[18rem] items-center gap-2 rounded-2xl border-0 px-3.5 py-2 text-left shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-55 ${statusConfig.style}`}
                    aria-label={`Etapa: ${statusConfig.label}`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-wide !text-inherit">
                      {statusConfig.label}
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 opacity-70" strokeWidth={2.4} aria-hidden />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
