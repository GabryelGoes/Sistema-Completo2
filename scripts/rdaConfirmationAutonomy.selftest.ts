/**
 * Selftest: autonomia inteligente e confirmações (sem LLM/banco).
 * npm run test:rda-confirmation-autonomy
 */
import {
  authorizeToolInvocation,
  buildAuthenticatedActorSystemBlock,
  buildSaoPauloTemporalHint,
  canAccessRdaConversation,
  canShareRdaConversations,
  claimPendingActionForExecution,
  classifyPendingRowDenial,
  EXECUTING_STALE_MS,
  isAffirmativeConfirmationText,
  isRdaConversationOwner,
  looksLikeOperationalTaskRequest,
  markPendingActionExecuted,
  needsHumanConfirmation,
  PENDING_REASON,
  pendingActorMatchesAuth,
  productionRdaToolRegistry,
  RDA_ADMIN_ACTOR_KEY,
  resolveConfirmationPolicy,
  resolveRdaActorKey,
  summarizePendingToolCall,
} from "../services/rdaIntelligence/index.js";
import { ensureProductionRdaToolsRegistered } from "../services/rdaIntelligence/tools/registerProduction.js";
import { looksLikePermanentGuidance } from "../services/rdaIntelligence/knowledge/rules.js";
import type { RdaAuthContext } from "../services/rdaIntelligence/types.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

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
const tech2: RdaAuthContext = {
  role: "user",
  userId: "t2",
  username: "tec2",
  permissions: { access_patio: true, access_home: true },
};
/** Login administrativo típico: role admin sem userId. */
const adminSession: RdaAuthContext = {
  role: "admin",
  username: "admin",
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
  assert(ok.allowed === true, "open OS com confirm server-side → ok");
}

console.log("\n9) Bypass client-side removido (humanConfirmedToolIds)");
{
  const ui = readFileSync(
    join(process.cwd(), "components/rda/RdaAssistantPanel.tsx"),
    "utf8"
  );
  const orch = readFileSync(
    join(process.cwd(), "services/rdaIntelligence/agent/orchestrator.ts"),
    "utf8"
  );
  const routes = readFileSync(
    join(process.cwd(), "services/rdaIntelligence/registerRdaRoutes.ts"),
    "utf8"
  );
  const api = readFileSync(
    join(process.cwd(), "services/apiService.ts"),
    "utf8"
  );
  assert(!ui.includes("humanConfirmedToolIds"), "UI sem humanConfirmedToolIds");
  assert(
    !/humanConfirmedToolIds\s*\?:/.test(api),
    "apiService sem humanConfirmedToolIds no postRdaChat"
  );
  assert(
    !routes.includes("body.humanConfirmedToolIds"),
    "rota chat não lê humanConfirmedToolIds"
  );
  assert(
    !orch.includes("input.humanConfirmedToolIds"),
    "orchestrator não usa humanConfirmedToolIds do input"
  );
  assert(
    orch.includes("humanConfirmed: false"),
    "loop LLM força humanConfirmed false"
  );
  assert(
    orch.includes("claimPendingActionForExecution"),
    "confirmação via claim atômico"
  );
  // Mesmo com humanConfirmed no authorize HTTP, rota ignora (false fixo).
  assert(
    routes.includes("humanConfirmed: false"),
    "authorize-tool ignora flag do cliente"
  );
}

console.log("\n10) Classificação: outro usuário, reuso, interrupção");
{
  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const meta = {
    kind: "rda_pending_action" as const,
    toolId: "rda_propose_open_service_order",
    params: { serviceOrderId: "00000000-0000-0000-0000-000000000099" },
    summary: "Abrir OS",
    expiresAt,
    conversationId: "c1",
    actorKey: "user:m1",
    actorRole: "user" as const,
  };
  const other = classifyPendingRowDenial({
    reason: PENDING_REASON.pending,
    meta: { ...meta, actorKey: "user:other-user" },
    actorUserId: "other-user",
    auth: manager,
  });
  assert(other.status === "forbidden", "ID de outro usuário → forbidden");

  const missingIds = classifyPendingRowDenial({
    reason: PENDING_REASON.pending,
    meta: { ...meta, actorKey: "" },
    actorUserId: null,
    auth: manager,
  });
  assert(
    missingIds.status === "forbidden",
    "actorKey/userId ausentes → forbidden (fail-closed)"
  );

  const reused = classifyPendingRowDenial({
    reason: PENDING_REASON.executed,
    meta,
    actorUserId: manager.userId,
    auth: manager,
  });
  assert(reused.status === "already_executed", "ação já executada → blocked");

  const failedReuse = classifyPendingRowDenial({
    reason: PENDING_REASON.failed,
    meta,
    actorUserId: manager.userId,
    auth: manager,
  });
  assert(failedReuse.status === "already_failed", "ação falha → não reutiliza");

  const inProgress = classifyPendingRowDenial({
    reason: PENDING_REASON.executing,
    meta: { ...meta, claimedAt: new Date().toISOString() },
    actorUserId: manager.userId,
    auth: manager,
  });
  assert(inProgress.status === "in_progress", "executing fresco → in_progress");

  const interrupted = classifyPendingRowDenial({
    reason: PENDING_REASON.executing,
    meta: {
      ...meta,
      claimedAt: new Date(Date.now() - EXECUTING_STALE_MS - 1000).toISOString(),
    },
    actorUserId: manager.userId,
    auth: manager,
  });
  assert(
    interrupted.status === "interrupted",
    "executing órfão → interrupted (não reexecuta)"
  );
}

console.log("\n11) Claim atômico: só uma requisição executa");
{
  type Row = {
    id: string;
    tool_id: string;
    params: Record<string, unknown>;
    result_summary: string;
    actor_user_id: string | null;
    actor_role: string;
    conversation_id: string;
    reason: string;
    workshop_id: string;
  };

  const expiresAt = new Date(Date.now() + 60_000).toISOString();
  const meta = {
    kind: "rda_pending_action",
    toolId: "rda_propose_open_service_order",
    params: { serviceOrderId: "00000000-0000-0000-0000-000000000099" },
    summary: "Abrir OS teste",
    expiresAt,
    conversationId: "conv-1",
    actorKey: "user:m1",
    actorRole: "user",
  };
  const store: Row[] = [
    {
      id: "act-1",
      tool_id: "rda_propose_open_service_order",
      params: meta.params,
      result_summary: JSON.stringify(meta),
      actor_user_id: "m1",
      actor_role: "user",
      conversation_id: "conv-1",
      reason: PENDING_REASON.pending,
      workshop_id: "ws-1",
    },
  ];

  function makeClient(): SupabaseClient {
    const api = {
      from(_table: string) {
        let filters: Record<string, string> = {};
        let updatePayload: Record<string, unknown> | null = null;
        const chain: Record<string, unknown> = {};
        const applySelect = () => {
          const rows = store.filter((r) => {
            if (filters.workshop_id && r.workshop_id !== filters.workshop_id)
              return false;
            if (
              filters.conversation_id &&
              r.conversation_id !== filters.conversation_id
            )
              return false;
            if (filters.id && r.id !== filters.id) return false;
            if (filters.reason && r.reason !== filters.reason) return false;
            return true;
          });
          return rows;
        };
        chain.select = () => chain;
        chain.eq = (col: string, val: string) => {
          filters[col] = val;
          return chain;
        };
        chain.in = () => chain;
        chain.order = () => chain;
        chain.limit = () => chain;
        chain.maybeSingle = async () => {
          const rows = applySelect();
          return { data: rows[0] || null, error: null };
        };
        chain.single = async () => {
          const rows = applySelect();
          return { data: rows[0] || null, error: null };
        };
        chain.update = (payload: Record<string, unknown>) => {
          updatePayload = payload;
          const updateChain: Record<string, unknown> = {};
          const uFilters: Record<string, string> = {};
          updateChain.eq = (col: string, val: string) => {
            uFilters[col] = val;
            return updateChain;
          };
          updateChain.select = async () => {
            const targets = store.filter((r) => {
              if (uFilters.workshop_id && r.workshop_id !== uFilters.workshop_id)
                return false;
              if (
                uFilters.conversation_id &&
                r.conversation_id !== uFilters.conversation_id
              )
                return false;
              if (uFilters.id && r.id !== uFilters.id) return false;
              if (uFilters.reason && r.reason !== uFilters.reason) return false;
              return true;
            });
            if (!targets.length) return { data: [], error: null };
            for (const t of targets) {
              if (typeof updatePayload!.reason === "string") {
                t.reason = updatePayload!.reason as string;
              }
              if (typeof updatePayload!.result_summary === "string") {
                t.result_summary = updatePayload!.result_summary as string;
              }
              if (typeof updatePayload!.allowed === "boolean") {
                /* noop for fake */
              }
            }
            return {
              data: targets.map((t) => ({ id: t.id, reason: t.reason })),
              error: null,
            };
          };
          return updateChain;
        };
        return chain;
      },
    };
    return api as unknown as SupabaseClient;
  }

  const sb = makeClient();
  const first = await claimPendingActionForExecution({
    supabase: sb,
    workshopId: "ws-1",
    auth: manager,
    conversationId: "conv-1",
    actionId: "act-1",
  });
  assert(first.status === "claimed", "primeira requisição reivindica");

  const second = await claimPendingActionForExecution({
    supabase: sb,
    workshopId: "ws-1",
    auth: manager,
    conversationId: "conv-1",
    actionId: "act-1",
  });
  assert(
    second.status === "in_progress" || second.status === "already_executed",
    "segunda requisição não executa de novo"
  );
  assert(
    second.status === "in_progress",
    "segunda concorrente → in_progress"
  );

  const marked = await markPendingActionExecuted({
    supabase: sb,
    workshopId: "ws-1",
    actionId: "act-1",
    ok: true,
    summary: "ok",
  });
  assert(marked.ok === true, "markPending verifica UPDATE ok");
  assert(store[0].reason === PENDING_REASON.executed, "estado final executed");

  const markedAgain = await markPendingActionExecuted({
    supabase: sb,
    workshopId: "ws-1",
    actionId: "act-1",
    ok: true,
    summary: "ok2",
  });
  assert(
    markedAgain.ok === false && markedAgain.reason === "not_executing",
    "mark sem executing → not_executing"
  );

  const reuse = await claimPendingActionForExecution({
    supabase: sb,
    workshopId: "ws-1",
    auth: manager,
    conversationId: "conv-1",
    actionId: "act-1",
  });
  assert(reuse.status === "already_executed", "reuso após executed bloqueado");

  store[0].reason = PENDING_REASON.pending;
  store[0].result_summary = JSON.stringify({
    ...meta,
    actorKey: "user:other",
  });
  store[0].actor_user_id = "other";
  const foreign = await claimPendingActionForExecution({
    supabase: sb,
    workshopId: "ws-1",
    auth: manager,
    conversationId: "conv-1",
    actionId: "act-1",
  });
  assert(foreign.status === "forbidden", "claim de outro usuário bloqueado");

  // Admin session claim on admin-authored pending
  store[0].reason = PENDING_REASON.pending;
  store[0].actor_user_id = null;
  store[0].actor_role = "admin";
  store[0].result_summary = JSON.stringify({
    ...meta,
    actorKey: RDA_ADMIN_ACTOR_KEY,
    actorRole: "admin",
  });
  const adminClaim = await claimPendingActionForExecution({
    supabase: sb,
    workshopId: "ws-1",
    auth: adminSession,
    conversationId: "conv-1",
    actionId: "act-1",
  });
  assert(adminClaim.status === "claimed", "admin sem userId reivindica própria ação");

  const techOnAdmin = await claimPendingActionForExecution({
    supabase: sb,
    workshopId: "ws-1",
    auth: tech,
    conversationId: "conv-1",
    actionId: "act-1",
  });
  assert(
    techOnAdmin.status === "forbidden" || techOnAdmin.status === "in_progress",
    "tech não reivindica ação do admin"
  );
}

console.log("\n12) Isolamento de conversas e identidade admin");
{
  assert(resolveRdaActorKey(manager) === "user:m1", "actorKey gestor");
  assert(resolveRdaActorKey(tech) === "user:t1", "actorKey tech");
  assert(resolveRdaActorKey(adminSession) === RDA_ADMIN_ACTOR_KEY, "actorKey admin estável");
  assert(
    resolveRdaActorKey({ role: "user", username: "x" }) === null,
    "user sem userId → sem identidade"
  );

  const techConv = {
    id: "c-tech",
    created_by_user_id: "t1",
    created_by_role: "user",
  };
  const tech2Conv = {
    id: "c-tech2",
    created_by_user_id: "t2",
    created_by_role: "user",
  };
  const adminConv = {
    id: "c-admin",
    created_by_user_id: null,
    created_by_role: "admin",
  };

  assert(isRdaConversationOwner(tech, techConv), "tech dono da própria conversa");
  assert(!isRdaConversationOwner(tech, tech2Conv), "tech não é dono da outra");
  assert(!isRdaConversationOwner(tech, adminConv), "tech não é dono da admin");
  assert(isRdaConversationOwner(adminSession, adminConv), "admin dono da conversa admin");
  assert(
    !isRdaConversationOwner(adminSession, techConv),
    "admin não é dono da conversa do tech (ownership)"
  );

  assert(canAccessRdaConversation(tech, techConv), "tech acessa a própria");
  assert(
    !canAccessRdaConversation(tech, tech2Conv),
    "tech bloqueado em conversa cruzada mesma oficina"
  );
  assert(
    !canAccessRdaConversation(tech2, techConv),
    "tech2 bloqueado na conversa do tech"
  );
  assert(
    canShareRdaConversations(manager),
    "gestor tem política explícita de compartilhamento"
  );
  assert(
    canAccessRdaConversation(manager, techConv),
    "gestor acessa conversa do tech (política compartilhada)"
  );
  assert(
    canAccessRdaConversation(adminSession, techConv),
    "admin acessa conversa do tech (política compartilhada)"
  );
  assert(
    !canShareRdaConversations(tech),
    "tech sem política compartilhada"
  );

  // Pending: gestor NÃO confirma ação do tech só por ser gestor
  assert(
    !pendingActorMatchesAuth({
      auth: manager,
      actorKey: "user:t1",
      actorUserId: "t1",
      actorRole: "user",
    }),
    "gestor não confirma pending do tech"
  );
  assert(
    pendingActorMatchesAuth({
      auth: tech,
      actorKey: "user:t1",
      actorUserId: "t1",
      actorRole: "user",
    }),
    "autor confirma própria pending"
  );
  assert(
    pendingActorMatchesAuth({
      auth: adminSession,
      actorKey: RDA_ADMIN_ACTOR_KEY,
      actorUserId: null,
      actorRole: "admin",
    }),
    "admin confirma própria pending sem userId"
  );
  assert(
    !pendingActorMatchesAuth({
      auth: adminSession,
      actorKey: "user:t1",
      actorUserId: "t1",
      actorRole: "user",
    }),
    "admin não confirma pending do tech"
  );

  const orch = readFileSync(
    join(process.cwd(), "services/rdaIntelligence/agent/orchestrator.ts"),
    "utf8"
  );
  const routes = readFileSync(
    join(process.cwd(), "services/rdaIntelligence/registerRdaRoutes.ts"),
    "utf8"
  );
  assert(orch.includes("canAccessRdaConversation"), "ensureConversation valida acesso");
  assert(orch.includes("requireRdaActorKey"), "exige identidade estável");
  assert(routes.includes("canAccessRdaConversation"), "GET messages valida acesso");
  assert(routes.includes("RDA_CONVERSATION_FORBIDDEN"), "chat mapeia 403 conversa");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
