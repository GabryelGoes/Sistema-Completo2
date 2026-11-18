/**
 * Evita banner/aviso para o próprio autor da ação.
 * Compara por userId (preferencial) e, em seguida, por nome exibido normalizado.
 */

export type SessionNotifyIdentity = {
  /** ID do usuário do sistema (técnico / full_access). Admin Gerência pode ser null. */
  userId?: string | null;
  role?: "admin" | "user" | null;
  /** Nomes possíveis na sessão (displayName, username, nome da Gerência). */
  displayNames?: Array<string | null | undefined>;
};

export function normalizeNotifyPersonLabel(raw: string | null | undefined): string {
  return String(raw || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function sessionNotifyLabels(identity: SessionNotifyIdentity | null | undefined): string[] {
  if (!identity) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of identity.displayNames || []) {
    const n = normalizeNotifyPersonLabel(raw);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

export function isSelfNotifyAuthorName(
  authorName: string | null | undefined,
  identity: SessionNotifyIdentity | null | undefined
): boolean {
  const author = normalizeNotifyPersonLabel(authorName);
  if (!author) return false;
  return sessionNotifyLabels(identity).includes(author);
}

export function isSelfNotifyAuthorUserId(
  authorUserId: string | null | undefined,
  identity: SessionNotifyIdentity | null | undefined
): boolean {
  const self = typeof identity?.userId === "string" ? identity.userId.trim() : "";
  const author = typeof authorUserId === "string" ? authorUserId.trim() : "";
  return !!self && !!author && self === author;
}

/** Extrai autor de payload de notificação (orçamento, comentário, etapa, etc.). */
export function extractNotificationAuthor(payload: Record<string, unknown> | null | undefined): {
  userId: string | null;
  displayName: string | null;
} {
  if (!payload || typeof payload !== "object") return { userId: null, displayName: null };
  const userIdRaw =
    payload.author_user_id ?? payload.authorUserId ?? payload.actor_user_id ?? payload.actorUserId;
  const userId = typeof userIdRaw === "string" && userIdRaw.trim() ? userIdRaw.trim() : null;
  const nameRaw =
    payload.author_display_name ??
    payload.authorDisplayName ??
    payload.technician_name ??
    payload.technicianName ??
    payload.actor_display_name ??
    payload.actorDisplayName;
  const displayName = typeof nameRaw === "string" && nameRaw.trim() ? nameRaw.trim() : null;
  return { userId, displayName };
}

/**
 * True quando a notificação/banner é do próprio usuário logado.
 * Preferência: userId; fallback: nome exibido.
 */
export function isSelfAuthoredNotification(
  payload: Record<string, unknown> | null | undefined,
  identity: SessionNotifyIdentity | null | undefined
): boolean {
  const author = extractNotificationAuthor(payload);
  if (isSelfNotifyAuthorUserId(author.userId, identity)) return true;
  if (author.userId) return false; // id diferente → não é self
  return isSelfNotifyAuthorName(author.displayName, identity);
}

export function isSelfAuthoredBanner(
  authorName: string | null | undefined,
  authorUserId: string | null | undefined,
  identity: SessionNotifyIdentity | null | undefined
): boolean {
  if (isSelfNotifyAuthorUserId(authorUserId, identity)) return true;
  if (authorUserId) return false;
  return isSelfNotifyAuthorName(authorName, identity);
}

/** Remove o próprio id da lista de destinatários técnicos. */
export function excludeSelfRecipientIds(
  recipientIds: readonly string[],
  actorUserId: string | null | undefined
): string[] {
  const self = typeof actorUserId === "string" ? actorUserId.trim() : "";
  if (!self) return [...recipientIds];
  return recipientIds.filter((id) => id !== self);
}
