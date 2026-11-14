/**
 * SEC-03.3 — permissões de funcionários (UI + sync + orçamentos explícitos).
 * Contas e dados fictícios apenas. npm run test:sec033-employee-access
 */
import {
  applyServerAccessSnapshot,
  asPermissionRecord,
  canOpenSettingsHub,
  effectiveAccessOrcamentos,
  homeModuleAllowed,
  materializePermissionsForEdit,
  normalizePermissionsForAdminSave,
  permissionsSnapshotsEqual,
  permissionsToTabs,
  resolveAjustesVisibility,
} from "../utils/employeeAccess.js";
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

console.log("\n2) Navegação / módulos centralizados");
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

console.log("\n3) Ajustes sem callback implícito");
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
  const withSettings = resolveAjustesVisibility({
    role: "user",
    permissions: { ...bob, access_settings: true },
    isSystemUser: true,
    isTechnician: false,
    hasTechnicianProfile: false,
    hasLogout: true,
  });
  assert(withSettings.tema === true && withSettings.orcamentos_prefs === true, "com access_settings");
}

console.log("\n4) Sync: ganhar/perder módulo; falha não inventa privilégio");
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
  assert(lostStock.changed, "perdeu estoque → changed");
  assert(lostStock.next.permissions.access_estoque_pecas === false, "estoque false no snapshot");
  assert(!homeModuleAllowed("parts_stock", "user", lostStock.next.permissions), "UI sem estoque");

  const gainedLab = applyServerAccessSnapshot(
    { role: "user", permissions: lostStock.next.permissions, isTechnician: false },
    {
      permissions: { access_home: true, access_patio: true, access_laboratorio: true },
      isTechnician: false,
    }
  );
  assert(gainedLab.changed && homeModuleAllowed("laboratorio", "user", gainedLab.next.permissions), "ganhou Lab");

  const stale = { access_home: true, full_access: true };
  const fromServer = asPermissionRecord({ access_home: true, access_patio: true });
  assert(!permissionsSnapshotsEqual(stale, fromServer), "full_access antigo ≠ servidor");
  assert(fromServer.full_access !== true, "corpo do browser não concede full_access");
}

console.log("\n5) Self-elevation: normalize não aceita lixo do cliente como grant especial");
{
  const forged = asPermissionRecord({
    full_access: "yes",
    access_estoque_pecas: 1,
    access_patio: true,
  });
  assert(forged.full_access !== true, "string não vira full_access");
  assert(forged.access_estoque_pecas !== true, "número não vira grant");
  assert(forged.access_patio === true, "boolean true ok");
}

console.log("\n6) SEC-03: sem enforce global; rota my-access catalogada");
{
  const policy = productionAuthorizationPolicy();
  assert(authorizationHasEnforce(policy, {}) === false, "nenhuma família em enforce");
  const rule = policy.rules.find((r) => r.id === "self_access_read");
  assert(!!rule && rule.path.test("/api/auth/my-access"), "regra self_access_read");
  assert(rule?.ownership === "session_user", "ownership session_user");
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
