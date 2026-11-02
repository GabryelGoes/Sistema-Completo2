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

/**
 * Ranking de relevância para busca de nomes (menor = melhor).
 * 0 = nome completo igual à busca
 * 1 = nome começa com a busca
 * 2 = alguma palavra começa com a busca
 * 3 = contém a busca no meio
 * 99 = não casa
 */
export function nameSearchRank(name: string, query: string): number {
  const n = normalizeSearchText(name).trim();
  const q = normalizeSearchText(query).trim();
  if (!q || !n) return 99;
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  const words = n.split(/\s+/).filter(Boolean);
  if (words.some((w) => w.startsWith(q))) return 2;
  if (n.includes(q)) return 3;
  return 99;
}

/** Comparador: melhor rank primeiro; empate por ordem alfabética. */
export function compareByNameSearchRank(aName: string, bName: string, query: string): number {
  const ra = nameSearchRank(aName, query);
  const rb = nameSearchRank(bName, query);
  if (ra !== rb) return ra - rb;
  return aName.localeCompare(bName, 'pt', { sensitivity: 'base' });
}

/**
 * Ranking para busca de placa (menor = melhor).
 * 0 = igual · 1 = começa com · 2 = contém · 99 = não casa
 */
export function plateSearchRank(plate: string, query: string): number {
  const p = String(plate ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  const q = String(query ?? '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase();
  if (!q || !p) return 99;
  if (p === q) return 0;
  if (p.startsWith(q)) return 1;
  if (p.includes(q)) return 2;
  return 99;
}
