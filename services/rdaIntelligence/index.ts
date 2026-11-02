/**
 * RDA Intelligence — fundação (Fase 0).
 * Export público do módulo. Sem side effects ao importar.
 */

export {
  RDA_INTELLIGENCE_SETTING_KEY,
  RDA_INTELLIGENCE_ENV_KEY,
  RDA_ALLOW_LLM_CALLS_ENV_KEY,
  type RdaAuthContext,
  type RdaToolDefinition,
  type RdaAuthorizationResult,
  type RdaProviderId,
  type RdaSystemEvent,
  type RdaAuditEntry,
} from "./types.js";

export {
  parseRdaEnabledFlag,
  resolveRdaIntelligenceEnabled,
  describeRdaFeatureFlag,
} from "./featureFlag.js";

export {
  authorizeToolInvocation,
  authAllowsToolPermission,
  authHasFullAccess,
} from "./permissions.js";

export {
  RdaToolRegistry,
  createRdaToolRegistry,
  productionRdaToolRegistry,
} from "./tools/registry.js";

export { validateToolParams } from "./tools/validators.js";

export { NoopRdaProvider, noopRdaProvider } from "./providers/noop.js";
export { OpenAiRdaProvider, openAiRdaProvider } from "./providers/openai.js";
export { resolveRdaLlmProvider } from "./providers/resolve.js";
export { RdaProviderDisabledError, type RdaLlmProvider } from "./providers/types.js";

export {
  RdaEventBus,
  createRdaEventBus,
  createRdaSystemEvent,
  productionRdaEventBus,
} from "./events/bus.js";

export { RdaMemoryAuditLog, productionRdaAuditLog } from "./audit/memoryLog.js";

export {
  RDA_MANAGERIAL_HUB_BLUEPRINT_VERSION,
  type RdaManagerialEvaluationDraft,
  type RdaWorkSessionBlueprint,
  type RdaPerformanceSignal,
} from "./future/managerialHubBlueprint.js";

export {
  registerRdaIntelligenceRoutes,
  type RegisterRdaIntelligenceRoutesDeps,
} from "./registerRdaRoutes.js";
