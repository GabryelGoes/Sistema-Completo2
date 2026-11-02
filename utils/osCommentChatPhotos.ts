/** Metadados de fotos anexadas a um comentário do chat da OS. */
export type OsChatPhotoRef = {
  path: string;
  name: string;
};

const MARKER_RE = /<!--os-chat-photos:([\s\S]*?)-->/g;

/** Serializa fotos no texto do comentário (persistido no banco). */
export function appendOsChatPhotosMarker(text: string, photos: OsChatPhotoRef[]): string {
  const cleaned = stripOsChatPhotosMarker(text).trim();
  if (!photos.length) return cleaned;
  const payload = JSON.stringify(
    photos.map((p) => ({
      path: String(p.path || '').trim(),
      name: String(p.name || '').trim() || 'foto.jpg',
    })).filter((p) => p.path)
  );
  if (payload === '[]') return cleaned;
  return cleaned ? `${cleaned}\n\n<!--os-chat-photos:${payload}-->` : `<!--os-chat-photos:${payload}-->`;
}

/** Remove o bloco de fotos do texto (para exibir/editar só a mensagem). */
export function stripOsChatPhotosMarker(text: string): string {
  return String(text || '')
    .replace(MARKER_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extrai fotos embutidas no texto do comentário. */
export function parseOsChatPhotosFromText(text: string): OsChatPhotoRef[] {
  const raw = String(text || '');
  const out: OsChatPhotoRef[] = [];
  const seen = new Set<string>();
  for (const match of raw.matchAll(MARKER_RE)) {
    const json = (match[1] || '').trim();
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const path = String((item as { path?: unknown }).path ?? '').trim();
        if (!path || seen.has(path)) continue;
        seen.add(path);
        const name = String((item as { name?: unknown }).name ?? '').trim() || 'foto.jpg';
        out.push({ path, name });
      }
    } catch {
      /* ignore malformed */
    }
  }
  return out;
}
