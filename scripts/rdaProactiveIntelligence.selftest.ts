/**
 * Selftest Monitoramento Proativo (Fase 5) — sem banco.
 * npm run test:rda-proactive
 */
import {
  authorizeToolInvocation,
  buildRecommendation,
  canConfigureProactiveMonitor,
  canViewProactiveIntelligence,
  allowedProactiveCategories,
  detectProactiveAlerts,
  formatAlertBody,
  parseProactiveMonitorConfig,
  productionRdaToolRegistry,
  DEFAULT_PROACTIVE_MONITOR_CONFIG,
} from "../services/rdaIntelligence/index.js";
import { ensureProductionRdaToolsRegistered } from "../services/rdaIntelligence/tools/registerProduction.js";
import type { RdaAuthContext } from "../services/rdaIntelligence/types.js";
import type { ProactiveAlertDraft } from "../services/rdaIntelligence/proactiveIntelligence/types.js";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

ensureProductionRdaToolsRegistered();
console.log("RDA proactive intelligence selftest (Fase 5)\n");

console.log("1) Config defaults e parse");
{
  assert(DEFAULT_PROACTIVE_MONITOR_CONFIG.intervalMinutes === 30, "interval 30");
  assert(DEFAULT_PROACTIVE_MONITOR_CONFIG.enabled === true, "enabled default");
  const off = parseProactiveMonitorConfig({
    rda_proactive_monitor_enabled: "false",
    rda_proactive_interval_minutes: "15",
    rda_proactive_reopen_after_hours: "48",
    rda_proactive_notify_on_create: "0",
  });
  assert(off.enabled === false, "disabled");
  assert(off.intervalMinutes === 15, "interval 15");
  assert(off.reopenAfterHours === 48, "reopen 48");
  assert(off.notifyOnCreate === false, "notify off");
  const clamp = parseProactiveMonitorConfig({
    rda_proactive_interval_minutes: "2",
  });
  assert(clamp.intervalMinutes === 30, "interval clamp invalid → default");
}

console.log("\n2) Permissões");
{
  assert(
    canViewProactiveIntelligence({ role: "admin", flags: null }),
    "admin view"
  );
  assert(
    canConfigureProactiveMonitor({
      role: "user",
      userId: "u",
      flags: { isTechnician: false, permissions: { access_radar_qualidade: true } },
    }),
    "radar configure"
  );
  assert(
    !canConfigureProactiveMonitor({
      role: "user",
      userId: "u",
      flags: { isTechnician: false, permissions: { access_patio: true } },
    }),
    "patio não configura"
  );
  const cats = allowedProactiveCategories({
    role: "user",
    flags: { isTechnician: false, permissions: { access_estoque_pecas: true } },
    permissions: { access_estoque_pecas: true },
  });
  assert(cats.includes("estoque") && cats.length === 1, "só estoque");
}

console.log("\n3) Recomendações e body");
{
  const rec = buildRecommendation({ category: "patio", kind: "waiting_parts" });
  assert(rec.includes("Recomendo"), "recomendação explícita");
  assert(rec.toLowerCase().includes("fornecedor"), "peças/fornecedor");
  const body = formatAlertBody({
    body: "Fato: 3 veículos.",
    evidence: "status=AGUARDANDO_PECAS",
    recommendation: rec,
  });
  assert(body.includes("Evidência:"), "evidência no body");
  assert(body.includes("Recomendação:"), "recomendação no body");
}

console.log("\n4) Tools Fase 5 registradas e autorizadas");
{
  for (const id of [
    "rda_proactive_alerts_attention",
    "rda_proactive_what_happened_today",
    "rda_proactive_unresolved",
    "rda_proactive_critical",
    "rda_proactive_recommend_first",
  ]) {
    assert(!!productionRdaToolRegistry.get(id), id);
  }
  const auth: RdaAuthContext = {
    role: "user",
    userId: "g",
    permissions: { access_radar_qualidade: true },
  };
  assert(
    authorizeToolInvocation({
      registry: productionRdaToolRegistry,
      auth,
      toolId: "rda_proactive_critical",
      featureEnabled: true,
    }).allowed,
    "tool critical autorizada"
  );
  const patioAuth: RdaAuthContext = {
    role: "user",
    userId: "p",
    permissions: { access_patio: true },
  };
  assert(
    authorizeToolInvocation({
      registry: productionRdaToolRegistry,
      auth: patioAuth,
      toolId: "rda_proactive_alerts_attention",
      featureEnabled: true,
    }).allowed,
    "patio pode listar alertas (filtro no executor)"
  );
}

console.log("\n5) Dedupe keys estáveis (rascunhos)");
{
  const drafts: ProactiveAlertDraft[] = [
    {
      alertKey: "patio:bottleneck:waiting_parts",
      category: "patio",
      severity: "critical",
      title: "Pátio: aguardando peças",
      body: "3 veículos",
      recommendation: buildRecommendation({ category: "patio", kind: "waiting_parts" }),
      evidence: "n=3",
    },
    {
      alertKey: "patio:bottleneck:waiting_parts",
      category: "patio",
      severity: "critical",
      title: "Pátio: aguardando peças",
      body: "3 veículos",
      recommendation: buildRecommendation({ category: "patio", kind: "waiting_parts" }),
      evidence: "n=3",
    },
  ];
  const keys = new Set(drafts.map((d) => d.alertKey));
  assert(keys.size === 1, "mesma chave = dedupe");
}

console.log("\n6) Detectores não quebram sem dados (supabase fake mínimo)");
{
  const calls: string[] = [];
  const fake = {
    from(table: string) {
      calls.push(table);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of [
        "select",
        "eq",
        "neq",
        "in",
        "is",
        "lt",
        "gt",
        "gte",
        "lte",
        "not",
        "or",
        "order",
        "limit",
        "insert",
        "update",
        "upsert",
      ]) {
        chain[m] = self;
      }
      chain.maybeSingle = async () => ({ data: null, error: null });
      chain.single = async () => ({ data: null, error: null });
      // thenable
      (chain as { then?: unknown }).then = (
        resolve: (v: { data: unknown[]; error: null }) => void
      ) => resolve({ data: [], error: null });
      return chain;
    },
  };
  const drafts = await detectProactiveAlerts({
    workshopId: "00000000-0000-0000-0000-000000000001",
    supabase: fake as never,
  });
  assert(Array.isArray(drafts), "detect retorna array");
  assert(drafts.every((d) => d.alertKey && d.recommendation), "cada draft tem key+rec");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
