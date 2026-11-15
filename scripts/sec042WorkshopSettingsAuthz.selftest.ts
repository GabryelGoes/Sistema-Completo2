/**
 * SEC-04.2 — autorização G0–G3 + uploads (contas fictícias, sem produção).
 * npm run test:sec042-workshop-settings-authz
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  affectedWriteGroups,
  authorizeAdminPhotoUpload,
  authorizeLabProductKindPhoto,
  authorizeWorkshopSettingsWrite,
  touchesSensitiveG1,
  workshopSettingsAuthzErrorMessage,
  workshopSettingsAuthzLogFields,
  type WorkshopSettingsActor,
} from "../utils/workshopSettingsAuthz.js";
import {
  pickWorkshopSettingsWrite,
  requestsEffectiveCredentialChange,
  responseExposesSecrets,
  withWorkshopSecretFlags,
} from "../utils/workshopSettingsSecrets.js";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";

const ROOT = process.cwd();
const SAMPLE = "valor-ficticio-sec042";

let passed = 0;
let failed = 0;
function ok(name: string, cond: boolean) {
  if (cond) {
    passed += 1;
    console.log(`OK   ${name}`);
  } else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

function actor(
  partial: Partial<WorkshopSettingsActor> & Pick<WorkshopSettingsActor, "role" | "load">
): WorkshopSettingsActor {
  return partial;
}

console.log("SEC-04.2 workshop settings authz selftest\n");

const admin = actor({ role: "admin", load: "ok" });
const full = actor({
  role: "user",
  userId: "u-full",
  load: "ok",
  permissions: { full_access: true },
});
const settings = actor({
  role: "user",
  userId: "u-set",
  load: "ok",
  permissions: { access_settings: true },
});
const lab = actor({
  role: "user",
  userId: "u-lab",
  load: "ok",
  permissions: { access_laboratorio: true },
});
const services = actor({
  role: "user",
  userId: "u-svc",
  load: "ok",
  permissions: { access_servicos_oficina: true },
});
const none = actor({ role: "user", userId: "u-none", load: "ok", permissions: {} });
const tech = actor({
  role: "user",
  userId: "u-tech",
  load: "ok",
  permissions: { access_laboratorio: true },
});
const lookupFail = actor({ role: "user", userId: "u-fail", load: "failed" });
const missing = actor({ role: "user", userId: "u-miss", load: "missing" });
const unauth = actor({ role: null, load: "unauthenticated" });

// --- G0 ---
ok("G0 admin secret allow", authorizeWorkshopSettingsWrite(admin, { patioPin: SAMPLE }).ok === true);
ok("G0 full secret deny", authorizeWorkshopSettingsWrite(full, { patioPin: SAMPLE }).ok === false);
ok("G0 settings secret deny", authorizeWorkshopSettingsWrite(settings, { adminPassword: SAMPLE }).ok === false);
ok("G0 empty secret no group", affectedWriteGroups(pickWorkshopSettingsWrite({ patioPin: "  " })).length === 0);
ok("G0 empty does not reject", authorizeWorkshopSettingsWrite(none, { patioPin: "   " }).ok === true);

// --- G1 ---
ok("G1 admin allow", authorizeWorkshopSettingsWrite(admin, { adminDisplayName: "X" }).ok === true);
ok("G1 full deny", authorizeWorkshopSettingsWrite(full, { patioLoginEnabled: false }).ok === false);
ok(
  "G1 false boolean still sensitive",
  touchesSensitiveG1(pickWorkshopSettingsWrite({ technicianAccessPatio: false })) === true
);
ok(
  "G1 full deny reason admin_required",
  (() => {
    const d = authorizeWorkshopSettingsWrite(full, { technicianAccessAgenda: true });
    return d.ok === false && d.reason === "admin_required";
  })()
);

// --- G2 ---
ok("G2 admin allow", authorizeWorkshopSettingsWrite(admin, { labProductKinds: [] }).ok === true);
ok("G2 full allow", authorizeWorkshopSettingsWrite(full, { labQuickServices: [] }).ok === true);
ok("G2 lab allow", authorizeWorkshopSettingsWrite(lab, { labProductKinds: [{ id: "a", label: "A" }] }).ok === true);
ok("G2 services allow", authorizeWorkshopSettingsWrite(services, { labQuickServices: [] }).ok === true);
ok("G2 tech+lab allow", authorizeWorkshopSettingsWrite(tech, { labProductKinds: [] }).ok === true);
ok("G2 none deny", authorizeWorkshopSettingsWrite(none, { labProductKinds: [] }).ok === false);
ok("G2 settings-only deny", authorizeWorkshopSettingsWrite(settings, { labProductKinds: [] }).ok === false);

// --- G3 ---
ok("G3 admin allow", authorizeWorkshopSettingsWrite(admin, { labelTemplates: { lab_os: {} } }).ok === true);
ok("G3 full allow", authorizeWorkshopSettingsWrite(full, { aiImproveTextLevel: "light" }).ok === true);
ok("G3 settings allow", authorizeWorkshopSettingsWrite(settings, { appAppearance: { a: 1 } }).ok === true);
ok("G3 none deny", authorizeWorkshopSettingsWrite(none, { labelTemplates: { chave: {} } }).ok === false);
ok("G3 lab-only deny", authorizeWorkshopSettingsWrite(lab, { aiImproveTextLevel: "strong" }).ok === false);

// --- mistos atômicos ---
ok(
  "misto G2+G3 sem settings: deny (não grava parcial por authz)",
  authorizeWorkshopSettingsWrite(lab, {
    labProductKinds: [],
    labelTemplates: { lab_os: {} },
  }).ok === false
);
ok(
  "misto G2+G3 com lab+settings: allow",
  authorizeWorkshopSettingsWrite(
    actor({
      role: "user",
      userId: "u-both",
      load: "ok",
      permissions: { access_laboratorio: true, access_settings: true },
    }),
    { labProductKinds: [], labelTemplates: { lab_os: {} } }
  ).ok === true
);
ok(
  "misto secret+G3: full deny atômico",
  authorizeWorkshopSettingsWrite(full, {
    labelTemplates: { lab_os: {} },
    patioPin: SAMPLE,
  }).ok === false
);
ok(
  "misto G1+G2: lab deny atômico",
  authorizeWorkshopSettingsWrite(lab, {
    labProductKinds: [],
    adminDisplayName: "X",
  }).ok === false
);

// --- lookup / unauth / revoked ---
ok("unauth deny", authorizeWorkshopSettingsWrite(unauth, { labProductKinds: [] }).ok === false);
ok("lookup_failed deny G3", authorizeWorkshopSettingsWrite(lookupFail, { labelTemplates: {} }).ok === false);
ok("not_in_workshop deny G2", authorizeWorkshopSettingsWrite(missing, { labQuickServices: [] }).ok === false);
ok(
  "revogação: permissions vazias negam G3",
  authorizeWorkshopSettingsWrite(
    actor({ role: "user", userId: "u-rev", load: "ok", permissions: {} }),
    { aiImproveTextLevel: "balanced" }
  ).ok === false
);

// --- desconhecidos ---
ok(
  "desconhecido ignorado → ok sem grupos",
  authorizeWorkshopSettingsWrite(none, { foo: 1, bar: SAMPLE }).ok === true &&
    affectedWriteGroups(pickWorkshopSettingsWrite({ foo: 1 })).length === 0
);
ok(
  "null appearance não toca G3",
  affectedWriteGroups(pickWorkshopSettingsWrite({ appAppearance: null })).length === 0
);

// --- uploads ---
ok("admin photo: admin allow", authorizeAdminPhotoUpload(admin).ok === true);
ok("admin photo: full deny", authorizeAdminPhotoUpload(full).ok === false);
ok("admin photo: none deny", authorizeAdminPhotoUpload(none).ok === false);
ok("lab photo: lab allow", authorizeLabProductKindPhoto(lab).ok === true);
ok("lab photo: services allow", authorizeLabProductKindPhoto(services).ok === true);
ok("lab photo: full allow", authorizeLabProductKindPhoto(full).ok === true);
ok("lab photo: settings deny", authorizeLabProductKindPhoto(settings).ok === false);
ok("lab photo: lookup fail deny", authorizeLabProductKindPhoto(lookupFail).ok === false);

// --- mensagens / logs sem secret ---
{
  const deny = authorizeWorkshopSettingsWrite(none, { labProductKinds: [] });
  ok(
    "mensagem deny sem secret",
    deny.ok === false && !workshopSettingsAuthzErrorMessage(deny).includes(SAMPLE)
  );
  const log = workshopSettingsAuthzLogFields(deny, { route: "PUT /api/workshop-settings", role: "user" });
  ok("log sem SAMPLE", !JSON.stringify(log).includes(SAMPLE));
  ok("log tem kind sec04", log.kind === "sec04_workshop_settings");
}

ok(
  "flags resposta sem plaintext",
  !responseExposesSecrets(withWorkshopSecretFlags({ patioLoginEnabled: true }, { patio_pin: SAMPLE }), [SAMPLE])
);
ok("requestsEffectiveCredentialChange true", requestsEffectiveCredentialChange({ stockGuardPassword: SAMPLE }));

// --- wiring estático ---
const apiApp = readFileSync(join(ROOT, "apiApp.ts"), "utf8");
const sync = readFileSync(join(ROOT, "utils/labelTemplatesSync.ts"), "utf8");
ok("apiApp importa workshopSettingsAuthz", apiApp.includes("authorizeWorkshopSettingsWrite"));
ok("PUT chama authorize antes de updates", apiApp.includes("authorizeWorkshopSettingsWrite(settingsActor"));
ok("admin photo auth antes de multer", (() => {
  const start = apiApp.indexOf('"/api/workshop-admin/photo"');
  const multer = apiApp.indexOf("upload.single(\"file\")", start);
  const authz = apiApp.indexOf("authorizeAdminPhotoUpload", start);
  return authz > start && authz < multer;
})());
ok("lab photo auth antes de multer", (() => {
  const start = apiApp.indexOf('"/api/lab-product-kinds/:kindId/photo"');
  const multer = apiApp.indexOf("upload.single(\"file\")", start);
  const authz = apiApp.indexOf("authorizeLabProductKindPhoto", start);
  return authz > start && authz < multer;
})());
ok(
  "label sync engole falha de upload sem loop",
  sync.includes("SEC-04.2") && sync.includes("lastSyncedAt = Date.now()")
);

// SEC-03 modes intactos
const policy = productionAuthorizationPolicy();
ok("SEC-03 customers ainda enforce", policy.families.find((f) => f.id === "customers")?.mode === "enforce");
ok("SEC-03 parts_stock ainda enforce", policy.families.find((f) => f.id === "parts_stock")?.mode === "enforce");
ok("SEC-03 notifications ainda off", policy.families.find((f) => f.id === "notifications")?.mode === "off");
ok(
  "sem família workshop_admin_settings",
  !policy.families.some((f) => (f.id as string) === "workshop_admin_settings")
);

console.log(`\n${passed} ok, ${failed} falhas`);
if (failed > 0) process.exit(1);
