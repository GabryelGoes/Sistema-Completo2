/**
 * Confirma remoção do cronômetro manual da ficha e preservação do monitoramento de etapa.
 * npm run test:remove-os-work-time-panel
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectPatioBottlenecks,
  enrichOrderFact,
  recordServiceOrderStageEntry,
} from "../services/rdaIntelligence/index.js";
import { DEFAULT_PATIO_STAGE_THRESHOLD_HOURS } from "../services/rdaIntelligence/patioIntelligence/thresholds.js";

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

const root = process.cwd();

console.log("Remove OsWorkTimePanel selftest\n");

console.log("1) Painel removido da ficha");
{
  const patio = readFileSync(join(root, "components/views/PatioView.tsx"), "utf8");
  const app = readFileSync(join(root, "App.tsx"), "utf8");
  assert(!patio.includes("OsWorkTimePanel"), "PatioView sem OsWorkTimePanel");
  assert(!patio.includes("workTimeTechnician"), "PatioView sem workTimeTechnician");
  assert(!app.includes("workTimeTechnician"), "App sem workTimeTechnician");
  assert(!patio.includes("Meu tempo nesta OS"), "PatioView sem título do painel");
}

console.log("\n2) Monitoramento de etapa preservado (código)");
{
  const api = readFileSync(join(root, "apiApp.ts"), "utf8");
  assert(api.includes("recordServiceOrderStageEntry"), "apiApp chama recordServiceOrderStageEntry");
  assert(
    typeof recordServiceOrderStageEntry === "function",
    "recordServiceOrderStageEntry exportado"
  );
  assert(
    /status_entered_at/.test(api) || api.includes("recordServiceOrderStageEntry"),
    "fluxo de mudança de etapa ligado à permanência"
  );
  const panel = readFileSync(join(root, "components/patio/OsWorkTimePanel.tsx"), "utf8");
  assert(panel.includes("Meu tempo nesta OS"), "arquivo do painel permanece (APIs/UI legado intacto)");
}

console.log("\n3) Gargalos independem de rda_work_sessions");
{
  const now = Date.parse("2026-11-05T12:00:00.000Z");
  const fact = enrichOrderFact(
    {
      id: "os-1",
      status: "AGUARDANDO_PECAS",
      status_entered_at: "2026-10-28T12:00:00.000Z",
      delivery_date: "2026-11-04T12:00:00.000Z",
      plate: "ABC1D23",
      os_number: 1,
      updated_at: "2026-11-05T10:00:00.000Z",
      created_at: "2026-10-20T12:00:00.000Z",
    },
    now
  );
  assert(fact.stageTimeKnown === true, "permanência conhecida via status_entered_at");
  assert((fact.hoursInStage ?? 0) >= 72, `horas na etapa = ${fact.hoursInStage}`);
  assert(!/cronômetro/i.test(fact.stageTimeLabel), `label: ${fact.stageTimeLabel}`);
  const bots = detectPatioBottlenecks([fact], {
    ...DEFAULT_PATIO_STAGE_THRESHOLD_HOURS,
  });
  assert(
    bots.some((b) => b.kind === "waiting_parts" || b.status === "AGUARDANDO_PECAS"),
    "gargalo por status_entered_at sem sessão de cronômetro"
  );
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
