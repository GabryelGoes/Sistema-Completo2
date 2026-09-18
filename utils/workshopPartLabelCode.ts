/**
 * Gera EAN-13 interno (prefixo 200) estável a partir do id do produto,
 * para etiquetas e leitura por pistola quando o cadastro não tem código.
 */

export function ean13CheckDigit(digits12: string): number {
  const d = String(digits12).replace(/\D/g, '');
  if (d.length !== 12) throw new Error('EAN-13 base precisa de 12 dígitos');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = Number(d[i]);
    sum += i % 2 === 0 ? n : n * 3;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidEan13(code: string): boolean {
  const d = String(code ?? '').replace(/\D/g, '');
  if (d.length !== 13) return false;
  return ean13CheckDigit(d.slice(0, 12)) === Number(d[12]);
}

/** Hash simples → 9 dígitos (0–999999999). */
function hashToNineDigits(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const n = Math.abs(h >>> 0) % 1_000_000_000;
  return String(n).padStart(9, '0');
}

/**
 * EAN-13 interno: 200 + 9 dígitos do seed + dígito verificador.
 * Ex.: estilo 200XXXXXXXXXC (13 dígitos, como 4041248845653).
 */
export function generateInternalEan13(seed: string, attempt = 0): string {
  const baseSeed = attempt > 0 ? `${seed}#${attempt}` : seed;
  const body = `200${hashToNineDigits(baseSeed)}`;
  return `${body}${ean13CheckDigit(body)}`;
}
