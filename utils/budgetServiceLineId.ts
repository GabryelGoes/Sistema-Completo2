/**
 * Identificador estável de linha de serviço dentro do JSONB `budgets.services`.
 * Linhas antigas sem `line_id` recebem UUID na primeira normalização/persistência.
 */

export type BudgetServiceLineWithId = {
  line_id?: string;
  id?: string;
  description?: string;
  [key: string]: unknown;
};

function newLineId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `svc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Extrai line_id existente (line_id ou id UUID-like). */
export function readBudgetServiceLineId(line: BudgetServiceLineWithId | null | undefined): string | null {
  if (!line || typeof line !== "object") return null;
  const a = typeof line.line_id === "string" ? line.line_id.trim() : "";
  if (a) return a;
  const b = typeof line.id === "string" ? line.id.trim() : "";
  if (b && b.length >= 8) return b;
  return null;
}

/**
 * Garante `line_id` em cada linha. Retorna `{ lines, changed }`.
 * Não gera ids determinísticos a partir da descrição — UUID persistido.
 */
export function ensureBudgetServiceLineIds(
  services: unknown
): { lines: BudgetServiceLineWithId[]; changed: boolean } {
  const arr = Array.isArray(services) ? services : [];
  let changed = false;
  const lines = arr.map((raw) => {
    const base =
      raw && typeof raw === "object"
        ? ({ ...(raw as BudgetServiceLineWithId) } as BudgetServiceLineWithId)
        : ({ description: "" } as BudgetServiceLineWithId);
    const existing = readBudgetServiceLineId(base);
    if (!existing) {
      base.line_id = newLineId();
      changed = true;
    } else if (!base.line_id) {
      base.line_id = existing;
      changed = true;
    }
    return base;
  });
  return { lines, changed };
}

export const OS_GENERAL_SERVICE_LINE_ID = "__os_general__";

export function isGeneralOsServiceLine(lineId: string | null | undefined): boolean {
  return !lineId || lineId === OS_GENERAL_SERVICE_LINE_ID;
}
