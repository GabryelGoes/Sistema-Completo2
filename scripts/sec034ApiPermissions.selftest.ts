/**
 * SEC-03.4: decisões de Estoque, Relatórios e Boletins com usuários fictícios.
 * A política de produção permanece sem enforce. O bloqueio é só na cópia de teste.
 * npm run test:sec034-api-permissions
 */
import {
  productionAuthorizationPolicy,
  type AuthorizationFamilyId,
  type AuthorizationPolicy,
  type FamilyMode,
} from "../utils/authorizationPolicy.js";
import {
  authorizationHasEnforce,
  decideAuthorization,
  findMatchingRules,
  resetShadowLogLimiter,
  type PermissionSource,
  type SessionActor,
  type ShadowRecord,
} from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const USER = "22222222-2222-4222-8222-222222222201";

let passed = 0;
let failed = 0;
function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function enforce(ids: readonly AuthorizationFamilyId[]): AuthorizationPolicy {
  const base = productionAuthorizationPolicy();
  const selected = new Set(ids);
  return {
    rules: base.rules,
    families: base.families.map((family) =>
      selected.has(family.id) ? { ...family, mode: "enforce" as FamilyMode } : family
    ),
  };
}

function source(permissions: Record<string, boolean> | null, fail = false): PermissionSource {
  return {
    async loadUser(workshopId: string, userId: string) {
      if (fail) return { ok: false };
      if (workshopId !== WORKSHOP || userId !== USER || !permissions) return { ok: true, row: null };
      return { ok: true, row: { permissions, is_technician: true } };
    },
  };
}

async function decide(input: {
  method: string;
  path: string;
  actor: SessionActor | null;
  permissions?: Record<string, boolean> | null;
  fail?: boolean;
  policy?: AuthorizationPolicy;
  log?: (record: ShadowRecord) => void;
  env?: NodeJS.ProcessEnv;
}) {
  return decideAuthorization({
    method: input.method,
    path: input.path,
    actor: input.actor,
    workshopId: WORKSHOP,
    source: source(input.permissions === undefined ? {} : input.permissions, input.fail),
    policy: input.policy,
    log: input.log,
    env: input.env,
  });
}

const stockPolicy = enforce(["parts_stock"]);
const reportPolicy = enforce(["reports"]);
const bulletinPolicy = enforce(["bulletins"]);
const patio = { role: "user" as const, userId: USER };
const stockUser = { access_estoque_pecas: true };
const patioUser = { access_patio: true };
const labUser = { access_laboratorio: true };
const receptionUser = { access_reception: true };
const budgetUser = { access_orcamentos: true };

async function main() {
  const production = productionAuthorizationPolicy();
  const modeOf = (id: string) => production.families.find((family) => family.id === id)?.mode;
  record(
    "produção bloqueia estoque, TV, catálogos, técnicos, relatórios e boletins",
    modeOf("customers") === "enforce" &&
      modeOf("appointments") === "enforce" &&
      modeOf("budgets") === "enforce" &&
      modeOf("comments") === "enforce" &&
      modeOf("photos") === "enforce" &&
      modeOf("parts_stock") === "enforce" &&
      modeOf("abs_stock") === "enforce" &&
      modeOf("notifications") === "enforce" &&
      modeOf("service_orders") === "enforce" &&
      modeOf("reports") === "enforce" &&
      modeOf("bulletins") === "enforce" &&
      modeOf("technicians") === "enforce" &&
      modeOf("tv_admin") === "enforce" &&
      modeOf("workshop_catalogs") === "enforce" &&
      production.families.every(
        (family) =>
          family.unmatched === "ignore" &&
          (            family.id === "customers" ||
            family.id === "appointments" ||
            family.id === "budgets" ||
            family.id === "comments" ||
            family.id === "photos" ||
            family.id === "tv_admin" ||
            family.id === "workshop_catalogs" ||
            family.id === "technicians" ||
            family.id === "reports" ||
            family.id === "bulletins" ||
            family.id === "parts_stock" ||
            family.id === "abs_stock" ||
            family.id === "notifications" ||
            family.id === "service_orders" ||
            family.mode !== "enforce")
      ) &&
      authorizationHasEnforce(production, {}) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "reports" }) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "customers,appointments,service_orders,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications" }) === false &&
      production.families.filter((family) => family.mode === "shadow").map((family) => family.id).sort().join(",") ===
        "",
    `estoque ${modeOf("parts_stock")}; relatório ${modeOf("reports")}; boletim ${modeOf("bulletins")}; catálogo ${modeOf("workshop_catalogs")}`
  );

  const stockDelete = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: patio,
    permissions: stockUser,
    policy: stockPolicy,
  });
  const noStockDelete = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  const patioRead = await decide({
    method: "GET",
    path: "/api/workshop-parts",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  const patioPhoto = await decide({
    method: "GET",
    path: "/api/workshop-parts/peca-1/photos",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  const patioPurchase = await decide({
    method: "GET",
    path: "/api/workshop-parts/peca-1/purchases",
    actor: patio,
    permissions: budgetUser,
    policy: stockPolicy,
  });
  const patioCategory = await decide({
    method: "GET",
    path: "/api/workshop-part-categories",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  const patioLab = await decide({
    method: "GET",
    path: "/api/workshop-parts/peca-1/lab-context",
    actor: patio,
    permissions: labUser,
    policy: stockPolicy,
  });
  const patioMove = await decide({
    method: "POST",
    path: "/api/workshop-parts/movements",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  const patioCancel = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/movements/mov-1",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  const labMove = await decide({
    method: "POST",
    path: "/api/workshop-parts/movements",
    actor: patio,
    permissions: labUser,
    policy: stockPolicy,
  });
  const receptionRead = await decide({
    method: "GET",
    path: "/api/workshop-parts/lookup",
    actor: patio,
    permissions: receptionUser,
    policy: stockPolicy,
  });
  const patioReservations = await decide({
    method: "GET",
    path: "/api/workshop-parts/pending-reservations",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  const patioLedger = await decide({
    method: "GET",
    path: "/api/estoque/ledger",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  const patioCreate = await decide({
    method: "POST",
    path: "/api/workshop-parts",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  const patioGuard = await decide({
    method: "POST",
    path: "/api/workshop-parts/verify-stock-guard",
    actor: patio,
    permissions: patioUser,
    policy: stockPolicy,
  });
  record(
    "estoque separa administração e uso do pátio",
    stockDelete.effect === "allow" &&
      stockDelete.block === false &&
      noStockDelete.effect === "deny" &&
      noStockDelete.block === true &&
      patioRead.effect === "allow" &&
      patioPhoto.effect === "allow" &&
      patioPurchase.effect === "allow" &&
      patioCategory.effect === "allow" &&
      patioLab.effect === "allow" &&
      patioMove.effect === "allow" &&
      patioMove.action === "move" &&
      patioCancel.effect === "allow" &&
      labMove.effect === "allow" &&
      receptionRead.effect === "allow" &&
      patioReservations.effect === "deny" &&
      patioLedger.effect === "deny" &&
      patioCreate.effect === "deny" &&
      patioGuard.effect === "deny",
    `exclusão ${noStockDelete.effect}; baixa ${patioMove.effect}; reserva ${patioReservations.effect}`
  );

  const reportRead = await decide({
    method: "GET",
    path: "/api/reports/technician-services",
    actor: patio,
    permissions: { access_relatorios: true },
    policy: reportPolicy,
  });
  const reportDelete = await decide({
    method: "DELETE",
    path: "/api/reports/technician-services/linha-1",
    actor: patio,
    permissions: { access_relatorios: true },
    policy: reportPolicy,
  });
  const noReport = await decide({
    method: "GET",
    path: "/api/reports/technician-services",
    actor: patio,
    permissions: patioUser,
    policy: reportPolicy,
  });
  const bulletinRead = await decide({
    method: "GET",
    path: "/api/error-bulletins/boletim-1",
    actor: patio,
    permissions: { access_boletim_erros: true },
    policy: bulletinPolicy,
  });
  const bulletinWrite = await decide({
    method: "POST",
    path: "/api/error-bulletins",
    actor: patio,
    permissions: { access_boletim_erros: true },
    policy: bulletinPolicy,
  });
  const noBulletin = await decide({
    method: "DELETE",
    path: "/api/error-bulletins/boletim-1",
    actor: patio,
    permissions: { access_relatorios: true },
    policy: bulletinPolicy,
  });
  record(
    "relatório e boletim seguem a chave do módulo",
    reportRead.effect === "allow" &&
      reportDelete.effect === "allow" &&
      noReport.effect === "deny" &&
      noReport.block === true &&
      bulletinRead.effect === "allow" &&
      bulletinWrite.effect === "allow" &&
      noBulletin.effect === "deny" &&
      noBulletin.block === true,
    `relatório ${noReport.reason}; boletim ${noBulletin.reason}`
  );

  const manager = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "admin" },
    policy: stockPolicy,
  });
  const full = await decide({
    method: "GET",
    path: "/api/reports/technician-services",
    actor: patio,
    permissions: { full_access: true },
    policy: reportPolicy,
  });
  const otherShop = await decide({
    method: "GET",
    path: "/api/error-bulletins",
    actor: patio,
    permissions: null,
    policy: bulletinPolicy,
  });
  const lookupFail = await decide({
    method: "POST",
    path: "/api/workshop-parts",
    actor: patio,
    permissions: stockUser,
    fail: true,
    policy: stockPolicy,
  });
  const direct = await decide({
    method: "DELETE",
    path: "/api/workshop-suppliers/fornecedor-1",
    actor: patio,
    permissions: {},
    policy: stockPolicy,
  });
  const offStillOpen = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: patio,
    permissions: {},
  });
  record(
    "gerência, acesso total, outra oficina e falha não abrem o bloqueio real",
    manager.effect === "allow" &&
      manager.reason === "admin" &&
      full.effect === "allow" &&
      full.reason === "full_access" &&
      otherShop.effect === "deny" &&
      otherShop.reason === "not_in_workshop" &&
      lookupFail.effect === "lookup_failed" &&
      lookupFail.block === true &&
      direct.effect === "deny" &&
      direct.block === true &&
      offStillOpen.effect === "deny" &&
      offStillOpen.block === true &&
      offStillOpen.reason === "missing_permission",
    `falha ${lookupFail.block}; produção ${offStillOpen.reason}`
  );

  resetShadowLogLimiter();
  const observed: ShadowRecord[] = [];
  const observe = (record: ShadowRecord) => observed.push(record);
  const reportDenied = await decide({
    method: "GET",
    path: "/api/reports/technician-services",
    actor: patio,
    permissions: {},
    log: observe,
  });
  const reportAllowed = await decide({
    method: "DELETE",
    path: "/api/reports/technician-services/linha-1",
    actor: patio,
    permissions: { access_relatorios: true },
    log: observe,
  });
  const bulletinDenied = await decide({
    method: "POST",
    path: "/api/error-bulletins",
    actor: patio,
    permissions: { access_patio: true },
    log: observe,
  });
  const bulletinAllowed = await decide({
    method: "PATCH",
    path: "/api/error-bulletins/boletim-1",
    actor: patio,
    permissions: { access_boletim_erros: true },
    log: observe,
  });
  const reportManager = await decide({
    method: "GET",
    path: "/api/reports/technician-services",
    actor: { role: "admin" },
    log: observe,
  });
  const bulletinFull = await decide({
    method: "DELETE",
    path: "/api/error-bulletins/boletim-1",
    actor: patio,
    permissions: { full_access: true },
    log: observe,
  });
  const bulletinLookup = await decide({
    method: "GET",
    path: "/api/error-bulletins",
    actor: patio,
    permissions: { access_boletim_erros: true },
    fail: true,
    log: observe,
  });
  const emergencyOff = await decide({
    method: "DELETE",
    path: "/api/reports/technician-services/linha-1",
    actor: patio,
    permissions: {},
    env: { SEC03_DISABLE_FAMILIES: "reports,bulletins" },
    log: observe,
  });
  const dumped = JSON.stringify(observed);
  const safeKeys = new Set(["kind", "family", "rule", "action", "method", "decision", "reason"]);
  record(
    "sombra registra a negação e a operação continua",
    reportDenied.effect === "deny" &&
      reportDenied.block === true &&
      reportDenied.reason === "missing_permission" &&
      reportAllowed.effect === "allow" &&
      reportAllowed.block === false &&
      bulletinDenied.effect === "deny" &&
      bulletinDenied.block === true &&
      bulletinAllowed.effect === "allow" &&
      reportManager.effect === "allow" &&
      reportManager.reason === "admin" &&
      bulletinFull.effect === "allow" &&
      bulletinFull.reason === "full_access" &&
      bulletinLookup.effect === "lookup_failed" &&
      bulletinLookup.block === true &&
      emergencyOff.effect === "skipped" &&
      emergencyOff.reason === "family_off" &&
      emergencyOff.block === false &&
      observed.some((entry) => entry.family === "reports" && entry.decision === "deny") &&
      observed.some((entry) => entry.family === "bulletins" && entry.decision === "lookup_failed") &&
      observed.every((entry) => Object.keys(entry).every((key) => safeKeys.has(key))) &&
      !dumped.includes(USER) &&
      !dumped.includes("linha-1") &&
      !dumped.includes("boletim") &&
      !dumped.includes("senha"),
    `bloqueio ${reportDenied.block}; falha ${bulletinLookup.block}; registros ${observed.length}`
  );

  const topRule = (method: string, path: string) => {
    const matches = findMatchingRules(production, method, path);
    return matches.reduce((best, rule) => (!best || rule.priority > best.priority ? rule : best));
  };
  const sharedReads = [
    ["GET", "/api/workshop-parts", "parts_collection_read_shared"],
    ["GET", "/api/workshop-parts/peca-1", "part_item_read_shared"],
    ["GET", "/api/workshop-parts/lookup", "parts_lookup_read"],
    ["GET", "/api/workshop-parts/peca-1/photos", "part_photos_read_shared"],
    ["GET", "/api/workshop-parts/peca-1/purchases", "part_purchases_read_shared"],
    ["GET", "/api/workshop-parts/peca-1/lab-context", "part_lab_context_read"],
    ["GET", "/api/workshop-part-categories", "part_categories_read_shared"],
  ] as const;
  const sharedMoves = [
    ["GET", "/api/workshop-parts/movements", "parts_move_read"],
    ["POST", "/api/workshop-parts/movements", "parts_move"],
    ["DELETE", "/api/workshop-parts/movements/mov-1", "parts_move_delete"],
  ] as const;
  const adminOnly = [
    ["POST", "/api/workshop-parts", "parts_create"],
    ["DELETE", "/api/workshop-parts/peca-1", "part_delete"],
    ["GET", "/api/workshop-parts/pending-reservations", "parts_pending_reservations_read"],
    ["POST", "/api/workshop-parts/verify-stock-guard", "parts_guard_check"],
    ["GET", "/api/estoque/ledger", "estoque_ledger_read"],
    ["POST", "/api/workshop-parts/peca-1/receive", "part_receive"],
    ["PUT", "/api/workshop-parts/peca-1/categories", "part_categories_set"],
  ] as const;
  const matrixOk =
    sharedReads.every(([method, path, id]) => topRule(method, path).id === id && topRule(method, path).anyOf.includes("access_patio")) &&
    sharedMoves.every(([method, path, id]) => topRule(method, path).id === id && topRule(method, path).anyOf.includes("access_patio") && topRule(method, path).anyOf.includes("access_laboratorio")) &&
    adminOnly.every(([method, path, id]) => topRule(method, path).id === id && topRule(method, path).anyOf.length === 1 && topRule(method, path).anyOf[0] === "access_estoque_pecas");
  resetShadowLogLimiter();
  const stockLogs: ShadowRecord[] = [];
  const stockLog = (record: ShadowRecord) => stockLogs.push(record);
  const patioCatalog = await decide({ method: "GET", path: "/api/workshop-parts", actor: patio, permissions: patioUser, log: stockLog });
  const patioPhotoShadow = await decide({ method: "GET", path: "/api/workshop-parts/peca-1/photos", actor: patio, permissions: patioUser, log: stockLog });
  const budgetPurchase = await decide({ method: "GET", path: "/api/workshop-parts/peca-1/purchases", actor: patio, permissions: budgetUser, log: stockLog });
  const budgetCategory = await decide({ method: "GET", path: "/api/workshop-part-categories", actor: patio, permissions: budgetUser, log: stockLog });
  const labContext = await decide({ method: "GET", path: "/api/workshop-parts/peca-1/lab-context", actor: patio, permissions: labUser, log: stockLog });
  const receptionLookup = await decide({ method: "GET", path: "/api/workshop-parts/lookup", actor: patio, permissions: receptionUser, log: stockLog });
  const patioMoveShadow = await decide({ method: "POST", path: "/api/workshop-parts/movements", actor: patio, permissions: patioUser, log: stockLog });
  const patioCancelShadow = await decide({ method: "DELETE", path: "/api/workshop-parts/movements/mov-1", actor: patio, permissions: patioUser, log: stockLog });
  const labMoveShadow = await decide({ method: "POST", path: "/api/workshop-parts/movements", actor: patio, permissions: labUser, log: stockLog });
  const patioAdmin = await decide({ method: "DELETE", path: "/api/workshop-parts/peca-1", actor: patio, permissions: patioUser, log: stockLog });
  const noKey = await decide({ method: "GET", path: "/api/workshop-parts", actor: patio, permissions: {}, log: stockLog });
  const stockAdmin = await decide({ method: "POST", path: "/api/workshop-parts", actor: patio, permissions: stockUser, log: stockLog });
  const stockManager = await decide({ method: "DELETE", path: "/api/workshop-suppliers/fornecedor-1", actor: { role: "admin" }, log: stockLog });
  const stockFull = await decide({ method: "GET", path: "/api/estoque/ledger", actor: patio, permissions: { full_access: true }, log: stockLog });
  const stockLookup = await decide({ method: "GET", path: "/api/workshop-parts", actor: patio, permissions: stockUser, fail: true, log: stockLog });
  record(
    "enforce do estoque preserva baixa e ficha e bloqueia administração",
    matrixOk &&
      patioCatalog.effect === "allow" && patioCatalog.block === false &&
      patioPhotoShadow.effect === "allow" &&
      budgetPurchase.effect === "allow" &&
      budgetCategory.effect === "allow" &&
      labContext.effect === "allow" &&
      receptionLookup.effect === "allow" &&
      patioMoveShadow.effect === "allow" && patioMoveShadow.action === "move" &&
      patioCancelShadow.effect === "allow" &&
      labMoveShadow.effect === "allow" &&
      patioAdmin.effect === "deny" && patioAdmin.block === true && patioAdmin.reason === "missing_permission" &&
      noKey.effect === "deny" && noKey.block === true &&
      stockAdmin.effect === "allow" &&
      stockManager.effect === "allow" && stockManager.reason === "admin" &&
      stockFull.effect === "allow" && stockFull.reason === "full_access" &&
      stockLookup.effect === "lookup_failed" && stockLookup.block === true &&
      stockLogs.some((entry) => entry.family === "parts_stock" && entry.decision === "deny") &&
      stockLogs.some((entry) => entry.decision === "lookup_failed") &&
      !JSON.stringify(stockLogs).includes(USER),
    `baixa ${patioMoveShadow.effect}; exclusão ${patioAdmin.block}; falha ${stockLookup.block}`
  );

  console.log(`\n${passed} ok, ${failed} falha(s)`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.name : "erro");
  process.exit(1);
});
