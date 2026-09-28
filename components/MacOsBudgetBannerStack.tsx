import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Pencil, X } from 'lucide-react';
import type { Notification } from '../services/apiService';

const AUTO_DISMISS_MS = 6500;
const MAX_VISIBLE = 3;

export type MacOsBudgetBannerItem = {
  id: string;
  notification: Notification;
};

function plateLabel(plate: string | null | undefined): string | null {
  const p = typeof plate === 'string' ? plate.trim().toUpperCase() : '';
  return p || null;
}

function vehicleLine(n: Notification): string {
  const p = n.payload;
  const model = (typeof p.vehicle_model === 'string' && p.vehicle_model.trim()) || 'Veículo';
  const plate = plateLabel(p.vehicle_plate as string | null | undefined);
  return plate ? `${model} · ${plate}` : model;
}

function authorLine(n: Notification): string {
  const p = n.payload;
  const who =
    (typeof p.author_display_name === 'string' && p.author_display_name.trim()) ||
    (typeof p.technician_name === 'string' && p.technician_name.trim()) ||
    'Alguém';
  return who;
}

function ordinalHint(n: Notification): string | null {
  if (n.type !== 'budget_created') return null;
  const raw = pOrdinal(n);
  if (raw == null || raw < 2) return null;
  return `${raw}º orçamento deste veículo`;
}

function pOrdinal(n: Notification): number | null {
  const v = n.payload.budget_number ?? n.payload.budget_ordinal;
  const num = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  return Number.isFinite(num) && num >= 1 ? Math.floor(num) : null;
}

function titleFor(n: Notification): string {
  if (n.type === 'budget_edited') return 'Orçamento editado';
  const ord = pOrdinal(n);
  if (ord != null && ord >= 2) return `${ord}º orçamento criado`;
  return 'Orçamento criado';
}

type BannerCardProps = {
  item: MacOsBudgetBannerItem;
  onDismiss: (id: string) => void;
  onActivate: (item: MacOsBudgetBannerItem) => void;
};

function BannerCard({ item, onDismiss, onActivate }: BannerCardProps) {
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const n = item.notification;
  const isEdit = n.type === 'budget_edited';
  const hint = ordinalHint(n);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setEntered(true));
    const timer = window.setTimeout(() => beginLeave(), AUTO_DISMISS_MS);
    return () => {
      cancelAnimationFrame(enter);
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismiss once per mount
  }, []);

  const beginLeave = () => {
    setLeaving(true);
    window.setTimeout(() => onDismiss(item.id), 280);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => {
        onActivate(item);
        beginLeave();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(item);
          beginLeave();
        }
      }}
      className={`group pointer-events-auto relative w-full cursor-pointer overflow-hidden rounded-[18px] border border-white/55 bg-white/82 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.35),0_0_0_0.5px_rgba(0,0,0,0.06)] backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] dark:border-white/12 dark:bg-zinc-900/90 dark:shadow-[0_16px_48px_-12px_rgba(0,0,0,0.65)] ${
        entered && !leaving
          ? 'translate-x-0 opacity-100'
          : 'translate-x-[110%] opacity-0'
      }`}
      style={{ WebkitBackdropFilter: 'blur(28px)' }}
    >
      <div className="flex items-start gap-3 px-3.5 py-3 pr-10">
        <div
          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-[11px] shadow-sm ring-1 ring-black/5 dark:ring-white/10 ${
            isEdit
              ? 'bg-gradient-to-b from-[#5AC8FA] to-[#007AFF]'
              : 'bg-gradient-to-b from-[#34C759] to-[#248A3D]'
          }`}
        >
          {isEdit ? (
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
            {titleFor(n)}
          </p>
          <p className="mt-0.5 text-[13px] leading-snug text-zinc-600 dark:text-zinc-300">
            {vehicleLine(n)}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-zinc-500 dark:text-zinc-400">
            por {authorLine(n)}
            {hint ? <span className="text-zinc-400 dark:text-zinc-500"> · {hint}</span> : null}
          </p>
        </div>
      </div>
      <button
        type="button"
        aria-label="Dispensar"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full text-zinc-400 opacity-0 transition hover:bg-black/5 hover:text-zinc-700 group-hover:opacity-100 dark:hover:bg-white/10 dark:hover:text-zinc-200"
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

/** Banners estilo macOS (canto superior direito). */
export function MacOsBudgetBannerStack({ items, onDismiss, onActivate }: MacOsBudgetBannerStackProps) {
  if (typeof document === 'undefined') return null;
  const visible = items.slice(0, MAX_VISIBLE);
  if (visible.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100050] flex w-[min(380px,calc(100vw-1.5rem))] flex-col gap-2.5 sm:right-4"
      aria-live="polite"
    >
      {visible.map((item) => (
        <BannerCard key={item.id} item={item} onDismiss={onDismiss} onActivate={onActivate} />
      ))}
    </div>,
    document.body
  );
}
