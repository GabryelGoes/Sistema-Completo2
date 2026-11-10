/**
 * Selftest RDA Fase 6 — Assistente de Produtividade (sem banco).
 * npm run test:rda-productivity
 */
import {
  authorizeToolInvocation,
  buildProductivityDedupeKey,
  canAccessProductivityTask,
  canManageProductivity,
  canUpdateTaskAsAssignee,
  canViewProductivity,
  normalizeProductivityPriority,
  normalizeProductivityStatus,
  notifyProductivityEvent,
  productionRdaToolRegistry,
  reserveProductivityDedupeKey,
  severityForProductivityNotify,
  validateAssigneeFilterAccess,
  validateDelegationAccess,
} from "../services/rdaIntelligence/index.js";
import { ensureProductionRdaToolsRegistered } from "../services/rdaIntelligence/tools/registerProduction.js";
import type { RdaAuthContext } from "../services/rdaIntelligence/types.js";
import type { ProductivityTaskView } from "../services/rdaIntelligence/productivity/types.js";
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
  const apiApp = readFileSync(join(process.cwd(), "apiApp.ts"), "utf8");
  assert(
    apiApp.includes("/api/rda/productivity/deadlines/tick"),
    "middleware libera tick de prazos"
  );
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

console.log("\n7) Regressão: filtro/detalhe sem vazar tarefas de terceiros");
{
  assert(
    validateAssigneeFilterAccess(tech, "outro-user") !== null,
    "tech não filtra por assignee alheio"
  );
  assert(
    validateAssigneeFilterAccess(tech, "t1") === null,
    "tech pode filtrar pelo próprio id"
  );
  assert(validateAssigneeFilterAccess(tech, null) === null, "tech pode omitir filtro");
  assert(
    validateAssigneeFilterAccess(manager, "outro-user") === null,
    "gestão pode filtrar qualquer assignee"
  );

  const alienTask = {
    assigneeUserId: "outro",
    requesterUserId: "outro",
    createdByUserId: "outro",
  };
  const ownTask = {
    assigneeUserId: "t1",
    requesterUserId: "m1",
    createdByUserId: "m1",
  };
  assert(!canAccessProductivityTask(tech, alienTask), "tech sem acesso a tarefa alheia");
  assert(canAccessProductivityTask(tech, ownTask), "tech acessa própria (assignee)");
  assert(canAccessProductivityTask(manager, alienTask), "gestão acessa qualquer");

  const serviceSrc = readFileSync(
    join(process.cwd(), "services/rdaIntelligence/productivity/service.ts"),
    "utf8"
  );
  assert(
    serviceSrc.includes("validateAssigneeFilterAccess"),
    "list usa validateAssigneeFilterAccess"
  );
  assert(
    serviceSrc.includes("canAccessProductivityTask"),
    "list/get usam canAccessProductivityTask"
  );
  assert(
    /getProductivityTask[\s\S]*?canAccessProductivityTask/.test(serviceSrc),
    "detalhe valida acesso após carregar por id"
  );
}

console.log("\n8) Regressão: delegação indevida por nome (após resolução)");
{
  assert(
    validateDelegationAccess(tech, "outro-user") !== null,
    "tech não delega a terceiros (nome→id)"
  );
  assert(validateDelegationAccess(tech, "t1") === null, "tech atribui a si");
  assert(validateDelegationAccess(tech, null) === null, "tech sem assignee (auto)");
  assert(
    validateDelegationAccess(manager, "outro-user") === null,
    "gestão pode delegar"
  );
  const createSrc = readFileSync(
    join(process.cwd(), "services/rdaIntelligence/productivity/service.ts"),
    "utf8"
  );
  assert(
    createSrc.includes("validateDelegationAccess"),
    "create valida delegação após resolveAssignee"
  );
  // Garante ordem: resolveAssignee antes de validateDelegationAccess no create.
  const createFn = createSrc.slice(createSrc.indexOf("export async function createProductivityTask"));
  const resolveAt = createFn.indexOf("resolveAssignee(");
  const validateAt = createFn.indexOf("validateDelegationAccess(");
  assert(resolveAt >= 0 && validateAt > resolveAt, "resolve → validateDelegationAccess");
}

console.log("\n9) Regressão: reserva atômica em corrida (mesmo alerta)");
{
  type DedupeRow = {
    id: string;
    workshop_id: string;
    dedupe_key: string;
    task_id: string;
    notification_id: string | null;
  };
  const dedupeStore: DedupeRow[] = [];
  let notifCount = 0;
  let idSeq = 0;
  let insertGate: Promise<void> = Promise.resolve();

  function makeFakeSupabase() {
    return {
      from(table: string) {
        if (table === "rda_productivity_notification_dedupe") {
          return {
            insert(row: Omit<DedupeRow, "id">) {
              return {
                select(_cols: string) {
                  return {
                    async maybeSingle() {
                      // Serializa inserts para simular unique constraint sob corrida.
                      const prev = insertGate;
                      let release!: () => void;
                      insertGate = new Promise<void>((r) => {
                        release = r;
                      });
                      await prev;
                      try {
                        const existing = dedupeStore.find(
                          (r) =>
                            r.workshop_id === row.workshop_id &&
                            r.dedupe_key === row.dedupe_key
                        );
                        if (existing) {
                          return {
                            data: null,
                            error: {
                              message:
                                'duplicate key value violates unique constraint "uq_rda_productivity_notif_dedupe"',
                            },
                          };
                        }
                        const id = `dedupe-${++idSeq}`;
                        dedupeStore.push({ id, ...row });
                        return { data: { id }, error: null };
                      } finally {
                        release();
                      }
                    },
                  };
                },
              };
            },
            select(_cols: string) {
              const filters: Record<string, string> = {};
              const api = {
                eq(col: string, val: string) {
                  filters[col] = val;
                  return api;
                },
                async maybeSingle() {
                  const hit = dedupeStore.find(
                    (r) =>
                      (!filters.workshop_id || r.workshop_id === filters.workshop_id) &&
                      (!filters.dedupe_key || r.dedupe_key === filters.dedupe_key)
                  );
                  return {
                    data: hit ? { notification_id: hit.notification_id } : null,
                    error: null,
                  };
                },
              };
              return api;
            },
            update(patch: { notification_id: string }) {
              return {
                eq(_col: string, id: string) {
                  const row = dedupeStore.find((r) => r.id === id);
                  if (row) row.notification_id = patch.notification_id;
                  return Promise.resolve({ data: null, error: null });
                },
              };
            },
            delete() {
              return {
                eq(_col: string, id: string) {
                  const idx = dedupeStore.findIndex((r) => r.id === id);
                  if (idx >= 0) dedupeStore.splice(idx, 1);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        }
        if (table === "notifications") {
          return {
            insert(_row: unknown) {
              const withSelect = {
                select(_cols: string) {
                  return {
                    async maybeSingle() {
                      notifCount += 1;
                      return { data: { id: `n-${notifCount}` }, error: null };
                    },
                  };
                },
                then(
                  resolve: (v: { data: null; error: null }) => void,
                  reject?: (e: unknown) => void
                ) {
                  // insert sem .select() (notificação do assignee)
                  return Promise.resolve({ data: null, error: null }).then(resolve, reject);
                },
              };
              return withSelect;
            },
          };
        }
        throw new Error(`unexpected table ${table}`);
      },
    };
  }

  const fakeA = makeFakeSupabase() as unknown as import("@supabase/supabase-js").SupabaseClient;
  const [r1, r2] = await Promise.all([
    reserveProductivityDedupeKey({
      supabase: fakeA,
      workshopId: "w1",
      dedupeKey: "overdue:task-x:2026-11-10",
      taskId: "task-x",
    }),
    reserveProductivityDedupeKey({
      supabase: fakeA,
      workshopId: "w1",
      dedupeKey: "overdue:task-x:2026-11-10",
      taskId: "task-x",
    }),
  ]);
  const reservedCount = [r1, r2].filter((r) => r.reserved).length;
  const blockedCount = [r1, r2].filter((r) => !r.reserved).length;
  assert(reservedCount === 1, "apenas uma reserva atômica vence");
  assert(blockedCount === 1, "segunda execução bloqueada por unique");
  assert(dedupeStore.length === 1, "uma linha de dedupe");

  dedupeStore.length = 0;
  notifCount = 0;
  idSeq = 0;
  insertGate = Promise.resolve();
  const fakeB = makeFakeSupabase() as unknown as import("@supabase/supabase-js").SupabaseClient;
  const task: ProductivityTaskView = {
    id: "task-race",
    title: "Prazo",
    description: "",
    priority: "normal",
    status: "pending",
    requesterUserId: "m1",
    requesterName: "Gestor",
    assigneeUserId: null,
    assigneeName: null,
    dueAt: new Date(Date.now() - 3600_000).toISOString(),
    completedAt: null,
    cancelledAt: null,
    refType: null,
    refId: null,
    refLabel: null,
    notes: "",
    createdByUserId: "m1",
    createdByName: "Gestor",
    updatedByUserId: "m1",
    updatedByName: "Gestor",
    clientRequestId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    overdue: true,
  };
  const [n1, n2] = await Promise.all([
    notifyProductivityEvent({
      supabase: fakeB,
      workshopId: "w1",
      task,
      kind: "overdue",
      stableKey: "overdue:task-race:day",
    }),
    notifyProductivityEvent({
      supabase: fakeB,
      workshopId: "w1",
      task,
      kind: "overdue",
      stableKey: "overdue:task-race:day",
    }),
  ]);
  const sentCount = [n1, n2].filter((n) => n.sent).length;
  assert(sentCount === 1, "só uma notificação enviada na corrida");
  assert(notifCount === 1, "apenas um insert em notifications");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
