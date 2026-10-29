/**
 * Normaliza texto para busca: minúsculas e sem acentos/diacríticos.
 * Ex.: "José" e "jose" batem; "São Paulo" encontra com "sao paulo".
 */
export function normalizeSearchText(text: string): string {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
