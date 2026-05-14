import React, { useEffect, useState } from 'react';
import { Bell, X } from 'lucide-react';
import type { TvChimeKind } from '../utils/tvChimeSchedule';

export type TvChimeBannerPhase = 'pre' | 'main';

export interface TvChimeBannerCardProps {
  phase: TvChimeBannerPhase;
  kind: TvChimeKind;
  title: string;
  message: string;
  /**
   * `modal` — cartão claro compacto (gestor em secretária).
   * `preview` — miniatura no modal (cartão compacto escuro).
   * `display` — mesmo layout do slide «aviso» na TV: cabeçalho da marca + fundo preto + letras grandes.
   */
  variant?: 'modal' | 'preview' | 'display';
  /**
   * Com `variant="display"`: preenche o contentor pai (ex.: preview da TV), com tipografia mais contida.
   */
  displayEmbedded?: boolean;
  onDismiss?: () => void;
  dismissAriaLabel?: string;
  className?: string;
}

function formatTvClock(d: Date): string {
  try {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
}

function panelClass(phase: TvChimeBannerPhase, kind: TvChimeKind): string {
  if (phase === 'pre') {
    return 'border-slate-300/90 bg-white/95 text-slate-900';
  }
  if (kind === 'lunch') {
    return 'border-amber-400/80 bg-gradient-to-r from-amber-50 to-white text-amber-950';
  }
  if (kind === 'departure') {
    return 'border-[#007AFF]/50 bg-gradient-to-r from-blue-50 to-white text-zinc-900';
  }
  return 'border-violet-300/80 bg-gradient-to-r from-violet-50 to-white text-violet-950';
}

function panelDisplayClass(phase: TvChimeBannerPhase, kind: TvChimeKind): string {
  if (phase === 'pre') {
    return 'border border-white/20 bg-zinc-950';
  }
  if (kind === 'lunch') {
    return 'border border-amber-500/40 bg-gradient-to-b from-amber-950/90 to-black';
  }
  if (kind === 'departure') {
    return 'border border-sky-500/40 bg-gradient-to-b from-sky-950/90 to-black';
  }
  return 'border border-white/[0.08] bg-black';
}

function titleNoticeTone(phase: TvChimeBannerPhase, kind: TvChimeKind): string {
  if (phase === 'pre') return 'text-zinc-100';
  if (kind === 'lunch') return 'text-amber-300';
  if (kind === 'departure') return 'text-sky-300';
  return 'text-yellow-400';
}

/** Cabeçalho igual ao preview do slide na TV (`TvPatioPreview`). */
function TvPatioBrandHeaderBar({ clockLabel }: { clockLabel: string }) {
  return (
    <div className="flex shrink-0 items-end justify-between gap-2 border-b border-white/[0.06] bg-black px-3 pb-1.5 pt-2.5 sm:px-4 sm:pb-2 sm:pt-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-black italic leading-none text-yellow-400 sm:text-[15px] md:text-base">
          REI DO ABS
        </span>
        <span className="text-[6px] font-bold uppercase tracking-[0.2em] text-white/35 sm:text-[7px]">
          Pátio
        </span>
      </div>
      <span className="font-mono text-[7px] tabular-nums text-white/40 sm:text-[8px] md:text-[10px]">{clockLabel}</span>
    </div>
  );
}

/**
 * Aviso por horário — `display` replica o slide «aviso» (cabeçalho + área preta + texto grande).
 */
export function TvChimeBannerCard({
  phase,
  kind,
  title,
  message,
  variant = 'modal',
  displayEmbedded = false,
  onDismiss,
  dismissAriaLabel = 'Fechar aviso',
  className = '',
}: TvChimeBannerCardProps) {
  const [clock, setClock] = useState(() => formatTvClock(new Date()));
  useEffect(() => {
    const id = window.setInterval(() => setClock(formatTvClock(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (variant === 'display') {
    const embedded = displayEmbedded;
    const eyebrow = phase === 'pre' ? 'Lembrete' : 'Horário programado';
    const titleTone = titleNoticeTone(phase, kind);
    const isPre = phase === 'pre';

    const titleCls = embedded
      ? `max-w-full text-pretty text-center font-black uppercase leading-tight tracking-tight ${isPre ? 'text-sm normal-case sm:text-base' : 'text-base sm:text-lg md:text-xl'} ${titleTone}`
      : `max-w-[min(92vw,72rem)] text-pretty text-center font-black uppercase leading-[1.05] tracking-tight ${isPre ? 'text-[clamp(1.25rem,5.5vmin,3.5rem)] normal-case' : 'text-[clamp(1.75rem,7vmin,5.25rem)]'} ${titleTone}`;

    const eyebrowCls = embedded
      ? 'text-[8px] font-black uppercase tracking-[0.22em] text-yellow-500/75 sm:text-[9px]'
      : 'text-[clamp(0.65rem,1.8vmin,0.95rem)] font-black uppercase tracking-[0.26em] text-yellow-500/80';

    const messageCls = embedded
      ? 'mt-2 max-w-full text-pretty text-center text-[10px] font-medium leading-snug text-zinc-300 sm:mt-3 sm:text-[11px] md:text-xs'
      : 'mt-4 max-w-[min(56rem,92vw)] text-pretty text-center text-[clamp(1rem,3.4vmin,2.5rem)] font-medium leading-snug text-zinc-300 sm:mt-5';

    const outerFrame = embedded
      ? `flex h-full min-h-0 w-full flex-col overflow-hidden bg-black ${className}`
      : `flex max-h-[min(88dvh,920px)] w-full max-w-[min(96rem,calc(100vw-1.5rem))] min-h-[min(52dvh,420px)] flex-col overflow-hidden rounded-[1.2rem] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.65),0_0_0_1px_rgba(255,255,255,0.08)] ring-1 ring-white/10 animate-in zoom-in-95 duration-300 ${className}`;

    return (
      <div
        className={`pointer-events-auto relative ${outerFrame} ${panelDisplayClass(phase, kind)}`}
        role="status"
        aria-live="polite"
      >
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="absolute right-2 top-2 z-20 rounded-full bg-white/10 p-2.5 text-zinc-200 transition-colors hover:bg-white/20 hover:text-white sm:right-3 sm:top-3 sm:p-3"
            aria-label={dismissAriaLabel}
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        ) : null}
        <TvPatioBrandHeaderBar clockLabel={clock} />
        <div
          className={`flex min-h-0 flex-1 flex-col items-center justify-center bg-black px-4 py-6 text-center sm:px-8 sm:py-10 ${embedded ? 'py-4' : 'md:px-12 md:py-14'}`}
        >
          <p className={eyebrowCls}>{eyebrow}</p>
          <p className={`mt-2 sm:mt-3 ${titleCls}`}>{title}</p>
          <p className={messageCls}>{message}</p>
        </div>
      </div>
    );
  }

  const isPreview = variant === 'preview';

  const eyebrow = phase === 'pre' ? 'Lembrete' : 'TV do pátio · Horário';
  const eyebrowCls = isPreview
    ? 'text-[9px] font-black uppercase tracking-[0.2em] text-yellow-500/85'
    : 'text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500';
  const titleCls = isPreview
    ? `text-[13px] font-black uppercase leading-tight tracking-tight sm:text-sm ${titleNoticeTone(phase, kind)}`
    : 'text-[17px] font-semibold leading-snug tracking-tight';
  const messageCls = isPreview
    ? 'mt-1.5 text-[11px] font-medium leading-snug text-zinc-300 sm:text-xs'
    : 'mt-1 text-[13px] leading-snug text-zinc-600';
  const iconCls = isPreview
    ? 'mt-0.5 h-4 w-4 shrink-0 text-yellow-400'
    : 'mt-0.5 h-5 w-5 shrink-0 text-[#007AFF]';
  const iconStroke = 2.2;
  const closeCls = isPreview
    ? 'pointer-events-auto shrink-0 rounded-full bg-white/10 p-1 text-zinc-300 hover:bg-white/20 hover:text-white'
    : 'pointer-events-auto shrink-0 rounded-full p-1 text-zinc-500 hover:bg-black/5 hover:text-zinc-800';
  const closeIconCls = isPreview ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const boxPad = isPreview ? 'px-3 py-2.5' : 'px-4 py-3';
  const shadow = isPreview
    ? 'shadow-[0_16px_40px_-8px_rgba(0,0,0,0.65)]'
    : 'shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)]';

  const previewPanel = isPreview ? panelDisplayClass(phase, kind) : panelClass(phase, kind);

  return (
    <div
      className={`pointer-events-auto w-full max-w-lg rounded-2xl border backdrop-blur-xl animate-in slide-in-from-top-2 duration-300 ${previewPanel} ${boxPad} ${shadow} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start gap-1.5 sm:gap-2">
        <Bell className={iconCls} strokeWidth={iconStroke} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className={eyebrowCls}>{eyebrow}</p>
          <p className={titleCls}>{title}</p>
          <p className={messageCls}>{message}</p>
        </div>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className={closeCls}
            aria-label={dismissAriaLabel}
          >
            <X className={closeIconCls} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
