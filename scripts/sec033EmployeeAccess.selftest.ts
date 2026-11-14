/**
 * SEC-03.3 — permissões de funcionários (UI + sync + orçamentos + confiança).
 * Contas e dados fictícios apenas. npm run test:sec033-employee-access
 */
import {
  applyServerAccessSnapshot,
  asPermissionRecord,
  canOpenSettingsHub,
  effectiveAccessOrcamentos,
  effectivePatioApproveBudgetItems,
  EMPLOYEE_ACCESS_GRACE_MS,
  homeModuleAllowed,
  initialAccessTrustState,
  materializePermissionsForEdit,
  normalizePermissionsForAdminSave,
  patchEmployeePermission,
  permissionsSnapshotsEqual,
  permissionsToTabs,
  refreshAccessTrust,
  resolveAjustesVisibility,
  resolveUiPermissions,
  stripSensitivePermissions,
} from "../utils/employeeAccess.js";
import {
  applyAccessSyncToSession,
  applySyncResultToTrust,
  createAccessSyncController,
} from "../utils/employeeAccessSync.js";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";

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

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

console.log("SEC-03.3 employee access selftest\n");

console.log("1) Orçamentos: legado vs false explícito");
{
  const legacyPatioOnly = { access_patio: true };
  assert(effectiveAccessOrcamentos(legacyPatioOnly) === true, "legado: Pátio herda Orçamentos");
  const explicitOff = { access_patio: true, access_orcamentos: false };
  assert(effectiveAccessOrcamentos(explicitOff) === false, "false explícito bloqueia Orçamentos");
  const saved = normalizePermissionsForAdminSave({ access_patio: true });
  assert(saved.access_orcamentos === false, "save novo grava access_orcamentos: false");
  assert(saved.access_patio === true, "save preserva Pátio");
  const edited = materializePermissionsForEdit(legacyPatioOnly);
  assert(edited.access_orcamentos === true, "edição materializa herança legada");
  const afterUncheck = normalizePermissionsForAdminSave({
    ...edited,
    access_orcamentos: false,
  });
  assert(afterUncheck.access_orcamentos === false, "desmarcar persiste false");
}

console.log("\n2) patio_approve legado + patch rápido");
{
  const legacyEdit = { access_patio: true, patio_edit_budgets: true };
  assert(effectivePatioApproveBudgetItems(legacyEdit) === true, "legado aprova via edit_budgets");
  const normalized = normalizePermissionsForAdminSave(legacyEdit, { mode: "merge" });
  assert(
    !Object.prototype.hasOwnProperty.call(normalized, "patio_approve_budget_items"),
    "merge não inventa patio_approve false"
  );
  const explicitOff = normalizePermissionsForAdminSave(
    { ...legacyEdit, patio_approve_budget_items: false },
    { mode: "merge" }
  );
  assert(explicitOff.patio_approve_budget_items === false, "false explícito preservado");
  const patched = patchEmployeePermission(
    { access_home: true, access_patio: true, patio_edit_budgets: true },
    { patio_approve_budget_items: false }
  );
  assert(patched.access_patio === true, "patch não zera Pátio");
  assert(patched.access_home === true, "patch não zera home");
  assert(patched.patio_approve_budget_items === false, "patch grava false");
  assert(!Object.prototype.hasOwnProperty.call(patched, "access_orcamentos"), "patch não força orçamentos");
}

console.log("\n3) Navegação / módulos centralizados");
{
  const alice = {
    access_home: true,
    access_patio: true,
    access_orcamentos: false,
    access_agenda: false,
  };
  const tabs = permissionsToTabs(alice);
  assert(tabs.includes("patio") && !tabs.includes("orcamentos"), "alice: Pátio sem Orçamentos");
  assert(homeModuleAllowed("patio", "user", alice), "tile Pátio");
  assert(!homeModuleAllowed("orcamentos", "user", alice), "sem tile Orçamentos");
  assert(!homeModuleAllowed("parts_stock", "user", alice), "sem Estoque");
  assert(canOpenSettingsHub("user", alice), "hub mínimo (perfil) liberado");
}

console.log("\n4) Ajustes sem callback implícito");
{
  const bob = { access_home: true, access_patio: true };
  const vis = resolveAjustesVisibility({
    role: "user",
    permissions: bob,
    isSystemUser: true,
    isTechnician: false,
    hasTechnicianProfile: false,
    hasLogout: true,
  });
  assert(vis.tema === false, "tema exige access_settings");
  assert(vis.orcamentos_prefs === false, "prefs orçamento exigem access_settings");
  assert(vis.perfil === true, "perfil pessoal preservado");
  assert(vis.dispositivo === true, "dispositivo preservado");
}

console.log("\n5) Sessão antiga / privilégio removido antes do sync");
{
  const staleLocal = {
    access_home: true,
    access_patio: true,
    access_estoque_pecas: true,
    full_access: true,
  };
  const unverified = initialAccessTrustState();
  const ui = resolveUiPermissions(staleLocal, unverified);
  assert(ui.full_access !== true, "unverified: sem full_access do localStorage");
  assert(ui.access_estoque_pecas !== true, "unverified: sem Estoque sensível");
  assert(ui.access_patio === true, "unverified: operacional Pátio pode seguir snapshot");
  assert(!homeModuleAllowed("parts_stock", "user", ui), "unverified: tile Estoque oculto");
}

console.log("\n6) Falha de sync antes da validação inicial");
{
  const trust = applySyncResultToTrust({
    trust: initialAccessTrustState(),
    result: { outcome: "network_error", sequence: 1, generation: 0 },
  });
  assert(trust.status === "unverified", "rede antes do sync → continua unverified");
  const ui = resolveUiPermissions(
    { access_home: true, access_estoque_pecas: true, access_settings: true },
    trust
  );
  assert(ui.access_estoque_pecas !== true && ui.access_settings !== true, "sem sensíveis");
}

console.log("\n7) Falha temporária após sync válido + expiração da graça");
{
  const t0 = 1_700_000_000_000;
  const verified = applySyncResultToTrust({
    trust: initialAccessTrustState(),
    result: { outcome: "ok", snapshot: { permissions: {}, isTechnician: false }, sequence: 1, generation: 0 },
    nowMs: t0,
  });
  assert(verified.status === "verified" && verified.verifiedAt === t0, "sync ok → verified");

  const grace = applySyncResultToTrust({
    trust: verified,
    result: { outcome: "network_error", sequence: 2, generation: 0 },
    nowMs: t0 + 1_000,
  });
  assert(grace.status === "grace", "rede após verified → grace");
  const uiGrace = resolveUiPermissions(
    { access_home: true, access_estoque_pecas: true },
    grace,
    t0 + 1_000
  );
  assert(uiGrace.access_estoque_pecas === true, "dentro da graça mantém operacional sensível");

  const expired = refreshAccessTrust(grace, t0 + EMPLOYEE_ACCESS_GRACE_MS + 1);
  assert(expired.status === "expired", "após graça → expired");
  const uiExpired = resolveUiPermissions(
    { access_home: true, access_estoque_pecas: true },
    expired,
    t0 + EMPLOYEE_ACCESS_GRACE_MS + 1
  );
  assert(uiExpired.access_estoque_pecas !== true, "expired remove Estoque");
}

console.log("\n8) 401/403/404 explícitos");
{
  const session = {
    role: "user" as const,
    permissions: { access_home: true, access_estoque_pecas: true, full_access: true },
    isTechnician: false,
  };
  const denied403 = applyAccessSyncToSession(
    session,
    { status: "verified", verifiedAt: Date.now() },
    { outcome: "denied", status: 403, sequence: 1, generation: 0 }
  );
  assert(denied403.trust.status === "denied", "403 → denied");
  assert(denied403.permissions.full_access !== true, "403 remove full_access");
  assert(denied403.sessionInvalid === false, "403 não encerra sessão automaticamente");

  const denied401 = applyAccessSyncToSession(
    session,
    { status: "verified", verifiedAt: Date.now() },
    { outcome: "denied", status: 401, sequence: 2, generation: 0 }
  );
  assert(denied401.sessionInvalid === true, "401 marca sessão inválida");
}

console.log("\n9) Concorrência: coalescing, ordem e logout");
{
  const ctrl = createAccessSyncController();
  let fetches = 0;
  const slow = () =>
    delay(40).then(() => {
      fetches += 1;
      return { permissions: { access_home: true, access_patio: true }, isTechnician: false };
    });
  const p1 = ctrl.run(slow);
  const p2 = ctrl.run(slow);
  const [r1, r2] = await Promise.all([p1, p2]);
  assert(fetches === 1, "foco duplo: uma só requisição");
  assert(r1.outcome === "ok" && r2.outcome === "ok", "ambos recebem o mesmo ok");

  const ctrl2 = createAccessSyncController();
  let resolveLate: (v: { permissions: Record<string, boolean>; isTechnician: boolean }) => void = () => {};
  const late = new Promise<{ permissions: Record<string, boolean>; isTechnician: boolean }>((res) => {
    resolveLate = res;
  });
  const first = ctrl2.run(() => late as Promise<{ permissions: Record<string, boolean>; isTechnician: boolean }>);
  ctrl2.bumpGeneration();
  resolveLate({ permissions: { access_estoque_pecas: true }, isTechnician: false });
  const lateResult = await first;
  assert(lateResult.outcome === "superseded", "logout/troca de sessão → superseded");

  const ctrl3 = createAccessSyncController();
  const a = ctrl3.run(async () => {
    await delay(30);
    return { permissions: { access_home: true }, isTechnician: false };
  });
  await delay(5);
  const b = ctrl3.run(async () => ({
    permissions: { access_home: true, access_patio: true },
    isTechnician: false,
  }));
  // b coalesces into a while a in flight — same promise
  const [ra, rb] = await Promise.all([a, b]);
  assert(ra.outcome === rb.outcome, "coalesce compartilha resultado");
}

console.log("\n10) Sync aplica ganho/perda; strip sensível");
{
  const session = {
    role: "user" as const,
    permissions: { access_home: true, access_patio: true, access_estoque_pecas: true },
    isTechnician: false,
  };
  const lostStock = applyServerAccessSnapshot(session, {
    permissions: { access_home: true, access_patio: true, access_estoque_pecas: false },
    isTechnician: false,
  });
  assert(lostStock.changed && !homeModuleAllowed("parts_stock", "user", lostStock.next.permissions), "perdeu estoque");
  const stripped = stripSensitivePermissions({ full_access: true, access_patio: true });
  assert(stripped.full_access !== true && stripped.access_patio === true, "strip só sensíveis");
  const forged = asPermissionRecord({ full_access: "yes", access_patio: true });
  assert(forged.full_access !== true, "browser não concede full_access com string");
}

console.log("\n11) SEC-03: sem enforce; rota my-access");
{
  const policy = productionAuthorizationPolicy();
  assert(authorizationHasEnforce(policy, {}) === false, "nenhuma família em enforce");
  const rule = policy.rules.find((r) => r.id === "self_access_read");
  assert(!!rule && rule.path.test("/api/auth/my-access"), "regra self_access_read");
}

console.log("\n12) Cadastro: replace grava booleanos; merge preserva ausentes");
{
  const created = normalizePermissionsForAdminSave({ access_patio: true }, { mode: "replace" });
  assert(created.access_home === false && created.access_orcamentos === false, "cadastro: nav explícita");
  const merged = normalizePermissionsForAdminSave(
    { access_patio: true, patio_approve_budget_items: true },
    { mode: "merge" }
  );
  assert(merged.access_patio === true && merged.patio_approve_budget_items === true, "merge patch");
  assert(merged.access_home === undefined || merged.access_home === false, "merge sem forçar home false se ausente");
  // merge mode: access_home not in src → should not be set to false
  assert(!Object.prototype.hasOwnProperty.call(merged, "access_home"), "merge omite access_home ausente");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
