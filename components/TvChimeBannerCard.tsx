import React from 'react';
import { Bell, X } from 'lucide-react';
import type { TvChimeKind } from '../utils/tvChimeSchedule';

export type TvChimeBannerPhase = 'pre' | 'main';

export interface TvChimeBannerCardProps {
  phase: TvChimeBannerPhase;
  kind: TvChimeKind;
  title: string;
  message: string;
  /** `modal`: tamanhos do aviso real no gestor. `preview`: miniatura dentro do frame da TV. */
  variant?: 'modal' | 'preview';
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

/**
 * Faixa de aviso por horário (igual ao gestor e ao que se pretende na TV física).
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
  const isPreview = variant === 'preview';

  const eyebrow = phase === 'pre' ? 'Lembrete' : 'TV do pátio · Horário';
  const eyebrowCls = isPreview
    ? 'text-[7px] font-bold uppercase tracking-[0.1em] text-zinc-500'
    : 'text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-500';
  const titleCls = isPreview
    ? 'text-[11px] font-semibold leading-snug tracking-tight'
    : 'text-[17px] font-semibold leading-snug tracking-tight';
  const messageCls = isPreview
    ? 'mt-0.5 text-[9px] leading-snug text-zinc-600'
    : 'mt-1 text-[13px] leading-snug text-zinc-600';
  const iconCls = isPreview ? 'mt-0.5 h-3.5 w-3.5 shrink-0 text-[#007AFF]' : 'mt-0.5 h-5 w-5 shrink-0 text-[#007AFF]';
  const iconStroke = isPreview ? 2 : 2.2;
  const closeCls = isPreview
    ? 'pointer-events-auto shrink-0 rounded-full p-0.5 text-zinc-500 hover:bg-black/5 hover:text-zinc-800'
    : 'pointer-events-auto shrink-0 rounded-full p-1 text-zinc-500 hover:bg-black/5 hover:text-zinc-800';
  const closeIconCls = isPreview ? 'h-3 w-3' : 'h-4 w-4';
  const boxPad = isPreview ? 'px-2.5 py-2' : 'px-4 py-3';
  const shadow = isPreview
    ? 'shadow-[0_12px_28px_-10px_rgba(0,0,0,0.35)]'
    : 'shadow-[0_20px_50px_-12px_rgba(0,0,0,0.25)]';

  return (
    <div
      className={`pointer-events-auto w-full max-w-lg rounded-2xl border backdrop-blur-xl animate-in slide-in-from-top-2 duration-300 ${panelClass(
        phase,
        kind
      )} ${boxPad} ${shadow} ${className}`}
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
