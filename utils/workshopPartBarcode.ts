/** Normaliza código lido por pistola, câmera ou digitação. */
export function normalizeBarcodeInput(raw: string): string {
  return String(raw ?? '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .replace(/\s+/g, '');
}

export type WorkshopPartCodeFields = {
  id: string;
  barcode?: string | null;
  original_code?: string | null;
  numeric_code?: string | null;
  name?: string | null;
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

/** Heurística de pistola USB: sequência rápida terminando em Enter. */
export function isLikelyBarcodeWedgeKeystroke(opts: {
  elapsedMs: number;
  length: number;
}): boolean {
  const { elapsedMs, length } = opts;
  if (length < 4) return false;
  // Scanners tipicamente disparam &lt; 50ms entre teclas; toleramos até ~80ms médio.
  const avg = elapsedMs / Math.max(1, length - 1);
  return avg <= 80 && elapsedMs <= 1200;
}
