import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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

export type LabListaStageOption = {
  id: string;
  name: string;
  style: string;
};

type LabListaBoardProps = {
  cards: TrelloCard[];
  getStatusConfig: (listName: string, listId?: string) => LabListaStageConfig;
  lists: { id: string; name: string }[];
  stageOptions: LabListaStageOption[];
  locationBusyId: string | null;
  stageBusyId: string | null;
  onOpenCard: (card: TrelloCard) => void;
  onChangeStage: (card: TrelloCard, stageId: string) => void;
  onChangeLocation: (card: TrelloCard, target: LabListaUiLocation) => void;
};

function uiLocationFromKind(kind: LabLocationKind): LabListaUiLocation | null {
  if (kind === 'oficina') return 'oficina';
  if (kind === 'deposito' || kind === 'fila') return 'laboratorio';
  return null;
}

function formatBenchComp(slot: number | null | undefined): string | null {
  if (typeof slot !== 'number') return null;
  if (slot < LAB_BENCH_FIRST_SLOT || slot > LAB_BENCH_LAST_SLOT) return null;
  return String(slot).padStart(2, '0');
}

function getScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node = el?.parentElement ?? null;
  while (node && node !== document.body) {
    const style = window.getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return window;
}

function readScrollTop(target: HTMLElement | Window): number {
  return target === window ? window.scrollY : (target as HTMLElement).scrollTop;
}

function writeScrollTop(target: HTMLElement | Window, top: number, smooth: boolean) {
  if (target === window) {
    window.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  } else {
    (target as HTMLElement).scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }
}

/** Folga do fundo sólido além dos botões (px). */
const SUGGESTION_PANEL_PAD_X = 12;
const SUGGESTION_PANEL_PAD_Y = 12;

type MenuPlacement = {
  top: number;
  left: number;
  width: number;
  optionHeight: number;
  openUp: boolean;
};

function computeMenuPlacement(
  trigger: HTMLElement,
  optionCount: number
): MenuPlacement {
  const rect = trigger.getBoundingClientRect();
  const gap = 6;
  const edge = 12;
  const itemGap = 4;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(rect.width, vw - edge * 2 - SUGGESTION_PANEL_PAD_X * 2);
  const optionHeight = Math.max(rect.height, 36);
  const optionsHeight =
    optionCount * optionHeight + Math.max(0, optionCount - 1) * itemGap;
  const panelHeight = optionsHeight + SUGGESTION_PANEL_PAD_Y * 2;
  let left = Math.max(
    edge + SUGGESTION_PANEL_PAD_X,
    Math.min(rect.left, vw - width - edge - SUGGESTION_PANEL_PAD_X)
  );
  const spaceBelow = vh - rect.bottom - gap - edge;
  const spaceAbove = rect.top - gap - edge;
  const openUp = spaceBelow < panelHeight && spaceAbove >= spaceBelow;
  let top = openUp ? rect.top - gap - optionsHeight : rect.bottom + gap;
  top = Math.max(
    edge + SUGGESTION_PANEL_PAD_Y,
    Math.min(top, vh - optionsHeight - edge - SUGGESTION_PANEL_PAD_Y)
  );
  return { top, left, width, optionHeight, openUp };
}

type SuggestionOption = {
  id: string;
  label: string;
  style?: string;
};

function ListaSuggestionPicker({
  triggerClassName,
  triggerLabel,
  options,
  currentId,
  busy,
  ariaLabel,
  optionRoundedClass = 'rounded-xl',
  onPick,
}: {
  triggerClassName: string;
  triggerLabel: React.ReactNode;
  options: SuggestionOption[];
  currentId: string | null;
  busy?: boolean;
  ariaLabel: string;
  optionRoundedClass?: string;
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<MenuPlacement | null>(null);
  const [pickingId, setPickingId] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const scrollRestoreRef = useRef<{ target: HTMLElement | Window; top: number } | null>(null);
  const optionCount = options.length;

  const restoreScroll = useCallback(() => {
    const saved = scrollRestoreRef.current;
    if (!saved) return;
    scrollRestoreRef.current = null;
    window.requestAnimationFrame(() => {
      writeScrollTop(saved.target, saved.top, true);
    });
  }, []);

  const closeMenu = useCallback(
    (restore: boolean) => {
      setOpen(false);
      setPlacement(null);
      setPickingId(null);
      if (restore) restoreScroll();
    },
    [restoreScroll]
  );

  const openMenu = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const scrollTarget = getScrollParent(trigger);
    scrollRestoreRef.current = {
      target: scrollTarget,
      top: readScrollTop(scrollTarget),
    };
    setOpen(true);
    trigger.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
    window.setTimeout(() => {
      if (!triggerRef.current) return;
      setPlacement(computeMenuPlacement(triggerRef.current, optionCount));
    }, 180);
  }, [optionCount]);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      if (!triggerRef.current) return;
      setPlacement(computeMenuPlacement(triggerRef.current, optionCount));
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, optionCount]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, closeMenu]);

  const handlePick = (id: string) => {
    if (id === currentId) {
      closeMenu(true);
      return;
    }
    setPickingId(id);
    window.setTimeout(() => {
      onPick(id);
      closeMenu(true);
    }, 220);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (open) closeMenu(true);
          else openMenu();
        }}
        className={triggerClassName}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        {triggerLabel}
        <ChevronDown
          className={`h-4 w-4 shrink-0 opacity-70 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          strokeWidth={2.4}
          aria-hidden
        />
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(
            <>
              <button
                type="button"
                aria-label="Fechar sugestões"
                className="fixed inset-0 z-[99998] border-0 bg-zinc-950/25 backdrop-blur-[2px] motion-safe:animate-in motion-safe:fade-in motion-safe:duration-200 dark:bg-black/35"
                onClick={() => closeMenu(true)}
              />
              {placement ? (
                <div
                  ref={menuRef}
                  role="listbox"
                  style={{
                    position: 'fixed',
                    top: placement.top - SUGGESTION_PANEL_PAD_Y,
                    left: placement.left - SUGGESTION_PANEL_PAD_X,
                    width: placement.width + SUGGESTION_PANEL_PAD_X * 2,
                    padding: `${SUGGESTION_PANEL_PAD_Y}px ${SUGGESTION_PANEL_PAD_X}px`,
                    zIndex: 99999,
                  }}
                  className={`relative rounded-2xl bg-zinc-100 dark:bg-black motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-200 ${
                    placement.openUp
                      ? 'motion-safe:slide-in-from-bottom-2 origin-bottom'
                      : 'motion-safe:slide-in-from-top-2 origin-top'
                  }`}
                >
                  {/* Degradê suave nas bordas → blur do fundo */}
                  <div
                    aria-hidden
                    className="pointer-events-none absolute -inset-3 -z-10 rounded-[1.6rem] bg-gradient-to-b from-zinc-100 via-zinc-100/85 to-zinc-100/0 opacity-90 blur-[1px] dark:from-black dark:via-black/85 dark:to-black/0 dark:opacity-95"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 rounded-2xl
                      shadow-[0_0_28px_16px_rgba(244,244,245,0.75),0_0_56px_32px_rgba(244,244,245,0.35)]
                      dark:shadow-[0_0_28px_16px_rgba(0,0,0,0.85),0_0_56px_32px_rgba(0,0,0,0.45)]"
                  />
                  <div className="relative flex flex-col gap-1">
                    {options.map((opt, index) => {
                      const active = currentId === opt.id;
                      const picking = pickingId === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          role="option"
                          aria-selected={active}
                          style={{
                            height: placement.optionHeight,
                            animationDelay: `${index * 24}ms`,
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handlePick(opt.id);
                          }}
                          className={`inline-flex w-full items-center gap-2 border-0 px-3.5 text-left text-[13px] font-semibold shadow-sm transition-all duration-200 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-left-1 motion-safe:duration-200 ${optionRoundedClass} ${
                            picking
                              ? 'scale-[1.03] brightness-110'
                              : active
                                ? ''
                                : 'hover:brightness-105 active:scale-[0.985]'
                          } ${
                            opt.style ??
                            (active
                              ? 'bg-[#007AFF]/12 text-[#007AFF] dark:bg-[#0A84FF]/18 dark:text-[#64B5FF]'
                              : 'border border-zinc-200/80 bg-white text-zinc-800 dark:border-white/[0.12] dark:bg-zinc-900 dark:text-zinc-100')
                          }`}
                        >
                          <span className="min-w-0 flex-1 truncate uppercase tracking-wide">
                            {opt.label}
                          </span>
                          {active || picking ? (
                            <Check
                              className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
                                picking
                                  ? 'scale-125 animate-in zoom-in-50 duration-200'
                                  : 'scale-100'
                              }`}
                              strokeWidth={2.6}
                              aria-hidden
                            />
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>,
            document.body
          )
        : null}
    </>
  );
}

export const LabListaBoard: React.FC<LabListaBoardProps> = ({
  cards,
  getStatusConfig,
  lists,
  stageOptions,
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

  const locationOptions: SuggestionOption[] = [
    {
      id: 'oficina',
      label: 'Oficina',
      style: "bg-[#F5D00B] text-black border border-[#F5D00B]",
    },
    {
      id: 'laboratorio',
      label: 'Laboratório',
      style: 'bg-emerald-600 text-white border border-emerald-600',
    },
  ];

  return (
    <div className="overflow-x-auto overflow-y-visible rounded-[1.35rem] border border-zinc-200/70 bg-white/70 shadow-[0_10px_30px_-16px_rgba(0,0,0,0.18)] dark:border-white/[0.08] dark:bg-zinc-950/45 dark:shadow-none">
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
              ? storageThumbnailUrl(photoRaw, { maxWidth: 128, maxHeight: 128, resize: 'cover' }) ||
                photoRaw
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
                <td className="relative px-3 py-3.5 sm:px-4">
                  <ListaSuggestionPicker
                    busy={busyLoc}
                    currentId={uiLoc}
                    ariaLabel={`Localização: ${
                      uiLoc === 'oficina'
                        ? 'Oficina'
                        : uiLoc === 'laboratorio'
                          ? 'Laboratório'
                          : 'Definir'
                    }`}
                    optionRoundedClass="rounded-xl"
                    options={locationOptions}
                    triggerClassName="inline-flex min-h-[2.5rem] w-full max-w-[11.5rem] items-center gap-2 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 text-left text-[13px] font-semibold text-zinc-800 shadow-sm transition hover:bg-zinc-50 active:scale-[0.98] disabled:opacity-55 dark:border-white/[0.12] dark:bg-zinc-900/80 dark:text-zinc-100 dark:hover:bg-zinc-800/80"
                    triggerLabel={
                      <span className="min-w-0 flex-1 truncate">
                        {uiLoc === 'oficina'
                          ? 'Oficina'
                          : uiLoc === 'laboratorio'
                            ? 'Laboratório'
                            : 'Definir'}
                      </span>
                    }
                    onPick={(id) => onChangeLocation(card, id as LabListaUiLocation)}
                  />
                </td>
                <td className="relative px-3 py-3.5 sm:px-4">
                  <ListaSuggestionPicker
                    busy={busyStage}
                    currentId={card.idList}
                    ariaLabel={`Etapa: ${statusConfig.label}`}
                    optionRoundedClass="rounded-2xl"
                    options={stageOptions.map((s) => ({
                      id: s.id,
                      label: s.name,
                      style: s.style,
                    }))}
                    triggerClassName={`inline-flex min-h-[2.65rem] w-full max-w-[18rem] items-center gap-2 rounded-2xl border-0 px-3.5 py-2 text-left shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-55 ${statusConfig.style}`}
                    triggerLabel={
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold uppercase tracking-wide !text-inherit">
                        {statusConfig.label}
                      </span>
                    }
                    onPick={(stageId) => onChangeStage(card, stageId)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
