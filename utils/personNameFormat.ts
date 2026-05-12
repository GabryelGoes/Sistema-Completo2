/** Capitaliza cada palavra (ex.: "joão silva" → "João Silva"). */
export function capitalizeFirst(str: string): string {
  if (!str || !str.trim()) return str;
  return str
    .trim()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Apenas os dois primeiros nomes (ex.: "João Silva" a partir de "João Silva Santos"). */
export function firstTwoNames(fullName: string): string {
  if (!fullName || !fullName.trim()) return fullName;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return fullName.trim();
  return parts.slice(0, 2).join(' ');
}
