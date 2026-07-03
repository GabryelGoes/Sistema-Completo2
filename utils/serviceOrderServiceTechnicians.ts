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
