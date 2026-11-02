/**
 * Selftest da fundação RDA Intelligence (Fase 0).
 * Rode: npm run test:rda-foundation
 * Exit 0 = ok; exit 1 = falha.
 */
import {
  authorizeToolInvocation,
  createRdaEventBus,
  createRdaSystemEvent,
  createRdaToolRegistry,
  describeRdaFeatureFlag,
  openAiRdaProvider,
  parseRdaEnabledFlag,
  resolveRdaIntelligenceEnabled,
  resolveRdaLlmProvider,
  validateToolParams,
  type RdaToolDefinition,
} from "../services/rdaIntelligence/index.js";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string): void {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

async function expectThrow(fn: () => Promise<unknown>, msg: string): Promise<void> {
  try {
    await fn();
    assert(false, `${msg} (deveria lançar)`);
  } catch {
    assert(true, msg);
  }
}

console.log("RDA Foundation selftest\n");

console.log("1) Feature flag default false");
assert(parseRdaEnabledFlag(undefined) === false, "undefined → false");
assert(parseRdaEnabledFlag(null) === false, "null → false");
assert(parseRdaEnabledFlag("") === false, "empty → false");
assert(parseRdaEnabledFlag("false") === false, "false → false");
assert(parseRdaEnabledFlag("TRUE") === true, "TRUE → true");
assert(
  resolveRdaIntelligenceEnabled({ settingValue: null, envValue: null }) === false,
  "resolve default false"
);
assert(
  describeRdaFeatureFlag({ settingValue: null, envValue: null }).enabled === false,
  "describe default false"
);
assert(
  describeRdaFeatureFlag({ settingValue: null, envValue: null }).defaultEnabled === false,
  "defaultEnabled === false"
);
assert(
  describeRdaFeatureFlag({ settingValue: null, envValue: null }).source === "default",
  "source default"
);

console.log("\n2) Tool registry + param validation");
const registry = createRdaToolRegistry();
assert(registry.size === 0, "registry inicia vazio");

const readTool: RdaToolDefinition = {
  id: "test.ping",
  description: "Tool de teste somente leitura",
  parameters: {
    type: "object",
    properties: { message: { type: "string" } },
    required: [],
    additionalProperties: false,
  },
  requiredPermission: "access_patio",
  side: "read",
  requiresHumanConfirmation: false,
};

const writeTool: RdaToolDefinition = {
  id: "test.mutate",
  description: "Tool de teste escrita",
  parameters: {
    type: "object",
    properties: { id: { type: "string" } },
    required: ["id"],
    additionalProperties: false,
  },
  requiredPermission: "patio_edit_budgets",
  side: "write",
  requiresHumanConfirmation: true,
};

registry.register(readTool);
registry.register(writeTool);
assert(registry.has("test.ping"), "ping registrada");
assert(registry.list().length === 2, "2 tools listadas");

const badParams = validateToolParams(writeTool.parameters, {});
assert(badParams.ok === false, "params sem id inválidos");
const goodParams = validateToolParams(writeTool.parameters, { id: "x" });
assert(goodParams.ok === true, "params com id válidos");
const extraParams = validateToolParams(writeTool.parameters, { id: "x", nope: 1 });
assert(extraParams.ok === false, "additionalProperties false rejeita extras");

console.log("\n3) Autorização fail-closed");
const deniedFlag = authorizeToolInvocation({
  registry,
  auth: { role: "admin" },
  toolId: "test.ping",
  featureEnabled: false,
});
assert(deniedFlag.allowed === false && !deniedFlag.allowed && deniedFlag.reason === "feature_disabled", "flag off nega admin");

const deniedUnknown = authorizeToolInvocation({
  registry,
  auth: { role: "admin" },
  toolId: "test.unknown",
  featureEnabled: true,
});
assert(
  deniedUnknown.allowed === false && deniedUnknown.reason === "tool_not_found",
  "tool inexistente negada"
);

const deniedPerms = authorizeToolInvocation({
  registry,
  auth: { role: "user", userId: "u1", permissions: { access_agenda: true } },
  toolId: "test.ping",
  featureEnabled: true,
});
assert(
  deniedPerms.allowed === false && deniedPerms.reason === "permission_denied",
  "user sem access_patio negado"
);

const deniedNoPermMap = authorizeToolInvocation({
  registry,
  auth: { role: "user", userId: "u1" },
  toolId: "test.ping",
  featureEnabled: true,
});
assert(
  deniedNoPermMap.allowed === false && deniedNoPermMap.reason === "permission_denied",
  "user sem mapa de permissões negado"
);

const deniedConfirm = authorizeToolInvocation({
  registry,
  auth: { role: "admin" },
  toolId: "test.mutate",
  params: { id: "1" },
  featureEnabled: true,
  humanConfirmed: false,
});
assert(
  deniedConfirm.allowed === false && deniedConfirm.reason === "confirmation_required",
  "write exige confirmação"
);

const allowedRead = authorizeToolInvocation({
  registry,
  auth: { role: "user", permissions: { access_patio: true } },
  toolId: "test.ping",
  featureEnabled: true,
});
assert(allowedRead.allowed === true, "user com access_patio autorizado no ping");

const allowedWrite = authorizeToolInvocation({
  registry,
  auth: { role: "admin" },
  toolId: "test.mutate",
  params: { id: "1" },
  featureEnabled: true,
  humanConfirmed: true,
});
assert(allowedWrite.allowed === true, "admin + confirm autoriza write");

const fullAccess = authorizeToolInvocation({
  registry,
  auth: { role: "user", permissions: { full_access: true } },
  toolId: "test.ping",
  featureEnabled: true,
});
assert(fullAccess.allowed === true, "full_access autoriza");

console.log("\n4) Providers sem rede");
const providerOff = resolveRdaLlmProvider({ featureEnabled: false });
assert(providerOff.id === "noop", "feature off → noop");
await expectThrow(() => providerOff.complete({ messages: [] }), "noop.complete lança");
await expectThrow(
  () => openAiRdaProvider.complete({ messages: [{ role: "user", content: "hi" }] }),
  "openai.complete lança sem chamar rede"
);

console.log("\n5) Event bus no-op com flag off");
const bus = createRdaEventBus();
let hits = 0;
bus.on("*", () => {
  hits += 1;
});
const pubOff = await bus.publish(createRdaSystemEvent("rda.command", { x: 1 }), {
  featureEnabled: false,
});
assert(pubOff.accepted === false && pubOff.delivered === 0 && hits === 0, "publish off não entrega");
const pubOn = await bus.publish(createRdaSystemEvent("rda.command", { x: 1 }), {
  featureEnabled: true,
});
assert(pubOn.accepted === true && pubOn.delivered === 1 && hits === 1, "publish on entrega");

console.log("\n6) Production registry permanece vazio (sem tools de dados)");
const { productionRdaToolRegistry } = await import("../services/rdaIntelligence/index.js");
assert(productionRdaToolRegistry.list().length === 0, "production registry vazio");

console.log(`\nResultado: ${passed} ok, ${failed} falhas`);
if (failed > 0) process.exit(1);
process.exit(0);
