/** Linha de técnico por serviço (fechamento da OS). */
export type ServiceTechnicianLineRef = {
  description: string;
  technicianId: string;
  technicianName?: string | null;
  budgetId?: string | null;
};

function normDesc(s: string): string {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Nome do técnico para uma linha de serviço do orçamento (match por budget + descrição).
 */
export function resolveBudgetServiceTechnicianName(
  lines: ServiceTechnicianLineRef[],
  budgetId: string,
  serviceDescription: string,
  usedLineIndexes?: Set<number>
): string | null {
  const desc = normDesc(serviceDescription);
  if (!desc) return null;

  const candidates = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => {
      const bid = String(line.budgetId ?? '').trim();
      if (bid && bid !== budgetId) return false;
      return normDesc(line.description) === desc;
    });

  for (const { line, index } of candidates) {
    if (usedLineIndexes?.has(index)) continue;
    usedLineIndexes?.add(index);
    const name = (line.technicianName ?? '').trim();
    return name || null;
  }

  // Fallback: mesma descrição em qualquer orçamento da OS
  for (let i = 0; i < lines.length; i++) {
    if (usedLineIndexes?.has(i)) continue;
    if (normDesc(lines[i].description) !== desc) continue;
    usedLineIndexes?.add(i);
    const name = (lines[i].technicianName ?? '').trim();
    return name || null;
  }

  return null;
}

export function buildBudgetServiceTechnicianNames(
  lines: ServiceTechnicianLineRef[],
  budgetId: string,
  services: { description: string }[]
): (string | null)[] {
  const used = new Set<number>();
  return services.map((s) =>
    resolveBudgetServiceTechnicianName(lines, budgetId, s.description, used)
  );
}
