import type { VehicleReferenceLink } from '../types';

/** Normaliza o JSON vindo da API para o estado do modal. */
export function parseReferenceLinksFromApi(raw: unknown): VehicleReferenceLink[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: VehicleReferenceLink[] = [];
  let i = 0;
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const url = typeof o.url === 'string' ? o.url.trim() : '';
    if (!url) continue;
    const id =
      typeof o.id === 'string' && o.id.trim()
        ? o.id.trim()
        : `link-${i}`;
    const label =
      typeof o.label === 'string' && o.label.trim() ? o.label.trim() : url;
    out.push({ id, label, url });
    i += 1;
  }
  return out;
}
