/**
 * Isolamento de conversas RDA e identidade autenticada estável.
 * Nunca confiar só em workshop_id + conversationId do cliente.
 */
import type { RdaAuthContext } from "../types.js";
import { authHasFullAccess } from "../permissions.js";

/** Prefixo estável para sessões admin (sem userId em workshop_system_users). */
export const RDA_ADMIN_ACTOR_KEY = "admin" as const;

export type RdaConversationOwnerRow = {
  id: string;
  created_by_user_id?: string | null;
  created_by_role?: string | null;
};

/**
 * Identidade autenticada estável e verificável para ownership / pending actions.
 * - user com userId → `user:<uuid>`
 * - admin (login gerência, sem userId) → `admin` (escopo já é workshop_id nas queries)
 * - demais → null (negar)
 */
export function resolveRdaActorKey(auth: RdaAuthContext): string | null {
  if (auth.role === "admin") {
    return RDA_ADMIN_ACTOR_KEY;
  }
  const uid = String(auth.userId || "").trim();
  if (auth.role === "user" && uid) {
    return `user:${uid}`;
  }
  return null;
}

/** Exige identidade resolvível; lança se a sessão não puder ser vinculada. */
export function requireRdaActorKey(auth: RdaAuthContext): string {
  const key = resolveRdaActorKey(auth);
  if (!key) {
    throw new Error(
      "Sessão sem identidade autenticada estável para o RDA. Faça login novamente."
    );
  }
  return key;
}

/** Dono da conversa (mesmo usuário ou mesma sessão admin da oficina). */
export function isRdaConversationOwner(
  auth: RdaAuthContext,
  conversation: RdaConversationOwnerRow
): boolean {
  const key = resolveRdaActorKey(auth);
  if (!key) return false;
  if (key === RDA_ADMIN_ACTOR_KEY) {
    return String(conversation.created_by_role || "") === "admin";
  }
  if (!auth.userId) return false;
  return (
    String(conversation.created_by_user_id || "") === String(auth.userId) &&
    String(conversation.created_by_role || "") === "user"
  );
}

/**
 * Política explícita de acesso compartilhado para gestores:
 * admin, full_access ou access_radar_qualidade podem abrir conversas da oficina
 * que não são suas (leitura/continuidade). Confirmação de pending actions
 * continua exigindo match inequívoco do autor.
 */
export function canShareRdaConversations(auth: RdaAuthContext): boolean {
  if (auth.role === "admin") return true;
  if (authHasFullAccess(auth)) return true;
  if (auth.permissions?.access_radar_qualidade === true) return true;
  return false;
}

export function canAccessRdaConversation(
  auth: RdaAuthContext,
  conversation: RdaConversationOwnerRow
): boolean {
  if (isRdaConversationOwner(auth, conversation)) return true;
  if (canShareRdaConversations(auth)) return true;
  return false;
}

/**
 * Match inequívoco entre autor da ação pendente e sessão autenticada.
 * Fail-closed: ausência de actorKey/userId não libera.
 */
export function pendingActorMatchesAuth(input: {
  auth: RdaAuthContext;
  actorKey?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
}): boolean {
  const authKey = resolveRdaActorKey(input.auth);
  if (!authKey) return false;

  const metaKey = String(input.actorKey || "").trim();
  if (metaKey) {
    if (metaKey !== authKey) return false;
    if (authKey === RDA_ADMIN_ACTOR_KEY) {
      return input.auth.role === "admin";
    }
    // user:<id> — cruzar também com coluna actor_user_id quando presente
    if (input.actorUserId != null && String(input.actorUserId).trim()) {
      return String(input.actorUserId) === String(input.auth.userId);
    }
    return Boolean(input.auth.userId);
  }

  // Legado sem actorKey: só aceita se actor_user_id e auth.userId coincidem.
  if (input.auth.role === "user" && input.auth.userId && input.actorUserId) {
    return String(input.actorUserId) === String(input.auth.userId);
  }
  // Legado admin: role admin + actor_user_id nulo + actor_role admin
  if (
    input.auth.role === "admin" &&
    !input.actorUserId &&
    String(input.actorRole || "") === "admin"
  ) {
    return true;
  }
  return false;
}
