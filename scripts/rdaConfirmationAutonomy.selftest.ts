/**
 * Selftest: autonomia inteligente e confirmações (sem LLM/banco).
 * npm run test:rda-confirmation-autonomy
 */
import {
  authorizeToolInvocation,
  buildAuthenticatedActorSystemBlock,
  buildSaoPauloTemporalHint,
  isAffirmativeConfirmationText,
  looksLikeOperationalTaskRequest,
  needsHumanConfirmation,
  productionRdaToolRegistry,
  resolveConfirmationPolicy,
  summarizePendingToolCall,
} from "../services/rdaIntelligence/index.js";
import { ensureProductionRdaToolsRegistered } from "../services/rdaIntelligence/tools/registerProduction.js";
import { looksLikePermanentGuidance } from "../services/rdaIntelligence/knowledge/rules.js";
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
console.log("RDA confirmation autonomy selftest\n");

const manager: RdaAuthContext = {
  role: "user",
  userId: "m1",
  username: "gestor",
  permissions: { full_access: true, access_radar_qualidade: true, access_home: true },
};
const tech: RdaAuthContext = {
  role: "user",
  userId: "t1",
  username: "tec",
  permissions: { access_patio: true, access_home: true },
};

console.log("1) Políticas por tool");
{
  const create = productionRdaToolRegistry.get("rda_productivity_create_task")!;
  const reminder = productionRdaToolRegistry.get("rda_productivity_create_reminder")!;
  const reassign = productionRdaToolRegistry.get("rda_productivity_reassign")!;
  const update = productionRdaToolRegistry.get("rda_productivity_update_status")!;
  const knowledge = productionRdaToolRegistry.get("rda_propose_knowledge")!;
  const openOs = productionRdaToolRegistry.get("rda_propose_open_service_order")!;
  assert(resolveConfirmationPolicy(create) === "auto", "create_task auto");
  assert(resolveConfirmationPolicy(reminder) === "auto", "reminder auto");
  assert(resolveConfirmationPolicy(reassign) === "auto", "reassign auto");
  assert(resolveConfirmationPolicy(update) === "auto", "update_status auto");
  assert(resolveConfirmationPolicy(knowledge) === "protected", "knowledge protected");
  assert(resolveConfirmationPolicy(openOs) === "confirm_once", "open OS confirm_once");
  assert(!needsHumanConfirmation(create, false), "create sem humanConfirmed ok");
  assert(needsHumanConfirmation(knowledge, false), "knowledge exige confirm");
  assert(!needsHumanConfirmation(knowledge, true), "knowledge com confirm ok");
}

console.log("\n2) Gestor cria/delega direto; tech não reatribui");
{
  const createOk = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: manager,
    toolId: "rda_productivity_create_task",
    params: {
      title: "Organizar carrinho e ferramentas",
      assigneeName: "Fernando",
      dueAt: "2026-11-11T09:00:00-03:00",
    },
    featureEnabled: true,
  });
  assert(createOk.allowed === true, "gestor cria tarefa sem confirmação");

  const reassignOk = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: manager,
    toolId: "rda_productivity_reassign",
    params: {
      taskId: "00000000-0000-0000-0000-000000000001",
      assigneeName: "Fernando",
    },
    featureEnabled: true,
  });
  assert(reassignOk.allowed === true, "gestor reatribui direto");

  const techCreate = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: tech,
    toolId: "rda_productivity_create_task",
    params: { title: "Minha tarefa" },
    featureEnabled: true,
  });
  assert(techCreate.allowed === true, "tech cria própria (ACL create; delegação no service)");

  const techReassign = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: tech,
    toolId: "rda_productivity_reassign",
    params: {
      taskId: "00000000-0000-0000-0000-000000000001",
      assigneeName: "Fernando",
    },
    featureEnabled: true,
  });
  assert(techReassign.allowed === false, "tech sem radar não reatribui");
}

console.log("\n3) Identidade autenticada no bloco de sistema");
{
  const block = buildAuthenticatedActorSystemBlock(manager);
  assert(block.includes("m1"), "inclui userId");
  assert(block.includes("gestor") || block.includes("full_access"), "inclui permissões/papel");
  assert(/não peça/i.test(block), "não pedir identificação de novo");
}

console.log("\n4) Datas America/Sao_Paulo e pedido operacional");
{
  const hint = buildSaoPauloTemporalHint(
    "Amanhã às 9h o Fernando precisa organizar o carrinho",
    new Date("2026-11-10T15:00:00.000Z")
  );
  assert(!!hint && hint.includes("America/Sao_Paulo"), "hint com fuso");
  assert(!!hint && hint.includes("2026-11-11"), "amanhã → dia seguinte");
  assert(!!hint && /T09:00:00-03:00/.test(hint), "9h no fuso -03");
  assert(
    looksLikeOperationalTaskRequest(
      "Amanhã às 9h o Fernando precisa organizar o carrinho e as ferramentas"
    ),
    "pedido operacional detectado"
  );
  assert(
    !looksLikePermanentGuidance(
      "Amanhã às 9h o Fernando precisa organizar o carrinho"
    ) ||
      looksLikeOperationalTaskRequest(
        "Amanhã às 9h o Fernando precisa organizar o carrinho"
      ),
    "não tratar tarefa como regra permanente exclusiva"
  );
}

console.log("\n5) Confirmação textual e resumo de ação");
{
  assert(isAffirmativeConfirmationText("Confirmo"), "Confirmo");
  assert(isAffirmativeConfirmationText("Sim"), "Sim");
  assert(isAffirmativeConfirmationText("Pode fazer"), "Pode fazer");
  assert(!isAffirmativeConfirmationText("Confirmo a abertura da OS proposta e mais texto longo demais para ser só afirmação"), "frase longa não é só afirmação");
  assert(
    summarizePendingToolCall("rda_propose_open_service_order", {
      serviceOrderId: "abc",
    }).includes("OS"),
    "resumo OS"
  );
  assert(
    summarizePendingToolCall("rda_productivity_create_task", {
      title: "Organizar",
    }).includes("Organizar"),
    "resumo tarefa"
  );
}

console.log("\n6) UI sem frase fixa de OS; pending actions");
{
  const ui = readFileSync(
    join(process.cwd(), "components/rda/RdaAssistantPanel.tsx"),
    "utf8"
  );
  assert(!ui.includes("Confirmo a abertura da OS proposta."), "sem frase fixa de OS");
  assert(ui.includes("confirmActionIds"), "envia confirmActionIds");
  assert(ui.includes("Cancelar"), "botão Cancelar");
  assert(ui.includes("Confirmação única"), "rótulo confirmação única");
  const orch = readFileSync(
    join(process.cwd(), "services/rdaIntelligence/agent/orchestrator.ts"),
    "utf8"
  );
  assert(orch.includes("confirmActionIds"), "orchestrator confirma por id");
  assert(orch.includes("createPendingAction"), "cria pending com params");
  assert(orch.includes("buildAuthenticatedActorSystemBlock"), "injeta identidade");
}

console.log("\n7) Separação tarefa / OS / lembrete / memória");
{
  assert(
    resolveConfirmationPolicy(
      productionRdaToolRegistry.get("rda_productivity_create_task")!
    ) === "auto",
    "tarefa auto"
  );
  assert(
    resolveConfirmationPolicy(
      productionRdaToolRegistry.get("rda_productivity_create_reminder")!
    ) === "auto",
    "lembrete auto"
  );
  assert(
    resolveConfirmationPolicy(
      productionRdaToolRegistry.get("rda_propose_open_service_order")!
    ) === "confirm_once",
    "OS confirm_once"
  );
  assert(
    resolveConfirmationPolicy(
      productionRdaToolRegistry.get("rda_propose_knowledge")!
    ) === "protected",
    "memória protected"
  );
}

console.log("\n8) Write legado ainda exige confirmação (fail-safe)");
{
  // Tool de teste implícita: qualquer write sem confirmationPolicy=auto.
  const openOs = productionRdaToolRegistry.get("rda_propose_open_service_order")!;
  const denied = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: manager,
    toolId: openOs.id,
    params: { serviceOrderId: "00000000-0000-0000-0000-000000000099" },
    featureEnabled: true,
  });
  assert(
    denied.allowed === false && denied.reason === "confirmation_required",
    "open OS sem confirm → confirmation_required"
  );
  const ok = authorizeToolInvocation({
    registry: productionRdaToolRegistry,
    auth: manager,
    toolId: openOs.id,
    params: { serviceOrderId: "00000000-0000-0000-0000-000000000099" },
    humanConfirmed: true,
    featureEnabled: true,
  });
  assert(ok.allowed === true, "open OS com confirm → ok");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
