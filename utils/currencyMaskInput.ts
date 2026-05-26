/** Valor máximo: 99.999.999,99 */
export const CURRENCY_MASK_MAX_CENTS = 9_999_999_999;

export function parseCurrencyStringToNumber(raw: string): number {
  const s = String(raw ?? '').trim();
  if (!s) return 0;
  if (s.includes(',')) {
    const normalized = s.replace(/\./g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

export function numberToCurrencyMaskCents(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(CURRENCY_MASK_MAX_CENTS, Math.round(value * 100));
}

export function centsToFormValueString(cents: number): string {
  return (Math.max(0, cents) / 100).toFixed(2);
}

/** Ex.: 123456 → "1.234,56" */
export function formatCurrencyMaskDisplay(cents: number): string {
  const c = Math.max(0, Math.min(CURRENCY_MASK_MAX_CENTS, Math.floor(cents)));
  const whole = Math.floor(c / 100);
  const frac = String(c % 100).padStart(2, '0');
  return `${whole.toLocaleString('pt-BR')},${frac}`;
}

/** Novo dígito entra à direita; valores anteriores deslocam para a esquerda (estilo caixa). */
export function applyCurrencyMaskDigit(cents: number, digit: number): number {
  if (!Number.isInteger(digit) || digit < 0 || digit > 9) return cents;
  const next = cents * 10 + digit;
  return Math.min(CURRENCY_MASK_MAX_CENTS, next);
}

export function applyCurrencyMaskBackspace(cents: number): number {
  return Math.floor(Math.max(0, cents) / 10);
}

export function parsePastedCurrencyToCents(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const n = parseCurrencyStringToNumber(trimmed);
  if (!Number.isFinite(n)) return null;
  return numberToCurrencyMaskCents(n);
}
