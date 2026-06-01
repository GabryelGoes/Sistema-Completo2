import type { TrelloCard } from '../types';

/** Módulos aguardando vaga nos compartimentos 1–4 (cadastro com bancada lotada). */
export function getBenchQueuedCards(cards: TrelloCard[]): TrelloCard[] {
  return [...cards]
    .filter((c) => c.benchQueuedAt && c.benchSlot == null)
    .sort(
      (a, b) =>
        new Date(a.benchQueuedAt!).getTime() - new Date(b.benchQueuedAt!).getTime()
    );
}

export function formatBenchQueuedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}
