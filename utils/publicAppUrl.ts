/**
 * Origem pública do app (página de acompanhamento do cliente).
 * Em produção, defina VITE_PUBLIC_APP_URL no build (ex.: https://sistema-rda.com).
 */
export function getPublicAppOrigin(): string {
  if (typeof window === 'undefined') return '';
  const fromEnv = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  return window.location.origin.replace(/\/$/, '');
}

export function companionPublicUrl(shareToken: string): string {
  const token = (shareToken || '').trim();
  if (!token) return '';
  const origin = getPublicAppOrigin();
  const path = `/acompanhamento/${encodeURIComponent(token)}`;
  return `${origin}${path}`;
}
