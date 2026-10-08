import React, { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Package, X } from 'lucide-react';
import type { LabScanMode } from '../../utils/labScanMode';
import {
  getLabProductKindPhotoUrl,
  LAB_PRODUCT_KINDS_CHANGED_EVENT,
  labProductDisplayLabel,
} from '../../utils/moduleMetadata';
import { storageThumbnailUrl } from '../../utils/storageThumbnailUrl';
import { ModalPortal } from '../ui/ModalPortal';
import { iosModalOverlay, iosVehicleModalShell } from '../ui/iosModalStyles';
import {
  modalBackdropAnimClass,
  modalSheetAnimClass,
  useModalExitPresence,
} from '../../hooks/useModalExitAnimation';

export type LabScanBatchItem = {
  id: string;
  osNumber?: number | null;
  label: string;
  feedback: string;
  ok: boolean;
  already?: boolean;
  vehicleModel?: string | null;
  customerName?: string | null;
  moduleKind?: string | null;
  moduleProductOther?: string | null;
  moduleIdentification?: string | null;
  benchSlot?: number | null;
};

export type LabScanBatchPanelProps = {
  mode: Extract<LabScanMode, 'saida' | 'retorno'>;
  items: LabScanBatchItem[];
  confirming: boolean;
  onConfirm: () => void;
  onUndoLast: () => void;
  onClear: () => void;
};

function formatComp(slot: number | null | undefined): string | null {
  if (typeof slot !== 'number' || !Number.isInteger(slot) || slot < 1) return null;
  return String(slot).padStart(2, '0');
}

function ItemPhoto({
  moduleKind,
  sizeClass = 'h-28 w-28 sm:h-32 sm:w-32',
}: {
  moduleKind?: string | null;
  sizeClass?: string;
}) {
  const [, bump] = useState(0);
  useEffect(() => {
    const onChange = () => bump((n) => n + 1);
    window.addEventListener(LAB_PRODUCT_KINDS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(LAB_PRODUCT_KINDS_CHANGED_EVENT, onChange);
  }, []);
  const raw = getLabProductKindPhotoUrl(moduleKind);
  const photoUrl = raw
    ? storageThumbnailUrl(raw, { maxWidth: 320, maxHeight: 320, resize: 'cover' }) || raw
    : null;

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[1.35rem] border border-zinc-200/80 bg-zinc-100 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.28)] dark:border-white/[0.1] dark:bg-zinc-900 ${sizeClass}`}
    >
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-zinc-400 dark:text-zinc-600">
          <Package className="h-10 w-10" strokeWidth={1.6} aria-hidden />
        </span>
      )}
    </div>
  );
}

export function LabScanBatchPanel({
  mode,
  items,
  confirming,
  onConfirm,
  onUndoLast,
  onClear,
}: LabScanBatchPanelProps) {
  const open = items.length > 0;
  const presence = useModalExitPresence(open);
  const displayItemsRef = useRef<LabScanBatchItem[]>(items);
  if (items.length > 0) {
    displayItemsRef.current = items;
  }
  const displayItems = items.length > 0 ? items : displayItemsRef.current;
  const latestId = displayItems[displayItems.length - 1]?.id ?? null;
  const [focusedId, setFocusedId] = useState<string | null>(latestId);
  const okCount = displayItems.filter((i) => i.ok).length;
  const canConfirm = open && !confirming && okCount > 0;

  // Novo bip → destaca a peça mais recente
  useEffect(() => {
    if (latestId) setFocusedId(latestId);
  }, [latestId, displayItems.length]);

  useEffect(() => {
    if (!canConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.isComposing || e.repeat) return;
      e.preventDefault();
      e.stopPropagation();
      onConfirm();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canConfirm, onConfirm]);

  if (!presence.mounted) return null;
  const focused =
    displayItems.find((i) => i.id === focusedId) ?? displayItems[displayItems.length - 1];
  if (!focused) return null;

  const title = mode === 'saida' ? 'Entrada no laboratório' : 'Retorno à oficina';
  const accent =
    mode === 'saida' ? 'bg-violet-600 text-white' : 'bg-[#F5D00B] text-black';
  const accentSoft =
    mode === 'saida'
      ? 'bg-violet-500/15 text-violet-800 dark:bg-violet-400/15 dark:text-violet-200'
      : 'bg-amber-400/20 text-amber-950 dark:bg-[#F5D00B]/18 dark:text-[#F5D00B]';

  const vehicle = (focused.vehicleModel || focused.label || '—').trim() || '—';
  const customer = (focused.customerName || '').trim() || '—';
  const partLabel = labProductDisplayLabel(focused.moduleKind, focused.moduleProductOther);
  const moduleId = (focused.moduleIdentification || '').trim();
  const comp = formatComp(focused.benchSlot);
  const others = [...displayItems].reverse().filter((i) => i.id !== focused.id);

  return (
    <ModalPortal manageBackLayer={false}>
      <div
        className={`${iosModalOverlay} z-[260] ${modalBackdropAnimClass(presence.exiting)}`}
        onClick={(e) => {
          if (e.target === e.currentTarget && !confirming) onClear();
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lab-scan-batch-title"
          className={`${iosVehicleModalShell} w-full max-w-[min(32rem,100%)] ${modalSheetAnimClass(presence.exiting)}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative shrink-0 border-b border-zinc-200/70 px-5 pb-4 pt-5 dark:border-white/[0.08] sm:px-7 sm:pt-6">
            <button
              type="button"
              onClick={onClear}
              disabled={confirming}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full bg-zinc-200/80 text-zinc-600 transition hover:bg-zinc-300/90 disabled:opacity-40 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/15 sm:right-5 sm:top-5"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" strokeWidth={2.4} />
            </button>
            <p
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${accentSoft}`}
            >
              Leitor QR
            </p>
            <h2
              id="lab-scan-batch-title"
              className="mt-2 pr-10 text-[22px] font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-[24px]"
            >
              {title}
            </h2>
            <p className="mt-1 text-[13px] text-zinc-500 dark:text-zinc-400">
              {displayItems.length} peça{displayItems.length === 1 ? '' : 's'} no lote · continue
              bipando ou Enter para confirmar
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
            <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
              <ItemPhoto moduleKind={focused.moduleKind} />
              <div className="min-w-0 flex-1 text-center sm:text-left">
                {focused.osNumber != null ? (
                  <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                    OS {focused.osNumber}
                  </p>
                ) : null}
                <p className="mt-1 text-[20px] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-white sm:text-[22px]">
                  {vehicle}
                </p>
                <p className="mt-1 truncate text-[14px] font-medium text-zinc-600 dark:text-zinc-300">
                  {customer}
                </p>
                <p className="mt-1 truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                  {partLabel}
                  {moduleId ? ` · ${moduleId}` : ''}
                </p>

                <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                      focused.ok
                        ? focused.already
                          ? 'bg-amber-100 text-amber-950 dark:bg-amber-500/20 dark:text-amber-100'
                          : accent
                        : 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200'
                    }`}
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
                    {focused.feedback}
                  </span>
                  {comp ? (
                    <span className="inline-flex items-center rounded-full border border-zinc-200/90 bg-white px-3 py-1.5 text-[13px] font-bold tabular-nums text-zinc-700 dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-200">
                      Comp. {comp}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {others.length > 0 ? (
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                  Anteriores neste lote
                </p>
                <ul className="max-h-[10.5rem] space-y-2 overflow-y-auto overscroll-contain custom-scrollbar">
                  {others.map((item) => {
                    const itemVehicle = (item.vehicleModel || item.label || '—').trim() || '—';
                    const itemPart = labProductDisplayLabel(
                      item.moduleKind,
                      item.moduleProductOther
                    );
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => setFocusedId(item.id)}
                          className="flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left transition hover:bg-zinc-50 active:scale-[0.99] dark:bg-zinc-900/80 dark:hover:bg-zinc-800/90"
                        >
                          <ItemPhoto
                            moduleKind={item.moduleKind}
                            sizeClass="h-11 w-11 !rounded-xl !shadow-none"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                              {itemVehicle}
                              {item.osNumber != null ? (
                                <span className="font-medium text-zinc-500 dark:text-zinc-400">
                                  {' '}
                                  · OS {item.osNumber}
                                </span>
                              ) : null}
                            </p>
                            <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                              {(item.customerName || '').trim() || '—'} · {itemPart}
                            </p>
                            <p
                              className={`truncate text-[12px] ${
                                item.ok
                                  ? item.already
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-zinc-500 dark:text-zinc-400'
                                  : 'text-red-600 dark:text-red-300'
                              }`}
                            >
                              {item.feedback}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
          </div>

          <div className="shrink-0 border-t border-zinc-200/70 bg-white/80 px-5 py-4 backdrop-blur-md dark:border-white/[0.08] dark:bg-zinc-950/60 sm:px-7">
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={onUndoLast}
                disabled={confirming || !open || displayItems.length === 0}
                className="inline-flex flex-1 items-center justify-center rounded-2xl bg-zinc-200/90 px-4 py-3.5 text-[15px] font-semibold text-zinc-800 transition active:scale-[0.99] disabled:opacity-40 dark:bg-white/10 dark:text-zinc-100"
              >
                Desfazer
              </button>
              <button
                type="button"
                onClick={onConfirm}
                disabled={confirming || okCount === 0}
                className={`inline-flex flex-[1.35] items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-40 ${accent}`}
              >
                {confirming ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                Confirmar
                <kbd className="ml-0.5 hidden rounded-md bg-black/10 px-1.5 py-0.5 text-[11px] font-bold tracking-wide sm:inline dark:bg-white/15">
                  Enter
                </kbd>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
