/** Campos estendidos de linha de serviço em orçamentos (JSONB). */

export type BudgetServiceLine = {
  description: string;
  approved?: boolean;
  labor_hours?: number | null;
  outsourced?: boolean;
  /** Valor sugerido pelo técnico — uso interno da oficina. */
  suggested_value?: number | null;
  lab_preset_id?: string | null;
  pre_approved?: boolean;
  source?: 'lab_evaluation' | string;
  line_observations?: string;
};

export function formatSuggestedValueBrl(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(Number(value))) return '';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function parseSuggestedValueInput(raw: string): number | null {
  const cleaned = String(raw ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
