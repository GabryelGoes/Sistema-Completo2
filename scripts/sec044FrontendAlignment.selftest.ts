/**
 * SEC-04.4 — alinhamento frontend/backend (UI mounts, senhas, HTTP, etiquetas).
 * Contas e dados fictícios. npm run test:sec044-frontend-alignment
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApiHttpError,
  formatApiFailureMessage,
  isApiHttpError,
  isNetworkFetchError,
} from "../utils/apiHttpError.js";
import { shouldClearSession } from "../utils/shouldClearSession.js";
import {
  canWriteOperationalSecrets,
  resolveSec044ModalMounts,
  sec044VisibilityForProfile,
} from "../utils/sec044FrontendAlignment.js";
import { resolveAjustesVisibility } from "../utils/employeeAccess.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

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

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

console.log("SEC-04.4 frontend alignment selftest\n");

console.log("1) Matriz de mounts × permissão (visibility)");
{
  const g = sec044VisibilityForProfile({ kind: "gerencia" });
  const gm = resolveSec044ModalMounts(g);
  assert(gm.lab_tipos && gm.lab_rapidos && gm.etiquetas && gm.notificacoes_sistema && gm.senhas, "Gerência monta todos SEC-04.4");

  const f = sec044VisibilityForProfile({ kind: "full_access", isTechnician: false });
  const fm = resolveSec044ModalMounts(f);
  assert(fm.lab_tipos && fm.lab_rapidos && fm.etiquetas && fm.notificacoes_sistema && fm.senhas, "full_access monta G2/G3 + notif + senhas (UI)");
  assert(
    canWriteOperationalSecrets({ role: "user", isSystemUser: true, isTechnician: false }) === false,
    "full_access NÃO grava G0/G1"
  );
  assert(
    canWriteOperationalSecrets({ role: "admin", isSystemUser: false, isTechnician: false }) === true,
    "Gerência grava G0/G1"
  );

  const lab = resolveSec044ModalMounts(sec044VisibilityForProfile({ kind: "lab", isTechnician: true }));
  assert(lab.lab_tipos && lab.lab_rapidos, "técnico access_laboratorio abre tipos/rápidos");
  assert(!lab.etiquetas && !lab.notificacoes_sistema && !lab.senhas, "lab-only não abre etiquetas/notif/senhas");

  const srv = resolveSec044ModalMounts(sec044VisibilityForProfile({ kind: "servicos", isTechnician: true }));
  assert(srv.lab_tipos && srv.lab_rapidos, "técnico access_servicos_oficina abre tipos/rápidos");

  const set = resolveSec044ModalMounts(sec044VisibilityForProfile({ kind: "settings", isTechnician: true }));
  assert(set.etiquetas, "técnico access_settings abre etiquetas");
  assert(!set.lab_tipos, "settings-only não abre lab tipos");

  const n = resolveSec044ModalMounts(sec044VisibilityForProfile({ kind: "notif", isTechnician: true }));
  assert(n.notificacoes_sistema, "técnico access_notificacoes_sistema abre notif");
  assert(!n.etiquetas && !n.lab_tipos, "notif-only não abre etiquetas/lab");

  const none = resolveSec044ModalMounts(sec044VisibilityForProfile({ kind: "none", isTechnician: true }));
  assert(!none.lab_tipos && !none.etiquetas && !none.notificacoes_sistema && !none.senhas, "sem chave: sem mounts SEC-04.4");
}

console.log("\n2) Perda de permissão → visibility fecha mounts");
{
  const withLab = resolveAjustesVisibility({
    role: "user",
    permissions: { access_laboratorio: true },
    isSystemUser: true,
    isTechnician: true,
    hasTechnicianProfile: true,
    hasLogout: true,
  });
  const without = resolveAjustesVisibility({
    role: "user",
    permissions: { access_home: true },
    isSystemUser: true,
    isTechnician: true,
    hasTechnicianProfile: true,
    hasLogout: true,
  });
  assert(withLab.lab_tipos === true && without.lab_tipos === false, "remoção de access_laboratorio zera lab_tipos");
  assert(withLab.lab_rapidos === true && without.lab_rapidos === false, "remoção zera lab_rapidos");
}

console.log("\n3) Erros HTTP padronizados (401/403/rede/5xx)");
{
  const u = new ApiHttpError(401, "Sessão expirada", "Sessão expirada");
  assert(u.kind === "unauthorized", "401 → unauthorized");
  assert(
    formatApiFailureMessage(u, "x").includes("Sessão") || formatApiFailureMessage(u, "x").includes("expirada"),
    "401 mensagem de sessão"
  );
  const f = new ApiHttpError(403, "Sem permissão", "Sem permissão");
  assert(f.kind === "forbidden", "403 → forbidden");
  assert(formatApiFailureMessage(f, "x").includes("permissão") || formatApiFailureMessage(f, "x").includes("Sem"), "403 mensagem");
  const s = new ApiHttpError(500, "boom", "boom");
  assert(s.kind === "server", "5xx → server");
  assert(isApiHttpError(f), "isApiHttpError");
  assert(isNetworkFetchError(new TypeError("Failed to fetch")), "TypeError = rede");
  assert(
    formatApiFailureMessage(new TypeError("Failed to fetch"), "x").toLowerCase().includes("conexão") ||
      formatApiFailureMessage(new TypeError("Failed to fetch"), "x").toLowerCase().includes("rede"),
    "rede não vira mensagem de permissão"
  );
  assert(shouldClearSession(403, { error: "Sem permissão." }) === false, "403 genérico NÃO faz logout");
  assert(shouldClearSession(401, { error: "Token inválido" }) === true, "401 limpa sessão");
  assert(shouldClearSession(401, { code: "invalid_credentials" }) === false, "401 invalid_credentials preserva sessão");
}

console.log("\n4) Source: HomeView mounts fora de !isTechnician");
{
  const src = readSrc("components/views/HomeView.tsx");
  const techGateIdx = src.indexOf("{!isTechnician && (");
  assert(techGateIdx > 0, "gate !isTechnician ainda existe para RDA/usuários");
  const labMount = src.indexOf("ajustesVisibility.lab_tipos ? (");
  const labelsMount = src.indexOf("ajustesVisibility.etiquetas ? (");
  const notifMount = src.indexOf("ajustesVisibility.notificacoes_sistema ? (");
  const senhasMount = src.indexOf("ajustesVisibility.senhas ? (");
  assert(labMount > 0 && labMount < techGateIdx, "LabProductTypes monta por visibility antes do gate técnico");
  assert(labelsMount > 0 && labelsMount < techGateIdx, "LabelTemplates monta por visibility antes do gate técnico");
  assert(notifMount > 0 && notifMount < techGateIdx, "SystemNotifications monta por visibility antes do gate técnico");
  assert(senhasMount > 0 && senhasMount < techGateIdx, "ChangePasswords monta por visibility antes do gate técnico");
  assert(src.includes("allowSecretWrites={isWorkshopAdmin}"), "senhas: allowSecretWrites só Gerência");
  assert(src.includes("if (!ajustesVisibility.lab_tipos) setIsLabProductTypesOpen(false)"), "perda de permissão fecha lab tipos");
  assert(src.includes("if (!ajustesVisibility.etiquetas) setIsLabelEditorOpen(false)"), "perda de permissão fecha etiquetas");
  assert(src.includes("RdaKnowledgeMemoryPanel"), "RDA preservado");
  assert(src.includes("SystemUsersModal"), "usuários administrativos preservados no gate");
}

console.log("\n5) Source: senhas / etiquetas / apiService");
{
  const pwd = readSrc("components/ChangePasswordsModal.tsx");
  assert(pwd.includes("allowSecretWrites"), "ChangePasswordsModal prop allowSecretWrites");
  assert(pwd.includes("Somente a Gerência pode alterar"), "mensagem bloqueio G0/G1");
  assert(pwd.includes("formatApiFailureMessage"), "senhas usam formatApiFailureMessage");

  const labels = readSrc("components/LabelTemplatesEditorModal.tsx");
  assert(labels.includes("local_only_forbidden") || labels.includes("Sem permissão para publicar"), "editor diferencia 403");
  assert(labels.includes("cache local") || labels.includes("Servidor indisponível"), "editor diferencia rede");
  assert(labels.includes("remoteSaved"), "não afirma sync remoto sem remoteSaved");

  const sync = readSrc("utils/labelTemplatesSync.ts");
  assert(sync.includes("autoUploadDenied"), "403 auto-upload não entra em loop");
  assert(sync.includes("local_only_forbidden"), "status forbidden tipado");
  assert(sync.includes("local_only_network"), "status network tipado");

  const api = readSrc("services/apiService.ts");
  assert(api.includes("throwIfNotOk"), "apiService usa throwIfNotOk em settings/notif");
}

console.log("\n6) full_access ≠ Gerência para secrets (UI)");
{
  assert(
    canWriteOperationalSecrets({ role: "user", isSystemUser: true, isTechnician: false }) === false,
    "user system ≠ admin secrets"
  );
  assert(
    canWriteOperationalSecrets({ role: undefined, isSystemUser: false, isTechnician: true }) === false,
    "técnico ≠ admin secrets"
  );
}

console.log(`\nSEC-04.4 resultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
