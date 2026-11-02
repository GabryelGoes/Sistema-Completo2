/**
 * Tipos centrais do RDA Intelligence (Fase 0 — fundação).
 * Sem dependência de UI, Supabase ou provedores externos.
 */

/** Chave em `workshop_settings` (valor "true" | "false"; ausência = false). */
export const RDA_INTELLIGENCE_SETTING_KEY = "rda_intelligence_enabled" as const;

/** Variável de ambiente opcional (mesmo semântica; default desligado). */
export const RDA_INTELLIGENCE_ENV_KEY = "RDA_INTELLIGENCE_ENABLED" as const;

/**
 * Bloqueio duro de chamadas LLM na Fase 0.
 * Mesmo com OPENAI_API_KEY, só libera se isto for "true" (futuro).
 */
export const RDA_ALLOW_LLM_CALLS_ENV_KEY = "RDA_ALLOW_LLM_CALLS" as const;

export type RdaRole = "admin" | "user";

/**
 * Contexto de autenticação passado ao ACL de tools.
 * Permissões vêm do servidor (não confiar no cliente).
 */
export type RdaAuthContext = {
  role: RdaRole;
  userId?: string;
  username?: string;
  /** Mapa de permissões do usuário; null/undefined em user = negar (exceto admin). */
  permissions?: Record<string, boolean> | null;
};

export type RdaPermissionKey = string;

export type RdaToolSide = "read" | "write";

export type RdaJsonSchema = {
  type: "object";
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
};

export type RdaToolDefinition = {
  id: string;
  description: string;
  /** JSON Schema simplificado dos parâmetros. */
  parameters: RdaJsonSchema;
  /**
   * Permissão SystemUserPermissions (ou futura chave RDA).
   * Admin e full_access passam. Sem chave explícita no user → negado.
   */
  requiredPermission: RdaPermissionKey | null;
  side: RdaToolSide;
  requiresHumanConfirmation: boolean;
  /**
   * Se false, a tool não entra no registry “de produção” (só testes).
   * Default true quando omitido no register.
   */
  enabled?: boolean;
};

export type RdaToolValidationResult =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; error: string };

export type RdaAuthorizationDeniedReason =
  | "feature_disabled"
  | "tool_not_found"
  | "tool_disabled"
  | "permission_denied"
  | "confirmation_required"
  | "invalid_params";

export type RdaAuthorizationResult =
  | { allowed: true; tool: RdaToolDefinition; params: Record<string, unknown> }
  | { allowed: false; reason: RdaAuthorizationDeniedReason; message: string };

export type RdaProviderId = "noop" | "openai";

export type RdaLlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
};

export type RdaLlmCompleteRequest = {
  messages: RdaLlmMessage[];
  /** IDs de tools do registry a expor ao modelo (futuro). */
  toolIds?: string[];
};

export type RdaLlmCompleteResult = {
  provider: RdaProviderId;
  content: string;
  raw?: unknown;
};

export type RdaEventKind =
  | "service_order.created"
  | "service_order.stage_changed"
  | "service_order.finalized"
  | "budget.approved"
  | "rda.insight_requested"
  | "rda.command";

export type RdaSystemEvent = {
  id: string;
  kind: RdaEventKind;
  workshopId?: string;
  occurredAt: string;
  payload: Record<string, unknown>;
};

export type RdaAuditEntry = {
  id: string;
  at: string;
  actorRole: RdaRole;
  actorUserId?: string;
  toolId?: string;
  eventKind?: RdaEventKind;
  allowed: boolean;
  reason?: string;
  detail?: Record<string, unknown>;
};
