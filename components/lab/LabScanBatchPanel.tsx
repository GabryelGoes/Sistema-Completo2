import React from 'react';
import { Check, Loader2, Undo2, X } from 'lucide-react';
import type { LabScanMode } from '../../utils/labScanMode';

export type LabScanBatchItem = {
  id: string;
  osNumber?: number | null;
  label: string;
  feedback: string;
  ok: boolean;
  already?: boolean;
};

export type LabScanBatchPanelProps = {
  mode: Extract<LabScanMode, 'saida' | 'retorno'>;
  items: LabScanBatchItem[];
  confirming: boolean;
  onConfirm: () => void;
  onUndoLast: () => void;
  onClear: () => void;
  idleHintSeconds?: number;
};

export function LabScanBatchPanel({
  mode,
  items,
  confirming,
  onConfirm,
  onUndoLast,
  onClear,
  idleHintSeconds = 2,
}: LabScanBatchPanelProps) {
  if (items.length === 0) return null;

  const title = mode === 'saida' ? 'Saída → Depósito' : 'Retorno → Oficina';
  const okCount = items.filter((i) => i.ok).length;

  return (
    <div className="fixed bottom-4 left-1/2 z-[260] w-[min(100%-1.5rem,420px)] -translate-x-1/2 rounded-2xl border border-zinc-200/80 bg-white/95 p-3 shadow-2xl shadow-black/20 backdrop-blur-md dark:border-white/10 dark:bg-zinc-950/95">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-500">
            {title}
          </p>
          <p className="mt-0.5 text-[15px] font-semibold text-zinc-900 dark:text-white">
            {items.length} peça{items.length === 1 ? '' : 's'} · Escaneando…
          </p>
          <p className="mt-0.5 text-[11px] text-zinc-500">
            Confirme o lote ou aguarde {idleHintSeconds}s sem novo bip
          </p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="rounded-full p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-white/10"
          aria-label="Limpar lote"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-2 max-h-36 space-y-1 overflow-y-auto custom-scrollbar">
        {items.map((item) => (
          <li
            key={item.id}
            className={`rounded-xl px-2.5 py-1.5 text-[12px] ${
              item.ok
                ? item.already
                  ? 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100'
                  : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
                : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
            }`}
          >
            <span className="font-semibold">
              {item.osNumber != null ? `OS ${item.osNumber}` : item.label}
            </span>
            <span className="opacity-80"> · {item.feedback}</span>
          </li>
        ))}
      </ul>

      <div className="mt-2.5 flex gap-2">
        <button
          type="button"
          onClick={onUndoLast}
          disabled={confirming || items.length === 0}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-100 px-3 py-2.5 text-[13px] font-semibold text-zinc-800 disabled:opacity-40 dark:bg-white/10 dark:text-zinc-100"
        >
          <Undo2 className="h-4 w-4" />
          Desfazer último
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={confirming || okCount === 0}
          className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-[13px] font-semibold text-white disabled:opacity-40 ${
            mode === 'saida' ? 'bg-sky-600' : 'bg-emerald-600'
          }`}
        >
          {confirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Confirmar lote
        </button>
      </div>
    </div>
  );
}
