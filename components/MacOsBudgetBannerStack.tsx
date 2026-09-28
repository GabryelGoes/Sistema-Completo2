import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, FileText, Pencil, X } from 'lucide-react';

/** Quantos banners empilhados no máximo (mais recente no topo). */
const MAX_STACK = 12;

export type MacOsBudgetBannerItem = {
  id: string;
  kind: 'budget_created' | 'budget_edited' | 'budget_verified';
  serviceOrderId: string;
  budgetId: string;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
  authorName?: string | null;
  budgetNumber?: number | null;
};

function plateLabel(plate: string | null | undefined): string | null {
  const p = typeof plate === 'string' ? plate.trim().toUpperCase() : '';
  return p || null;
}

function vehicleLine(item: MacOsBudgetBannerItem): string {
  const model = (item.vehicleModel && item.vehicleModel.trim()) || 'Veículo';
  const plate = plateLabel(item.vehiclePlate);
  return plate ? `${model} · ${plate}` : model;
}

function titleFor(item: MacOsBudgetBannerItem): string {
  if (item.kind === 'budget_verified') {
    const n = item.budgetNumber;
    if (n != null && n >= 2) return `${n}º orçamento verificado`;
    return 'Orçamento verificado';
  }
  if (item.kind === 'budget_edited') {
    const n = item.budgetNumber;
    if (n != null && n >= 2) return `${n}º orçamento editado`;
    return 'Orçamento editado';
  }
  const n = item.budgetNumber;
  if (n != null && n >= 2) return `${n}º orçamento criado`;
  return 'Orçamento criado';
}

type BannerCardProps = {
  item: MacOsBudgetBannerItem;
  onDismiss: (id: string) => void;
  onActivate: (item: MacOsBudgetBannerItem) => void;
};

function BannerCard({ item, onDismiss, onActivate }: BannerCardProps) {
  const [leaving, setLeaving] = useState(false);
  const isEdit = item.kind === 'budget_edited';
  const isVerified = item.kind === 'budget_verified';
  const hint =
    (item.kind === 'budget_created' || item.kind === 'budget_verified') &&
    item.budgetNumber != null &&
    item.budgetNumber >= 2
      ? `${item.budgetNumber}º orçamento deste veículo`
      : null;
  const author = item.authorName?.trim() || null;

  const beginLeave = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => onDismiss(item.id), 280);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onActivate(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(item);
        }
      }}
      className={`group pointer-events-auto relative w-full cursor-pointer overflow-hidden rounded-[18px] border border-white/55 bg-white/85 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(0,0,0,0.06)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-white/12 dark:bg-zinc-900/92 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.65)] ${
        leaving ? 'translate-x-[110%] opacity-0' : 'translate-x-0 opacity-100'
      }`}
      style={{ WebkitBackdropFilter: 'blur(28px)' }}
    >
      <div className="flex items-start gap-3 px-3.5 py-3 pr-10">
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[11px] shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${
            isVerified
              ? 'bg-gradient-to-b from-[#30D158] to-[#248A3D]'
              : isEdit
                ? 'bg-gradient-to-b from-[#5AC8FA] to-[#007AFF]'
                : 'bg-gradient-to-b from-[#34C759] to-[#248A3D]'
          }`}
        >
          {isVerified ? (
            <CheckCircle2 className="h-[18px] w-[18px] text-white" strokeWidth={2.4} />
          ) : isEdit ? (
            <Pencil className="h-[18px] w-[18px] text-white" strokeWidth={2.4} />
          ) : (
            <FileText className="h-[18px] w-[18px] text-white" strokeWidth={2.4} />
          )}
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-baseline gap-2">
            <p className="truncate text-[12px] font-semibold tracking-tight text-zinc-500 dark:text-zinc-400">
              Rei do ABS
            </p>
            <span className="text-[11px] tabular-nums text-zinc-400 dark:text-zinc-500">agora</span>
          </div>
          <p className="mt-0.5 text-[14px] font-semibold leading-snug tracking-tight text-zinc-900 dark:text-white">
            {titleFor(item)}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-zinc-600 dark:text-zinc-300">
            {vehicleLine(item)}
          </p>
          {author || hint ? (
            <p className="mt-0.5 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
              {author ? <>por {author}</> : null}
              {author && hint ? <span className="text-zinc-400 dark:text-zinc-500"> · </span> : null}
              {hint ? <span>{hint}</span> : null}
            </p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        aria-label="Fechar notificação"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.04] text-zinc-500 transition hover:bg-black/10 hover:text-zinc-800 dark:bg-white/[0.08] dark:text-zinc-300 dark:hover:bg-white/15 dark:hover:text-white"
        onClick={(e) => {
          e.stopPropagation();
          beginLeave();
        }}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  );
}

export type MacOsBudgetBannerStackProps = {
  items: MacOsBudgetBannerItem[];
  onDismiss: (id: string) => void;
  onActivate: (item: MacOsBudgetBannerItem) => void;
};

/** Banners estilo macOS (canto superior direito) — só fecham no X; mais recente no topo. */
export function MacOsBudgetBannerStack({ items, onDismiss, onActivate }: MacOsBudgetBannerStackProps) {
  if (typeof document === 'undefined') return null;
  const visible = items.slice(0, MAX_STACK);
  if (visible.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100050] flex max-h-[calc(100dvh-1.5rem)] w-[min(380px,calc(100vw-1.5rem))] flex-col gap-2.5 overflow-y-auto overscroll-contain sm:right-5 sm:top-4"
      aria-live="polite"
    >
      {visible.map((item) => (
        <BannerCard key={item.id} item={item} onDismiss={onDismiss} onActivate={onActivate} />
      ))}
    </div>,
    document.body
  );
}
