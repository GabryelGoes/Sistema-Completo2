/** Formatação de horas de mão de obra (decimal API → texto legível). Usado em orçamentos e cadastro. */

export function laborHoursToParts(laborHours: number): { h: number; m: number } {
  const safe = Math.max(0, Number(laborHours) || 0);
  const totalMin = Math.round(safe * 60);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

export function formatLaborLabel(laborHours: number | null | undefined): string {
  if (laborHours == null || !Number.isFinite(Number(laborHours))) return '—';
  const { h, m } = laborHoursToParts(Number(laborHours));
  if (h === 0 && m === 0) return '0';
  if (m === 0) return `${h}h`;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}min`;
}
