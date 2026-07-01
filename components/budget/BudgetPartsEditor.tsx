import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import type { WorkshopPart } from '../../services/apiService';
import { resolveBudgetPartStockFlags } from '../../utils/budgetPartStock';
import { BudgetLineReorderButtons } from './BudgetLineReorderButtons';
import { BudgetPartStockBadge } from '../ui/BudgetPartStockBadge';
import { BudgetPartSuggestionDropdown } from './BudgetPartSuggestionDropdown';
import { WorkshopPartQuickViewModal } from './WorkshopPartQuickViewModal';
import { moveItemInList } from '../../utils/moveItemInList';

function normalizeText(text: string): string {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export type BudgetPartRow = {
  id: string;
  description: string;
  quantity: string;
  fromStock?: boolean;
  workshopPartId?: string;
};

export type BudgetPartsEditorProps = {
  parts: BudgetPartRow[];
  onChange: (parts: BudgetPartRow[]) => void;
  workshopParts: WorkshopPart[];
  inputClass: string;
  insetClass: string;
  labelClass?: string;
  disabled?: boolean;
};

export function mapBudgetPartRowsToPayload(parts: BudgetPartRow[]) {
  return parts
    .filter((p) => p.description.trim())
    .map((p) => {
      const row: {
        description: string;
        quantity: string;
        fromStock?: boolean;
        workshopPartId?: string;
      } = {
        description: p.description.trim(),
        quantity: (p.quantity || '1').trim(),
      };
      if (p.fromStock) {
        row.fromStock = true;
        if (p.workshopPartId) row.workshopPartId = p.workshopPartId;
      }
      return row;
    });
}

export const BudgetPartsEditor: React.FC<BudgetPartsEditorProps> = ({
  parts,
  onChange,
  workshopParts,
  inputClass,
  insetClass,
  labelClass = 'mb-2 block text-[12px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400',
  disabled = false,
}) => {
  const [suggestionsForPartId, setSuggestionsForPartId] = useState<string | null>(null);
  const [partSuggestionBoxPosition, setPartSuggestionBoxPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [budgetPartQuickView, setBudgetPartQuickView] = useState<WorkshopPart | null>(null);
  const focusedPartInputRef = useRef<HTMLInputElement | null>(null);
  const partSuggestionCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addPartRow = () => {
    onChange([...parts, { id: `p-${Date.now()}`, description: '', quantity: '1' }]);
  };

  const removePartRow = (id: string) => {
    onChange(parts.filter((p) => p.id !== id));
  };

  const movePartRow = (id: string, direction: -1 | 1) => {
    onChange((() => {
      const from = parts.findIndex((item) => item.id === id);
      if (from < 0) return parts;
      return moveItemInList(parts, from, from + direction);
    })());
  };

  const updatePartDescription = (id: string, value: string) => {
    onChange(
      parts.map((item) => {
        if (item.id !== id) return item;
        const flags = resolveBudgetPartStockFlags(value, workshopParts, item);
        return { ...item, description: value, ...flags };
      })
    );
  };

  const updatePartQuantity = (id: string, delta: number) => {
    onChange(
      parts.map((item) => {
        if (item.id !== id) return item;
        const currentQty = parseInt(item.quantity, 10) || 0;
        return { ...item, quantity: String(Math.max(1, currentQty + delta)) };
      })
    );
  };

  const getPartSuggestions = (description: string) => {
    const q = normalizeText(description.trim());
    if (!q) return [];
    return workshopParts.filter((p) => normalizeText(p.name).includes(q)).slice(0, 6);
  };

  const applyPartSuggestion = (partId: string, part: WorkshopPart) => {
    onChange(
      parts.map((item) => {
        if (item.id !== partId) return item;
        return {
          ...item,
          description: part.name,
          fromStock: true,
          workshopPartId: part.id,
        };
      })
    );
    setSuggestionsForPartId(null);
  };

  const keepPartSuggestionsOpen = () => {
    if (partSuggestionCloseTimerRef.current) {
      clearTimeout(partSuggestionCloseTimerRef.current);
      partSuggestionCloseTimerRef.current = null;
    }
  };

  const handlePartInputFocus = (id: string) => {
    keepPartSuggestionsOpen();
    setSuggestionsForPartId(id);
  };

  const handlePartInputBlur = () => {
    partSuggestionCloseTimerRef.current = setTimeout(() => setSuggestionsForPartId(null), 180);
  };

  const budgetPartQuickViewCatalogNumber = useMemo(() => {
    if (!budgetPartQuickView) return undefined;
    const idx = workshopParts.findIndex((p) => p.id === budgetPartQuickView.id);
    return idx >= 0 ? idx + 1 : undefined;
  }, [budgetPartQuickView, workshopParts]);

  useLayoutEffect(() => {
    const update = () => {
      if (suggestionsForPartId && focusedPartInputRef.current) {
        const rect = focusedPartInputRef.current.getBoundingClientRect();
        setPartSuggestionBoxPosition({ top: rect.bottom + 4, left: rect.left, width: rect.width });
      } else {
        setPartSuggestionBoxPosition(null);
      }
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [suggestionsForPartId, parts]);

  useEffect(() => {
    return () => {
      if (partSuggestionCloseTimerRef.current) clearTimeout(partSuggestionCloseTimerRef.current);
    };
  }, []);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className={`${labelClass} mb-0`}>Peças utilizadas</p>
        <button
          type="button"
          onClick={addPartRow}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-sky-800/80 transition-colors hover:text-sky-950 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" strokeWidth={2.2} />
          Adicionar
        </button>
      </div>
      <div className="space-y-2.5">
        {parts.length === 0 ? (
          <p className="rounded-xl border border-dashed border-zinc-300/90 bg-zinc-50/80 px-3 py-2.5 text-[12px] text-zinc-500 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-400">
            Nenhuma peça — clique em Adicionar se necessário.
          </p>
        ) : (
          parts.map((item, partIndex) => {
            const isFocusedPart = suggestionsForPartId === item.id;
            return (
              <div
                key={item.id}
                className={`${insetClass} flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center`}
              >
                <BudgetLineReorderButtons
                  onMoveUp={() => movePartRow(item.id, -1)}
                  onMoveDown={() => movePartRow(item.id, 1)}
                  disableUp={partIndex === 0}
                  disableDown={partIndex === parts.length - 1}
                  ariaLabelPrefix="Peça"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  {item.fromStock ? <BudgetPartStockBadge className="self-start" /> : null}
                  <input
                    ref={isFocusedPart ? focusedPartInputRef : undefined}
                    type="text"
                    placeholder="Nome da peça…"
                    className={`${inputClass} min-w-0 w-full shadow-none`}
                    value={item.description}
                    onChange={(e) => updatePartDescription(item.id, e.target.value)}
                    onFocus={() => handlePartInputFocus(item.id)}
                    onBlur={handlePartInputBlur}
                    disabled={disabled}
                  />
                </div>
                <div className="flex shrink-0 items-center justify-end gap-2 sm:justify-start">
                  <div className="flex items-center overflow-hidden rounded-xl border border-sky-200/80 bg-white">
                    <button
                      type="button"
                      onClick={() => updatePartQuantity(item.id, -1)}
                      disabled={disabled}
                      className="flex h-10 w-10 items-center justify-center text-sky-800/80 transition-colors hover:bg-sky-100 disabled:opacity-50"
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-10 text-center text-[14px] font-semibold tabular-nums text-slate-900">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updatePartQuantity(item.id, 1)}
                      disabled={disabled}
                      className="flex h-10 w-10 items-center justify-center text-sky-800/80 transition-colors hover:bg-sky-100 disabled:opacity-50"
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => removePartRow(item.id)}
                    disabled={disabled}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-200/60 bg-red-50/40 text-red-500/85 transition-colors hover:border-red-400 hover:bg-red-100/80 hover:text-red-600 disabled:opacity-50"
                    aria-label="Remover peça"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <BudgetPartSuggestionDropdown
        open={!!suggestionsForPartId}
        position={partSuggestionBoxPosition}
        suggestions={
          suggestionsForPartId
            ? getPartSuggestions(parts.find((i) => i.id === suggestionsForPartId)?.description ?? '')
            : []
        }
        onClose={() => setSuggestionsForPartId(null)}
        onKeepOpen={keepPartSuggestionsOpen}
        onOpenPartDetails={(part) => {
          keepPartSuggestionsOpen();
          setBudgetPartQuickView(part);
        }}
        onSelect={(part) => {
          if (suggestionsForPartId) applyPartSuggestion(suggestionsForPartId, part);
        }}
      />

      {budgetPartQuickView ? (
        <WorkshopPartQuickViewModal
          part={budgetPartQuickView}
          catalogNumber={budgetPartQuickViewCatalogNumber}
          onClose={() => setBudgetPartQuickView(null)}
          onUseInBudget={(part) => {
            if (suggestionsForPartId) applyPartSuggestion(suggestionsForPartId, part);
            setBudgetPartQuickView(null);
          }}
        />
      ) : null}
    </div>
  );
};
