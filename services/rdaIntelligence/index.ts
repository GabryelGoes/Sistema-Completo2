/**
 * RDA Intelligence — motor + tools + tempo/avaliações.
 * Registrar tools de produção ao carregar o módulo.
 */
import { ensureProductionRdaToolsRegistered } from "./tools/registerProduction.js";
ensureProductionRdaToolsRegistered();

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

export { registerRdaWorkSessionRoutes } from "./workSessions/registerRdaWorkSessionRoutes.js";
export { formatDurationHms, newClientMutationId, computeLiveTotals } from "./workSessions/timing.js";
export {
  aggregateOsTimeIndicators,
  canStartOrResumeTimeKind,
  timeKindAllowedForOsStatus,
  timeKindsToAutoPauseOnStageChange,
  timeKindLabel,
  RDA_EXECUTION_OS_STATUS,
  RDA_DIAGNOSTIC_OS_STATUS,
  RDA_PAUSE_REASON_STAGE_CHANGE,
  type RdaWorkTimeKind,
} from "./workSessions/stageRules.js";
export {
  autoPauseWorkSessionsOnStageChange,
  listRunningWorkSessionIdsForKinds,
  applyAutoPauseKindsToRunning,
} from "./workSessions/autoPauseOnStageChange.js";
export type {
  RdaWorkSessionDto,
  RdaWorkPauseReason,
  RdaWorkPerformanceTechnicianRow,
} from "./workSessions/types.js";

export { runRdaChatTurn } from "./agent/orchestrator.js";
export {
  historyRowsToLlmMessages,
  sanitizeMessagesForOpenAi,
  toolCallsFromMetadata,
} from "./agent/openaiMessages.js";
export { runManagementScan } from "./insights/managementScan.js";
export { ensureProductionRdaToolsRegistered } from "./tools/registerProduction.js";
export { RDA_PRODUCTION_TOOLS } from "./tools/definitions.js";
export { executeRdaTool } from "./tools/executors.js";
export {
  RDA_ORDER_TYPE_PATIO,
  RDA_ORDER_TYPE_LAB,
  orderTypeToSector,
  parseSectorParam,
  sectorLabel,
  sectorToOrderType,
} from "./tools/orderTypes.js";

export {
  allowedKnowledgeVisibilitiesForAuth,
  assertVisibilityAllowedForAuth,
  canManageRdaKnowledge,
  canProposeRdaKnowledge,
  canViewRdaKnowledgeAdmin,
} from "./knowledge/access.js";
export {
  applyApproveToHeader,
  applyProposeRevisionToHeader,
  citationKindForItem,
  concurrencyAllowsUpdate,
  findKnowledgeConflicts,
  isOfficialRetrievalEligible,
  looksLikePermanentGuidance,
  normalizeKnowledgeKey,
  shouldDeferItemMetadataUntilApprove,
} from "./knowledge/rules.js";
export { registerRdaKnowledgeRoutes } from "./knowledge/registerKnowledgeRoutes.js";
export {
  RDA_KNOWLEDGE_CATEGORIES,
  RDA_KNOWLEDGE_LIFECYCLES,
  type RdaKnowledgeDto,
} from "./knowledge/types.js";

export {
  canViewOperationalIntelligence,
  canViewTechnicianTimeBreakdown,
} from "./operationalLearning/access.js";
export {
  buildDistribution,
  confidenceFromSamples,
  formatDurationPt,
  medianMs,
  percentileNearestRank,
} from "./operationalLearning/stats.js";
export {
  definitiveOccurrenceDurations,
  definitiveProductiveValues,
  serviceKeyFromDescription,
  serviceOccurrenceKey,
  toSessionFact,
  bucketTotals,
} from "./operationalLearning/sessionFacts.js";
export {
  buildOverview,
  buildPauseReasonRows,
  buildServiceDurationRows,
  buildTechnicianBreakdown,
  clampOpsLimit,
  clampOpsOffset,
} from "./operationalLearning/aggregations.js";
export {
  attributePauseIntervalsToPeriod,
  computePauseIntervals,
  intervalsOverlappingPeriod,
} from "./operationalLearning/pauseIntervals.js";
export {
  factsForPeriodAnalysis,
  finishedSessionInPeriod,
  openSessionRelevantToPeriod,
  partitionFactsByPeriod,
} from "./operationalLearning/periodAttribution.js";
export { detectOperationalPatterns } from "./operationalLearning/patterns.js";
export { registerOperationalLearningRoutes } from "./operationalLearning/registerOperationalLearningRoutes.js";
export {
  OPS_SESSION_SELECT_PRODUCTION,
  OPS_QUERY_DEFAULT_LIMIT,
  OPS_QUERY_MAX_LIMIT,
  OPS_QUERY_MAX_ROWS,
} from "./operationalLearning/types.js";

export {
  canConfigurePatioThresholds,
  canViewPatioIntelligence,
} from "./patioIntelligence/access.js";
export {
  buildPatioDashboard,
  buildProductiveContext,
  detectDeliveryRisks,
  detectPatioBottlenecks,
  enrichOrderFact,
  formatStageTimeLabel,
  ordersReadyToStart,
  suggestPatioPriorities,
} from "./patioIntelligence/analysis.js";
export { recordServiceOrderStageEntry } from "./patioIntelligence/recordStageEntry.js";
export {
  PATIO_STAGE_IDS,
  PATIO_STAGE_LABELS,
  patioStageLabel,
} from "./patioIntelligence/stages.js";
export {
  DEFAULT_PATIO_STAGE_THRESHOLD_HOURS,
  parsePatioThresholds,
  RDA_PATIO_THRESHOLDS_SETTING_KEY,
  thresholdHoursForStatus,
} from "./patioIntelligence/thresholds.js";
export { registerPatioIntelligenceRoutes } from "./patioIntelligence/registerPatioIntelligenceRoutes.js";
