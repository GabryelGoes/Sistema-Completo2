import { resolveRdaIntelligenceEnabled } from "./featureFlag.js";
import type { RdaToolRegistry } from "./tools/registry.js";
import { validateToolParams } from "./tools/validators.js";
import type {
  RdaAuthContext,
  RdaAuthorizationResult,
  RdaToolDefinition,
} from "./types.js";

export function authHasFullAccess(auth: RdaAuthContext): boolean {
  if (auth.role === "admin") return true;
  if (auth.permissions?.full_access === true) return true;
  return false;
}

/**
 * Verifica permissão de uma tool.
 * Default deny: user sem mapa de permissões, ou chave omitida/false → negado.
 */
export function authAllowsToolPermission(
  auth: RdaAuthContext,
  tool: RdaToolDefinition
): boolean {
  if (authHasFullAccess(auth)) return true;
  if (auth.role !== "user") return false;
  const perms = auth.permissions;
  if (!perms || typeof perms !== "object") return false;
  // Memória oficial: quem pode usar o assistente pode recuperar regras aprovadas.
  if (tool.id === "rda_search_approved_knowledge") {
    return (
      perms.access_home === true ||
      perms.access_patio === true ||
      perms.access_laboratorio === true ||
      perms.access_radar_qualidade === true
    );
  }
  // Fase 5: alertas proativos — gestão ou área operacional (filtro por categoria no executor).
  if (
    tool.id === "rda_proactive_alerts_attention" ||
    tool.id === "rda_proactive_what_happened_today" ||
    tool.id === "rda_proactive_unresolved" ||
    tool.id === "rda_proactive_critical" ||
    tool.id === "rda_proactive_recommend_first"
  ) {
    return (
      perms.access_radar_qualidade === true ||
      perms.access_patio === true ||
      perms.access_laboratorio === true ||
      perms.access_estoque_pecas === true
    );
  }
  // Fase 6: produtividade — quem usa o assistente pode ler/criar; reassign exige radar (requiredPermission).
  if (
    tool.id === "rda_productivity_list_tasks" ||
    tool.id === "rda_productivity_list_overdue" ||
    tool.id === "rda_productivity_summarize_pending" ||
    tool.id === "rda_productivity_list_people" ||
    tool.id === "rda_productivity_create_task" ||
    tool.id === "rda_productivity_update_status" ||
    tool.id === "rda_productivity_create_reminder"
  ) {
    return (
      perms.access_home === true ||
      perms.access_radar_qualidade === true ||
      perms.access_patio === true ||
      perms.access_laboratorio === true ||
      perms.access_estoque_pecas === true
    );
  }
  if (!tool.requiredPermission) {
    // Tool sem permissão específica: ainda exige usuário autenticado com perms conhecidas
    // e full_access já retornou true acima. Sem requiredPermission → só admin/full_access.
    return false;
  }
  return perms[tool.requiredPermission] === true;
}

export type AuthorizeToolInvocationInput = {
  registry: RdaToolRegistry;
  auth: RdaAuthContext;
  toolId: string;
  params?: unknown;
  /** Confirmação humana explícita para tools write/requiresHumanConfirmation. */
  humanConfirmed?: boolean;
  /** Flag da feature; se omitido, resolve default (false). */
  featureEnabled?: boolean;
  settingValue?: string | null;
  envValue?: string | null;
};

/**
 * Autorização server-side de invocação de tool.
 * Ordem: feature flag → existência → enabled → permissão → confirmação → params.
 * Qualquer falha → denied (fail closed).
 */
export function authorizeToolInvocation(
  input: AuthorizeToolInvocationInput
): RdaAuthorizationResult {
  const enabled =
    typeof input.featureEnabled === "boolean"
      ? input.featureEnabled
      : resolveRdaIntelligenceEnabled({
          settingValue: input.settingValue,
          envValue: input.envValue,
        });

  if (!enabled) {
    return {
      allowed: false,
      reason: "feature_disabled",
      message: "RDA Intelligence está desligado.",
    };
  }

  const tool = input.registry.get(input.toolId);
  if (!tool) {
    return {
      allowed: false,
      reason: "tool_not_found",
      message: `Ferramenta não registrada: ${input.toolId}.`,
    };
  }

  if (tool.enabled === false) {
    return {
      allowed: false,
      reason: "tool_disabled",
      message: `Ferramenta desabilitada: ${tool.id}.`,
    };
  }

  if (!authAllowsToolPermission(input.auth, tool)) {
    return {
      allowed: false,
      reason: "permission_denied",
      message: "Permissão insuficiente para esta ferramenta.",
    };
  }

  const needsConfirm =
    tool.requiresHumanConfirmation || tool.side === "write";
  if (needsConfirm && input.humanConfirmed !== true) {
    return {
      allowed: false,
      reason: "confirmation_required",
      message: "Confirmação humana obrigatória para esta ação.",
    };
  }

  const validated = validateToolParams(tool.parameters, input.params ?? {});
  if (validated.ok === false) {
    return {
      allowed: false,
      reason: "invalid_params",
      message: validated.error,
    };
  }

  return { allowed: true, tool, params: validated.params };
}
