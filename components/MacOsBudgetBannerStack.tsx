import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Trash2 } from 'lucide-react';
import { findDesktopNotificationsBellTarget, playMacGenieMinimize } from '../utils/macGenieMinimize';
import {
  MacOsNotificationCard,
  type MacOsNotificationCardModel,
} from './MacOsNotificationCard';

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

export function budgetBannerToCardModel(item: MacOsBudgetBannerItem): MacOsNotificationCardModel {
  const hint =
    (item.kind === 'budget_created' || item.kind === 'budget_verified') &&
    item.budgetNumber != null &&
    item.budgetNumber >= 2
      ? `${item.budgetNumber}º orçamento deste veículo`
      : null;
  return {
    id: item.id,
    authorName: authorLabel(item),
    authorPhotoUrl: item.authorPhotoUrl,
    title: titleFor(item),
    body: vehicleLine(item),
    hint,
    timeLabel: 'agora',
    accent:
      item.kind === 'budget_verified' ? 'emerald' : item.kind === 'budget_edited' ? 'blue' : 'green',
    icon: item.kind === 'budget_verified' ? 'check' : item.kind === 'budget_edited' ? 'pencil' : 'file',
    unread: true,
  };
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

  const beginLeave = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => onDismiss(item.id), 280);
  };

  return (
    <MacOsNotificationCard
      model={budgetBannerToCardModel(item)}
      theme={theme}
      cardRef={cardRef}
      hidden={hiddenForGenie}
      leaving={leaving}
      onActivate={() => {
        if (hiddenForGenie || leaving) return;
        onActivate(item);
      }}
      onDismiss={beginLeave}
    />
  );
}

export type MacOsBudgetBannerStackProps = {
  items: MacOsBudgetBannerItem[];
  theme: 'dark' | 'light';
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  /** Após animação genie: move para a central de notificações. */
  onMinimize: (items: MacOsBudgetBannerItem[]) => void;
  onActivate: (item: MacOsBudgetBannerItem) => void;
};

/** Banners estilo macOS (canto superior direito) — tema do app, limpar tudo e minimizar (genie → sino). */
export function MacOsBudgetBannerStack({
  items,
  theme,
  onDismiss,
  onDismissAll,
  onMinimize,
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
    const snapshot = [...visible];
    const target = findDesktopNotificationsBellTarget();
    const sources = snapshot
      .map((item) => cardElsRef.current.get(item.id))
      .filter((el): el is HTMLDivElement => Boolean(el));

    const animPromise =
      target && sources.length > 0
        ? playMacGenieMinimize({ sources, target, durationMs: 860, staggerMs: 42 })
        : new Promise<void>((r) => window.setTimeout(r, 180));

    setGenieHiddenIds(new Set(snapshot.map((v) => v.id)));

    try {
      await animPromise;
    } finally {
      onMinimize(snapshot);
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
