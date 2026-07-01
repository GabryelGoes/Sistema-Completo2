/** Serviço padrão mais frequente no laboratório. */
export const LAB_VALVE_CLEANING_SERVICE_LABEL = 'Limpeza e desobstrução das válvulas';

export const LAB_LAST_PRODUCT_KIND_KEY = 'lab_last_product_kind_v1';

export function loadLastLabProductKind(): string {
  try {
    return localStorage.getItem(LAB_LAST_PRODUCT_KIND_KEY)?.trim() ?? '';
  } catch {
    return '';
  }
}

export function saveLastLabProductKind(kind: string): void {
  const v = kind.trim();
  if (!v) return;
  try {
    localStorage.setItem(LAB_LAST_PRODUCT_KIND_KEY, v);
  } catch {
    /* ignore */
  }
}

/** Status em que a avaliação técnica ainda pode ser registrada. */
export const LAB_EVALUATION_OPEN_STATUSES = ['AGUARDANDO_AVALIACAO', 'AVALIACAO_TECNICA'] as const;

export function isLabEvaluationOpen(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim();
  return (LAB_EVALUATION_OPEN_STATUSES as readonly string[]).includes(s);
}
