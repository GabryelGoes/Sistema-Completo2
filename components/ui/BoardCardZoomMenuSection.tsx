import React from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import {
  boardCardZoomValueFromStep,
  formatBoardCardZoomPercent,
  type BoardCardZoomScope,
  BOARD_CARD_ZOOM_STEPS,
} from '../../utils/boardCardZoomPrefs';

/**
 * Controles de zoom (− / % / +) para o menu ⋯ — salva ao clicar.
 */
export function BoardCardZoomMenuSection({
  scope: _scope,
  modeLabel,
  stepIndex,
  onStepChange,
}: {
  scope: BoardCardZoomScope;
  modeLabel: string;
  stepIndex: number;
  onStepChange: (nextIndex: number) => void;
}) {
  const zoom = boardCardZoomValueFromStep(stepIndex);
  const atMin = stepIndex <= 0;
  const atMax = stepIndex >= BOARD_CARD_ZOOM_STEPS.length - 1;

  return (
    <div className="border-b border-zinc-100 px-3 pb-2 dark:border-white/[0.07]">
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
        Tamanho dos cartões
      </p>
      <p className="mb-2 text-[11px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">
        Modo <span className="font-semibold text-zinc-700 dark:text-zinc-200">{modeLabel}</span> — preferência
        salva neste dispositivo
      </p>
      <div className="flex items-center gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/90 p-1.5 dark:border-white/[0.1] dark:bg-white/[0.05]">
        <button
          type="button"
          role="menuitem"
          disabled={atMin}
          aria-label="Diminuir cartões"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!atMin) onStepChange(stepIndex - 1);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-35 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <ZoomOut className="h-5 w-5" strokeWidth={2.2} aria-hidden />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[15px] font-bold tabular-nums text-zinc-900 dark:text-white">
            {formatBoardCardZoomPercent(zoom)}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            Zoom
          </p>
        </div>
        <button
          type="button"
          role="menuitem"
          disabled={atMax}
          aria-label="Aumentar cartões"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!atMax) onStepChange(stepIndex + 1);
          }}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-35 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <ZoomIn className="h-5 w-5" strokeWidth={2.2} aria-hidden />
        </button>
      </div>
    </div>
  );
}
