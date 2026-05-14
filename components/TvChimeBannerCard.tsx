import React from 'react';
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
   * `preview` — miniatura no modal, estilo TV (fundo escuro, texto amarelo).
   * `display` — leitura à distância na TV do pátio (como slide tipo «aviso»).
   */
  variant?: 'modal' | 'preview' | 'display';
  onDismiss?: () => void;
  /** Texto do botão fechar para leitores de ecrã. */
  dismissAriaLabel?: string;
  className?: string;
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

/** Painel escuro alto contraste (alinhado ao slide «aviso» na TV). */
function panelDisplayClass(phase: TvChimeBannerPhase, kind: TvChimeKind): string {
  if (phase === 'pre') {
    return 'border-2 border-white/30 bg-zinc-950/96 text-zinc-100 shadow-[0_24px_100px_rgba(0,0,0,0.75)]';
  }
  if (kind === 'lunch') {
    return 'border-2 border-amber-500/55 bg-gradient-to-b from-amber-950/98 via-zinc-950 to-black text-amber-50 shadow-[0_24px_100px_rgba(0,0,0,0.8)]';
  }
  if (kind === 'departure') {
    return 'border-2 border-sky-500/50 bg-gradient-to-b from-sky-950/95 via-zinc-950 to-black text-sky-50 shadow-[0_24px_100px_rgba(0,0,0,0.8)]';
  }
  return 'border-2 border-yellow-500/40 bg-black text-yellow-50 shadow-[0_0_80px_rgba(234,179,8,0.14)]';
}

function titleDisplayTone(phase: TvChimeBannerPhase, kind: TvChimeKind): string {
  if (phase === 'pre') return 'text-zinc-50';
  if (kind === 'lunch') return 'text-amber-200';
  if (kind === 'departure') return 'text-sky-200';
  return 'text-yellow-400';
}

/**
 * Faixa de aviso por horário — no pátio usa `display` para legibilidade à distância.
 */
export function TvChimeBannerCard({
  phase,
  kind,
  title,
  message,
  variant = 'modal',
  onDismiss,
  dismissAriaLabel = 'Fechar aviso',
  className = '',
}: TvChimeBannerCardProps) {
  if (variant === 'display') {
    const eyebrow = phase === 'pre' ? 'Lembrete' : 'TV do pátio · Horário';
    const titleTone = titleDisplayTone(phase, kind);
    const isPre = phase === 'pre';
    return (
      <div
        className={`pointer-events-auto w-full max-w-[min(96rem,calc(100vw-1.5rem))] rounded-3xl border backdrop-blur-md animate-in slide-in-from-top-3 duration-300 ${panelDisplayClass(
          phase,
          kind
        )} px-5 py-8 sm:px-10 sm:py-10 md:px-14 md:py-12 ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="relative flex flex-col items-center text-center">
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="pointer-events-auto absolute -right-1 -top-1 rounded-full bg-white/10 p-3 text-zinc-300 transition-colors hover:bg-white/20 hover:text-white sm:right-0 sm:top-0"
              aria-label={dismissAriaLabel}
            >
              <X className="h-6 w-6 sm:h-7 sm:w-7" />
            </button>
          ) : null}
          <Bell
            className="mb-3 h-12 w-12 shrink-0 text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.35)] sm:mb-4 sm:h-16 sm:w-16 md:h-20 md:w-20"
            strokeWidth={2}
            aria-hidden
          />
          <p className="text-[clamp(0.7rem,2.2vmin,1.1rem)] font-black uppercase tracking-[0.28em] text-yellow-500/90">
            {eyebrow}
          </p>
          <p
            className={`mt-3 max-w-[95vw] font-black leading-[1.05] tracking-tight sm:mt-4 ${
              isPre
                ? 'text-[clamp(1.35rem,5.5vmin,3.75rem)] normal-case'
                : 'text-[clamp(1.85rem,7.5vmin,5.5rem)] uppercase'
            } ${titleTone}`}
          >
            {title}
          </p>
          <p className="mt-4 max-w-[min(56rem,95vw)] text-pretty text-[clamp(1.05rem,3.6vmin,2.85rem)] font-semibold leading-snug text-zinc-200 sm:mt-5">
            {message}
          </p>
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
    ? `text-[13px] font-black uppercase leading-tight tracking-tight sm:text-sm ${titleDisplayTone(phase, kind)}`
    : 'text-[17px] font-semibold leading-snug tracking-tight';
  const messageCls = isPreview
    ? 'mt-1.5 text-[11px] font-medium leading-snug text-zinc-300 sm:text-xs'
    : 'mt-1 text-[13px] leading-snug text-zinc-600';
  const iconCls = isPreview
    ? 'mt-0.5 h-4 w-4 shrink-0 text-yellow-400'
    : 'mt-0.5 h-5 w-5 shrink-0 text-[#007AFF]';
  const iconStroke = isPreview ? 2.2 : 2.2;
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
