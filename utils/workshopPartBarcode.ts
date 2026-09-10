/** Normaliza código lido por pistola, câmera ou digitação. */
export function normalizeBarcodeInput(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '');
}

/** Normaliza texto para busca por nome (sem acento, minúsculas). */
export function normalizePartSearchText(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim();
}

export type WorkshopPartCodeFields = {
  id: string;
  barcode?: string | null;
  original_code?: string | null;
  numeric_code?: string | null;
  name?: string | null;
  brand?: string | null;
  model?: string | null;
};

/**
 * Resolve produto por código de barras, código original ou código numérico.
 * Prioridade: barcode → original_code → numeric_code (match exato após normalizar).
 */
export function findWorkshopPartByCode<T extends WorkshopPartCodeFields>(
  parts: T[],
  rawCode: string
): T | null {
  const code = normalizeBarcodeInput(rawCode);
  if (!code) return null;

  const eq = (value: string | null | undefined) =>
    normalizeBarcodeInput(String(value ?? '')) === code;

  const byBarcode = parts.find((p) => eq(p.barcode));
  if (byBarcode) return byBarcode;

  const byOriginal = parts.find((p) => eq(p.original_code));
  if (byOriginal) return byOriginal;

  const byNumeric = parts.find((p) => eq(p.numeric_code));
  if (byNumeric) return byNumeric;

  return null;
}

/**
 * Busca produtos por nome, marca, modelo ou códigos (parcial).
 * Ordena: match exato no nome → começa com → contém → marca/códigos.
 */
export function searchWorkshopPartsByText<T extends WorkshopPartCodeFields>(
  parts: T[],
  rawQuery: string,
  limit = 12
): T[] {
  const q = normalizePartSearchText(rawQuery);
  if (!q || q.length < 1) return [];

  const scored: Array<{ part: T; score: number }> = [];
  for (const part of parts) {
    const name = normalizePartSearchText(part.name || '');
    const brand = normalizePartSearchText(part.brand || '');
    const model = normalizePartSearchText(part.model || '');
    const original = normalizePartSearchText(part.original_code || '');
    const numeric = normalizePartSearchText(part.numeric_code || '');
    const barcode = normalizePartSearchText(part.barcode || '');

    if (
      !name.includes(q) &&
      !brand.includes(q) &&
      !model.includes(q) &&
      !original.includes(q) &&
      !numeric.includes(q) &&
      !barcode.includes(q)
    ) {
      continue;
    }

    let score = 50;
    if (name === q) score = 0;
    else if (name.startsWith(q)) score = 10;
    else if (name.includes(q)) score = 20;
    else if (brand.startsWith(q) || brand.includes(q)) score = 30;
    else if (model.includes(q)) score = 35;
    else score = 40;

    scored.push({ part, score });
  }

  scored.sort(
    (a, b) => a.score - b.score || (a.part.name || '').localeCompare(b.part.name || '', 'pt-BR')
  );
  return scored.slice(0, Math.max(1, limit)).map((s) => s.part);
}

/** Heurística de pistola USB: sequência rápida terminando em Enter. */
export function isLikelyBarcodeWedgeKeystroke(opts: {
  elapsedMs: number;
  length: number;
}): boolean {
  const { elapsedMs, length } = opts;
  if (length < 4) return false;
  const avg = elapsedMs / Math.max(1, length - 1);
  return avg <= 80 && elapsedMs <= 1200;
}
