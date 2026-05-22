import type { WorkshopPart } from '../services/apiService';

/** Campos opcionais de peça vinculada ao estoque da oficina (JSON no orçamento). */
export type BudgetPartFields = {
  description: string;
  quantity: string;
  approved?: boolean;
  fromStock?: boolean;
  workshopPartId?: string;
};

export function normalizeBudgetPartName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function findWorkshopPartByDescription(
  description: string,
  catalog: WorkshopPart[]
): WorkshopPart | undefined {
  const key = normalizeBudgetPartName(description);
  if (!key) return undefined;
  return catalog.find((p) => normalizeBudgetPartName(p.name) === key);
}

export function resolveBudgetPartStockFlags(
  description: string,
  catalog: WorkshopPart[],
  existing?: Pick<BudgetPartFields, 'fromStock' | 'workshopPartId'>
): Pick<BudgetPartFields, 'fromStock' | 'workshopPartId'> {
  if (existing?.fromStock === true) {
    const byId = existing.workshopPartId
      ? catalog.find((p) => p.id === existing.workshopPartId)
      : undefined;
    const match = byId ?? findWorkshopPartByDescription(description, catalog);
    if (match) return { fromStock: true, workshopPartId: match.id };
  }
  const match = findWorkshopPartByDescription(description, catalog);
  if (match) return { fromStock: true, workshopPartId: match.id };
  return { fromStock: false, workshopPartId: undefined };
}
