import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, FileText, Minus, Pencil, Trash2, X } from 'lucide-react';
import { findDesktopOrcamentosNavTarget, playMacGenieMinimize } from '../utils/macGenieMinimize';

/** Soft-cap visual; novos banners sempre entram (mais recente no topo). */
const MAX_VISIBLE = 48;

export type MacOsBudgetBannerItem = {
  id: string;
  kind: 'budget_created' | 'budget_edited' | 'budget_verified';
  serviceOrderId: string;
  budgetId: string;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
  authorName?: string | null;
  authorPhotoUrl?: string | null;
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

function authorLabel(item: MacOsBudgetBannerItem): string {
  const name = item.authorName?.trim();
  return name || 'Usuário';
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

type BannerCardProps = {
  item: MacOsBudgetBannerItem;
  theme: 'dark' | 'light';
  onDismiss: (id: string) => void;
  onActivate: (item: MacOsBudgetBannerItem) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  hiddenForGenie?: boolean;
};

function BannerCard({
  item,
  theme,
  onDismiss,
  onActivate,
  cardRef,
  hiddenForGenie,
}: BannerCardProps) {
  const [leaving, setLeaving] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const isEdit = item.kind === 'budget_edited';
  const isVerified = item.kind === 'budget_verified';
  const isDark = theme === 'dark';
  const hint =
    (item.kind === 'budget_created' || item.kind === 'budget_verified') &&
    item.budgetNumber != null &&
    item.budgetNumber >= 2
      ? `${item.budgetNumber}º orçamento deste veículo`
      : null;
  const author = authorLabel(item);
  const photoUrl = item.authorPhotoUrl?.trim() || null;

  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl]);

  const beginLeave = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => onDismiss(item.id), 280);
  };

  const shell = isDark
    ? 'border-white/12 bg-zinc-900/92 text-white shadow-[0_16px_48px_-12px_rgba(0,0,0,0.65)]'
    : 'border-black/8 bg-white/92 text-zinc-900 shadow-[0_12px_40px_-12px_rgba(0,0,0,0.28),0_0_0_0.5px_rgba(0,0,0,0.04)]';

  const meta = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const title = isDark ? 'text-white' : 'text-zinc-900';
  const body = isDark ? 'text-zinc-300' : 'text-zinc-600';
  const closeBtn = isDark
    ? 'bg-white/[0.08] text-zinc-300 hover:bg-white/15 hover:text-white'
    : 'bg-black/[0.05] text-zinc-500 hover:bg-black/10 hover:text-zinc-800';

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={hiddenForGenie ? -1 : 0}
      onClick={() => {
        if (hiddenForGenie || leaving) return;
        onActivate(item);
      }}
      onKeyDown={(e) => {
        if (hiddenForGenie || leaving) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onActivate(item);
        }
      }}
      className={`group pointer-events-auto relative w-full cursor-pointer overflow-hidden rounded-[18px] border backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${shell} ${
        leaving ? 'translate-x-[110%] opacity-0' : 'translate-x-0 opacity-100'
      } ${hiddenForGenie ? 'pointer-events-none opacity-0' : ''}`}
      style={{ WebkitBackdropFilter: 'blur(28px)' }}
      aria-hidden={hiddenForGenie || undefined}
    >
      <div className="flex items-start gap-3 px-3.5 py-3 pr-10">
        <div className="relative mt-0.5 h-10 w-10 shrink-0">
          <div
            className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-[11px] shadow-sm ring-1 ${
              isDark ? 'ring-white/10' : 'ring-black/5'
            } ${
              isVerified
                ? 'bg-gradient-to-b from-[#30D158] to-[#248A3D]'
                : isEdit
                  ? 'bg-gradient-to-b from-[#5AC8FA] to-[#007AFF]'
                  : 'bg-gradient-to-b from-[#34C759] to-[#248A3D]'
            }`}
          >
            {photoUrl && !photoFailed ? (
              <img
                src={photoUrl}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <span className="text-[12px] font-bold tracking-tight text-white">
                {initialsFromName(author)}
              </span>
            )}
          </div>
          <span
            className={`absolute -bottom-1 -right-1 flex h-[18px] w-[18px] items-center justify-center rounded-full shadow-sm ring-2 ${
              isDark ? 'ring-zinc-900' : 'ring-white'
            } ${
              isVerified
                ? 'bg-[#30D158]'
                : isEdit
                  ? 'bg-[#007AFF]'
                  : 'bg-[#34C759]'
            }`}
            aria-hidden
          >
            {isVerified ? (
              <CheckCircle2 className="h-2.5 w-2.5 text-white" strokeWidth={2.8} />
            ) : isEdit ? (
              <Pencil className="h-2.5 w-2.5 text-white" strokeWidth={2.8} />
            ) : (
              <FileText className="h-2.5 w-2.5 text-white" strokeWidth={2.8} />
            )}
          </span>
        </div>
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-baseline gap-2">
            <p className={`truncate text-[12px] font-semibold tracking-tight ${meta}`}>{author}</p>
            <span className={`shrink-0 text-[11px] tabular-nums ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>
              agora
            </span>
          </div>
          <p className={`mt-0.5 text-[14px] font-semibold leading-snug tracking-tight ${title}`}>
            {titleFor(item)}
          </p>
          <p className={`mt-0.5 text-[13px] leading-snug ${body}`}>{vehicleLine(item)}</p>
          {hint ? (
            <p className={`mt-0.5 text-[12px] leading-snug ${meta}`}>{hint}</p>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        aria-label="Fechar notificação"
        className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full transition ${closeBtn}`}
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
  theme: 'dark' | 'light';
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  onActivate: (item: MacOsBudgetBannerItem) => void;
};

/** Banners estilo macOS (canto superior direito) — tema do app, limpar tudo e minimizar (genie). */
export function MacOsBudgetBannerStack({
  items,
  theme,
  onDismiss,
  onDismissAll,
  onActivate,
}: MacOsBudgetBannerStackProps) {
  const cardElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [minimizing, setMinimizing] = useState(false);
  const [genieHiddenIds, setGenieHiddenIds] = useState<Set<string>>(() => new Set());

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardElsRef.current.set(id, el);
    else cardElsRef.current.delete(id);
  }, []);

  useEffect(() => {
    // Novos itens cancelam estado residual de genie.
    setGenieHiddenIds(new Set());
    setMinimizing(false);
  }, [items.length > 0 ? items[0]?.id : '']);

  if (typeof document === 'undefined') return null;
  const visible = items.slice(0, MAX_VISIBLE);
  if (visible.length === 0) return null;

  const isDark = theme === 'dark';
  const toolbarShell = isDark
    ? 'border-white/12 bg-zinc-900/80 text-zinc-200'
    : 'border-black/8 bg-white/85 text-zinc-700';
  const toolbarBtn = isDark
    ? 'hover:bg-white/10 text-zinc-200'
    : 'hover:bg-black/[0.06] text-zinc-700';

  const handleClearAll = () => {
    if (minimizing) return;
    onDismissAll();
  };

  const handleMinimize = async () => {
    if (minimizing || visible.length === 0) return;
    setMinimizing(true);
    const target = findDesktopOrcamentosNavTarget();
    const sources = visible
      .map((item) => cardElsRef.current.get(item.id))
      .filter((el): el is HTMLDivElement => Boolean(el));

    // Inicia o genie (clones + rects síncronos) antes de ocultar os cards originais.
    const animPromise =
      target && sources.length > 0
        ? playMacGenieMinimize({ sources, target, durationMs: 860, staggerMs: 42 })
        : new Promise<void>((r) => window.setTimeout(r, 180));

    setGenieHiddenIds(new Set(visible.map((v) => v.id)));

    try {
      await animPromise;
    } finally {
      onDismissAll();
      setMinimizing(false);
      setGenieHiddenIds(new Set());
    }
  };

  return createPortal(
    <div
      className={`${isDark ? 'dark' : 'light'} pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100050] flex max-h-[calc(100dvh-1.5rem)] w-[min(380px,calc(100vw-1.5rem))] origin-top-right scale-[0.85] flex-col gap-2 overflow-y-auto overscroll-contain sm:right-5 sm:top-4`}
      aria-live="polite"
      data-budget-banner-theme={theme}
    >
      <div className="pointer-events-auto sticky top-0 z-10 flex justify-end gap-1.5 pb-0.5">
        <button
          type="button"
          disabled={minimizing}
          onClick={() => void handleMinimize()}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-xl transition disabled:opacity-50 ${toolbarShell} ${toolbarBtn}`}
          style={{ WebkitBackdropFilter: 'blur(20px)' }}
        >
          <Minus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
          Minimizar
        </button>
        <button
          type="button"
          disabled={minimizing}
          onClick={handleClearAll}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold backdrop-blur-xl transition disabled:opacity-50 ${toolbarShell} ${toolbarBtn}`}
          style={{ WebkitBackdropFilter: 'blur(20px)' }}
        >
          <Trash2 className="h-3 w-3" strokeWidth={2.25} aria-hidden />
          Limpar Tudo
        </button>
      </div>

      {visible.map((item) => (
        <BannerCard
          key={item.id}
          item={item}
          theme={theme}
          onDismiss={onDismiss}
          onActivate={onActivate}
          cardRef={(el) => setCardRef(item.id, el)}
          hiddenForGenie={genieHiddenIds.has(item.id)}
        />
      ))}
    </div>,
    document.body
  );
}
