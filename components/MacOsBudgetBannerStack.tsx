import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Minus, Trash2 } from 'lucide-react';
import type { Notification } from '../services/apiService';
import { findDesktopNotificationsBellTarget } from '../utils/macGenieMinimize';
import {
  GenieNotificationDismiss,
  GenieNotificationDismissMany,
  genieOriginFromElement,
  genieOriginFromSelector,
  type GenieOrigin,
} from '../utils/GenieNotificationDismiss';
import {
  MacOsNotificationCard,
  type MacOsNotificationCardModel,
} from './MacOsNotificationCard';

/** Soft-cap visual; novos banners sempre entram (mais recente no topo). */
const MAX_VISIBLE = 48;

export type MacOsBudgetBannerBoardScope = 'patio' | 'lab';

export type MacOsBudgetBannerItem = {
  id: string;
  kind:
    | 'budget_created'
    | 'budget_edited'
    | 'budget_verified'
    | 'budget_items_approved'
    | 'comment'
    | 'lab_sem_conserto';
  serviceOrderId: string;
  /** Obrigatório para orçamentos; ausente em comentários / Sem conserto. */
  budgetId?: string;
  vehicleModel?: string | null;
  vehiclePlate?: string | null;
  customerName?: string | null;
  authorName?: string | null;
  authorPhotoUrl?: string | null;
  budgetNumber?: number | null;
  /** Contagem de itens aprovados (banner de aprovação). */
  approvedItemsCount?: number | null;
  /** Prévia do texto do comentário. */
  commentText?: string | null;
  /** Snapshot para abrir o CommentPopUp ao ativar o banner. */
  commentNotification?: Notification | null;
  /** Nº da OS (banner Sem conserto). */
  osNumber?: number | null;
  /**
   * Origem da OS: Pátio (vehicle) ou Laboratório (module).
   * Se omitido, infere por `kind` / payload.
   */
  boardScope?: MacOsBudgetBannerBoardScope | null;
};

/** Resolve Pátio vs Laboratório a partir do item / order_type. */
export function resolveBannerBoardScope(
  item: Pick<MacOsBudgetBannerItem, 'kind' | 'boardScope'> & {
    orderType?: string | null;
  }
): MacOsBudgetBannerBoardScope {
  if (item.boardScope === 'lab' || item.boardScope === 'patio') return item.boardScope;
  if (item.kind === 'lab_sem_conserto') return 'lab';
  const ot = typeof item.orderType === 'string' ? item.orderType.trim().toLowerCase() : '';
  if (ot === 'module') return 'lab';
  return 'patio';
}

function plateLabel(plate: string | null | undefined): string | null {
  const p = typeof plate === 'string' ? plate.trim().toUpperCase() : '';
  return p || null;
}

function vehicleLine(item: MacOsBudgetBannerItem): string {
  const model =
    (item.vehicleModel && item.vehicleModel.trim()) ||
    (item.kind === 'lab_sem_conserto' ? 'Módulo' : 'Veículo');
  const plate = plateLabel(item.vehiclePlate);
  const customer = (item.customerName && item.customerName.trim()) || '';
  if (item.kind === 'comment' || item.kind === 'lab_sem_conserto') {
    const os =
      item.kind === 'lab_sem_conserto' && item.osNumber != null ? `OS #${item.osNumber}` : null;
    const parts = [model, customer || null, plate, os].filter(Boolean);
    return parts.join(' · ') || model;
  }
  return plate ? `${model} · ${plate}` : model;
}

function titleFor(item: MacOsBudgetBannerItem): string {
  if (item.kind === 'comment') return 'Novo comentário';
  if (item.kind === 'lab_sem_conserto') return 'Sem conserto';
  if (item.kind === 'budget_items_approved') {
    const count = item.approvedItemsCount;
    if (typeof count === 'number' && count >= 1) {
      return count === 1 ? '1 item aprovado' : `${count} itens aprovados`;
    }
    return 'Itens aprovados';
  }
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

function commentPreview(text: string | null | undefined): string | null {
  const t = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  if (!t) return null;
  return t.length > 120 ? `${t.slice(0, 117)}…` : t;
}

export function budgetBannerToCardModel(item: MacOsBudgetBannerItem): MacOsNotificationCardModel {
  const boardScope = resolveBannerBoardScope(item);
  if (item.kind === 'comment') {
    return {
      id: item.id,
      authorName: authorLabel(item),
      authorPhotoUrl: item.authorPhotoUrl,
      title: titleFor(item),
      body: commentPreview(item.commentText) || vehicleLine(item),
      hint: commentPreview(item.commentText) ? vehicleLine(item) : null,
      timeLabel: 'agora',
      accent: 'violet',
      icon: 'comment',
      unread: true,
      boardScope,
    };
  }
  if (item.kind === 'lab_sem_conserto') {
    return {
      id: item.id,
      authorName: authorLabel(item),
      authorPhotoUrl: item.authorPhotoUrl,
      title: titleFor(item),
      body: vehicleLine(item),
      hint: null,
      timeLabel: 'agora',
      accent: 'amber',
      icon: 'alert',
      unread: true,
      boardScope: 'lab',
    };
  }
  const scopeHint = boardScope === 'lab' ? 'desta OS' : 'deste veículo';
  const hint =
    (item.kind === 'budget_created' ||
      item.kind === 'budget_verified' ||
      item.kind === 'budget_items_approved') &&
    item.budgetNumber != null &&
    item.budgetNumber >= 2
      ? `${item.budgetNumber}º orçamento ${scopeHint}`
      : null;
  const accent: MacOsNotificationCardModel['accent'] =
    item.kind === 'budget_verified'
      ? 'emerald'
      : item.kind === 'budget_items_approved'
        ? 'amber'
        : item.kind === 'budget_edited'
          ? 'blue'
          : 'green';
  const icon: MacOsNotificationCardModel['icon'] =
    item.kind === 'budget_verified' || item.kind === 'budget_items_approved'
      ? 'check'
      : item.kind === 'budget_edited'
        ? 'pencil'
        : 'file';
  return {
    id: item.id,
    authorName: authorLabel(item),
    authorPhotoUrl: item.authorPhotoUrl,
    title: titleFor(item),
    body: vehicleLine(item),
    hint,
    timeLabel: 'agora',
    accent,
    icon,
    unread: true,
    boardScope,
  };
}

type BannerCardProps = {
  item: MacOsBudgetBannerItem;
  theme: 'dark' | 'light';
  onDismiss: (id: string) => void;
  onActivate: (item: MacOsBudgetBannerItem) => void;
  cardRef?: (el: HTMLDivElement | null) => void;
  hiddenForGenie?: boolean;
  busy?: boolean;
  onDismissRequest: (item: MacOsBudgetBannerItem, el: HTMLDivElement | null) => void;
};

function BannerCard({
  item,
  theme,
  onActivate,
  cardRef,
  hiddenForGenie,
  busy,
  onDismissRequest,
}: BannerCardProps) {
  const localRef = useRef<HTMLDivElement | null>(null);

  const setRefs = (el: HTMLDivElement | null) => {
    localRef.current = el;
    cardRef?.(el);
  };

  return (
    <div className="pointer-events-auto w-full">
      <MacOsNotificationCard
        model={budgetBannerToCardModel(item)}
        theme={theme}
        cardRef={setRefs}
        hidden={hiddenForGenie}
        busy={busy}
        onActivate={() => {
          if (hiddenForGenie || busy) return;
          onActivate(item);
        }}
        onDismiss={() => onDismissRequest(item, localRef.current)}
      />
    </div>
  );
}

export type MacOsBudgetBannerStackProps = {
  items: MacOsBudgetBannerItem[];
  /** Ignorado: banners do canto usam sempre o visual escuro. */
  theme?: 'dark' | 'light';
  onDismiss: (id: string) => void;
  onDismissAll: () => void;
  /** Após animação genie: move para a central de notificações. */
  onMinimize: (items: MacOsBudgetBannerItem[]) => void;
  onActivate: (item: MacOsBudgetBannerItem) => void;
  /**
   * Destino do efeito Genie (ícone do sino, ponto, seletor…).
   * Se omitido, usa o sino do cabeçalho PC.
   */
  genieOrigin?: GenieOrigin;
};

/** Banners estilo macOS (canto superior direito) — sempre visual escuro; limpar tudo e minimizar (genie → sino). */
export function MacOsBudgetBannerStack({
  items,
  theme: _theme,
  onDismiss,
  onDismissAll,
  onMinimize,
  onActivate,
  genieOrigin: genieOriginProp,
}: MacOsBudgetBannerStackProps) {
  const cardElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const [minimizing, setMinimizing] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [genieHiddenIds, setGenieHiddenIds] = useState<Set<string>>(() => new Set());
  /** Banners do canto: sempre o visual do modo escuro (fundo escuro), em qualquer tema do app. */
  const bannerTheme = 'dark' as const;

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

  /** Ícones só — cores chapadas (sem transparência / blur). ~20% menores que h-8. */
  const toolbarBtnBase =
    'pointer-events-auto inline-flex h-[1.6rem] w-[1.6rem] shrink-0 items-center justify-center rounded-full border border-zinc-700 bg-zinc-900 text-white transition-[background-color,border-color,color,transform] duration-150 disabled:opacity-50 active:scale-[0.96]';
  const toolbarMinimizeBtn = `${toolbarBtnBase} hover:border-amber-500 hover:bg-amber-500 hover:text-zinc-950`;
  const toolbarClearBtn = `${toolbarBtnBase} hover:border-red-600 hover:bg-red-600 hover:text-white`;

  const handleClearAll = () => {
    if (minimizing || busyIds.size > 0) return;
    onDismissAll();
  };

  const resolveBellOrigin = (): GenieOrigin => {
    if (genieOriginProp) return genieOriginProp;
    const bell = findDesktopNotificationsBellTarget();
    return genieOriginFromElement(bell) ?? genieOriginFromSelector('[data-desktop-notif-bell]');
  };

  const runGenieToBell = async (sources: HTMLElement[]) => {
    if (sources.length === 0) {
      await new Promise<void>((r) => window.setTimeout(r, 120));
      return;
    }
    await GenieNotificationDismissMany({
      sources,
      genieOrigin: resolveBellOrigin(),
      durationMs: 420,
      staggerMs: 32,
      stripCount: 16,
      leaveSourcesHidden: true,
    });
  };

  const handleDismissOne = async (item: MacOsBudgetBannerItem, el: HTMLDivElement | null) => {
    if (minimizing || busyIds.has(item.id)) return;
    setBusyIds((prev) => new Set(prev).add(item.id));
    const source = el ?? cardElsRef.current.get(item.id) ?? null;
    try {
      if (source) {
        await GenieNotificationDismiss({
          source,
          genieOrigin: resolveBellOrigin(),
          durationMs: 400,
          stripCount: 16,
          leaveSourceHidden: true,
        });
      }
    } finally {
      onDismiss(item.id);
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  const handleMinimize = async () => {
    if (minimizing || visible.length === 0 || busyIds.size > 0) return;
    setMinimizing(true);
    const snapshot = [...visible];
    const sources = snapshot
      .map((item) => cardElsRef.current.get(item.id))
      .filter((el): el is HTMLDivElement => Boolean(el));

    const animPromise = runGenieToBell(sources);
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
      className="dark pointer-events-none fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[100050] flex max-h-[calc(100dvh-1.5rem)] w-[min(380px,calc(100vw-1.5rem))] origin-top-right scale-[0.85] flex-col items-start gap-2 overflow-y-auto overscroll-contain sm:right-5 sm:top-4"
      aria-live="polite"
      data-budget-banner-theme={bannerTheme}
    >
      {/* Toolbar à esquerda da pilha (não à direita / não cobre o X). */}
      <div className="pointer-events-none sticky top-0 z-10 mr-auto flex w-fit max-w-full shrink-0 flex-wrap items-center justify-start gap-1 self-start pb-0.5">
        <button
          type="button"
          disabled={minimizing || busyIds.size > 0}
          onClick={() => void handleMinimize()}
          className={toolbarMinimizeBtn}
          title="Minimizar"
          aria-label="Minimizar"
        >
          <Minus className="h-[11px] w-[11px]" strokeWidth={2.75} aria-hidden />
        </button>
        <button
          type="button"
          disabled={minimizing || busyIds.size > 0}
          onClick={handleClearAll}
          className={toolbarClearBtn}
          title="Limpar tudo"
          aria-label="Limpar tudo"
        >
          <Trash2 className="h-[11px] w-[11px]" strokeWidth={2.35} aria-hidden />
        </button>
      </div>

      {visible.map((item) => (
        <BannerCard
          key={item.id}
          item={item}
          theme={bannerTheme}
          onDismiss={onDismiss}
          onActivate={onActivate}
          cardRef={(el) => setCardRef(item.id, el)}
          hiddenForGenie={genieHiddenIds.has(item.id)}
          busy={busyIds.has(item.id)}
          onDismissRequest={(it, el) => void handleDismissOne(it, el)}
        />
      ))}
    </div>,
    document.body
  );
}
