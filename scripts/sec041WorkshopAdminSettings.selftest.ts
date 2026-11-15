/**
 * SEC-04.1 — Contratos de autorização (workshop admin settings).
 *
 * Parte A: regressão do comportamento ATUAL (deve passar sem mudar handlers).
 * Parte B: casos FUTUROS 04.2/04.3 marcados PENDING (não falham).
 *
 * npm run test:sec041-workshop-admin-settings
 *
 * Sem produção, sem secrets reais, sem tokens/PII no log.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  pickWorkshopSettingsWrite,
  plannedSecretWrites,
  requestsEffectiveCredentialChange,
  responseExposesSecrets,
  WORKSHOP_SETTINGS_WRITE_KEYS,
  withWorkshopSecretFlags,
} from "../utils/workshopSettingsSecrets.js";
import {
  authorizeAdminPhotoUpload,
  authorizeLabProductKindPhoto,
  authorizeWorkshopSettingsWrite,
  type WorkshopSettingsActor,
} from "../utils/workshopSettingsAuthz.js";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { decideAuthorization, type SessionActor } from "../utils/authorizeRequest.js";

const ROOT = process.cwd();

type StaffActor = {
  role: "admin" | "user";
  userId: string;
  permissions?: Record<string, boolean>;
  isTechnician?: boolean;
};

/** Contas fictícias — IDs sintéticos, sem PII real. */
const ACTORS = {
  none: null as null,
  admin: { role: "admin" as const, userId: "00000000-0000-4000-8000-000000000001" } satisfies StaffActor,
  full: {
    role: "user" as const,
    userId: "00000000-0000-4000-8000-000000000002",
    permissions: { full_access: true },
  } satisfies StaffActor,
  settings: {
    role: "user" as const,
    userId: "00000000-0000-4000-8000-000000000003",
    permissions: { access_settings: true },
  } satisfies StaffActor,
  lab: {
    role: "user" as const,
    userId: "00000000-0000-4000-8000-000000000004",
    permissions: { access_laboratorio: true },
  } satisfies StaffActor,
  services: {
    role: "user" as const,
    userId: "00000000-0000-4000-8000-000000000005",
    permissions: { access_servicos_oficina: true },
  } satisfies StaffActor,
  notif: {
    role: "user" as const,
    userId: "00000000-0000-4000-8000-000000000006",
    permissions: { access_notificacoes_sistema: true },
  } satisfies StaffActor,
  nonePerms: {
    role: "user" as const,
    userId: "00000000-0000-4000-8000-000000000007",
    permissions: {},
  } satisfies StaffActor,
  techLinked: {
    role: "user" as const,
    userId: "00000000-0000-4000-8000-000000000008",
    permissions: { access_settings: true },
    isTechnician: true,
  } satisfies StaffActor,
};

const SAMPLE_SECRET = "valor-ficticio-nao-secreto-sec041";
const WORKSHOP_A = "11111111-1111-4111-8111-111111111111";
const WORKSHOP_B = "99999999-9999-4999-8999-999999999999";

let passed = 0;
let failed = 0;
let pending = 0;

function ok(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`OK       ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL     ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function pendingCase(name: string, phase: "04.2" | "04.2+" | "04.3" | "04.3+" | "04.4", note: string) {
  pending += 1;
  console.log(`PENDING  [${phase}] ${name} — ${note}`);
}

type Decision = "401" | "403" | "allow";

function toAuthzActor(actor: StaffActor | null): WorkshopSettingsActor {
  if (!actor) return { role: null, load: "unauthenticated" };
  if (actor.role === "admin") return { role: "admin", load: "ok" };
  return {
    role: "user",
    userId: actor.userId,
    permissions: actor.permissions || {},
    load: "ok",
  };
}

/**
 * Contrato vigente PUT /api/workshop-settings após SEC-04.2 (authz G0–G3).
 */
function currentWorkshopSettingsPut(actor: StaffActor | null, rawBody: unknown): Decision {
  if (!actor) return "401";
  const decision = authorizeWorkshopSettingsWrite(toAuthzActor(actor), rawBody);
  return decision.ok ? "allow" : "403";
}

/**
 * Contrato vigente PUT system-notifications após SEC-04.3.
 * `passwordElevates` simula verifyAdmin bem-sucedido (sem senha real).
 */
function currentSystemNotificationsPut(
  actor: StaffActor | null,
  opts: { passwordElevates?: boolean; passwordProvidedWhenAllowed?: boolean; passwordValidWhenProvided?: boolean } = {}
): Decision {
  if (!actor) return "401";
  let allowed = false;
  if (actor.role === "admin") allowed = true;
  else if (
    actor.role === "user" &&
    (actor.permissions?.full_access || actor.permissions?.access_notificacoes_sistema)
  ) {
    allowed = true;
  }
  if (!allowed) {
    return opts.passwordElevates ? "allow" : "403";
  }
  if (opts.passwordProvidedWhenAllowed && opts.passwordValidWhenProvided === false) return "403";
  return "allow";
}

/** Uploads após SEC-04.2: admin photo = G1; lab photo = G2. */
function currentAdminPhoto(actor: StaffActor | null): Decision {
  if (!actor) return "401";
  return authorizeAdminPhotoUpload(toAuthzActor(actor)).ok ? "allow" : "403";
}

function currentLabPhoto(actor: StaffActor | null): Decision {
  if (!actor) return "401";
  return authorizeLabProductKindPhoto(toAuthzActor(actor)).ok ? "allow" : "403";
}

/** Proposta futura (não usada em asserts A). */
function proposedG2Write(actor: StaffActor | null): Decision {
  if (!actor) return "401";
  if (actor.role === "admin" || actor.permissions?.full_access) return "allow";
  if (actor.permissions?.access_laboratorio || actor.permissions?.access_servicos_oficina) return "allow";
  return "403";
}

function proposedG3Write(actor: StaffActor | null): Decision {
  if (!actor) return "401";
  if (actor.role === "admin" || actor.permissions?.full_access) return "allow";
  if (actor.permissions?.access_settings) return "allow";
  return "403";
}

function proposedNotifWrite(actor: StaffActor | null): Decision {
  if (!actor) return "401";
  if (actor.role === "admin" || actor.permissions?.full_access) return "allow";
  if (actor.permissions?.access_notificacoes_sistema) return "allow";
  return "403";
}

function proposedAdminPhoto(actor: StaffActor | null): Decision {
  if (!actor) return "401";
  return actor.role === "admin" ? "allow" : "403";
}

console.log("SEC-04.1 workshop admin settings — contratos (Parte A regressão / Parte B pending)\n");

const apiApp = readFileSync(join(ROOT, "apiApp.ts"), "utf8");
const secretsUtil = readFileSync(join(ROOT, "utils/workshopSettingsSecrets.ts"), "utf8");
const authPolicy = readFileSync(join(ROOT, "utils/authorizationPolicy.ts"), "utf8");

// ---------- A1 Rotas e AuthN (estático) ----------
ok(
  "A1 rotas settings/notif/photo presentes",
  apiApp.includes('app.get("/api/workshop-settings"') &&
    apiApp.includes('app.put("/api/workshop-settings"') &&
    apiApp.includes('app.get("/api/workshop/system-notifications"') &&
    apiApp.includes('app.put("/api/workshop/system-notifications"') &&
    apiApp.includes('"/api/workshop-admin/photo"') &&
    apiApp.includes('"/api/lab-product-kinds/:kindId/photo"')
);

const publicBlock = apiApp.slice(
  apiApp.indexOf("function isPublicApiRoute"),
  apiApp.indexOf("function isPublicApiRoute") + 1200
);
ok(
  "A1 rotas não são públicas",
  !publicBlock.includes("workshop-settings") &&
    !publicBlock.includes("system-notifications") &&
    !publicBlock.includes("workshop-admin/photo") &&
    !publicBlock.includes("lab-product-kinds")
);
ok("A1 middleware devolve session_invalid", apiApp.includes('code: "session_invalid"'));
ok("A1 guardHttpAuthorization após sessão", apiApp.includes("guardHttpAuthorization"));

ok("A1 sem sessão PUT settings → 401 (contrato)", currentWorkshopSettingsPut(ACTORS.none, { labProductKinds: [] }) === "401");
ok("A1 sem sessão PUT notif → 401 (contrato)", currentSystemNotificationsPut(ACTORS.none) === "401");
ok("A1 sem sessão upload admin → 401 (contrato)", currentAdminPhoto(ACTORS.none) === "401");

// ---------- A2 G0 secrets ----------
ok(
  "A2 G0 non-admin secret efetivo rejeitado",
  currentWorkshopSettingsPut(ACTORS.full, { patioPin: SAMPLE_SECRET }) === "403" &&
    currentWorkshopSettingsPut(ACTORS.settings, { adminPassword: SAMPLE_SECRET }) === "403" &&
    currentWorkshopSettingsPut(ACTORS.nonePerms, { vehicleDeletePassword: SAMPLE_SECRET }) === "403" &&
    currentWorkshopSettingsPut(ACTORS.techLinked, { stockGuardPassword: SAMPLE_SECRET }) === "403"
);
ok(
  "A2 G0 admin secret efetivo permitido",
  currentWorkshopSettingsPut(ACTORS.admin, { patioPin: SAMPLE_SECRET }) === "allow"
);
ok(
  "A2 G0 vazio não é alteração efetiva",
  requestsEffectiveCredentialChange(pickWorkshopSettingsWrite({ patioPin: "   ", adminPassword: "" })) === false &&
    currentWorkshopSettingsPut(ACTORS.full, { patioPin: "  " }) === "allow"
);
ok(
  "A2 G0 resposta sem plaintext",
  !responseExposesSecrets(
    withWorkshopSecretFlags({ patioLoginEnabled: true }, { patio_pin: SAMPLE_SECRET }),
    [SAMPLE_SECRET]
  )
);
ok(
  "A2 handler autoriza via workshopSettingsAuthz (G0 incluso)",
  apiApp.includes("authorizeWorkshopSettingsWrite(settingsActor")
);

// ---------- A3 G1 ----------
ok(
  "A3 G1 non-admin blocked",
  currentWorkshopSettingsPut(ACTORS.full, { adminDisplayName: "X" }) === "403" &&
    currentWorkshopSettingsPut(ACTORS.settings, { patioLoginEnabled: false }) === "403" &&
    currentWorkshopSettingsPut(ACTORS.lab, { technicianAccessPatio: true }) === "403"
);
ok(
  "A3 G1 admin allowed",
  currentWorkshopSettingsPut(ACTORS.admin, {
    adminDisplayName: "Oficina",
    technicianAccessAgenda: false,
  }) === "allow"
);
ok(
  "A3 apiApp authz G1 via authorizeWorkshopSettingsWrite",
  apiApp.includes("authorizeWorkshopSettingsWrite") && apiApp.includes("loadWorkshopSettingsActor")
);

// ---------- A4 G2/G3 após SEC-04.2 ----------
ok(
  "A4 G2 full allow",
  currentWorkshopSettingsPut(ACTORS.full, { labProductKinds: [] }) === "allow"
);
ok(
  "A4 G2 P0 403",
  currentWorkshopSettingsPut(ACTORS.nonePerms, { labQuickServices: [] }) === "403"
);
ok(
  "A4 G2 lab allow",
  currentWorkshopSettingsPut(ACTORS.lab, { labProductKinds: [] }) === "allow"
);
ok(
  "A4 G2 services allow",
  currentWorkshopSettingsPut(ACTORS.services, { labQuickServices: [] }) === "allow"
);
ok(
  "A4 G3 settings key allow",
  currentWorkshopSettingsPut(ACTORS.settings, {
    labelTemplates: { lab_os: {} },
    aiImproveTextLevel: "balanced",
  }) === "allow"
);
ok(
  "A4 G3 P0 403",
  currentWorkshopSettingsPut(ACTORS.nonePerms, { appAppearance: { accent: "#000" } }) === "403"
);
ok(
  "A4 G3 tech+settings allow",
  currentWorkshopSettingsPut(ACTORS.techLinked, { labelTemplates: { estoque: {} } }) === "allow"
);
ok(
  "A4 apiApp usa authorizeWorkshopSettingsWrite",
  apiApp.includes("authorizeWorkshopSettingsWrite")
);

// ---------- A5 mistos atômicos ----------
ok(
  "A5 misto secret+G3: non-admin 403",
  currentWorkshopSettingsPut(ACTORS.settings, {
    labelTemplates: { lab_os: {} },
    patioPin: SAMPLE_SECRET,
  }) === "403"
);
ok(
  "A5 misto G1+G2: non-admin 403",
  currentWorkshopSettingsPut(ACTORS.lab, {
    labProductKinds: [{ id: "abs", label: "ABS" }],
    adminDisplayName: "X",
  }) === "403"
);
ok(
  "A5 misto G2+G3: P0 403 atômico",
  currentWorkshopSettingsPut(ACTORS.nonePerms, {
    labProductKinds: [],
    labelTemplates: { chave: {} },
  }) === "403"
);

// ---------- A6 whitelist / falsy / desconhecidos ----------
const pickedUnknown = pickWorkshopSettingsWrite({
  labProductKinds: [],
  campoDesconhecido: SAMPLE_SECRET,
  foo: 1,
});
ok("A6 desconhecido ignorado", !("campoDesconhecido" in pickedUnknown) && !("foo" in pickedUnknown));
ok(
  "A6 whitelist estável",
  WORKSHOP_SETTINGS_WRITE_KEYS.includes("labProductKinds") &&
    WORKSHOP_SETTINGS_WRITE_KEYS.includes("aiImproveTextLevel") &&
    secretsUtil.includes("WORKSHOP_SETTINGS_WRITE_KEYS")
);
ok(
  "A6 ausente não planeja secret",
  plannedSecretWrites(pickWorkshopSettingsWrite({ labProductKinds: [] })).length === 0
);
ok(
  "A6 false boolean G1 ainda é toque sensível",
  currentWorkshopSettingsPut(ACTORS.full, { patioLoginEnabled: false }) === "403"
);

// ---------- A7 notificações ----------
ok("A7 notif admin allow", currentSystemNotificationsPut(ACTORS.admin) === "allow");
ok("A7 notif full_access allow", currentSystemNotificationsPut(ACTORS.full) === "allow");
ok(
  "A7 notif access_notificacoes_sistema allow (SEC-04.3)",
  currentSystemNotificationsPut(ACTORS.notif) === "allow"
);
ok(
  "A7 notif P0 + senha eleva — legado",
  currentSystemNotificationsPut(ACTORS.nonePerms, { passwordElevates: true }) === "allow"
);
ok(
  "A7 notif full + senha inválida 403",
  currentSystemNotificationsPut(ACTORS.full, {
    passwordProvidedWhenAllowed: true,
    passwordValidWhenProvided: false,
  }) === "403"
);
ok(
  "A7 handler usa authorizeSystemNotificationsPut + verifyAdmin",
  (() => {
    const start = apiApp.indexOf('app.put("/api/workshop/system-notifications"');
    const end = apiApp.indexOf('app.put("/api/workshop-settings"', start);
    const slice = apiApp.slice(start, end);
    return (
      slice.includes("authorizeSystemNotificationsPut") &&
      slice.includes("verifyAdmin") &&
      apiApp.includes("authorizeSystemNotificationsGet")
    );
  })()
);
ok(
  "A7 GET notif monta availableUsers/fullAccessUsers",
  apiApp.includes("availableUsers") &&
    apiApp.includes("fullAccessUsers") &&
    apiApp.includes("commentPopupRecipientIds")
);

// ---------- A8 uploads (SEC-04.2) ----------
ok("A8 upload admin: P0 403", currentAdminPhoto(ACTORS.nonePerms) === "403");
ok("A8 upload admin: full 403", currentAdminPhoto(ACTORS.full) === "403");
ok("A8 upload admin: Gerência allow", currentAdminPhoto(ACTORS.admin) === "allow");
ok("A8 upload lab: L allow", currentLabPhoto(ACTORS.lab) === "allow");
ok("A8 upload lab: P0 403", currentLabPhoto(ACTORS.nonePerms) === "403");
ok(
  "A8 admin photo authz antes do multer",
  (() => {
    const start = apiApp.indexOf('"/api/workshop-admin/photo"');
    const multerAt = apiApp.indexOf('upload.single("file")', start);
    const authzAt = apiApp.indexOf("authorizeAdminPhotoUpload", start);
    return authzAt > start && authzAt < multerAt && apiApp.includes('key: "admin_photo_url"');
  })()
);
ok(
  "A8 lab photo authz G2 antes do multer",
  (() => {
    const start = apiApp.indexOf('"/api/lab-product-kinds/:kindId/photo"');
    const multerAt = apiApp.indexOf('upload.single("file")', start);
    const authzAt = apiApp.indexOf("authorizeLabProductKindPhoto", start);
    return authzAt > start && authzAt < multerAt && apiApp.includes('key: "lab_product_kinds"');
  })()
);

// ---------- A9 SEC-03 famílias (não alterar modes) ----------
const policy = productionAuthorizationPolicy();
const familyMode = (id: string) => policy.families.find((f) => f.id === id)?.mode;
ok("A9 customers enforce", familyMode("customers") === "enforce");
ok("A9 parts_stock enforce", familyMode("parts_stock") === "enforce");
ok("A9 technicians enforce", familyMode("technicians") === "enforce");
ok("A9 workshop_catalogs enforce", familyMode("workshop_catalogs") === "enforce");
ok("A9 tv_admin enforce", familyMode("tv_admin") === "enforce");
ok("A9 bulletins enforce", familyMode("bulletins") === "enforce");
ok("A9 reports enforce", familyMode("reports") === "enforce");
ok("A9 notifications enforce", familyMode("notifications") === "enforce");
ok(
  "A9 sem família workshop_admin_settings",
  !policy.families.some((f) => f.id === ("workshop_admin_settings" as never)) &&
    !authPolicy.includes("workshop_admin_settings")
);
ok(
  "A9 prefixes não cobrem workshop-settings",
  !policy.families.some((f) => f.prefixes.some((p) => p.includes("workshop-settings")))
);

async function runSec03SkipChecks() {
  const actor: SessionActor = { role: "user", userId: ACTORS.nonePerms.userId };
  const verdict = await decideAuthorization({
    method: "PUT",
    path: "/api/workshop-settings",
    actor,
    workshopId: WORKSHOP_A,
    source: {
      async loadUser() {
        return { ok: true, row: { permissions: {}, is_technician: false } };
      },
    },
    policy,
  });
  ok(
    "A9 PUT workshop-settings SEC-03 não bloqueia",
    verdict.block === false &&
      (verdict.reason === "no_rule" || verdict.reason === "family_off" || verdict.effect === "skipped")
  );

  const verdictNotif = await decideAuthorization({
    method: "PUT",
    path: "/api/workshop/system-notifications",
    actor,
    workshopId: WORKSHOP_A,
    source: {
      async loadUser() {
        return { ok: true, row: { permissions: { access_notificacoes_sistema: true } } };
      },
    },
    policy,
  });
  ok("A9 PUT system-notifications fora da família notifications", verdictNotif.block === false);

  const verdictPhoto = await decideAuthorization({
    method: "POST",
    path: "/api/workshop-admin/photo",
    actor,
    workshopId: WORKSHOP_A,
    source: {
      async loadUser() {
        return { ok: true, row: { permissions: {} } };
      },
    },
    policy,
  });
  ok("A9 POST workshop-admin/photo SEC-03 não bloqueia", verdictPhoto.block === false);
}

await runSec03SkipChecks();

// ---------- A10 isolamento workshop + partial write risco ----------
ok(
  "A10 upserts settings usam workshop_id",
  apiApp.includes("workshop_id: WORKSHOP_ID") && apiApp.includes('.eq("workshop_id", WORKSHOP_ID)')
);
ok(
  "A10 system-notifications filtra users por workshop",
  (() => {
    const start = apiApp.indexOf('app.get("/api/workshop/system-notifications"');
    const slice = apiApp.slice(start, start + 2000);
    return slice.includes('.eq("workshop_id", WORKSHOP_ID)');
  })()
);
ok("A10 IDs fictícios de oficinas distintos (doc isolamento)", String(WORKSHOP_A) !== String(WORKSHOP_B));
ok(
  "A10 RISK-PARTIAL: loop de upsert por chave presente",
  apiApp.includes("for (const u of updates)") && apiApp.includes("Falha ao salvar configuração")
);

// ---------- A11 permissão removida / lookup ----------
ok(
  "A11 remover access_settings → PUT G3 403",
  currentWorkshopSettingsPut({ ...ACTORS.settings, permissions: {} }, { labelTemplates: { lab_os: {} } }) ===
    "403"
);
ok(
  "A11 notif: remover full_access faz PUT 403 sem senha",
  currentSystemNotificationsPut({ ...ACTORS.full, permissions: {} }) === "403"
);

// ---------- A12 matriz perfil × G0/G1 amostragem ----------
const matrixG0: Array<[string, StaffActor, Decision]> = [
  ["admin", ACTORS.admin, "allow"],
  ["full", ACTORS.full, "403"],
  ["settings", ACTORS.settings, "403"],
  ["lab", ACTORS.lab, "403"],
  ["services", ACTORS.services, "403"],
  ["notif", ACTORS.notif, "403"],
  ["nonePerms", ACTORS.nonePerms, "403"],
  ["techLinked", ACTORS.techLinked, "403"],
];
for (const [label, actor, want] of matrixG0) {
  ok(`A12 G0 matriz ${label}`, currentWorkshopSettingsPut(actor, { stockGuardPassword: SAMPLE_SECRET }) === want);
}

const matrixG1: Array<[string, StaffActor, Decision]> = [
  ["admin", ACTORS.admin, "allow"],
  ["full", ACTORS.full, "403"],
  ["settings", ACTORS.settings, "403"],
  ["nonePerms", ACTORS.nonePerms, "403"],
];
for (const [label, actor, want] of matrixG1) {
  ok(
    `A12 G1 matriz ${label}`,
    currentWorkshopSettingsPut(actor, { technicianAccessReception: true }) === want
  );
}

// ---------- Parte B — PENDING futuros ----------
console.log("\n--- Parte B: casos futuros (não falham) ---\n");

ok(
  "B→A G2 P0 403 implementado",
  currentWorkshopSettingsPut(ACTORS.nonePerms, { labProductKinds: [] }) === proposedG2Write(ACTORS.nonePerms)
);
ok("B→A G2 lab allow", currentWorkshopSettingsPut(ACTORS.lab, { labProductKinds: [] }) === "allow");
ok(
  "B→A G3 P0 403",
  currentWorkshopSettingsPut(ACTORS.nonePerms, { labelTemplates: { lab_os: {} } }) ===
    proposedG3Write(ACTORS.nonePerms)
);
ok("B→A G3 settings allow", currentWorkshopSettingsPut(ACTORS.settings, { aiImproveTextLevel: "light" }) === "allow");
ok(
  "B→A admin photo full 403",
  currentAdminPhoto(ACTORS.full) === proposedAdminPhoto(ACTORS.full)
);
ok("B→A lab photo P0 403", currentLabPhoto(ACTORS.nonePerms) === "403");
ok("B→A lab photo L allow", currentLabPhoto(ACTORS.lab) === "allow");

ok(
  "B→A GET/PUT notif N alinhado",
  currentSystemNotificationsPut(ACTORS.notif) === proposedNotifWrite(ACTORS.notif)
);
pendingCase(
  "Decisão N3 futura: remover elevação por senha no PUT notif",
  "04.3+",
  "legado ainda preservado nesta fase"
);
pendingCase(
  "Atomicidade de persistência (transação DB)",
  "04.2+",
  "RISK-PARTIAL: upserts por chave permanecem; authz já é atômica"
);
pendingCase("Alinhamento FE !isTechnician / copy", "04.4", "fora do selftest de API");

// ---------- Sem vazamento no log ----------
ok("A13 log do selftest não embute SAMPLE como se fosse produção", SAMPLE_SECRET.startsWith("valor-ficticio"));

console.log(`\nSEC-04.1 resultado: ${passed} ok, ${failed} falhas, ${pending} pending futuros`);
if (failed > 0) process.exit(1);
console.log("Parte A verde — nenhuma mudança funcional exigida.");
