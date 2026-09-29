import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Car,
  CheckCircle2,
  FileText,
  GitBranch,
  MessageCircle,
  Pencil,
  X,
} from 'lucide-react';

export type MacOsNotifAccent = 'green' | 'blue' | 'emerald' | 'rose' | 'amber' | 'violet' | 'sky';

export type MacOsNotifIconKind =
  | 'file'
  | 'pencil'
  | 'check'
  | 'comment'
  | 'car'
  | 'calendar'
  | 'alert'
  | 'branch';

export type MacOsNotificationCardModel = {
  id: string;
  authorName: string;
  authorPhotoUrl?: string | null;
  title: string;
  body?: string | null;
  hint?: string | null;
  timeLabel?: string | null;
  accent: MacOsNotifAccent;
  icon: MacOsNotifIconKind;
  unread?: boolean;
};

const ACCENT_AVATAR: Record<MacOsNotifAccent, string> = {
  green: 'bg-gradient-to-b from-[#34C759] to-[#248A3D]',
  emerald: 'bg-gradient-to-b from-[#30D158] to-[#248A3D]',
  blue: 'bg-gradient-to-b from-[#5AC8FA] to-[#007AFF]',
  sky: 'bg-gradient-to-b from-[#64D2FF] to-[#0A84FF]',
  rose: 'bg-gradient-to-b from-[#FF6961] to-[#D70015]',
  amber: 'bg-gradient-to-b from-[#FFD60A] to-[#FF9F0A]',
  violet: 'bg-gradient-to-b from-[#BF5AF2] to-[#8944AB]',
};

const ACCENT_BADGE: Record<MacOsNotifAccent, string> = {
  green: 'bg-[#34C759]',
  emerald: 'bg-[#30D158]',
  blue: 'bg-[#007AFF]',
  sky: 'bg-[#0A84FF]',
  rose: 'bg-[#FF453A]',
  amber: 'bg-[#FF9F0A]',
  violet: 'bg-[#BF5AF2]',
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function AccentIcon({ kind }: { kind: MacOsNotifIconKind }) {
  const cls = 'h-2.5 w-2.5 text-white';
  switch (kind) {
    case 'pencil':
      return <Pencil className={cls} strokeWidth={2.8} />;
    case 'check':
      return <CheckCircle2 className={cls} strokeWidth={2.8} />;
    case 'comment':
      return <MessageCircle className={cls} strokeWidth={2.8} />;
    case 'car':
      return <Car className={cls} strokeWidth={2.8} />;
    case 'calendar':
      return <Calendar className={cls} strokeWidth={2.8} />;
    case 'alert':
      return <AlertCircle className={cls} strokeWidth={2.8} />;
    case 'branch':
      return <GitBranch className={cls} strokeWidth={2.8} />;
    case 'file':
    default:
      return <FileText className={cls} strokeWidth={2.8} />;
  }
}

export type MacOsNotificationCardProps = {
  model: MacOsNotificationCardModel;
  theme: 'dark' | 'light';
  onActivate?: () => void;
  onDismiss?: () => void;
  /** Ref do wrapper completo (para animação genie). */
  cardRef?: (el: HTMLDivElement | null) => void;
  hidden?: boolean;
  leaving?: boolean;
  compact?: boolean;
  /** Enquanto true, ignora cliques (ex.: genie em andamento). */
  busy?: boolean;
};

/** Card estilo banner macOS — X fica fora da área clicável do card. */
export function MacOsNotificationCard({
  model,
  theme,
  onActivate,
  onDismiss,
  cardRef,
  hidden,
  leaving,
  compact,
  busy,
}: MacOsNotificationCardProps) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const isDark = theme === 'dark';
  const author = model.authorName.trim() || 'Usuário';
  const photoUrl = model.authorPhotoUrl?.trim() || null;

  useEffect(() => {
    setPhotoFailed(false);
  }, [photoUrl]);

  // Sombra em camadas (degradê suave), sem spread negativo — evita borda “cortada”.
  const shell = isDark
    ? 'border-white/[0.08] bg-zinc-900/92 text-white shadow-[0_0_0_0.5px_rgba(255,255,255,0.06),0_1px_2px_rgba(0,0,0,0.18),0_4px_10px_rgba(0,0,0,0.16),0_12px_28px_rgba(0,0,0,0.22),0_28px_56px_rgba(0,0,0,0.18)]'
    : 'border-black/[0.04] bg-white/92 text-zinc-900 shadow-[0_0_0_0.5px_rgba(0,0,0,0.04),0_1px_2px_rgba(0,0,0,0.03),0_4px_12px_rgba(0,0,0,0.05),0_12px_28px_rgba(0,0,0,0.07),0_28px_56px_rgba(0,0,0,0.06)]';
  const meta = isDark ? 'text-zinc-400' : 'text-zinc-500';
  const titleCls = isDark ? 'text-white' : 'text-zinc-900';
  const bodyCls = isDark ? 'text-zinc-300' : 'text-zinc-600';
  const closeBtn = isDark
    ? 'bg-white/[0.12] text-zinc-200 hover:bg-white/20 hover:text-white'
    : 'bg-black/[0.06] text-zinc-600 hover:bg-black/10 hover:text-zinc-900';
  const unreadRing = model.unread
    ? isDark
      ? 'ring-2 ring-[#0A84FF]/55'
      : 'ring-2 ring-[#007AFF]/35'
    : '';

  return (
    <div
      ref={cardRef}
      className={`relative w-full transition-all duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        leaving ? 'translate-x-[110%] opacity-0' : 'translate-x-0 opacity-100'
      } ${hidden || busy ? 'pointer-events-none' : ''} ${hidden ? 'opacity-0' : ''}`}
      aria-hidden={hidden || undefined}
      data-macos-notif-card={model.id}
    >
      <div
        role={onActivate ? 'button' : undefined}
        tabIndex={hidden || busy || !onActivate ? -1 : 0}
        onClick={() => {
          if (hidden || leaving || busy) return;
          onActivate?.();
        }}
        onKeyDown={(e) => {
          if (hidden || leaving || busy || !onActivate) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onActivate();
          }
        }}
        className={`group overflow-hidden rounded-[18px] border backdrop-blur-2xl ${shell} ${unreadRing} ${
          onActivate ? 'cursor-pointer' : ''
        }`}
        style={{ WebkitBackdropFilter: 'blur(28px)' }}
      >
        <div
          className={`flex items-start gap-3 ${compact ? 'px-3 py-2.5' : 'px-3.5 py-3'} ${
            onDismiss ? 'pr-10' : ''
          }`}
        >
          <div className="relative mt-0.5 h-10 w-10 shrink-0">
            <div
              className={`flex h-10 w-10 items-center justify-center overflow-hidden rounded-[11px] shadow-sm ring-1 ${
                isDark ? 'ring-white/10' : 'ring-black/5'
              } ${ACCENT_AVATAR[model.accent]}`}
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
              } ${ACCENT_BADGE[model.accent]}`}
              aria-hidden
            >
              <AccentIcon kind={model.icon} />
            </span>
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="flex items-baseline gap-2">
              <p className={`truncate text-[12px] font-semibold tracking-tight ${meta}`}>{author}</p>
              {model.timeLabel ? (
                <span
                  className={`shrink-0 text-[11px] tabular-nums ${
                    isDark ? 'text-zinc-500' : 'text-zinc-400'
                  }`}
                >
                  {model.timeLabel}
                </span>
              ) : null}
            </div>
            <p className={`mt-0.5 text-[14px] font-semibold leading-snug tracking-tight ${titleCls}`}>
              {model.title}
            </p>
            {model.body ? (
              <p className={`mt-0.5 text-[13px] leading-snug ${bodyCls}`}>{model.body}</p>
            ) : null}
            {model.hint ? (
              <p className={`mt-0.5 line-clamp-2 text-[12px] leading-snug ${meta}`}>{model.hint}</p>
            ) : null}
          </div>
        </div>
      </div>

      {onDismiss ? (
        <button
          type="button"
          aria-label="Fechar notificação"
          className={`absolute right-1.5 top-1.5 z-30 flex h-8 w-8 items-center justify-center rounded-full shadow-sm ring-1 transition ${closeBtn} ${
            isDark ? 'ring-white/10' : 'ring-black/5'
          }`}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (hidden || leaving || busy) return;
            onDismiss();
          }}
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      ) : null}
    </div>
  );
}
