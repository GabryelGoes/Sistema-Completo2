/** Normaliza descrição de serviço para comparação/deduplicação. */
export function normalizeServiceDescription(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export type BudgetServiceRow = {
  description?: string;
  approved?: boolean;
};

export type BudgetRowForServices = {
  id: string;
  services?: BudgetServiceRow[] | null;
};

export type ServiceTechnicianLineInput = {
  description: string;
  technicianId: string;
  budgetId?: string | null;
};

export type ServiceTechnicianLine = ServiceTechnicianLineInput & {
  id?: string;
};

/** Serviços aprovados nos orçamentos, deduplicados por descrição. */
export function collectApprovedServicesFromBudgets(
  budgets: BudgetRowForServices[]
): { description: string; budgetId: string | null }[] {
  const seen = new Set<string>();
  const out: { description: string; budgetId: string | null }[] = [];
  for (const budget of budgets) {
    const services = Array.isArray(budget.services) ? budget.services : [];
    for (const svc of services) {
      if (svc.approved !== true) continue;
      const description = (svc.description ?? '').trim();
      if (!description) continue;
      const key = normalizeServiceDescription(description);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ description, budgetId: budget.id ?? null });
    }
  }
  return out;
}

/** Monta rascunho do fechamento: orçamento aprovado manda; técnicos já salvos são reaproveitados. */
export function mergeServiceTechnicianDraftLines(
  savedLines: ServiceTechnicianLineInput[],
  approvedServices: { description: string; budgetId?: string | null }[]
): ServiceTechnicianLineInput[] {
  const saved = savedLines
    .map((l) => ({
      description: (l.description ?? '').trim(),
      technicianId: (l.technicianId ?? '').trim(),
      budgetId: l.budgetId ?? null,
    }))
    .filter((l) => l.description || l.technicianId);

  if (approvedServices.length === 0) {
    if (saved.length > 0) return saved;
    return [{ description: '', technicianId: '', budgetId: null }];
  }

  const consumed = new Set<number>();

  return approvedServices.map((svc) => {
    const svcKey = normalizeServiceDescription(svc.description);
    let matchIdx = -1;

    for (let i = 0; i < saved.length; i++) {
      if (consumed.has(i)) continue;
      const row = saved[i];
      const descMatch = normalizeServiceDescription(row.description) === svcKey;
      const budgetMatch =
        svc.budgetId != null && row.budgetId != null && row.budgetId === svc.budgetId;
      if (descMatch || budgetMatch) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      consumed.add(matchIdx);
      return {
        description: svc.description,
        technicianId: saved[matchIdx].technicianId,
        budgetId: svc.budgetId ?? null,
      };
    }

    return {
      description: svc.description,
      technicianId: '',
      budgetId: svc.budgetId ?? null,
    };
  });
}

export function validateServiceTechnicianLines(
  lines: ServiceTechnicianLineInput[],
  approvedServices: { description: string }[]
): { ok: true } | { ok: false; error: string } {
  const filled = lines
    .map((l) => ({
      description: (l.description ?? '').trim(),
      technicianId: (l.technicianId ?? '').trim(),
    }))
    .filter((l) => l.description || l.technicianId);

  if (filled.length === 0) {
    return {
      ok: false,
      error: 'Informe pelo menos um serviço com o técnico responsável.',
    };
  }

  for (const line of filled) {
    if (!line.description) {
      return { ok: false, error: 'Todos os serviços precisam de descrição.' };
    }
    if (!line.technicianId) {
      return {
        ok: false,
        error: `Selecione o técnico para o serviço "${line.description}".`,
      };
    }
  }

  if (approvedServices.length > 0) {
    const covered = new Set(filled.map((l) => normalizeServiceDescription(l.description)));
    for (const svc of approvedServices) {
      const key = normalizeServiceDescription(svc.description);
      if (!covered.has(key)) {
        return {
          ok: false,
          error: `Falta indicar o técnico do serviço aprovado: "${svc.description}".`,
        };
      }
    }
  }

  return { ok: true };
}

/** Normaliza nome de peça para agregação (sem depender do front/apiService). */
function normalizeBudgetPartName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export type BudgetPartRowForStock = {
  description?: string;
  quantity?: string | number;
  approved?: boolean;
  fromStock?: boolean;
  workshopPartId?: string;
};

export type BudgetRowForParts = {
  id: string;
  parts?: BudgetPartRowForStock[] | null;
};

export type FinalizeStockLineInput = {
  description: string;
  quantity: string;
  workshopPartId?: string | null;
  budgetId?: string | null;
};

export function parseFinalizePartQuantity(value: unknown): number {
  const raw = String(value ?? '').replace(',', '.').trim();
  const qty = Number(raw);
  if (!Number.isFinite(qty) || qty <= 0) return 1;
  return qty;
}

export function formatFinalizePartQuantity(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '1';
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(3).replace(/\.?0+$/, '');
}

/** Peças aprovadas nos orçamentos, agregadas por descrição. */
export function collectApprovedPartsFromBudgets(
  budgets: BudgetRowForParts[]
): FinalizeStockLineInput[] {
  const byKey = new Map<
    string,
    { description: string; quantity: number; budgetId: string | null; workshopPartId: string | null }
  >();

  for (const budget of budgets) {
    const parts = Array.isArray(budget.parts) ? budget.parts : [];
    for (const part of parts) {
      if (part.approved !== true) continue;
      const description = String(part.description ?? '').trim();
      if (!description) continue;
      const key = normalizeBudgetPartName(description);
      const qty = parseFinalizePartQuantity(part.quantity);
      const prev = byKey.get(key);
      if (prev) {
        prev.quantity += qty;
        if (!prev.workshopPartId && part.workshopPartId) {
          prev.workshopPartId = part.workshopPartId;
        }
      } else {
        byKey.set(key, {
          description,
          quantity: qty,
          budgetId: budget.id ?? null,
          workshopPartId: part.workshopPartId ?? null,
        });
      }
    }
  }

  return Array.from(byKey.values()).map((row) => ({
    description: row.description,
    quantity: formatFinalizePartQuantity(row.quantity),
    budgetId: row.budgetId,
    workshopPartId: row.workshopPartId,
  }));
}

export function mergeFinalizeStockDraftLines(
  savedLines: FinalizeStockLineInput[],
  approvedParts: FinalizeStockLineInput[]
): FinalizeStockLineInput[] {
  const saved = savedLines
    .map((l) => ({
      description: (l.description ?? '').trim(),
      quantity: formatFinalizePartQuantity(parseFinalizePartQuantity(l.quantity)),
      workshopPartId: l.workshopPartId ?? null,
      budgetId: l.budgetId ?? null,
    }))
    .filter((l) => l.description);

  if (approvedParts.length === 0) {
    return saved.length > 0 ? saved : [];
  }

  const consumed = new Set<number>();

  const merged = approvedParts.map((part) => {
    const partKey = normalizeBudgetPartName(part.description);
    let matchIdx = -1;

    for (let i = 0; i < saved.length; i++) {
      if (consumed.has(i)) continue;
      const row = saved[i];
      const descMatch = normalizeBudgetPartName(row.description) === partKey;
      const budgetMatch =
        part.budgetId != null && row.budgetId != null && row.budgetId === part.budgetId;
      if (descMatch || budgetMatch) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx >= 0) {
      consumed.add(matchIdx);
      const row = saved[matchIdx];
      return {
        description: part.description,
        quantity: row.quantity,
        workshopPartId: row.workshopPartId ?? part.workshopPartId ?? null,
        budgetId: part.budgetId ?? null,
      };
    }

    return {
      description: part.description,
      quantity: part.quantity,
      workshopPartId: part.workshopPartId ?? null,
      budgetId: part.budgetId ?? null,
    };
  });

  saved.forEach((row, i) => {
    if (consumed.has(i)) return;
    merged.push(row);
  });

  return merged;
}

export function aggregateFinalizeStockParts(
  lines: FinalizeStockLineInput[]
): Map<string, number> {
  const agg = new Map<string, number>();
  for (const line of lines) {
    const description = (line.description ?? '').trim();
    if (!description) continue;
    const key = normalizeBudgetPartName(description);
    const prev = agg.get(key) ?? 0;
    agg.set(key, prev + parseFinalizePartQuantity(line.quantity));
  }
  return agg;
}
