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

export {
  canConfigureLabThresholds,
  canViewLabEstoqueIntelligence,
  canViewLabIntelligence,
  canViewStockIntelligence,
} from "./labEstoqueIntelligence/access.js";
export {
  buildLabBenchOccupancy,
  buildLabEstoqueDashboard,
  buildStockSummary,
  detectLabBottlenecks,
  enrichAbsUnit,
  enrichLabOrderFact,
  formatLabTimeLabel,
  formatStageTimeLabel as formatLabStageTimeLabel,
  listLongestInLab,
  listReadyForPickup,
} from "./labEstoqueIntelligence/analysis.js";
export {
  LAB_BENCH_SLOT_COUNT,
  LAB_STAGE_IDS,
  LAB_STAGE_LABELS,
  labStageLabel,
} from "./labEstoqueIntelligence/stages.js";
export {
  DEFAULT_LAB_STAGE_THRESHOLD_HOURS,
  parseLabThresholds,
  RDA_LAB_THRESHOLDS_SETTING_KEY,
  thresholdHoursForLabStatus,
} from "./labEstoqueIntelligence/thresholds.js";
export { registerLabEstoqueIntelligenceRoutes } from "./labEstoqueIntelligence/registerLabEstoqueIntelligenceRoutes.js";

export {
  canAccessProactiveCategory,
  canConfigureProactiveMonitor,
  canMutateProactiveAlerts,
  canViewProactiveIntelligence,
  allowedProactiveCategories,
} from "./proactiveIntelligence/access.js";
export {
  DEFAULT_PROACTIVE_MONITOR_CONFIG,
  parseProactiveMonitorConfig,
  RDA_PROACTIVE_ENABLED_KEY,
  RDA_PROACTIVE_INTERVAL_MINUTES_KEY,
  RDA_PROACTIVE_NOTIFY_KEY,
  RDA_PROACTIVE_REOPEN_HOURS_KEY,
} from "./proactiveIntelligence/config.js";
export { buildRecommendation, formatAlertBody } from "./proactiveIntelligence/recommendations.js";
export { detectProactiveAlerts } from "./proactiveIntelligence/detectors.js";
export { runProactiveScan } from "./proactiveIntelligence/runner.js";
export {
  filterAlertsForAuth,
  queryProactiveAlertsForAssistant,
  queryProactiveDashboard,
  loadProactiveMonitorConfig,
  saveProactiveMonitorConfig,
} from "./proactiveIntelligence/service.js";
export { registerProactiveIntelligenceRoutes } from "./proactiveIntelligence/registerProactiveIntelligenceRoutes.js";
export type {
  ProactiveAlertDraft,
  ProactiveAlertStatus,
  ProactiveAlertView,
  ProactiveCategory,
  ProactiveMonitorConfig,
  ProactiveScanResult,
  ProactiveSeverity,
} from "./proactiveIntelligence/types.js";

export {
  canAccessProductivityTask,
  canManageProductivity,
  canUpdateTaskAsAssignee,
  canViewProductivity,
  validateAssigneeFilterAccess,
  validateDelegationAccess,
} from "./productivity/access.js";
export {
  createProductivityTask,
  listAssignablePeople,
  listProductivityTasks,
  runProductivityDeadlineTick,
  summarizePendingTasks,
  updateProductivityTask,
  normalizePriority as normalizeProductivityPriority,
  normalizeStatus as normalizeProductivityStatus,
} from "./productivity/service.js";
export { registerProductivityRoutes } from "./productivity/registerProductivityRoutes.js";
export {
  buildProductivityDedupeKey,
  notifyProductivityEvent,
  reserveProductivityDedupeKey,
  severityForProductivityNotify,
  titleForProductivityNotify,
} from "./productivity/notifications.js";
export type {
  ProductivityNotifyKind,
  ReserveDedupeResult,
} from "./productivity/notifications.js";
export type {
  CreateProductivityTaskInput,
  ProductivityAssignablePerson,
  ProductivityPendingSummary,
  ProductivityTaskFilters,
  ProductivityTaskPriority,
  ProductivityTaskStatus,
  ProductivityTaskView,
  UpdateProductivityTaskInput,
} from "./productivity/types.js";
