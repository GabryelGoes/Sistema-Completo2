/** Chave de dedupe: trim + minúsculas + sem acentos. */
export function normalizeQualityRadarPersonKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
