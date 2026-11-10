/**
 * Selftest RDA Fase 6 — Assistente de Produtividade (sem banco).
 * npm run test:rda-productivity
 */
import {
  authorizeToolInvocation,
  buildProductivityDedupeKey,
  canManageProductivity,
  canUpdateTaskAsAssignee,
  canViewProductivity,
  normalizeProductivityPriority,
  normalizeProductivityStatus,
  productionRdaToolRegistry,
  severityForProductivityNotify,
} from "../services/rdaIntelligence/index.js";
import { ensureProductionRdaToolsRegistered } from "../services/rdaIntelligence/tools/registerProduction.js";
import type { RdaAuthContext } from "../services/rdaIntelligence/types.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
console.log("RDA productivity selftest (Fase 6)\n");

const admin: RdaAuthContext = { role: "admin", userId: "a1", username: "admin" };
const manager: RdaAuthContext = {
  role: "user",
  userId: "m1",
  username: "gestor",
  permissions: { access_radar_qualidade: true },
};
const tech: RdaAuthContext = {
  role: "user",
  userId: "t1",
  username: "tec",
  permissions: { access_patio: true, access_home: true },
};
const outsider: RdaAuthContext = {
  role: "user",
  userId: "o1",
  username: "sem",
  permissions: {},
};

console.log("1) Permissões view/manage");
{
  assert(canViewProductivity(admin), "admin view");
  assert(canManageProductivity(admin), "admin manage");
  assert(canViewProductivity(manager), "manager view");
  assert(canManageProductivity(manager), "manager manage");
  assert(canViewProductivity(tech), "tech view");
  assert(!canManageProductivity(tech), "tech não manage");
  assert(!canViewProductivity(outsider), "outsider sem view");
  assert(canUpdateTaskAsAssignee(tech, "t1"), "assignee próprio");
  assert(!canUpdateTaskAsAssignee(tech, "outro"), "assignee alheio");
}

console.log("\n2) Normalização de prioridade/status");
{
  assert(normalizeProductivityPriority("urgente") === "urgent", "urgente→urgent");
  assert(normalizeProductivityPriority("alta") === "high", "alta→high");
  assert(normalizeProductivityPriority("x") === "normal", "fallback normal");
  assert(normalizeProductivityStatus("pendente") === "pending", "pendente");
  assert(normalizeProductivityStatus("em_andamento") === "in_progress", "andamento");
  assert(normalizeProductivityStatus("concluída") === "done", "concluída");
  assert(normalizeProductivityStatus("cancelada") === "cancelled", "cancelada");
  assert(normalizeProductivityStatus("nope") === null, "status inválido");
}

console.log("\n3) Tools Fase 6 + confirmação humana");
{
  const ids = [
    "rda_productivity_list_tasks",
    "rda_productivity_list_overdue",
    "rda_productivity_summarize_pending",
    "rda_productivity_list_people",
    "rda_productivity_create_task",
    "rda_productivity_update_status",
    "rda_productivity_reassign",
    "rda_productivity_create_reminder",
  ];
  for (const id of ids) {
    assert(!!productionRdaToolRegistry.get(id), id);
  }
  const create = productionRdaToolRegistry.get("rda_productivity_create_task")!;
  assert(create.requiresHumanConfirmation === true, "create exige confirmação");
  assert(create.side === "write", "create write");
  const reassign = productionRdaToolRegistry.get("rda_productivity_reassign")!;
  assert(reassign.requiresHumanConfirmation === true, "reassign confirmação");
  assert(reassign.requiredPermission === "access_radar_qualidade", "reassign radar");

  const denied = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: tech,
    toolId: "rda_productivity_create_task",
    params: { title: "Revisar estoque" },
    featureEnabled: true,
  });
  assert(!denied.allowed, "write sem humanConfirmed bloqueia");
  const ok = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: tech,
    toolId: "rda_productivity_create_task",
    params: { title: "Revisar estoque" },
    humanConfirmed: true,
    featureEnabled: true,
  });
  assert(ok.allowed, "write com confirmação ok para tech (próprias)");
  const reassignDenied = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: tech,
    toolId: "rda_productivity_reassign",
    params: { taskId: "00000000-0000-0000-0000-000000000001", assigneeName: "João" },
    humanConfirmed: true,
    featureEnabled: true,
  });
  assert(!reassignDenied.allowed, "tech não reatribui");
  const reassignOk = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: manager,
    toolId: "rda_productivity_reassign",
    params: { taskId: "00000000-0000-0000-0000-000000000001", assigneeName: "João" },
    humanConfirmed: true,
    featureEnabled: true,
  });
  assert(reassignOk.allowed, "manager reatribui");
}

console.log("\n4) Notificações: severidade e dedupe estável");
{
  assert(severityForProductivityNotify("overdue") === "critical", "overdue critical");
  assert(severityForProductivityNotify("due_soon") === "warning", "due_soon warning");
  assert(severityForProductivityNotify("assigned") === "info", "assigned info");
  const d1 = buildProductivityDedupeKey("overdue", "task-1", "", "2026-11-10");
  const d2 = buildProductivityDedupeKey("overdue", "task-1", "", "2026-11-10");
  assert(d1 === d2, "dedupe overdue estável no dia");
  assert(d1 === "overdue:task-1:2026-11-10", "formato overdue");
  const a1 = buildProductivityDedupeKey("assigned", "task-9");
  const a2 = buildProductivityDedupeKey("assigned", "task-9");
  assert(a1 === a2 && a1 === "assigned:task-9", "assigned sem Date.now");
}

console.log("\n5) Migration local presente (não aplicada aqui)");
{
  const sql = readFileSync(
    join(process.cwd(), "supabase/migrations/20261110010000_rda_productivity_tasks.sql"),
    "utf8"
  );
  assert(sql.includes("rda_productivity_tasks"), "tabela tasks");
  assert(sql.includes("rda_productivity_task_events"), "tabela events");
  assert(sql.includes("rda_productivity_notification_dedupe"), "tabela dedupe");
  assert(sql.includes("ENABLE ROW LEVEL SECURITY"), "RLS");
  assert(sql.includes("client_request_id"), "idempotência");
}

console.log("\n6) Cron tick e painel UI no repo");
{
  const vercel = readFileSync(join(process.cwd(), "vercel.json"), "utf8");
  assert(vercel.includes("/api/rda/productivity/deadlines/tick"), "cron tick produtividade");
  assert(vercel.includes("/api/rda/proactive/scan/cron"), "cron proativo preservado");
  const panel = readFileSync(
    join(process.cwd(), "components/rda/RdaProductivityPanel.tsx"),
    "utf8"
  );
  assert(panel.includes("RdaSettingsChildShell"), "painel usa shell");
  const assistant = readFileSync(
    join(process.cwd(), "components/rda/RdaAssistantPanel.tsx"),
    "utf8"
  );
  assert(assistant.includes("webkitSpeechRecognition"), "voz no chat");
  assert(assistant.includes("Revise") || assistant.includes("revis"), "revisão antes do envio");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
