/**
 * Contexto de autenticação do sync de etiquetas (SEC-04.4).
 * Separado de `labelTemplatesSync.ts` para selftests sem puxar `apiService`.
 */

export type LabelTemplatesSyncAuthInput = {
  role: "admin" | "user" | null;
  userId?: string | null;
  /** full_access ou access_settings — quem pode gravar G3 no backend. */
  canWriteLabelTemplates: boolean;
};

/** Contexto atual (sessão + capacidade G3). Atualizado pelo App. */
let syncAuthKey = "";
/** Chave para a qual o auto-upload recebeu 403. Só bloqueia enquanto a chave for a mesma. */
let autoUploadDeniedForKey: string | null = null;
let lastSyncedAt = 0;

/**
 * Chave estável do contexto de sync (SEC-04.4).
 * Inclui identidade + bit de escrita G3 para que concessão/revogação de
 * `access_settings` / `full_access` libere ou rebloqueie o auto-upload.
 */
export function computeLabelTemplatesSyncAuthKey(
  input: LabelTemplatesSyncAuthInput | null | undefined
): string {
  if (!input || !input.role) return "";
  if (input.role === "admin") return "admin|g3=1";
  const id = (input.userId || "").trim() || "anonymous";
  return `user:${id}|g3=${input.canWriteLabelTemplates ? "1" : "0"}`;
}

/** true se o auto-upload deve ser pulado (403 recente no mesmo contexto). */
export function shouldSkipLabelAutoUpload(
  authKey: string,
  deniedForKey: string | null
): boolean {
  return Boolean(deniedForKey && deniedForKey === authKey);
}

/**
 * Liga o sync ao contexto autenticado atual.
 * @returns true se a chave mudou (chamador pode disparar sync controlada).
 */
export function setLabelTemplatesSyncAuthContext(
  input: LabelTemplatesSyncAuthInput | null | undefined
): boolean {
  const next = computeLabelTemplatesSyncAuthKey(input);
  if (next === syncAuthKey) return false;
  syncAuthKey = next;
  lastSyncedAt = 0;
  return true;
}

export function getLabelTemplatesSyncAuthKey(): string {
  return syncAuthKey;
}

export function getLabelTemplatesAutoUploadDeniedForKey(): string | null {
  return autoUploadDeniedForKey;
}

export function markLabelAutoUploadDenied(authKey: string = syncAuthKey): void {
  autoUploadDeniedForKey = authKey;
}

export function clearLabelAutoUploadDenied(): void {
  autoUploadDeniedForKey = null;
}

export function clearLabelAutoUploadDeniedIfCurrent(): void {
  if (autoUploadDeniedForKey === syncAuthKey) {
    autoUploadDeniedForKey = null;
  }
}

export function getLabelTemplatesLastSyncedAt(): number {
  return lastSyncedAt;
}

export function touchLabelTemplatesLastSyncedAt(at: number = Date.now()): void {
  lastSyncedAt = at;
}

/** Snapshot só para selftests / diagnóstico. */
export function getLabelTemplatesAutoUploadGateState(): {
  authKey: string;
  deniedForKey: string | null;
} {
  return { authKey: syncAuthKey, deniedForKey: autoUploadDeniedForKey };
}

/** Selftests: zera estado de módulo entre cenários. */
export function resetLabelTemplatesSyncStateForTests(): void {
  syncAuthKey = "";
  autoUploadDeniedForKey = null;
  lastSyncedAt = 0;
}

/** Selftests: simula 403 de auto-upload no authKey atual (sem HTTP). */
export function markLabelAutoUploadDeniedForTests(): void {
  autoUploadDeniedForKey = syncAuthKey;
}
