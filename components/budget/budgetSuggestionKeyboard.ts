import type { KeyboardEvent } from 'react';

/** Move o índice destacado nas sugestões (ciclo). `-1` = nenhum até a 1ª seta. */
export function moveSuggestionHighlight(
  current: number,
  itemCount: number,
  direction: 1 | -1
): number {
  if (itemCount <= 0) return -1;
  if (current < 0) return direction === 1 ? 0 : itemCount - 1;
  return (current + direction + itemCount) % itemCount;
}

/**
 * Trata setas, Enter e Escape no campo enquanto a lista de sugestões está aberta.
 * Retorna `true` se o evento foi consumido (não deve adicionar linha / fechar o modal / etc.).
 */
export function handleBudgetSuggestionKeyDown(opts: {
  e: KeyboardEvent;
  open: boolean;
  itemCount: number;
  highlightedIndex: number;
  setHighlightedIndex: (updater: number | ((prev: number) => number)) => void;
  onSelectHighlighted: (index: number) => void;
  /** Fecha só a lista (Esc). */
  onCloseSuggestions?: () => void;
}): boolean {
  const {
    e,
    open,
    itemCount,
    highlightedIndex,
    setHighlightedIndex,
    onSelectHighlighted,
    onCloseSuggestions,
  } = opts;
  if (!open || e.nativeEvent.isComposing) return false;

  if (e.key === 'Escape') {
    e.preventDefault();
    e.stopPropagation();
    onCloseSuggestions?.();
    setHighlightedIndex(-1);
    return true;
  }

  if (itemCount <= 0) return false;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    e.stopPropagation();
    setHighlightedIndex((i) => moveSuggestionHighlight(i, itemCount, 1));
    return true;
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    setHighlightedIndex((i) => moveSuggestionHighlight(i, itemCount, -1));
    return true;
  }
  if (
    e.key === 'Enter' &&
    !e.shiftKey &&
    highlightedIndex >= 0 &&
    highlightedIndex < itemCount
  ) {
    e.preventDefault();
    e.stopPropagation();
    onSelectHighlighted(highlightedIndex);
    return true;
  }
  return false;
}
