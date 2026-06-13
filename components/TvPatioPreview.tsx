import React from 'react';
import type { TvMediaObjectFit, TvSlide } from '../services/apiService';
import { normalizeTvMediaObjectFit } from '../services/apiService';
import type { TvChimeAlert, TvChimeKind, TvChimeScheduleConfig } from '../utils/tvChimeSchedule';
import { TvChimeBannerCard } from './TvChimeBannerCard';
import { TvUploadedVideoPlayer } from './tv/TvUploadedVideoPlayer';

function mediaObjectFitClass(fit: TvMediaObjectFit | undefined): string {
  switch (normalizeTvMediaObjectFit(fit)) {
    case 'contain':
      return 'object-contain';
    case 'fill':
      return 'object-fill';
    default:
      return 'object-cover';
  }
}

/** Vídeo local do PC da TV (ex.: "local:promo.mp4") — só toca na TV física. */
function isLocalVideoRef(url: string): boolean {
  return url.trim().toLowerCase().startsWith('local:');
}

function localVideoName(url: string): string {
  return url.trim().slice('local:'.length).replace(/^[/\\]+/, '').trim();
}

function extractYoutubeId(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  if (m) return m[1];
  try {
    const u = new URL(url);
    const v = u.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;
  } catch {
    /* ignore */
  }
  return null;
}

/** Preview no modal: sem autoplay com som (evita áudio ao abrir); mesma aparência sem controles. */
function buildYoutubePreviewEmbedUrl(videoId: string): string {
  const q = new URLSearchParams({
    autoplay: '0',
    mute: '1',
    controls: '0',
    modestbranding: '1',
    rel: '0',
    playsinline: '1',
    disablekb: '1',
    fs: '0',
    iv_load_policy: '3',
    cc_load_policy: '0',
  });
  return `https://www.youtube.com/embed/${videoId}?${q.toString()}`;
}

function formatMoney(n: number): string {
  try {
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  } catch {
    return String(n);
  }
}

const CHIME_DOW: Record<number, string> = {
  0: 'Dom',
  1: 'Seg',
  2: 'Ter',
  3: 'Qua',
  4: 'Qui',
  5: 'Sex',
  6: 'Sáb',
};

function formatChimeWeekdays(a: TvChimeAlert): string {
  if (!a.weekdays.length) return 'Todos os dias';
  const sorted = [...a.weekdays].sort((x, y) => x - y);
  if (sorted.join(',') === '1,2,3,4,5') return 'Seg a sex';
  return sorted.map((d) => CHIME_DOW[d] ?? d).join(' · ');
}

interface TvPatioPreviewProps {
  weeklyLabel: string;
  weeklyCurrent: number;
  weeklyTarget: number;
  /** Se false, não desenha a faixa da meta semanal (ex.: preview de slide). */
  showWeeklyStrip?: boolean;
  slide: TvSlide | null;
  /** Quando não há slide, mostra placeholder dos veículos */
  showVehiclesPlaceholder?: boolean;
  /** Simula na área da TV a faixa dos avisos por horário (aba Horários no modal). */
  chimeSchedulePreview?: TvChimeScheduleConfig | null;
  /** Sobreposição: aparência da faixa quando dispara (pré-aviso ou no horário). */
  chimeFiringPreview?: {
    phase: 'pre' | 'main';
    kind: TvChimeKind;
    title: string;
    message: string;
  } | null;
  onChimeFiringPreviewDismiss?: () => void;
}

/**
 * Miniatura fiel ao que a TV exibe (fundo preto, barra de meta, área do slide).
 */
export const TvPatioPreview: React.FC<TvPatioPreviewProps> = ({
  weeklyLabel,
  weeklyCurrent,
  weeklyTarget,
  showWeeklyStrip = true,
  slide,
  showVehiclesPlaceholder = true,
  chimeSchedulePreview = null,
  chimeFiringPreview = null,
  onChimeFiringPreviewDismiss,
}) => {
  const pct =
    weeklyTarget > 0 && Number.isFinite(weeklyCurrent / weeklyTarget)
      ? Math.max(0, Math.min(130, (weeklyCurrent / weeklyTarget) * 100))
      : 0;
  const hasGoal = showWeeklyStrip && weeklyTarget > 0;

  /** Imagem/vídeo com URL: sem cabeçalho da marca e área única em tela cheia (como na TV). */
  const isImmersiveMedia =
    !chimeSchedulePreview &&
    slide != null &&
    !!slide.mediaUrl &&
    (slide.slideType === 'image' || slide.slideType === 'video');
  const showBrandBar = !isImmersiveMedia;
  const showGoalStrip = hasGoal && !isImmersiveMedia;

  const renderChimePreview = () => {
    const cfg = chimeSchedulePreview;
    if (!cfg) return null;
    const alerts = [...cfg.alerts].filter((a) => a.enabled).sort((a, b) => a.time.localeCompare(b.time));
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-black">
        <div className="shrink-0 border-b border-white/10 bg-gradient-to-r from-amber-500 to-amber-400 px-2 py-1.5 text-center">
          <p className="text-[7px] font-black uppercase tracking-[0.18em] text-black/80">Horário · TV Pátio</p>
          <p className="text-[9px] font-bold leading-tight text-black">
            {cfg.masterEnabled ? 'Pré-visualização dos avisos' : 'Rotina desligada na configuração'}
          </p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2 py-2">
          {!cfg.masterEnabled ? (
            <p className="px-1 py-4 text-center text-[8px] font-medium leading-relaxed text-white/45">
              Ative &quot;Ativar rotina&quot; na secção de horários para disparar estes avisos na TV física.
            </p>
          ) : alerts.length === 0 ? (
            <p className="py-4 text-center text-[8px] text-white/40">Nenhum aviso ativo — adicione horários na lista.</p>
          ) : (
            <ul className="space-y-1.5">
              {alerts.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-white/[0.08] bg-white/[0.05] px-2 py-1.5 text-left"
                >
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="truncate text-[9px] font-black uppercase text-yellow-400">{a.label}</span>
                    <span className="shrink-0 font-mono text-[9px] font-bold tabular-nums text-white/90">{a.time}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[7px] leading-snug text-zinc-400">{a.message}</p>
                  <p className="mt-1 text-[6px] font-semibold uppercase tracking-wider text-white/35">
                    {formatChimeWeekdays(a)}
                    {a.playSound ? ' · Som' : ''}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        {cfg.masterEnabled && alerts.length > 0 ? (
          <div className="shrink-0 border-t border-white/10 bg-black/50 px-2 py-1.5">
            <p className="text-center text-[6px] font-medium leading-snug text-white/35">
              Na TV, a faixa aparece sobreposta no horário · Tom: {cfg.soundPreset}
            </p>
          </div>
        ) : null}
      </div>
    );
  };

  const renderSlide = () => {
    if (chimeSchedulePreview) {
      return renderChimePreview();
    }
    if (!slide) {
      if (!showVehiclesPlaceholder) {
        return (
          <div className="flex-1 flex items-center justify-center text-white/25 text-[10px] font-bold uppercase tracking-[0.2em] px-4 text-center">
            Nada selecionado
          </div>
        );
      }
      return (
        <div className="flex-1 flex flex-col justify-center gap-1.5 px-3 py-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-7 rounded-lg bg-white/[0.06] border border-white/[0.06] flex items-center px-2 gap-2"
            >
              <div className="h-2 w-16 rounded bg-white/10" />
              <div className="h-2 flex-1 rounded bg-white/5" />
              <div className="h-2 w-10 rounded bg-yellow-500/20" />
            </div>
          ))}
          <p className="text-[9px] text-center text-white/30 mt-1 font-medium">Lista de veículos (exemplo)</p>
        </div>
      );
    }

    const t = slide.slideType;

    if (t === 'image' && slide.mediaUrl) {
      const fit = mediaObjectFitClass(slide.mediaObjectFit);
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-0">
          <img src={slide.mediaUrl} alt="" className={`h-full w-full border-0 ${fit}`} />
        </div>
      );
    }

    if (t === 'video' && slide.mediaUrl) {
      if (isLocalVideoRef(slide.mediaUrl)) {
        return (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 bg-black px-4 text-center">
            <svg viewBox="0 0 24 24" className="h-7 w-7 fill-emerald-400/80">
              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
            </svg>
            <p className="text-[11px] font-black uppercase tracking-wider text-emerald-300/90">Vídeo local</p>
            <p className="max-w-[85%] break-all text-[9px] font-semibold text-white/55">{localVideoName(slide.mediaUrl)}</p>
            <p className="max-w-[85%] text-[8px] leading-snug text-white/35">
              Lido da pasta do PC da TV — não aparece neste preview, mas toca na TV física.
            </p>
          </div>
        );
      }
      const yt = /youtube\.com|youtu\.be/.test(slide.mediaUrl);
      if (yt) {
        const id = extractYoutubeId(slide.mediaUrl);
        const embed = id ? buildYoutubePreviewEmbedUrl(id) : slide.mediaUrl;
        return (
          <div className="relative min-h-[88px] w-full flex-1 overflow-hidden bg-black">
            <iframe title="preview" src={embed} className="absolute inset-0 h-full w-full border-0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" />
          </div>
        );
      }
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-black p-0">
          <TvUploadedVideoPlayer
            src={slide.mediaUrl}
            className="h-full w-full rounded-none"
            objectFit={normalizeTvMediaObjectFit(slide.mediaObjectFit)}
            preview
          />
        </div>
      );
    }

    if (t === 'goal') {
      const cur = slide.goalCurrent ?? 0;
      const tgt = slide.goalTarget ?? 1;
      const p = tgt > 0 ? Math.min(100, Math.max(0, (cur / tgt) * 100)) : 0;
      return (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-3 py-2 text-center">
          <p className="text-[11px] font-black text-white uppercase leading-tight line-clamp-2">
            {slide.goalLabel || slide.title || 'Meta'}
          </p>
          <div className="w-full max-w-[200px] space-y-1">
            {slide.goalShowValues === true ? (
              <div className="flex justify-between gap-1 text-[8px] font-bold text-yellow-400 tabular-nums">
                <span className="truncate">{formatMoney(cur)}</span>
                <span className="truncate text-right">{formatMoney(tgt)}</span>
              </div>
            ) : (
              <p className="text-center text-[14px] font-black tabular-nums text-yellow-400">{Math.round(p)}%</p>
            )}
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-yellow-400 to-orange-500"
                style={{ width: `${p}%` }}
              />
            </div>
          </div>
        </div>
      );
    }

    const alert = t === 'alert';
    return (
      <div className={`flex-1 flex flex-col items-center justify-center gap-2 px-3 py-2 ${alert ? 'animate-pulse' : ''}`}>
        <p className={`text-[12px] font-black uppercase leading-tight text-center line-clamp-3 ${alert ? 'text-red-400' : 'text-yellow-400'}`}>
          {slide.title || (alert ? 'Alerta' : 'Aviso')}
        </p>
        {slide.body ? (
          <p className="text-[9px] text-zinc-300 text-center line-clamp-4 leading-snug">{slide.body}</p>
        ) : null}
      </div>
    );
  };

  return (
    <div className="relative rounded-[1.2rem] overflow-hidden shadow-[0_32px_80px_-16px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.08)] ring-1 ring-white/10">
      <div className="aspect-video bg-black flex flex-col min-h-[200px] max-h-[320px]">
        {showBrandBar && (
          <div className="flex shrink-0 items-end justify-between gap-2 border-b border-white/[0.06] px-3 pb-1.5 pt-2.5">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-[13px] font-black italic leading-none text-yellow-400">REI DO ABS</span>
              <span className="text-[6px] font-bold uppercase tracking-[0.2em] text-white/35">Pátio</span>
            </div>
            <span className="font-mono text-[7px] tabular-nums text-white/40">12:00</span>
          </div>
        )}

        {showGoalStrip && (
          <div className="shrink-0 px-3 py-1.5 space-y-1 bg-black/40 border-b border-white/[0.04]">
            <div className="flex justify-between text-[7px] font-bold uppercase tracking-wider text-zinc-500">
              <span className="truncate">{weeklyLabel}</span>
              <span className="text-yellow-500/90 shrink-0 tabular-nums">{Math.round(pct)}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-yellow-400 to-orange-500 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          {renderSlide()}
          {chimeSchedulePreview && chimeFiringPreview ? (
            <div className="pointer-events-none absolute inset-0 z-[15] flex flex-col bg-black/20">
              <div className="pointer-events-auto h-full min-h-0 w-full flex-1 p-0">
                <TvChimeBannerCard
                  variant="display"
                  displayEmbedded
                  phase={chimeFiringPreview.phase}
                  kind={chimeFiringPreview.kind}
                  title={chimeFiringPreview.title}
                  message={chimeFiringPreview.message}
                  onDismiss={onChimeFiringPreviewDismiss}
                  dismissAriaLabel="Fechar pré-visualização"
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-12 h-1 rounded-full bg-white/15" />
    </div>
  );
};
