import type { WorkshopService } from '../services/apiService';

export const BUDGET_OUTSOURCED_SERVICE_LABEL = 'Terceirizado';
export const BUDGET_OUTSOURCED_SUGGESTION_ID = '__budget_service_terceirizado__';

const OUTSOURCED_KEY = 'terceirizado';

export function normalizeBudgetServiceText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isOutsourcedServiceDescription(description: string): boolean {
  return (
    normalizeBudgetServiceText(description) ===
    normalizeBudgetServiceText(BUDGET_OUTSOURCED_SERVICE_LABEL)
  );
}

export function isBudgetOutsourcedSuggestion(svc: Pick<WorkshopService, 'id' | 'name'>): boolean {
  return (
    svc.id === BUDGET_OUTSOURCED_SUGGESTION_ID ||
    isOutsourcedServiceDescription(svc.name)
  );
}

/** Sugestão sintética legada (catálogo); preferir substituição de texto. */
export function budgetOutsourcedSuggestion(): WorkshopService {
  return {
    id: BUDGET_OUTSOURCED_SUGGESTION_ID,
    name: BUDGET_OUTSOURCED_SERVICE_LABEL,
    category: null,
    labor_hours: null,
    sort_order: -1,
    created_at: '',
  };
}

export type OutsourcedWordMatch = {
  start: number;
  end: number;
  matched: string;
};

/**
 * Localiza a palavra "terceirizado" no texto (última ocorrência — costuma ir no fim).
 * Ignora acentos/caixa.
 */
export function findOutsourcedWordInDescription(
  description: string
): OutsourcedWordMatch | null {
  const text = String(description ?? '');
  if (!text) return null;
  const tokenRe = /[\p{L}\p{N}]+/gu;
  let last: OutsourcedWordMatch | null = null;
  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text))) {
    if (normalizeBudgetServiceText(m[0]) === OUTSOURCED_KEY) {
      last = { start: m.index, end: m.index + m[0].length, matched: m[0] };
    }
  }
  return last;
}

export function descriptionHasOutsourcedWord(description: string): boolean {
  return findOutsourcedWordInDescription(description) != null;
}

/** Remove a palavra "terceirizado" e limpa espaços sobrando. */
export function stripOutsourcedWordFromDescription(description: string): string {
  const match = findOutsourcedWordInDescription(description);
  if (!match) return String(description ?? '').trim();
  const before = description.slice(0, match.start);
  const after = description.slice(match.end);
  return `${before}${after}`
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/^[,.;:!?\s]+|[,.;:!\s]+$/g, '')
    .trim();
}

/**
 * Mostrar a dica de substituição estilo iOS quando a palavra está no texto
 * e a linha ainda não tem a etiqueta.
 */
export function shouldOfferOutsourcedTextReplace(opts: {
  description: string;
  outsourced?: boolean;
  dismissed?: boolean;
}): boolean {
  if (opts.outsourced) return false;
  if (opts.dismissed) return false;
  return descriptionHasOutsourcedWord(opts.description);
}
