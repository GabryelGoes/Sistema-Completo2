import React from 'react';
import { Columns3, LayoutGrid, ZoomIn, ZoomOut } from 'lucide-react';
import {
  BOARD_CARD_ZOOM_STEPS,
  BOARD_GRID_COLUMN_COUNTS,
  BOARD_TRELLO_COLUMN_WIDTH_REMS,
  boardCardZoomValueFromStep,
  formatBoardCardZoomPercent,
  gridColumnCountFromStep,
  trelloColumnWidthRemFromStep,
  type BoardCardZoomScope,
} from '../../utils/boardCardZoomPrefs';

function CompactStepper({
  label,
  valueLabel,
  hint,
  atMin,
  atMax,
  onDec,
  onInc,
  decAria,
  incAria,
  icon,
}: {
  label: string;
  valueLabel: string;
  hint?: string;
  atMin: boolean;
  atMax: boolean;
  onDec: () => void;
  onInc: () => void;
  decAria: string;
  incAria: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-500">
          {label}
        </p>
      </div>
      {hint ? (
        <p className="text-[11px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">{hint}</p>
      ) : null}
      <div className="flex items-center gap-1.5 rounded-lg border border-zinc-200/80 bg-zinc-50/90 p-1 dark:border-white/[0.1] dark:bg-white/[0.05]">
        <button
          type="button"
          role="menuitem"
          disabled={atMin}
          aria-label={decAria}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!atMin) onDec();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-35 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <ZoomOut className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <p className="text-[13px] font-bold tabular-nums leading-none text-zinc-900 dark:text-white">
            {valueLabel}
          </p>
        </div>
        <button
          type="button"
          role="menuitem"
          disabled={atMax}
          aria-label={incAria}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!atMax) onInc();
          }}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-zinc-800 shadow-sm transition-colors hover:bg-zinc-100 disabled:opacity-35 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          <ZoomIn className="h-3.5 w-3.5" strokeWidth={2.4} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/**
 * Controles de zoom de cartões (+ largura de coluna Trello ou nº de colunas da grade).
 */
export function BoardCardZoomMenuSection({
  scope: _scope,
  modeLabel,
  stepIndex,
  onStepChange,
  trelloMode = false,
  trelloColStepIndex,
  onTrelloColStepChange,
  gridColStepIndex,
  onGridColStepChange,
}: {
  scope: BoardCardZoomScope;
  modeLabel: string;
  stepIndex: number;
  onStepChange: (nextIndex: number) => void;
  /** Modo estilo Trello / colunas horizontais. */
  trelloMode?: boolean;
  trelloColStepIndex?: number;
  onTrelloColStepChange?: (nextIndex: number) => void;
  gridColStepIndex?: number;
  onGridColStepChange?: (nextIndex: number) => void;
}) {
  const zoom = boardCardZoomValueFromStep(stepIndex);
  const atMin = stepIndex <= 0;
  const atMax = stepIndex >= BOARD_CARD_ZOOM_STEPS.length - 1;

  const showTrelloCols =
    trelloMode && trelloColStepIndex != null && typeof onTrelloColStepChange === 'function';
  const showGridCols =
    !trelloMode && gridColStepIndex != null && typeof onGridColStepChange === 'function';

  const trelloRem = showTrelloCols ? trelloColumnWidthRemFromStep(trelloColStepIndex!) : 0;
  const gridCols = showGridCols ? gridColumnCountFromStep(gridColStepIndex!) : 0;

  return (
    <div className="space-y-3 border-b border-zinc-100 px-3 pb-2.5 dark:border-white/[0.07]">
      <p className="text-[11px] font-medium leading-snug text-zinc-500 dark:text-zinc-400">
        Modo <span className="font-semibold text-zinc-700 dark:text-zinc-200">{modeLabel}</span> — salvo neste
        dispositivo
      </p>

      <CompactStepper
        label="Tamanho dos cartões"
        valueLabel={formatBoardCardZoomPercent(zoom)}
        atMin={atMin}
        atMax={atMax}
        onDec={() => onStepChange(stepIndex - 1)}
        onInc={() => onStepChange(stepIndex + 1)}
        decAria="Diminuir cartões"
        incAria="Aumentar cartões"
      />

      {showTrelloCols ? (
        <CompactStepper
          label="Largura das colunas"
          valueLabel={`${trelloRem}rem`}
          hint="Zoom in/out nas colunas do quadro Trello"
          atMin={trelloColStepIndex! <= 0}
          atMax={trelloColStepIndex! >= BOARD_TRELLO_COLUMN_WIDTH_REMS.length - 1}
          onDec={() => onTrelloColStepChange!(trelloColStepIndex! - 1)}
          onInc={() => onTrelloColStepChange!(trelloColStepIndex! + 1)}
          decAria="Estreitar colunas"
          incAria="Alargar colunas"
          icon={<Columns3 className="h-3 w-3 text-zinc-400" strokeWidth={2.2} aria-hidden />}
        />
      ) : null}

      {showGridCols ? (
        <CompactStepper
          label="Colunas na grade"
          valueLabel={`${gridCols}`}
          hint="Quantidade de colunas verticais de cards"
          atMin={gridColStepIndex! <= 0}
          atMax={gridColStepIndex! >= BOARD_GRID_COLUMN_COUNTS.length - 1}
          onDec={() => onGridColStepChange!(gridColStepIndex! - 1)}
          onInc={() => onGridColStepChange!(gridColStepIndex! + 1)}
          decAria="Menos colunas"
          incAria="Mais colunas"
          icon={<LayoutGrid className="h-3 w-3 text-zinc-400" strokeWidth={2.2} aria-hidden />}
        />
      ) : null}
    </div>
  );
}
