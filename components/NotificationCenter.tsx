import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Trash2,
  MessageCircle,
  GitBranch,
  FileText,
  Edit3,
  CheckCircle2,
  Calendar,
  Car,
  AlertCircle,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';
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

const ADMIN_DISPLAY_NAME = 'Rei do ABS';

/** Primeiro nome do cliente a partir do nome completo. */
function getFirstName(fullName: string | null | undefined): string | null {
  const name = typeof fullName === 'string' ? fullName.trim() : '';
  if (!name) return null;
  const first = name.split(/\s+/)[0];
  return first || null;
}

/** Identificação do veículo nas notificações: modelo - primeiro nome do cliente. */
function formatVehicleLabel(p: Notification['payload']): string {
  const model = (p.vehicle_model && p.vehicle_model.trim()) || 'Veículo';
  const firstName = getFirstName(p.customer_name);
  return firstName ? `${model} - ${firstName}` : model;
}

const TYPE_CONFIG: Record<NotificationType, { label: string; icon: React.ReactNode; accent: string }> = {
  comment: { label: 'Comentário', icon: <MessageCircle className="w-5 h-5" />, accent: 'text-[#007AFF]' },
  stage_change: { label: 'Mudança de etapa', icon: <GitBranch className="w-5 h-5" />, accent: 'text-[#007AFF]' },
  budget_created: { label: 'Orçamento criado', icon: <FileText className="w-5 h-5" />, accent: 'text-[#007AFF]' },
  budget_edited: { label: 'Orçamento editado', icon: <Edit3 className="w-5 h-5" />, accent: 'text-[#007AFF]' },
  vehicle_finalized: { label: 'Veículo finalizado', icon: <CheckCircle2 className="w-5 h-5" />, accent: 'text-emerald-500' },
  vehicle_scheduled: { label: 'Veículo agendado', icon: <Calendar className="w-5 h-5" />, accent: 'text-[#007AFF]' },
  vehicle_registered: { label: 'Veículo cadastrado', icon: <Car className="w-5 h-5" />, accent: 'text-[#007AFF]' },
  complaint_edited: { label: 'Queixa editada', icon: <AlertCircle className="w-5 h-5" />, accent: 'text-rose-500' },
  delivery_date_changed: { label: 'Data de entrega alterada', icon: <Calendar className="w-5 h-5" />, accent: 'text-[#007AFF]' },
};

function formatNotificationTitle(n: Notification, forTechnician?: boolean): string {
  const cfg = TYPE_CONFIG[n.type] || { label: n.type };
  const p = n.payload;
  const vehicle = formatVehicleLabel(p);
  const who = p.author_display_name || p.technician_name || (forTechnician ? ADMIN_DISPLAY_NAME : 'Alguém');
  const adminLabel = ADMIN_DISPLAY_NAME;
  switch (n.type) {
    case 'comment':
      return `${who} comentou em ${vehicle}`;
    case 'stage_change':
      return forTechnician ? `${adminLabel} alterou etapa · ${vehicle}` : `${who} alterou etapa · ${vehicle}`;
    case 'budget_created':
      return `${who} criou orçamento · ${vehicle}`;
    case 'budget_edited':
      return `${who} editou orçamento · ${vehicle}`;
    case 'vehicle_finalized':
      return `${who} finalizou · ${vehicle}`;
    case 'vehicle_scheduled':
      return `${vehicle} agendado`;
    case 'vehicle_registered':
      return `Cadastro · ${vehicle}`;
    case 'complaint_edited':
      return forTechnician ? `${adminLabel} editou a queixa · ${vehicle}` : `${who} editou a queixa · ${vehicle}`;
    case 'delivery_date_changed':
      return `Data de entrega alterada · ${vehicle}`;
    default:
      return cfg.label;
  }
}

function formatNotificationSubtitle(n: Notification): string | null {
  if (n.type === 'comment' && n.payload.text) {
    return n.payload.text.length > 80 ? n.payload.text.slice(0, 80) + '…' : n.payload.text;
  }
  return null;
}

/** Mostra a notificação na central do dispositivo (barra do sistema). Usa Service Worker quando disponível (mais confiável em tablet/segundo plano). Retorna true se a permissão está concedida (evita som duplicado). */
function showNativeDeviceNotification(n: Notification, forTechnician?: boolean): boolean {
  if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') return false;
  const title = formatNotificationTitle(n, forTechnician);
  const body = formatNotificationSubtitle(n) || 'Rei do ABS';
  const icon = '/logo.png';

  const show = () => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then((reg) => reg.showNotification(title, { body, icon }))
        .catch(() => {
          try {
            const native = new Notification(title, { body, icon });
            native.onclick = () => { native.close(); window.focus(); };
          } catch {}
        });
    } else {
      try {
        const native = new Notification(title, { body, icon });
        native.onclick = () => { native.close(); window.focus(); };
      } catch {}
    }
  };
  show();
  return true;
}

interface NotificationCenterProps {
  /** Callback quando há novo comentário (para pop-up + som) */
  onNewCommentNotification?: (notification: Notification) => void;
  /** Callback ao clicar numa notificação (ex.: ir ao veículo/comentários no Pátio) */
  onNotificationClick?: (notification: Notification) => void;
  /** Se true, usa API de notificações do técnico (for=technician&slug=...) */
  forTechnician?: boolean;
  /** Slug do técnico quando forTechnician é true */
  technicianSlug?: string;
  /** Tema do sistema para cores (preto, amarelo, branco) */
  theme?: 'light' | 'dark';
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  onNewCommentNotification,
  onNotificationClick,
  forTechnician,
  technicianSlug,
  theme = 'dark',
}) => {
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
  const modalRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef<string | null>(null);
  const lastCreatedAtRef = useRef<string | null>(null);
  const prevUnreadIdsRef = useRef<Set<string>>(new Set());
  const firstFetchDoneRef = useRef(false);
  const canUseDOM = typeof window !== 'undefined' && typeof document !== 'undefined';
  const portalTarget = useMemo(() => (canUseDOM ? document.body : null), [canUseDOM]);

  /** Só busca notificações do técnico quando slug (userId) estiver definido; senão a API retornaria a lista do admin e o pop-up não apareceria para o técnico. */
  const notifParams =
    forTechnician && technicianSlug
      ? { for: "technician" as const, technicianSlug }
      : undefined;

  /** Pausa em segundo plano: ver checks em pollNewOnly / fetchNotifications. */
  const POLL_QUICK_MS = 60000;   // mín. 60s — reduz invocações Vercel / Supabase
  const POLL_FULL_MS = 120000;   // lista completa menos frequente

  const fetchNotifications = async (since?: string, silent = false) => {
    if (forTechnician && !technicianSlug) return;
    /** Poll em segundo plano — não bloqueia o primeiro fetch ao abrir o painel (silent=false). */
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
            if (n.type === 'comment') {
              onNewCommentNotification?.(n);
            } else if (!shownNative) {
              playOtherNotificationSound();
            }
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
          if (n.type === 'comment') {
            onNewCommentNotification?.(n);
          } else if (!shownNative) {
            playOtherNotificationSound();
          }
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
      Notification.requestPermission().then((p) => setNotifPermission(p)).catch(() => {});
    }
  };

  // Pedir permissão ao montar (após um breve delay) para que notificações apareçam no dispositivo sem depender do clique no sino
  useEffect(() => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    const t = setTimeout(requestNotificationPermission, 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open || !canUseDOM) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, canUseDOM]);

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
    if (notifications.length === 0) return;
    setClearing(true);
    try {
      await clearNotifications(notifParams);
      setNotifications([]);
      setUnreadCount(0);
    } catch {
      // ignore
    } finally {
      setClearing(false);
    }
  };

  const config = (type: NotificationType) => TYPE_CONFIG[type] || { label: type, icon: <Bell className="w-5 h-5" />, accent: 'text-brand-yellow' };

  const bellClass = isDark
    ? 'bg-white/10 border-white/15 text-zinc-200 hover:text-white hover:bg-white/15'
    : 'bg-white/70 border-zinc-200/80 text-zinc-700 hover:text-zinc-900 hover:bg-white/90';

  const panelClass = isDark
    ? 'bg-zinc-950/70 border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.65)]'
    : 'bg-white/70 border-zinc-200/70 shadow-[0_30px_90px_rgba(0,0,0,0.22)]';

  const headerBorderClass = isDark ? 'border-white/10' : 'border-zinc-200/70';
  const titleClass = isDark ? 'text-white' : 'text-zinc-900';
  const linkClass = 'text-[#007AFF] hover:underline disabled:opacity-50';
  const dividerClass = isDark ? 'divide-white/8' : 'divide-zinc-200/70';
  const itemUnreadClass = isDark ? 'bg-[#007AFF]/12' : 'bg-[#007AFF]/8';
  const itemHoverClass = isDark ? 'hover:bg-white/[0.06]' : 'hover:bg-black/[0.03]';
  const iconBgClass = isDark ? 'bg-white/10' : 'bg-white/70';
  const textPrimaryClass = isDark ? 'text-white' : 'text-zinc-900';
  const textSecondaryClass = isDark ? 'text-zinc-300' : 'text-zinc-600';
  const textMutedClass = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const chevronClass = isDark ? 'text-zinc-500' : 'text-zinc-400';
  const dotClass = 'bg-[#007AFF]';
  const emptyClass = isDark ? 'text-zinc-300' : 'text-zinc-500';
  const loadingClass = isDark ? 'text-zinc-400' : 'text-zinc-400';

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => {
          requestNotificationPermission();
          setOpen((o) => !o);
        }}
        className={`relative w-11 h-11 rounded-full backdrop-blur-xl border flex items-center justify-center transition-all shadow-[0_8px_24px_rgba(0,0,0,0.10)] active:scale-[0.98] ${bellClass}`}
        aria-label="Central de notificações"
      >
        <Bell className="w-5 h-5" strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[11px] font-bold flex items-center justify-center px-1 shadow-sm">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open &&
        portalTarget &&
        createPortal(
          <div
            className="fixed inset-0 z-[999999] flex items-start justify-center pt-20 bg-black/35 backdrop-blur-[2px]"
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <div
              ref={modalRef}
              className={`w-[min(420px,calc(100vw-24px))] rounded-[28px] backdrop-blur-2xl overflow-hidden flex flex-col max-h-[78vh] border ${panelClass}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-label="Central de notificações"
            >
              <div className={`flex items-center justify-between px-5 py-4 border-b shrink-0 ${headerBorderClass}`}>
                <div className="min-w-0">
                  <h3 className={`text-[17px] font-semibold tracking-tight ${titleClass}`}>Notificações</h3>
                  <p className={`mt-0.5 text-[12px] ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Toque para abrir e marcar como lida.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      disabled={markingAll}
                      className={`h-9 px-3 rounded-full border text-[13px] font-semibold tracking-tight backdrop-blur-xl transition-colors ${isDark ? 'border-white/10 bg-white/5 text-white hover:bg-white/10' : 'border-zinc-200/70 bg-white/60 text-zinc-900 hover:bg-white/80'} ${markingAll ? 'opacity-70' : ''}`}
                    >
                      {markingAll ? (
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Marcando…
                        </span>
                      ) : (
                        'Marcar tudo'
                      )}
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      disabled={clearing}
                      className={`h-9 w-9 rounded-full border backdrop-blur-xl grid place-items-center transition-colors ${isDark ? 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10' : 'border-zinc-200/70 bg-white/60 text-zinc-700 hover:bg-white/80'} ${clearing ? 'opacity-70' : ''}`}
                      title="Limpar todas"
                      aria-label="Limpar todas"
                    >
                      {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
                    className={`h-9 w-9 rounded-full border backdrop-blur-xl grid place-items-center transition-colors ${isDark ? 'border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10' : 'border-zinc-200/70 bg-white/60 text-zinc-700 hover:bg-white/80'}`}
                    aria-label="Fechar"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {typeof Notification !== 'undefined' && (notifPermission ?? Notification.permission) === 'default' && (
                <div className="px-5 pt-4">
                  <div className={`rounded-2xl border p-4 flex items-center justify-between gap-3 ${isDark ? 'border-white/10 bg-white/5 text-zinc-200' : 'border-zinc-200/70 bg-white/60 text-zinc-700'}`}>
                    <div className="min-w-0">
                      <p className={`text-[13px] font-semibold tracking-tight ${textPrimaryClass}`}>Notificações no dispositivo</p>
                      <p className={`mt-0.5 text-[12px] ${textMutedClass}`}>Ative para receber alertas mesmo fora do app.</p>
                    </div>
                    <button
                      type="button"
                      onClick={requestNotificationPermission}
                      className="shrink-0 h-9 px-4 rounded-full bg-[#007AFF] text-white text-[13px] font-semibold tracking-tight shadow-sm active:scale-[0.98]"
                    >
                      Ativar
                    </button>
                  </div>
                </div>
              )}

              {typeof Notification !== 'undefined' && (notifPermission ?? Notification.permission) === 'denied' && (
                <div className="px-5 pt-4">
                  <div className={`rounded-2xl border p-4 text-[12px] ${isDark ? 'border-amber-500/20 bg-amber-500/10 text-amber-200' : 'border-amber-300/50 bg-amber-50 text-amber-900'}`}>
                    Notificações no dispositivo desativadas. Ative nas configurações do site no navegador.
                  </div>
                </div>
              )}

              <div className="overflow-y-auto overscroll-contain flex-1 mt-4">
                {loading && notifications.length === 0 ? (
                  <div className={`flex justify-center py-12 ${loadingClass}`}>
                    <Loader2 className="w-8 h-8 animate-spin" />
                  </div>
                ) : notifications.length === 0 ? (
                  <div className={`py-12 px-5 text-center text-[14px] ${emptyClass}`}>Nenhuma notificação ainda.</div>
                ) : (
                  <ul className={`divide-y ${dividerClass}`}>
                    {notifications.map((n) => {
                      const cfg = config(n.type);
                      const isUnread = !n.read_at;
                      return (
                        <li
                          key={n.id}
                          role="button"
                          tabIndex={0}
                          className={`flex gap-3 px-5 py-4 transition-colors cursor-pointer ${isUnread ? itemUnreadClass : itemHoverClass}`}
                          onClick={() => {
                            if (isUnread) handleMarkRead(n.id);
                            onNotificationClick?.(n);
                            setOpen(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              if (isUnread) handleMarkRead(n.id);
                              onNotificationClick?.(n);
                              setOpen(false);
                            }
                          }}
                        >
                          <div className={`shrink-0 w-10 h-10 rounded-2xl flex items-center justify-center border ${iconBgClass} ${isDark ? 'border-white/10' : 'border-zinc-200/70'} ${cfg.accent}`}>
                            {cfg.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-[14px] font-semibold leading-snug tracking-tight ${textPrimaryClass}`}>
                              {formatNotificationTitle(n, forTechnician)}
                            </p>
                            {formatNotificationSubtitle(n) && (
                              <p className={`text-[13px] mt-0.5 line-clamp-2 ${textSecondaryClass}`}>
                                {formatNotificationSubtitle(n)}
                              </p>
                            )}
                            <p className={`text-[11px] mt-1 ${textMutedClass}`}>
                              {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {isUnread && <span className={`shrink-0 w-2 h-2 rounded-full ${dotClass}`} />}
                            <ChevronRight className={`w-5 h-5 shrink-0 ${chevronClass}`} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          portalTarget
        )}
    </div>
  );
}
