/**
 * Tipos centrais do RDA Intelligence.
 * Sem dependência de UI; providers usam env só no servidor.
 */

/** Chave em `workshop_settings` (valor "true" | "false"; ausência = false). */
export const RDA_INTELLIGENCE_SETTING_KEY = "rda_intelligence_enabled" as const;

/** Variável de ambiente opcional (mesmo semântica; default desligado). */
export const RDA_INTELLIGENCE_ENV_KEY = "RDA_INTELLIGENCE_ENABLED" as const;

/**
 * Bloqueio duro de chamadas LLM.
 * Mesmo com OPENAI_API_KEY, só libera se isto for "true".
 */
export const RDA_ALLOW_LLM_CALLS_ENV_KEY = "RDA_ALLOW_LLM_CALLS" as const;

/** Modelo OpenAI (default gpt-4o-mini). */
export const RDA_OPENAI_MODEL_ENV_KEY = "RDA_OPENAI_MODEL" as const;

/** Limite diário de tokens por oficina (default 500000). */
export const RDA_DAILY_TOKEN_LIMIT_ENV_KEY = "RDA_DAILY_TOKEN_LIMIT" as const;

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

export type RdaLlmToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type RdaLlmMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
};

export type RdaOpenAiToolSpec = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type RdaLlmCompleteRequest = {
  messages: RdaLlmMessage[];
  /** Specs OpenAI (já filtradas/autorizáveis). */
  tools?: RdaOpenAiToolSpec[];
  toolChoice?: "auto" | "none";
  toolIds?: string[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
};

export type RdaLlmCompleteResult = {
  provider: RdaProviderId;
  content: string;
  toolCalls?: RdaLlmToolCall[];
  model?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  raw?: unknown;
};

export type RdaEventKind =
  | "service_order.created"
  | "service_order.stage_changed"
  | "service_order.finalized"
  | "budget.approved"
  | "rda.insight_requested"
  | "rda.command"
  | "rda.management_scan";

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
