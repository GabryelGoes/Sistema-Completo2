/**
 * SEC-03.2 — campos que o próprio funcionário pode gravar.
 * O id da sessão manda. Username, id e permissões do corpo são ignorados.
 * Não há correspondência por nome entre usuário e técnico.
 */

export type OwnProfilePatch = {
  display_name?: string | null;
  accent_color?: string | null;
};

export function sessionProfileUserId(sessionUserId: unknown): string | null {
  if (typeof sessionUserId !== "string") return null;
  const id = sessionUserId.trim();
  return id || null;
}

export function ownProfilePatch(body: unknown): OwnProfilePatch {
  const source = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const patch: OwnProfilePatch = {};
  if (typeof source.displayName === "string") {
    patch.display_name = source.displayName.trim() || null;
  }
  if (Object.prototype.hasOwnProperty.call(source, "accentColor")) {
    patch.accent_color =
      typeof source.accentColor === "string" && source.accentColor.trim()
        ? source.accentColor.trim()
        : null;
  }
  return patch;
}
