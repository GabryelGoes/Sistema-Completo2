/**
 * Placas BR: formato antigo (ABC1234) e Mercosul (ABC1C34).
 * A 5ª posição troca dígito ↔ letra: 0=A … 9=J.
 */

const MERCOSUL_LETTER_TO_DIGIT: Record<string, string> = {
  A: '0',
  B: '1',
  C: '2',
  D: '3',
  E: '4',
  F: '5',
  G: '6',
  H: '7',
  I: '8',
  J: '9',
};

const DIGIT_TO_MERCOSUL_LETTER = 'ABCDEFGHIJ';

/** Remove separadores e normaliza para A–Z/0–9 em maiúsculas. */
export function normalizeBrazilianPlate(raw: unknown): string {
  return String(raw ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 8);
}

function isOldFormatPlate(p: string): boolean {
  return /^[A-Z]{3}[0-9]{4}$/.test(p);
}

function isMercosulFormatPlate(p: string): boolean {
  return /^[A-Z]{3}[0-9][A-J][0-9]{2}$/.test(p);
}

/** Converte Mercosul → antigo, ou devolve o antigo se já for. */
export function toOldBrazilianPlate(raw: unknown): string | null {
  const p = normalizeBrazilianPlate(raw);
  if (isOldFormatPlate(p)) return p;
  if (isMercosulFormatPlate(p)) {
    return p.slice(0, 4) + MERCOSUL_LETTER_TO_DIGIT[p[4]!]! + p.slice(5);
  }
  return null;
}

/** Converte antigo → Mercosul, ou devolve Mercosul se já for. */
export function toMercosulBrazilianPlate(raw: unknown): string | null {
  const p = normalizeBrazilianPlate(raw);
  if (isMercosulFormatPlate(p)) return p;
  if (isOldFormatPlate(p)) {
    const digit = Number(p[4]);
    if (!Number.isInteger(digit) || digit < 0 || digit > 9) return null;
    return p.slice(0, 4) + DIGIT_TO_MERCOSUL_LETTER[digit]! + p.slice(5);
  }
  return null;
}

/**
 * Chave de identidade do veículo pela placa: formato antigo quando conversível.
 * Assim ABC1C34 e ABC1234 batem no mesmo histórico.
 */
export function brazilianPlateIdentityKey(raw: unknown): string {
  const p = normalizeBrazilianPlate(raw);
  return toOldBrazilianPlate(p) ?? p;
}

/** Conjunto de formas equivalentes (digitada + antigo + Mercosul quando aplicável). */
export function brazilianPlateEquivalents(raw: unknown): string[] {
  const p = normalizeBrazilianPlate(raw);
  if (!p) return [];
  const set = new Set<string>([p]);
  const old = toOldBrazilianPlate(p);
  const merc = toMercosulBrazilianPlate(p);
  if (old) set.add(old);
  if (merc) set.add(merc);
  return [...set];
}

export function brazilianPlatesMatch(a: unknown, b: unknown): boolean {
  const ka = brazilianPlateIdentityKey(a);
  const kb = brazilianPlateIdentityKey(b);
  if (!ka || !kb || ka.length < 5 || kb.length < 5) {
    return normalizeBrazilianPlate(a) === normalizeBrazilianPlate(b) && normalizeBrazilianPlate(a).length >= 5;
  }
  return ka === kb;
}
