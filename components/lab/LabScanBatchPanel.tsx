import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Loader2, MapPin, Package, X } from 'lucide-react';
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
  /** Queixa / descrição do problema na OS. */
  issueDescription?: string | null;
  benchSlot?: number | null;
};

/** Remove prefixo legado de categoria no início da queixa. */
function stripLegacyComplaint(text: string | null | undefined): string {
  if (!text) return '';
  let t = String(text).replace(/^\s*\[(?:categoria|category)[^\]]*\]\s*/i, '');
  const lines = t.split('\n');
  const first = lines[0]?.trim() ?? '';
  if (/^Categoria do ve[ií]culo:/i.test(first)) {
    const rest = lines.slice(1);
    while (rest.length && rest[0].trim() === '') rest.shift();
    t = rest.join('\n');
  }
  return t.trim();
}

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

/** Violeta = laboratório; âmbar = pátio/oficina. */
function CompSlotBadge({
  slot,
  tone,
  size = 'md',
}: {
  slot: string;
  tone: 'lab' | 'patio';
  size?: 'md' | 'sm';
}) {
  const toneClass =
    tone === 'lab'
      ? 'bg-violet-600 text-white shadow-[0_6px_16px_-8px_rgba(124,58,237,0.55)]'
      : 'bg-[#F5D00B] text-black shadow-[0_6px_16px_-8px_rgba(245,208,11,0.45)]';
  const sizeClass =
    size === 'sm'
      ? 'h-8 w-8 rounded-[0.65rem] text-[12px]'
      : 'h-11 w-11 rounded-[0.85rem] text-[15px]';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-bold tabular-nums tracking-tight ${toneClass} ${sizeClass}`}
      title={`Compartimento ${slot}`}
      aria-label={`Compartimento ${slot}`}
    >
      {slot}
    </span>
  );
}

function ItemPhoto({
  moduleKind,
  sizeClass = 'h-28 w-28 sm:h-32 sm:w-32',
  emphasizeAlready = false,
  alreadyTone = 'lab',
}: {
  moduleKind?: string | null;
  sizeClass?: string;
  emphasizeAlready?: boolean;
  alreadyTone?: 'lab' | 'patio';
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

  const ringClass = emphasizeAlready
    ? alreadyTone === 'lab'
      ? 'ring-4 ring-violet-500/55 ring-offset-2 ring-offset-[#F2F2F7] dark:ring-offset-zinc-950'
      : 'ring-4 ring-amber-400/70 ring-offset-2 ring-offset-[#F2F2F7] dark:ring-offset-zinc-950'
    : '';

  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[1.35rem] border border-zinc-200/80 bg-zinc-100 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.28)] dark:border-white/[0.1] dark:bg-zinc-900 ${sizeClass} ${ringClass}`}
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
  const destinationTone: 'lab' | 'patio' = mode === 'saida' ? 'lab' : 'patio';
  const destinationLabel = mode === 'saida' ? 'laboratório' : 'pátio';

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

  useEffect(() => {
    if (!open || confirming || presence.exiting) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClear();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open, confirming, presence.exiting, onClear]);

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
  const partLabel =
    labProductDisplayLabel(focused.moduleKind, focused.moduleProductOther).trim() || 'Peça';
  const moduleId = (focused.moduleIdentification || '').trim();
  const complaint = stripLegacyComplaint(focused.issueDescription);
  const comp = formatComp(focused.benchSlot);
  const others = [...displayItems].reverse().filter((i) => i.id !== focused.id);
  const hasBatchList = others.length > 0;

  const alreadyBannerClass =
    destinationTone === 'lab'
      ? 'border-violet-500/50 bg-violet-500/[0.14] text-violet-950 dark:border-violet-400/45 dark:bg-violet-500/20 dark:text-violet-50'
      : 'border-amber-500/55 bg-amber-400/25 text-amber-950 dark:border-[#F5D00B]/45 dark:bg-[#F5D00B]/18 dark:text-[#F5D00B]';

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
          className={`${iosVehicleModalShell} w-full ${
            hasBatchList
              ? 'max-w-[min(54rem,calc(100vw-1.25rem))]'
              : 'max-w-[min(32rem,100%)]'
          } ${modalSheetAnimClass(presence.exiting)}`}
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
              {displayItems.length} peça{displayItems.length === 1 ? '' : 's'} no lote · a
              localização só muda ao confirmar
            </p>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
            <div
              className={
                hasBatchList
                  ? 'grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(15rem,0.85fr)] lg:items-start lg:gap-6'
                  : ''
              }
            >
              <div className="min-w-0">
                <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start sm:gap-6">
                  <div className="flex flex-col items-center gap-2.5">
                    <ItemPhoto
                      moduleKind={focused.moduleKind}
                      emphasizeAlready={Boolean(focused.already)}
                      alreadyTone={destinationTone}
                    />
                    {comp ? (
                      <CompSlotBadge slot={comp} tone={destinationTone} size="md" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1 text-center sm:text-left">
                    {focused.osNumber != null ? (
                      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                        OS {focused.osNumber}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[22px] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-white sm:text-[24px]">
                      {partLabel}
                    </p>
                    {moduleId ? (
                      <p className="mt-0.5 truncate text-[12px] font-medium text-zinc-500 dark:text-zinc-400">
                        {moduleId}
                      </p>
                    ) : null}
                    <p className="mt-3 truncate text-[15px] font-medium text-zinc-800 dark:text-zinc-100">
                      {vehicle}
                    </p>
                    <p className="mt-0.5 truncate text-[14px] font-medium text-zinc-600 dark:text-zinc-300">
                      {customer}
                    </p>
                    <p
                      className="mt-2 line-clamp-3 text-[13px] leading-snug text-zinc-500 dark:text-zinc-400"
                      title={complaint || undefined}
                    >
                      {complaint || 'Sem queixa registrada.'}
                    </p>

                    {focused.already ? (
                      <div
                        className={`mt-4 flex items-start gap-3 rounded-2xl border-2 px-3.5 py-3 text-left ${alreadyBannerClass}`}
                        role="status"
                      >
                        <AlertTriangle
                          className="mt-0.5 h-5 w-5 shrink-0"
                          strokeWidth={2.4}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <p className="text-[15px] font-bold leading-snug tracking-tight">
                            Já está no {destinationLabel}
                          </p>
                          <p className="mt-0.5 text-[13px] font-medium leading-snug opacity-90">
                            {focused.feedback}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold ${
                            focused.ok
                              ? accent
                              : 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200'
                          }`}
                        >
                          <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} aria-hidden />
                          {focused.feedback}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {hasBatchList ? (
                <aside className="min-w-0 border-t border-zinc-200/70 pt-5 dark:border-white/[0.08] lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                  <p className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
                    Peças do lote
                  </p>
                  <ul className="max-h-[min(22rem,46vh)] space-y-2 overflow-y-auto overscroll-contain custom-scrollbar lg:max-h-[min(28rem,52vh)]">
                    {others.map((item) => {
                      const itemVehicle = (item.vehicleModel || item.label || '—').trim() || '—';
                      const itemPart =
                        labProductDisplayLabel(item.moduleKind, item.moduleProductOther).trim() ||
                        'Peça';
                      const itemCustomer = (item.customerName || '').trim() || '—';
                      const itemComp = formatComp(item.benchSlot);
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => setFocusedId(item.id)}
                            className={`flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left transition active:scale-[0.99] ${
                              item.already
                                ? destinationTone === 'lab'
                                  ? 'bg-violet-500/[0.1] ring-1 ring-inset ring-violet-500/30 hover:bg-violet-500/[0.14] dark:bg-violet-500/15 dark:ring-violet-400/35'
                                  : 'bg-amber-400/20 ring-1 ring-inset ring-amber-500/35 hover:bg-amber-400/28 dark:bg-[#F5D00B]/12 dark:ring-[#F5D00B]/30'
                                : 'bg-white hover:bg-zinc-50 dark:bg-zinc-900/80 dark:hover:bg-zinc-800/90'
                            }`}
                          >
                            <ItemPhoto
                              moduleKind={item.moduleKind}
                              sizeClass="h-11 w-11 !rounded-xl !shadow-none"
                              emphasizeAlready={Boolean(item.already)}
                              alreadyTone={destinationTone}
                            />
                            {itemComp ? (
                              <CompSlotBadge slot={itemComp} tone={destinationTone} size="sm" />
                            ) : (
                              <span className="inline-flex h-8 w-8 shrink-0" aria-hidden />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-zinc-900 dark:text-white">
                                {itemPart}
                                {item.osNumber != null ? (
                                  <span className="font-medium text-zinc-500 dark:text-zinc-400">
                                    {' '}
                                    · OS {item.osNumber}
                                  </span>
                                ) : null}
                              </p>
                              <p className="truncate text-[12px] text-zinc-500 dark:text-zinc-400">
                                {itemVehicle} · {itemCustomer}
                              </p>
                              <p
                                className={`truncate text-[12px] font-medium ${
                                  item.ok
                                    ? item.already
                                      ? destinationTone === 'lab'
                                        ? 'text-violet-700 dark:text-violet-300'
                                        : 'text-amber-800 dark:text-amber-200'
                                      : 'text-zinc-500 dark:text-zinc-400'
                                    : 'text-red-600 dark:text-red-300'
                                }`}
                              >
                                {item.already
                                  ? `Já no ${destinationLabel}`
                                  : item.feedback}
                              </p>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </aside>
              ) : null}
            </div>
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
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}
