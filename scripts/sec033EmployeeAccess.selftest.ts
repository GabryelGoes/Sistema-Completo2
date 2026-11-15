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
  commitAccessSyncIfSessionMatches,
  createAccessSyncController,
} from "../utils/employeeAccessSync.js";
import {
  casTokenFromUpdatedAt,
  interpretOptimisticPermissionsWrite,
  interpretPermissionsLoad,
  planSystemUserPermissionsUpdate,
} from "../utils/systemUserPermissionsMerge.js";
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

console.log("\n11) SEC-03: TV, catálogos, técnicos e relatórios em enforce; rota my-access");
{
  const policy = productionAuthorizationPolicy();
  assert(
    policy.families.filter((family) => family.mode === "enforce").map((family) => family.id).join(",") ===
      "customers,appointments,parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports",
    "tv_admin, workshop_catalogs, technicians, reports, bulletins e parts_stock em enforce"
  );
  assert(authorizationHasEnforce(policy, {}) === true, "há enforce");
  assert(authorizationHasEnforce(policy, { SEC03_DISABLE_FAMILIES: "bulletins" }) === true, "as outras famílias em enforce permanecem");
  assert(
    authorizationHasEnforce(policy, { SEC03_DISABLE_FAMILIES: "customers,appointments,parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" }) === false,
    "os oito interruptores desligam o enforce"
  );
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

console.log("\n13) Merge admin: falha de leitura Supabase / usuário inexistente");
{
  const readFail = interpretPermissionsLoad({
    data: null,
    error: { message: "simulated supabase outage" },
  });
  assert(readFail.ok === false && readFail.reason === "read_error", "erro de leitura ≠ not_found");
  const planFail = planSystemUserPermissionsUpdate({
    mode: "merge",
    patch: { patio_approve_budget_items: true },
    load: readFail,
  });
  assert(planFail.ok === false && planFail.reason === "read_error", "merge aborta sem sobrescrever com {}");

  const missing = interpretPermissionsLoad({ data: null, error: null });
  assert(missing.ok === false && missing.reason === "not_found", "sem linha → not_found");
  const planMissing = planSystemUserPermissionsUpdate({
    mode: "merge",
    patch: { patio_approve_budget_items: false },
    load: missing,
  });
  assert(planMissing.ok === false && planMissing.reason === "not_found", "merge não atualiza usuário inexistente");
}

console.log("\n14) Aprovação rápida preserva demais chaves + CAS concorrente");
{
  const load = interpretPermissionsLoad({
    data: {
      permissions: {
        access_home: true,
        access_patio: true,
        access_estoque_pecas: true,
        patio_edit_budgets: true,
      },
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    error: null,
  });
  assert(load.ok, "load ok");
  const plan = planSystemUserPermissionsUpdate({
    mode: "merge",
    patch: { patio_approve_budget_items: false },
    load,
  });
  assert(plan.ok === true, "plan merge ok");
  if (plan.ok) {
    assert(plan.nextPermissions.access_estoque_pecas === true, "aprovar rápido preserva estoque");
    assert(plan.nextPermissions.access_patio === true, "preserva pátio");
    assert(plan.nextPermissions.patio_approve_budget_items === false, "grava false explícito");
    assert(plan.expectedUpdatedAt === "2026-01-01T00:00:00.000Z", "CAS usa updated_at lido");
  }

  const conflict = interpretOptimisticPermissionsWrite({
    data: null,
    error: null,
    userWasFound: true,
  });
  assert(conflict.ok === false && conflict.reason === "conflict", "0 rows após achar usuário → conflict");

  const writeErr = interpretOptimisticPermissionsWrite({
    data: null,
    error: { message: "write failed" },
    userWasFound: true,
  });
  assert(writeErr.ok === false && writeErr.reason === "write_error", "erro de write não vira {}");

  // Duas alterações: B lê o mesmo updated_at; só uma “ganha” o CAS.
  const firstWrite = interpretOptimisticPermissionsWrite({
    data: { id: "u1", permissions: { access_patio: true }, updated_at: "2026-01-01T00:00:01.000Z" },
    error: null,
    userWasFound: true,
  });
  const secondWrite = interpretOptimisticPermissionsWrite({
    data: null,
    error: null,
    userWasFound: true,
  });
  assert(firstWrite.ok && secondWrite.ok === false && secondWrite.reason === "conflict", "2ª admin perde no CAS");
}

console.log("\n15) Sync + logout / login outro usuário / StrictMode");
{
  const ctrl = createAccessSyncController();
  const gen = ctrl.bumpGeneration();
  const sessionA = {
    role: "user" as const,
    userId: "user-a",
    token: "tok-a",
    permissions: { access_home: true, access_estoque_pecas: true },
    isTechnician: false,
  };
  const resultOk = {
    outcome: "ok" as const,
    snapshot: {
      permissions: { access_home: true, access_estoque_pecas: false },
      isTechnician: false,
    },
    sequence: 1,
    generation: gen,
  };

  const afterLogout = commitAccessSyncIfSessionMatches({
    expectedUserId: "user-a",
    expectedToken: "tok-a",
    expectedGeneration: gen,
    currentGeneration: gen,
    currentSession: null,
    trust: { status: "verified", verifiedAt: Date.now() },
    result: resultOk,
  });
  assert(afterLogout.applied === false, "logout durante sync → não aplica");

  const genB = ctrl.bumpGeneration();
  const switchUser = commitAccessSyncIfSessionMatches({
    expectedUserId: "user-a",
    expectedToken: "tok-a",
    expectedGeneration: gen,
    currentGeneration: genB,
    currentSession: {
      role: "user",
      userId: "user-b",
      token: "tok-b",
      permissions: { access_home: true },
    },
    trust: initialAccessTrustState(),
    result: resultOk,
  });
  assert(switchUser.applied === false, "login de outro usuário → resposta antiga descartada");

  // StrictMode: dois “effects” com gerações diferentes; só a geração atual aplica.
  const gen1 = ctrl.bumpGeneration();
  const gen2 = ctrl.bumpGeneration();
  const dup1 = commitAccessSyncIfSessionMatches({
    expectedUserId: "user-a",
    expectedToken: "tok-a",
    expectedGeneration: gen1,
    currentGeneration: gen2,
    currentSession: sessionA,
    trust: initialAccessTrustState(),
    result: { ...resultOk, generation: gen1 },
  });
  const dup2 = commitAccessSyncIfSessionMatches({
    expectedUserId: "user-a",
    expectedToken: "tok-a",
    expectedGeneration: gen2,
    currentGeneration: gen2,
    currentSession: sessionA,
    trust: initialAccessTrustState(),
    result: {
      outcome: "ok",
      snapshot: { permissions: { access_home: true, access_patio: true }, isTechnician: false },
      sequence: 9,
      generation: gen2,
    },
  });
  assert(dup1.applied === false, "StrictMode: effect antigo não aplica");
  assert(dup2.applied === true && dup2.kind === "ok", "StrictMode: effect atual aplica");
  if (dup2.applied === true && dup2.kind === "ok") {
    assert(dup2.nextSession?.permissions.access_patio === true, "effect atual atualiza permissões");
  }
}

console.log("\n16) Graça de 10 minutos preservada no meio do intervalo");
{
  const t0 = 1_700_000_000_000;
  const verified = applySyncResultToTrust({
    trust: initialAccessTrustState(),
    result: { outcome: "ok", snapshot: { permissions: {}, isTechnician: false }, sequence: 1, generation: 0 },
    nowMs: t0,
  });
  const grace = applySyncResultToTrust({
    trust: verified,
    result: { outcome: "network_error", sequence: 2, generation: 0 },
    nowMs: t0 + 60_000,
  });
  assert(grace.status === "grace", "entra em grace");
  const mid = refreshAccessTrust(grace, t0 + EMPLOYEE_ACCESS_GRACE_MS - 1);
  assert(mid.status === "grace", "ainda dentro dos 10 min");
  const ui = resolveUiPermissions({ access_estoque_pecas: true }, mid, t0 + EMPLOYEE_ACCESS_GRACE_MS - 1);
  assert(ui.access_estoque_pecas === true, "sensível mantido até o fim da graça");
  const end = refreshAccessTrust(grace, t0 + EMPLOYEE_ACCESS_GRACE_MS + 1);
  assert(end.status === "expired", "expirou após 10 min");
}

console.log("\n17) Atalho aprovação: patch mínimo vs snapshot antigo do browser");
{
  // Navegador A carregou permissões antigas (ainda com Estoque).
  const staleBrowser: Record<string, boolean> = {
    access_home: true,
    access_patio: true,
    access_estoque_pecas: true,
    patio_edit_budgets: true,
    patio_approve_budget_items: true,
  };
  // Admin B removeu Estoque no banco.
  const dbAfterAdminB = {
    access_home: true,
    access_patio: true,
    access_estoque_pecas: false,
    patio_edit_budgets: true,
    patio_approve_budget_items: true,
  };
  const loadDb = interpretPermissionsLoad({
    data: { permissions: dbAfterAdminB, updated_at: "2026-02-01T12:00:00.000Z" },
    error: null,
  });

  // Bug antigo: patchEmployeePermission(stale, …) reenviava Estoque=true no merge.
  const staleFullPatch = patchEmployeePermission(staleBrowser, {
    patio_approve_budget_items: false,
  });
  assert(staleFullPatch.access_estoque_pecas === true, "snapshot antigo ainda carrega Estoque");
  const badPlan = planSystemUserPermissionsUpdate({
    mode: "merge",
    patch: staleFullPatch,
    load: loadDb,
  });
  assert(badPlan.ok === true, "plano com patch cheio ainda planeja");
  if (badPlan.ok) {
    assert(
      badPlan.nextPermissions.access_estoque_pecas === true,
      "patch cheio reescreveria Estoque removido por B (regressão a evitar)"
    );
  }

  // Correção: atalho envia só a chave de aprovação.
  const minimalClient = normalizePermissionsForAdminSave(
    { patio_approve_budget_items: false },
    { mode: "merge" }
  );
  assert(
    Object.keys(minimalClient).length === 1 && minimalClient.patio_approve_budget_items === false,
    "cliente envia somente patio_approve_budget_items"
  );
  const goodPlan = planSystemUserPermissionsUpdate({
    mode: "merge",
    patch: minimalClient,
    load: loadDb,
  });
  assert(goodPlan.ok === true, "merge mínimo planeja ok");
  if (goodPlan.ok) {
    assert(goodPlan.nextPermissions.access_estoque_pecas === false, "Estoque removido por B permanece");
    assert(goodPlan.nextPermissions.access_patio === true, "Pátio intacto");
    assert(goodPlan.nextPermissions.access_home === true, "home intacta");
    assert(goodPlan.nextPermissions.patio_edit_budgets === true, "edit budgets intacto");
    assert(goodPlan.nextPermissions.patio_approve_budget_items === false, "aprovação alterada");
    const keys = Object.keys(goodPlan.nextPermissions).sort();
    assert(
      keys.join(",") ===
        ["access_estoque_pecas", "access_home", "access_patio", "patio_approve_budget_items", "patio_edit_budgets"]
          .sort()
          .join(","),
      "nenhuma outra permissão inventada"
    );
  }

  // updated_at nulo/ausente: sem CAS → recusa.
  assert(casTokenFromUpdatedAt(null) === null, "null sem token CAS");
  assert(casTokenFromUpdatedAt("") === null, "vazio sem token CAS");
  assert(casTokenFromUpdatedAt("   ") === null, "whitespace sem token CAS");
  const nullCas = planSystemUserPermissionsUpdate({
    mode: "merge",
    patch: { patio_approve_budget_items: true },
    load: interpretPermissionsLoad({
      data: { permissions: dbAfterAdminB, updated_at: null },
      error: null,
    }),
  });
  assert(
    nullCas.ok === false && nullCas.reason === "cas_unavailable",
    "updated_at nulo → cas_unavailable (não atualiza desprotegido)"
  );

  // Concorrência: dois merges no mesmo token; o 2º write perde.
  const raceLoad = interpretPermissionsLoad({
    data: { permissions: dbAfterAdminB, updated_at: "2026-02-01T12:00:00.000Z" },
    error: null,
  });
  const racePlanA = planSystemUserPermissionsUpdate({
    mode: "merge",
    patch: { patio_approve_budget_items: false },
    load: raceLoad,
  });
  const racePlanB = planSystemUserPermissionsUpdate({
    mode: "merge",
    patch: { access_estoque_pecas: true },
    load: raceLoad,
  });
  assert(racePlanA.ok && racePlanB.ok, "ambos planejam com o mesmo token");
  if (racePlanA.ok && racePlanB.ok) {
    assert(racePlanA.expectedUpdatedAt === racePlanB.expectedUpdatedAt, "mesmo expectedUpdatedAt");
    const winner = interpretOptimisticPermissionsWrite({
      data: { id: "u1", updated_at: "2026-02-01T12:00:01.000Z" },
      error: null,
      userWasFound: true,
    });
    const loser = interpretOptimisticPermissionsWrite({
      data: null,
      error: null,
      userWasFound: true,
    });
    assert(winner.ok && loser.ok === false && loser.reason === "conflict", "2ª alteração simultânea → conflict");
  }
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
