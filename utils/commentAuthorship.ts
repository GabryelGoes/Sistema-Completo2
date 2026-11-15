/**
 * SEC-03.28 — autoria do comentário da OS.
 * A chave estável vem da sessão. O nome enviado pelo cliente só entra quando
 * coincide com essa sessão. Comentário com author_key de outra pessoa não
 * se edita por semelhança de nome.
 */

export function normalizeCommentPersonName(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function sameName(left: string, right: string): boolean {
  const a = normalizeCommentPersonName(left);
  const b = normalizeCommentPersonName(right);
  return a.length > 0 && a === b;
}

export function isOwnServiceOrderComment(input: {
  authorKey: string | null;
  authorName: string;
  readerKey: string;
  sessionNames: readonly string[];
  admin: boolean;
}): boolean {
  const authorKey = input.authorKey?.trim() || "";
  const readerKey = input.readerKey.trim();
  if (authorKey && readerKey && authorKey === readerKey) return true;
  if (authorKey) return false;
  if (input.sessionNames.some((name) => sameName(input.authorName, name))) return true;
  if (!input.admin) return false;
  const author = normalizeCommentPersonName(input.authorName);
  return author === "admin" || author.includes("rei do abs") || author.includes("gerencia");
}

/** Nome gravado no comentário. Fora da sessão, fica o nome da sessão. */
export function acceptedCommentAuthorName(input: {
  requested: unknown;
  sessionNames: readonly string[];
  fallback: string;
  admin: boolean;
}): string {
  const requested = typeof input.requested === "string" ? input.requested.trim() : "";
  if (!requested) return input.fallback;
  if (input.sessionNames.some((name) => sameName(requested, name))) return requested;
  if (input.admin) {
    const author = normalizeCommentPersonName(requested);
    if (author === "admin" || author.includes("rei do abs") || author.includes("gerencia")) return requested;
  }
  return input.fallback;
}
