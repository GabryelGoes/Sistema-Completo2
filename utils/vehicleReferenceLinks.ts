import type { VehicleReferenceLink } from '../types';

/** Hostname legível da URL (ex.: youtube.com), sem www. */
export function formatReferenceLinkSite(url: string): string {
  const raw = (url ?? '').trim();
  if (!raw) return '';
  try {
    const withProto = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`;
    const host = new URL(withProto).hostname.replace(/^www\./i, '');
    return host || raw;
  } catch {
    const noProto = raw.replace(/^https?:\/\//i, '').replace(/^\/+/, '');
    const host = noProto.split('/')[0]?.replace(/^www\./i, '') ?? '';
    return host || raw;
  }
}

/**
 * Uma linha: site + título do usuário (sem URL completa).
 * Ex.: "youtube.com · Manual do freio"
 */
export function formatReferenceLinkDisplay(link: Pick<VehicleReferenceLink, 'label' | 'url'>): string {
  const site = formatReferenceLinkSite(link.url);
  const label = (link.label ?? '').trim();
  const urlTrim = (link.url ?? '').trim();
  const isCustomTitle = Boolean(label) && label !== urlTrim && label !== site;
  if (isCustomTitle && site) return `${site} · ${label}`;
  if (isCustomTitle) return label;
  return site || label || urlTrim;
}

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
      typeof o.label === 'string' && o.label.trim() ? o.label.trim() : '';
    out.push({ id, label, url });
    i += 1;
  }
  return out;
}
