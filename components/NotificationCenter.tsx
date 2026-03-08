import React, { useState, useEffect, useRef } from 'react';
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

const ADMIN_DISPLAY_NAME = 'Rei do ABS';

const TYPE_CONFIG: Record<
  NotificationType,
  { label: string; icon: React.ReactNode; accent: string }
> = {
  comment: { label: 'Comentário', icon: <MessageCircle className="w-5 h-5" />, accent: 'text-brand-yellow' },
  stage_change: { label: 'Mudança de etapa', icon: <GitBranch className="w-5 h-5" />, accent: 'text-brand-yellow' },
  budget_created: { label: 'Orçamento criado', icon: <FileText className="w-5 h-5" />, accent: 'text-brand-yellow' },
  budget_edited: { label: 'Orçamento editado', icon: <Edit3 className="w-5 h-5" />, accent: 'text-brand-yellow' },
  vehicle_finalized: { label: 'Veículo finalizado', icon: <CheckCircle2 className="w-5 h-5" />, accent: 'text-brand-yellow' },
  vehicle_scheduled: { label: 'Veículo agendado', icon: <Calendar className="w-5 h-5" />, accent: 'text-brand-yellow' },
  vehicle_registered: { label: 'Veículo cadastrado', icon: <Car className="w-5 h-5" />, accent: 'text-brand-yellow' },
  complaint_edited: { label: 'Queixa editada', icon: <AlertCircle className="w-5 h-5" />, accent: 'text-brand-yellow' },
  delivery_date_changed: { label: 'Data de entrega alterada', icon: <Calendar className="w-5 h-5" />, accent: 'text-brand-yellow' },
};

function formatNotificationTitle(n: Notification, forTechnician?: boolean): string {
  const cfg = TYPE_CONFIG[n.type] || { label: n.type };
  const p = n.payload;
  const vehicle = p.vehicle_plate || p.vehicle_model || 'Veículo';
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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [clearing, setClearing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const lastFetchRef = useRef<string | null>(null);
  const prevUnreadIdsRef = useRef<Set<string>>(new Set());
  const firstFetchDoneRef = useRef(false);

  const notifParams =
    forTechnician && technicianSlug
      ? { for: "technician" as const, technicianSlug }
      : undefined;

  const fetchNotifications = async (since?: string) => {
    setLoading(true);
    try {
      const list = await getNotifications({ limit: 80, since, ...notifParams });
      setNotifications((prev) => {
        const byId = new Map(prev.map((n) => [n.id, n]));
        list.forEach((n) => byId.set(n.id, n));
        return Array.from(byId.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
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
            if (n.type === 'comment') {
              onNewCommentNotification?.(n);
            } else {
              playOtherNotificationSound();
            }
          }
        });
        prevUnreadIdsRef.current = new Set([...prevUnreadIdsRef.current, ...unreadIds]);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const t = setInterval(() => fetchNotifications(), 25000);
    return () => clearInterval(t);
  }, [forTechnician, technicianSlug]);

  useEffect(() => {
    if (!open) return;
    fetchNotifications();
  }, [open]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  const btnClass = isDark
    ? 'bg-zinc-800/80 border-white/10 text-zinc-300 hover:text-white hover:bg-zinc-700/80'
    : 'bg-white/90 border-zinc-200 text-zinc-700 hover:text-black hover:bg-white';
  const panelClass = isDark
    ? 'bg-[#0A0A0A] border-white/10 shadow-2xl'
    : 'bg-white border-zinc-200 shadow-2xl';
  const headerBorderClass = isDark ? 'border-white/10' : 'border-zinc-200';
  const titleClass = isDark ? 'text-white' : 'text-zinc-900';
  const linkClass = isDark
    ? 'text-brand-yellow hover:underline disabled:opacity-50'
    : 'text-amber-600 font-semibold hover:underline disabled:opacity-50';
  const dividerClass = isDark ? 'divide-white/10' : 'divide-zinc-200';
  const itemUnreadClass = isDark ? 'bg-brand-yellow/10' : 'bg-amber-500/10';
  const itemHoverClass = isDark ? 'hover:bg-white/[0.06]' : 'hover:bg-zinc-100';
  const iconBgClass = isDark ? 'bg-white/10' : 'bg-zinc-100';
  const textPrimaryClass = isDark ? 'text-white' : 'text-zinc-900';
  const textSecondaryClass = isDark ? 'text-zinc-400' : 'text-zinc-600';
  const textMutedClass = isDark ? 'text-zinc-500' : 'text-zinc-500';
  const chevronClass = isDark ? 'text-zinc-500' : 'text-zinc-400';
  const dotClass = 'bg-brand-yellow';
  const emptyClass = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const loadingClass = isDark ? 'text-zinc-500' : 'text-zinc-400';

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`relative w-11 h-11 rounded-full backdrop-blur-xl border flex items-center justify-center transition-all shadow-sm ${btnClass}`}
        aria-label="Central de notificações"
      >
        <Bell className="w-5 h-5" strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-brand-yellow text-black text-[11px] font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className={`absolute right-0 top-full mt-2 w-[min(380px,calc(100vw-24px))] rounded-2xl backdrop-blur-2xl overflow-hidden z-[100] flex flex-col max-h-[75vh] ${panelClass}`}>
          <div className={`flex items-center justify-between p-4 border-b shrink-0 ${headerBorderClass}`}>
            <h3 className={`text-lg font-semibold ${titleClass}`}>Notificações</h3>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  disabled={markingAll}
                  className={`text-[13px] font-medium flex items-center gap-1 ${linkClass}`}
                >
                  {markingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Marcar como lidas
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  disabled={clearing}
                  className={`text-[13px] font-medium flex items-center gap-1.5 ${isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-zinc-900'}`}
                  title="Limpar todas as notificações"
                >
                  {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Limpar
                </button>
              )}
            </div>
          </div>
          <div className="overflow-y-auto overscroll-contain flex-1">
            {loading && notifications.length === 0 ? (
              <div className={`flex justify-center py-12 ${loadingClass}`}>
                <Loader2 className="w-8 h-8 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className={`py-12 px-4 text-center text-[14px] ${emptyClass}`}>
                Nenhuma notificação ainda.
              </div>
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
                      className={`flex gap-3 px-4 py-3.5 transition-colors cursor-pointer ${isUnread ? itemUnreadClass : itemHoverClass}`}
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
                      <div className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${iconBgClass} ${cfg.accent}`}>
                        {cfg.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[14px] font-medium leading-snug ${textPrimaryClass}`}>
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
                      {isUnread && (
                        <span className={`shrink-0 w-2 h-2 rounded-full ${dotClass} mt-2`} />
                      )}
                      <ChevronRight className={`w-5 h-5 shrink-0 mt-1 ${chevronClass}`} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
