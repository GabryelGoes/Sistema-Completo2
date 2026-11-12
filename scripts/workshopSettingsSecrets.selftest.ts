/**
 * SEC-02: configurações não devolvem PIN nem senha de exclusão,
 * e campo vazio não regrava a credencial.
 * npm run test:workshop-settings-secrets
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  pickWorkshopSettingsWrite,
  plannedSecretWrites,
  rejectCredentialChange,
  responseExposesSecrets,
  withWorkshopSecretFlags,
} from "../utils/workshopSettingsSecrets.js";

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

console.log("workshopSettingsSecrets selftest\n");

const SAMPLE_PIN = "pin-de-teste";
const SAMPLE_DELETE = "senha-exclusao-teste";
const SAMPLE_STOCK = "senha-estoque-teste";
const stored = {
  patio_pin: SAMPLE_PIN,
  vehicle_delete_password: SAMPLE_DELETE,
  stock_guard_password: SAMPLE_STOCK,
  patio_login_enabled: "true",
  lab_product_kinds: "[]",
};

const publicGet = withWorkshopSecretFlags(
  {
    patioLoginEnabled: true,
    technicianAccessPatio: true,
    labProductKinds: [],
  },
  stored
);
assert(!responseExposesSecrets(publicGet, [SAMPLE_PIN, SAMPLE_DELETE, SAMPLE_STOCK]), "1 GET sem exposição de segredos");
assert(publicGet.patioPinConfigured === true, "1 GET indica PIN configurado");
assert(publicGet.vehicleDeletePasswordConfigured === true, "1 GET indica senha de exclusão configurada");
assert(publicGet.stockGuardPasswordConfigured === true, "1 GET preserva indicador do estoque");

const publicPut = withWorkshopSecretFlags(
  { patioLoginEnabled: true, labelTemplates: { lab_os: {} } },
  stored
);
assert(!responseExposesSecrets(publicPut, [SAMPLE_PIN, SAMPLE_DELETE, SAMPLE_STOCK]), "2 PUT sem exposição de segredos");

const absent = plannedSecretWrites(pickWorkshopSettingsWrite({ labProductKinds: [] }));
assert(absent.length === 0, "3 campo ausente não planeja gravação de credencial");

const blank = plannedSecretWrites(
  pickWorkshopSettingsWrite({
    patioPin: "",
    vehicleDeletePassword: "   ",
    stockGuardPassword: "\n\t",
    adminPassword: "  ",
  })
);
assert(blank.length === 0, "4 vazio ou só espaços não planeja gravação");

const adminWrite = plannedSecretWrites(
  pickWorkshopSettingsWrite({ patioPin: `  ${SAMPLE_PIN}  `, vehicleDeletePassword: SAMPLE_DELETE })
);
assert(
  adminWrite.some((row) => row.key === "patio_pin" && row.value === SAMPLE_PIN),
  "5 Gerência atualiza PIN com valor efetivo"
);
assert(
  adminWrite.some((row) => row.key === "vehicle_delete_password" && row.value === SAMPLE_DELETE),
  "5 Gerência atualiza senha de exclusão"
);
assert(rejectCredentialChange(true, { patioPin: SAMPLE_PIN }) === false, "5 Gerência não é rejeitada");

assert(rejectCredentialChange(false, { patioPin: SAMPLE_PIN }) === true, "6 funcionário não altera PIN");
assert(
  rejectCredentialChange(false, { vehicleDeletePassword: SAMPLE_DELETE }) === true,
  "6 funcionário não altera senha de exclusão"
);
assert(
  rejectCredentialChange(false, { stockGuardPassword: SAMPLE_STOCK }) === true,
  "6 funcionário não altera senha do estoque"
);
assert(
  rejectCredentialChange(false, { adminPassword: "outra-senha-teste" }) === true,
  "6 funcionário não altera senha da Gerência"
);
assert(rejectCredentialChange(false, { patioPin: "   " }) === false, "6 vazio não vira alteração efetiva");

const technicianSave = plannedSecretWrites(
  pickWorkshopSettingsWrite({
    technicianAccessReception: true,
    technicianAccessAgenda: false,
    technicianAccessPatio: true,
    patioLoginEnabled: true,
  })
);
assert(technicianSave.length === 0, "7 acesso de técnicos não modifica PIN");
const pickedTech = pickWorkshopSettingsWrite({
  technicianAccessPatio: true,
  patioLoginEnabled: false,
  patioPin: SAMPLE_PIN,
});
assert(!("patioPin" in pickedTech) === false, "7 lista explícita ainda aceita PIN só se o cliente enviar");
assert(
  plannedSecretWrites({
    technicianAccessPatio: true,
    patioLoginEnabled: true,
  }).length === 0,
  "7 payload de acesso sem patioPin não grava segredo"
);

const labSave = plannedSecretWrites(
  pickWorkshopSettingsWrite({
    labProductKinds: [{ id: "abs", label: "ABS" }],
    labQuickServices: [],
    labelTemplates: { lab_os: { name: "os" } },
    patioPin: " ",
    vehicleDeletePassword: "",
    stockGuardPassword: "",
    extraNaoPermitido: SAMPLE_PIN,
  })
);
assert(labSave.length === 0, "8 laboratório e etiquetas não modificam credenciais");
const pickedLab = pickWorkshopSettingsWrite({
  labProductKinds: [],
  labelTemplates: { estoque: {} },
  segredoInesperado: SAMPLE_DELETE,
});
assert(!("segredoInesperado" in pickedLab), "8 propriedade fora da lista é ignorada");

const emptyFlags = withWorkshopSecretFlags({ patioLoginEnabled: false }, {});
assert(emptyFlags.patioPinConfigured === false, "flags falsas quando não há valor");
assert(emptyFlags.vehicleDeletePasswordConfigured === false, "exclusão não configurada");
assert(emptyFlags.stockGuardPasswordConfigured === false, "estoque não configurado");

const root = process.cwd();
const passwordsModal = readFileSync(join(root, "components/ChangePasswordsModal.tsx"), "utf8");
const technicianModal = readFileSync(join(root, "components/TechnicianAccessModal.tsx"), "utf8");
const apiApp = readFileSync(join(root, "apiApp.ts"), "utf8");
const labModal = readFileSync(join(root, "components/LabProductTypesModal.tsx"), "utf8");
const labelSync = readFileSync(join(root, "utils/labelTemplatesSync.ts"), "utf8");

assert(!passwordsModal.includes("4366"), "9 modal de senhas não contém o PIN padrão");
assert(!technicianModal.includes("4366"), "9 modal de técnicos não contém o PIN padrão");
assert(!passwordsModal.includes("s.patioPin ||"), "9 modal de senhas não lê o PIN atual");
assert(!passwordsModal.includes("setPatioPin(s.patioPin"), "9 modal de senhas não preenche o PIN salvo");
assert(!technicianModal.includes("patioPin"), "9 modal de técnicos não referencia o PIN");
assert(passwordsModal.includes("patioPinConfigured"), "9 modal mostra estado do PIN");
assert(passwordsModal.includes("vehicleDeletePasswordConfigured"), "9 modal mostra estado da exclusão");
assert(technicianModal.includes("patioLoginEnabled"), "7 controle de login dos técnicos permanece");
assert(technicianModal.includes("technicianAccessPatio"), "7 controle de acesso ao pátio permanece");
assert(labModal.includes("labProductKinds") && !labModal.includes("patioPin"), "8 laboratório não envia PIN");
assert(labelSync.includes("labelTemplates") && !labelSync.includes("patioPin"), "8 etiquetas não enviam PIN");

assert(apiApp.includes("withWorkshopSecretFlags"), "respostas usam indicadores");
assert(!apiApp.includes("patioPin:"), "API não monta campo patioPin");
assert(!apiApp.includes("vehicleDeletePassword:"), "API não monta campo vehicleDeletePassword");
assert(apiApp.includes('eq("key", "vehicle_delete_password")'), "10 exclusão de veículo continua lendo a senha salva");
assert(apiApp.includes("verifyStockGuardPassword"), "10 proteção do estoque permanece");
assert(apiApp.includes('eq("key", "stock_guard_password")'), "10 guarda do estoque continua lendo a senha salva");
assert(apiApp.includes("pwd !== expectedPassword"), "10 comparação da exclusão de veículo não foi trocada");

console.log(`\n${passed} ok, ${failed} falhas`);
if (failed > 0) process.exit(1);
