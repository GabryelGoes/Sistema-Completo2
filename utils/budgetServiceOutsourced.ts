import type { WorkshopService } from '../services/apiService';

export const BUDGET_OUTSOURCED_SERVICE_LABEL = 'Terceirizado';
export const BUDGET_OUTSOURCED_SUGGESTION_ID = '__budget_service_terceirizado__';

export function normalizeBudgetServiceText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isOutsourcedServiceDescription(description: string): boolean {
  return normalizeBudgetServiceText(description) === normalizeBudgetServiceText(BUDGET_OUTSOURCED_SERVICE_LABEL);
}

export function isBudgetOutsourcedSuggestion(svc: Pick<WorkshopService, 'id' | 'name'>): boolean {
  return (
    svc.id === BUDGET_OUTSOURCED_SUGGESTION_ID ||
    isOutsourcedServiceDescription(svc.name)
  );
}

/** Sugestão sintética única para marcar serviço terceirizado. */
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

/**
 * Se a digitação aponta para "Terceirizado", retorna só essa sugestão.
 * Caso contrário, null (usar catálogo normal).
 */
export function matchOutsourcedServiceSuggestion(
  description: string
): WorkshopService[] | null {
  const q = normalizeBudgetServiceText(description);
  if (!q) return null;
  const key = normalizeBudgetServiceText(BUDGET_OUTSOURCED_SERVICE_LABEL);
  // Prefixo a partir de 4 letras (ex.: "terc") ou match exato — evita roubar "te"/"ter".
  if (q === key || (q.length >= 4 && key.startsWith(q))) {
    return [budgetOutsourcedSuggestion()];
  }
  return null;
}
