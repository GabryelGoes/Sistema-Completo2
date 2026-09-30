import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bell, Loader2, Trash2, X } from 'lucide-react';
import {
  getNotifications,
  getUnreadNotificationsCount,
  markNotificationRead,
  markAllNotificationsRead,
  clearNotifications,
  type Notification,
  type NotificationType,
} from '../services/apiService';
import { playOtherNotificationSound } from '../utils/notificationSound';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRegisterModalOpen } from './ui/ModalLayerContext';
import { useBrowserBackLayer } from './ui/BackNavigationContext';
import {
  MacOsNotificationCard,
  type MacOsNotifAccent,
  type MacOsNotifIconKind,
  type MacOsNotificationCardModel,
} from './MacOsNotificationCard';
import {
  budgetBannerToCardModel,
  type MacOsBudgetBannerItem,
} from './MacOsBudgetBannerStack';
import { findDesktopNotificationsBellTarget } from '../utils/macGenieMinimize';
import {
  GenieNotificationDismiss,
  genieOriginFromElement,
  genieOriginFromSelector,
  type GenieOrigin,
} from '../utils/GenieNotificationDismiss';

/** Primeiro nome do cliente a partir do nome completo. */
function getFirstName(fullName: string | null | undefined): string | null {
  const name = typeof fullName === 'string' ? fullName.trim() : '';
  if (!name) return null;
  const first = name.split(/\s+/)[0];
  return first || null;
}

function formatVehicleLabel(p: Notification['payload']): string {
  const isModule = p.order_type === 'module' || p.new_status === 'SEM_CONSERTO';
  const model =
    (p.vehicle_model && p.vehicle_model.trim()) ||
    (typeof p.module_identification === 'string' && p.module_identification.trim()) ||
    (isModule ? 'Módulo' : 'Veículo');
  const firstName = getFirstName(p.customer_name);
  return firstName ? `${model} - ${firstName}` : model;
}

function vehicleBody(p: Notification['payload']): string {
  const vehicle = formatVehicleLabel(p);
  const plate =
    typeof p.vehicle_plate === 'string' && p.vehicle_plate.trim()
      ? p.vehicle_plate.trim().toUpperCase()
      : '';
  return plate ? `${vehicle} · ${plate}` : vehicle;
}

function authorFromPayload(p: Notification['payload'], forTechnician?: boolean): string {
  const who =
    (typeof p.author_display_name === 'string' && p.author_display_name.trim()) ||
    (typeof p.technician_name === 'string' && p.technician_name.trim()) ||
    '';
  if (who) return who;
  return forTechnician ? 'Administrador' : 'Alguém';
}

function photoFromPayload(p: Notification['payload']): string | null {
  return typeof p.author_photo_url === 'string' && p.author_photo_url.trim()
    ? p.author_photo_url.trim()
    : null;
}

function budgetNumberFromPayload(p: Notification['payload']): number | null {
  if (typeof p.budget_number === 'number' && p.budget_number >= 1) return Math.floor(p.budget_number);
  if (typeof p.budget_number === 'string' && Number(p.budget_number) >= 1) {
    return Math.floor(Number(p.budget_number));
  }
  return null;
}

type TypeVisual = {
  title: (n: Notification, forTechnician?: boolean) => string;
  accent: MacOsNotifAccent;
  icon: MacOsNotifIconKind;
};

const TYPE_VISUAL: Record<NotificationType, TypeVisual> = {
  comment: {
    title: () => 'Novo comentário',
    accent: 'sky',
    icon: 'comment',
  },
  stage_change: {
    title: () => 'Mudança de etapa',
    accent: 'blue',
    icon: 'branch',
  },
  lab_sem_conserto: {
    title: () => 'Sem conserto',
    accent: 'amber',
    icon: 'alert',
  },
  budget_created: {
    title: (n) => {
      const num = budgetNumberFromPayload(n.payload);
      return num != null && num >= 2 ? `${num}º orçamento criado` : 'Orçamento criado';
    },
    accent: 'green',
    icon: 'file',
  },
  budget_edited: {
    title: (n) => {
      const num = budgetNumberFromPayload(n.payload);
      return num != null && num >= 2 ? `${num}º orçamento editado` : 'Orçamento editado';
    },
    accent: 'blue',
    icon: 'pencil',
  },
  vehicle_finalized: {
    title: () => 'Veículo finalizado',
    accent: 'emerald',
    icon: 'check',
  },
  vehicle_scheduled: {
    title: () => 'Veículo agendado',
    accent: 'violet',
    icon: 'calendar',
  },
  vehicle_registered: {
    title: () => 'Veículo cadastrado',
    accent: 'green',
    icon: 'car',
  },
  complaint_edited: {
    title: () => 'Queixa editada',
    accent: 'rose',
    icon: 'alert',
  },
  delivery_date_changed: {
    title: () => 'Data de entrega alterada',
    accent: 'amber',
    icon: 'calendar',
  },
};

function notificationToCardModel(
  n: Notification,
  forTechnician?: boolean
): MacOsNotificationCardModel {
  const visual = TYPE_VISUAL[n.type] || {
    title: () => n.type,
    accent: 'blue' as MacOsNotifAccent,
    icon: 'file' as MacOsNotifIconKind,
  };
  const hint =
    n.type === 'comment' && n.payload.text
      ? n.payload.text.length > 100
        ? `${n.payload.text.slice(0, 100)}…`
        : n.payload.text
      : n.type === 'budget_created' || n.type === 'budget_edited'
        ? (() => {
            const num = budgetNumberFromPayload(n.payload);
            return num != null && num >= 2 ? `${num}º orçamento deste veículo` : null;
          })()
        : n.type === 'lab_sem_conserto'
          ? 'Laboratório'
          : null;

  let timeLabel = 'agora';
  try {
    timeLabel = formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR });
  } catch {
    /* ignore */
  }

  return {
    id: n.id,
    authorName: authorFromPayload(n.payload, forTechnician),
    authorPhotoUrl: photoFromPayload(n.payload),
    title: visual.title(n, forTechnician),
    body: vehicleBody(n.payload),
    hint,
    timeLabel,
    accent: visual.accent,
    icon: visual.icon,
    unread: !n.read_at,
  };
}

/** Título curto para notificação nativa do dispositivo. */
function formatNativeTitle(n: Notification, forTechnician?: boolean): string {
  const author = authorFromPayload(n.payload, forTechnician);
  const visual = TYPE_VISUAL[n.type];
  const action = visual ? visual.title(n, forTechnician) : n.type;
  return `${author} · ${action}`;
}

function formatNativeBody(n: Notification): string {
  if (n.type === 'comment' && n.payload.text) {
    return n.payload.text.length > 80 ? `${n.payload.text.slice(0, 80)}…` : n.payload.text;
  }
  return vehicleBody(n.payload);
}

function showNativeDeviceNotification(n: Notification, forTechnician?: boolean): boolean {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }
  const title = formatNativeTitle(n, forTechnician);
  const body = formatNativeBody(n);
  const icon = '/logo.png';

  const show = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, { body, icon }))
        .catch(() => {
          try {
            const native = new Notification(title, { body, icon });
            native.onclick = () => {
              native.close();
              window.focus();
            };
          } catch {
            /* ignore */
          }
        });
    } else {
      try {
        const native = new Notification(title, { body, icon });
        native.onclick = () => {
          native.close();
          window.focus();
        };
      } catch {
        /* ignore */
      }
    }
  };
  show();
  return true;
}

export type NotificationCenterPlacement = 'floating' | 'desktopTopbar';

export interface NotificationCenterProps {
  onNewCommentNotification?: (notification: Notification) => void;
  onBudgetBannerNotification?: (notification: Notification) => void;
  onNotificationClick?: (notification: Notification) => void;
  forTechnician?: boolean;
  technicianSlug?: string;
  theme?: 'light' | 'dark';
  placement?: NotificationCenterPlacement;
  /** Banners de orçamento minimizados (disponíveis em qualquer página no sino). */
  minimizedBudgetBanners?: MacOsBudgetBannerItem[];
  onMinimizedBudgetActivate?: (item: MacOsBudgetBannerItem) => void;
  onMinimizedBudgetDismiss?: (id: string) => void;
  onMinimizedBudgetClearAll?: () => void;
  /**
   * Destino do efeito Genie ao fechar um item (padrão: sino do cabeçalho).
   */
  genieOrigin?: GenieOrigin;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  onNewCommentNotification,
  onBudgetBannerNotification,
  onNotificationClick,
  forTechnician,
  technicianSlug,
  theme = 'dark',
  placement = 'floating',
  minimizedBudgetBanners = [],
  onMinimizedBudgetActivate,
  onMinimizedBudgetDismiss,
  onMinimizedBudgetClearAll,
  genieOrigin: genieOriginProp,
}) => {
  const isDesktopTopbar = placement === 'desktopTopbar';
  const isDark = theme === 'dark';
  const [open, setOpen] = useState(false);
  useRegisterModalOpen(open);
  useBrowserBackLayer(open, () => setOpen(false));
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | null>(() =>
    typeof Notification !== 'undefined' ? Notification.permission : null
  );
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const cardElsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const busyIdsRef = useRef<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const lastFetchRef = useRef<string | null>(null);
  const lastCreatedAtRef = useRef<string | null>(null);
  const prevUnreadIdsRef = useRef<Set<string>>(new Set());
  const firstFetchDoneRef = useRef(false);
  const onNewCommentRef = useRef(onNewCommentNotification);
  const onBudgetBannerRef = useRef(onBudgetBannerNotification);
  onNewCommentRef.current = onNewCommentNotification;
  onBudgetBannerRef.current = onBudgetBannerNotification;
  const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined';
  const portalTarget = useMemo(() => (canUseDOM ? document.body : null), [canUseDOM]);

  const notifParams =
    forTechnician && technicianSlug
      ? { for: 'technician' as const, technicianSlug }
      : undefined;

  const POLL_QUICK_MS = 12000;
  const POLL_FULL_MS = 90000;

  const minimizedCount = minimizedBudgetBanners.length;
  const badgeCount = unreadCount + minimizedCount;

  const emitNewNotification = (n: Notification, shownNative: boolean) => {
    if (n.type === 'comment') {
      onNewCommentRef.current?.(n);
    } else if (
      n.type === 'budget_created' ||
      n.type === 'budget_edited' ||
      n.type === 'lab_sem_conserto'
    ) {
      onBudgetBannerRef.current?.(n);
      if (!shownNative) playOtherNotificationSound();
    } else if (!shownNative) {
      playOtherNotificationSound();
    }
  };

  const fetchNotifications = async (since?: string, silent = false) => {
    if (forTechnician && !technicianSlug) return;
    if (silent && typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (!silent) setLoading(true);
    try {
      const list = await getNotifications({ limit: 80, since, ...notifParams });
      let sorted: Notification[] = [];
      setNotifications((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        list.forEach((n) => byId.set(n.id, n));
        sorted = Array.from(byId.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        return sorted;
      });
      if (sorted.length > 0) lastCreatedAtRef.current = sorted[0].created_at;
      else if (!lastCreatedAtRef.current) lastCreatedAtRef.current = new Date().toISOString();
      const count = await getUnreadNotificationsCount(notifParams);
      setUnreadCount(count);
      lastFetchRef.current = new Date().toISOString();
      const unreadIds = new Set(list.filter((n) => !n.read_at).map((n) => n.id));
      if (!firstFetchDoneRef.current) {
        firstFetchDoneRef.current = true;
        prevUnreadIdsRef.current = new Set(unreadIds);
      } else {
        list.forEach((n) => {
          if (!n.read_at && !prevUnreadIdsRef.current.has(n.id)) {
            const shownNative = showNativeDeviceNotification(n, !!forTechnician);
            emitNewNotification(n, shownNative);
          }
        });
        prevUnreadIdsRef.current = new Set([...prevUnreadIdsRef.current, ...unreadIds]);
      }
    } catch {
      // ignore
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const pollNewOnly = async () => {
    if (forTechnician && !technicianSlug) return;
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    const since = lastCreatedAtRef.current;
    if (!since) return;
    try {
      const list = await getNotifications({ limit: 30, since, ...notifParams });
      if (list.length === 0) return;
      let sorted: Notification[] = [];
      setNotifications((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        list.forEach((n) => byId.set(n.id, n));
        sorted = Array.from(byId.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        return sorted;
      });
      if (sorted.length > 0) lastCreatedAtRef.current = sorted[0].created_at;
      const count = await getUnreadNotificationsCount(notifParams);
      setUnreadCount(count);
      list.forEach((n) => {
        if (!n.read_at && !prevUnreadIdsRef.current.has(n.id)) {
          const shownNative = showNativeDeviceNotification(n, !!forTechnician);
          emitNewNotification(n, shownNative);
        }
      });
      list.forEach((n) => {
        if (!n.read_at) prevUnreadIdsRef.current.add(n.id);
      });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchNotifications();
    const quick = setInterval(pollNewOnly, POLL_QUICK_MS);
    const full = setInterval(() => fetchNotifications(undefined, true), POLL_FULL_MS);
    return () => {
      clearInterval(quick);
      clearInterval(full);
    };
  }, [forTechnician, technicianSlug]);

  useEffect(() => {
    if (!open) return;
    fetchNotifications();
    if (typeof Notification !== 'undefined') setNotifPermission(Notification.permission);
  }, [open]);

  const requestNotificationPermission = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission()
        .then((p) => setNotifPermission(p))
        .catch(() => {});
    }
  };

  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    const t = setTimeout(requestNotificationPermission, 1500);
    return () => clearTimeout(t);
  }, []);

  const updateDropdownPosition = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn || typeof window === 'undefined') return;
    const rect = btn.getBoundingClientRect();
    const panelWidth = 400;
    const maxHeight = Math.min(window.innerHeight * 0.78, 620);
    let left = rect.right - panelWidth;
    left = Math.max(12, Math.min(left, window.innerWidth - panelWidth - 12));
    setDropdownStyle({
      position: 'fixed',
      top: rect.bottom + 8,
      left,
      width: panelWidth,
      maxHeight,
      zIndex: 99999,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open || !isDesktopTopbar) return;
    updateDropdownPosition();
  }, [open, isDesktopTopbar, updateDropdownPosition, minimizedCount, notifications.length]);

  useEffect(() => {
    if (!open || !isDesktopTopbar) return;
    const onResize = () => updateDropdownPosition();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, isDesktopTopbar, updateDropdownPosition]);

  useEffect(() => {
    if (!open || !canUseDOM) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    if (!isDesktopTopbar) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', onKeyDown);
        document.body.style.overflow = prevOverflow;
      };
    }
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, canUseDOM, isDesktopTopbar]);

  const handleMarkRead = async (id: string) => {
    try {
      await markNotificationRead(id, notifParams);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // ignore
    }
  };

  const setCardRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardElsRef.current.set(id, el);
    else cardElsRef.current.delete(id);
  }, []);

  const runGenieToBell = useCallback(async (sources: HTMLElement[]) => {
    const bell = findDesktopNotificationsBellTarget() ?? triggerRef.current;
    const origin =
      genieOriginProp ??
      genieOriginFromElement(bell) ??
      genieOriginFromSelector('[data-desktop-notif-bell]');
    if (sources.length === 0) {
      await new Promise<void>((r) => window.setTimeout(r, 100));
      return;
    }
    await GenieNotificationDismiss({
      source: sources[0],
      genieOrigin: origin,
      durationMs: 500,
      stripCount: 40,
      leaveSourceHidden: true,
    });
  }, [genieOriginProp]);

  const dismissWithGenie = useCallback(
    async (id: string, after: () => void) => {
      if (busyIdsRef.current.has(id)) return;
      busyIdsRef.current.add(id);
      setBusyIds(new Set(busyIdsRef.current));
      const el = cardElsRef.current.get(id) ?? null;
      try {
        if (el) await runGenieToBell([el]);
      } finally {
        after();
        busyIdsRef.current.delete(id);
        setBusyIds(new Set(busyIdsRef.current));
      }
    },
    [runGenieToBell]
  );

  const handleMarkAllRead = async () => {
    setMarkingAll(true);
    try {
      await markAllNotificationsRead(notifParams);
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: n.read_at || new Date().toISOString() }))
      );
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setMarkingAll(false);
    }
  };

  const handleClearAll = async () => {
    if (notifications.length === 0 && minimizedCount === 0) return;
    setClearing(true);
    try {
      if (notifications.length > 0) {
        await clearNotifications(notifParams);
        setNotifications([]);
        setUnreadCount(0);
      }
      onMinimizedBudgetClearAll?.();
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  };

  const panelShell = isDark
    ? 'border-white/12 bg-zinc-950/88 text-white shadow-[0_28px_80px_-16px_rgba(0,0,0,0.7)]'
    : 'border-black/8 bg-white/90 text-zinc-900 shadow-[0_28px_80px_-16px_rgba(0,0,0,0.28)]';

  const panelShellClass = isDesktopTopbar
    ? `rounded-[22px] border backdrop-blur-2xl overflow-hidden flex flex-col ${panelShell}`
    : `w-[min(420px,calc(100vw-24px))] rounded-[22px] border backdrop-blur-2xl overflow-hidden flex flex-col max-h-[78vh] ${panelShell}`;

  const headerBorder = isDark ? 'border-white/10' : 'border-black/8';
  const titleClass = isDark ? 'text-white' : 'text-zinc-900';
  const mutedClass = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const chipBtn = isDark
    ? 'border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10'
    : 'border-zinc-200/80 bg-white/70 text-zinc-800 hover:bg-white';
  const sectionLabel = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const emptyClass = isDark ? 'text-zinc-400' : 'text-zinc-500';

  const panelContent = (
    <>
      <div className={`flex items-center justify-between gap-3 border-b px-4 py-3.5 shrink-0 ${headerBorder}`}>
        <div className="min-w-0">
          <h3 className={`text-[16px] font-semibold tracking-tight ${titleClass}`}>Notificações</h3>
          <p className={`mt-0.5 text-[12px] ${mutedClass}`}>
            {minimizedCount > 0
              ? `${minimizedCount} minimizada${minimizedCount === 1 ? '' : 's'} · mesmo visual dos banners`
              : 'Mesmo visual dos banners do sistema'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAll}
              className={`h-8 px-2.5 rounded-full border text-[12px] font-semibold tracking-tight backdrop-blur-xl transition-colors ${chipBtn} ${
                markingAll ? 'opacity-70' : ''
              }`}
            >
              {markingAll ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  …
                </span>
              ) : (
                'Marcar tudo'
              )}
            </button>
          ) : null}
          {notifications.length > 0 || minimizedCount > 0 ? (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={clearing}
              className={`h-8 w-8 rounded-full border backdrop-blur-xl grid place-items-center transition-colors ${chipBtn} ${
                clearing ? 'opacity-70' : ''
              }`}
              title="Limpar todas"
              aria-label="Limpar todas"
            >
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={`h-8 w-8 rounded-full border backdrop-blur-xl grid place-items-center transition-colors ${chipBtn}`}
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {typeof Notification !== 'undefined' && (notifPermission ?? Notification.permission) === 'default' ? (
        <div className="px-4 pt-3">
          <div
            className={`rounded-[16px] border p-3 flex items-center justify-between gap-3 ${
              isDark ? 'border-white/10 bg-white/5 text-zinc-200' : 'border-zinc-200/80 bg-white/70 text-zinc-700'
            }`}
          >
            <div className="min-w-0">
              <p className={`text-[13px] font-semibold tracking-tight ${titleClass}`}>
                Notificações no dispositivo
              </p>
              <p className={`mt-0.5 text-[12px] ${mutedClass}`}>Ative para alertas fora do app.</p>
            </div>
            <button
              type="button"
              onClick={requestNotificationPermission}
              className="shrink-0 h-8 px-3 rounded-full bg-[#007AFF] text-white text-[12px] font-semibold tracking-tight shadow-sm active:scale-[0.98]"
            >
              Ativar
            </button>
          </div>
        </div>
      ) : null}

      {typeof Notification !== 'undefined' && (notifPermission ?? Notification.permission) === 'denied' ? (
        <div className="px-4 pt-3">
          <div
            className={`rounded-[16px] border p-3 text-[12px] ${
              isDark
                ? 'border-amber-500/20 bg-amber-500/10 text-amber-200'
                : 'border-amber-300/50 bg-amber-50 text-amber-900'
            }`}
          >
            Notificações no dispositivo desativadas. Ative nas configurações do site no navegador.
          </div>
        </div>
      ) : null}

      <div className="overflow-y-auto overscroll-contain flex-1 px-3 py-3 space-y-2.5">
        {minimizedCount > 0 ? (
          <div className="space-y-2">
            <p className={`px-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${sectionLabel}`}>
              Minimizadas
            </p>
            {minimizedBudgetBanners.map((item) => (
              <MacOsNotificationCard
                key={`min-${item.id}`}
                model={budgetBannerToCardModel(item)}
                theme={theme}
                compact
                busy={busyIds.has(`min-${item.id}`)}
                cardRef={(el) => setCardRef(`min-${item.id}`, el)}
                onActivate={() => {
                  onMinimizedBudgetActivate?.(item);
                  setOpen(false);
                }}
                onDismiss={() => {
                  void dismissWithGenie(`min-${item.id}`, () => onMinimizedBudgetDismiss?.(item.id));
                }}
              />
            ))}
          </div>
        ) : null}

        {loading && notifications.length === 0 && minimizedCount === 0 ? (
          <div className={`flex justify-center py-12 ${mutedClass}`}>
            <Loader2 className="w-7 h-7 animate-spin" />
          </div>
        ) : notifications.length === 0 && minimizedCount === 0 ? (
          <div className={`py-12 px-3 text-center text-[14px] ${emptyClass}`}>
            Nenhuma notificação ainda.
          </div>
        ) : notifications.length > 0 ? (
          <div className="space-y-2">
            {minimizedCount > 0 ? (
              <p className={`px-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${sectionLabel}`}>
                Todas
              </p>
            ) : null}
            {notifications.map((n) => {
              const model = notificationToCardModel(n, forTechnician);
              const isUnread = !n.read_at;
              return (
                <MacOsNotificationCard
                  key={n.id}
                  model={model}
                  theme={theme}
                  compact
                  busy={busyIds.has(n.id)}
                  cardRef={(el) => setCardRef(n.id, el)}
                  onActivate={() => {
                    if (isUnread) void handleMarkRead(n.id);
                    onNotificationClick?.(n);
                    setOpen(false);
                  }}
                  onDismiss={() => {
                    void dismissWithGenie(n.id, () => {
                      if (isUnread) void handleMarkRead(n.id);
                      setNotifications((prev) => prev.filter((x) => x.id !== n.id));
                    });
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </div>
    </>
  );

  const toggleOpen = () => {
    requestNotificationPermission();
    setOpen((o) => !o);
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        data-desktop-notif-bell={isDesktopTopbar ? 'true' : undefined}
        onClick={toggleOpen}
        className={
          isDesktopTopbar
            ? 'desktop-shell-topbar-btn relative'
            : `relative w-11 h-11 rounded-full backdrop-blur-xl border flex items-center justify-center transition-all shadow-[0_8px_24px_rgba(0,0,0,0.10)] active:scale-[0.98] ${
                isDark
                  ? 'bg-white/10 border-white/15 text-zinc-200 hover:text-white hover:bg-white/15'
                  : 'bg-white/70 border-zinc-200/80 text-zinc-700 hover:text-zinc-900 hover:bg-white/90'
              }`
        }
        aria-label="Central de notificações"
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Notificações"
      >
        <Bell className={isDesktopTopbar ? 'h-4 w-4' : 'w-5 h-5'} strokeWidth={2} />
        {badgeCount > 0 ? (
          <span
            data-desktop-notif-badge={isDesktopTopbar ? 'true' : undefined}
            className={
              isDesktopTopbar
                ? 'absolute -right-0.5 -top-0.5 flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-rose-500 px-0.5 text-[9px] font-bold text-white shadow-sm'
                : 'absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-bold text-white shadow-sm'
            }
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        ) : isDesktopTopbar ? (
          <span
            data-desktop-notif-badge="true"
            className="pointer-events-none absolute -right-0.5 -top-0.5 h-[15px] w-[15px] opacity-0"
            aria-hidden
          />
        ) : null}
      </button>

      {open && portalTarget && isDesktopTopbar
        ? createPortal(
            <>
              <div
                className="fixed inset-0 z-[99998]"
                role="presentation"
                aria-hidden
                onClick={() => setOpen(false)}
              />
              <div
                ref={modalRef}
                style={{ ...dropdownStyle, WebkitBackdropFilter: 'blur(28px)' }}
                className={panelShellClass}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Central de notificações"
              >
                {panelContent}
              </div>
            </>,
            portalTarget
          )
        : null}

      {open && portalTarget && !isDesktopTopbar
        ? createPortal(
            <div
              className="fixed inset-0 z-[999999] flex items-start justify-center bg-black/35 pt-20 backdrop-blur-[2px]"
              role="presentation"
              onClick={() => setOpen(false)}
            >
              <div
                ref={modalRef}
                className={panelShellClass}
                style={{ WebkitBackdropFilter: 'blur(28px)' }}
                onClick={(e) => e.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label="Central de notificações"
              >
                {panelContent}
              </div>
            </div>,
            portalTarget
          )
        : null}
    </div>
  );
};
