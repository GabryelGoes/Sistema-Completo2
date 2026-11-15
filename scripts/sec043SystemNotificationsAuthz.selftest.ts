/**
 * SEC-04.3 — autorização GET/PUT /api/workshop/system-notifications.
 * Contas fictícias; sem produção; sem log de senha.
 * npm run test:sec043-system-notifications-authz
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  actorHasSystemNotificationsPrivilege,
  authorizeSystemNotificationsGet,
  authorizeSystemNotificationsPut,
  systemNotificationsAuthzErrorMessage,
  systemNotificationsAuthzLogFields,
} from "../utils/systemNotificationsAuthz.js";
import type { WorkshopSettingsActor } from "../utils/workshopSettingsAuthz.js";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { decideAuthorization } from "../utils/authorizeRequest.js";

const ROOT = process.cwd();
const FAKE_PASS = "senha-ficticia-sec043";

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

console.log("SEC-04.3 system-notifications authz selftest\n");

const admin = actor({ role: "admin", load: "ok" });
const full = actor({
  role: "user",
  userId: "u-full",
  load: "ok",
  permissions: { full_access: true },
});
const notif = actor({
  role: "user",
  userId: "u-notif",
  load: "ok",
  permissions: { access_notificacoes_sistema: true },
});
const none = actor({ role: "user", userId: "u-none", load: "ok", permissions: {} });
const otherShop = actor({ role: "user", userId: "u-other", load: "missing" });
const lookupFail = actor({ role: "user", userId: "u-fail", load: "failed" });
const unauth = actor({ role: null, load: "unauthenticated" });
const revoked = actor({ role: "user", userId: "u-rev", load: "ok", permissions: {} });

// --- privilege helper ---
ok("privilege admin", actorHasSystemNotificationsPrivilege(admin) === true);
ok("privilege full", actorHasSystemNotificationsPrivilege(full) === true);
ok("privilege access_notificacoes", actorHasSystemNotificationsPrivilege(notif) === true);
ok("privilege none false", actorHasSystemNotificationsPrivilege(none) === false);
ok("privilege missing false", actorHasSystemNotificationsPrivilege(otherShop) === false);

// --- GET ---
ok("GET admin 200", authorizeSystemNotificationsGet(admin).ok === true);
ok("GET full 200", authorizeSystemNotificationsGet(full).ok === true);
ok("GET notif key 200", authorizeSystemNotificationsGet(notif).ok === true);
ok(
  "GET none 403",
  (() => {
    const d = authorizeSystemNotificationsGet(none);
    return d.ok === false && d.httpStatus === 403;
  })()
);
ok(
  "GET unauth 401",
  (() => {
    const d = authorizeSystemNotificationsGet(unauth);
    return d.ok === false && d.httpStatus === 401;
  })()
);
ok(
  "GET other workshop 403",
  (() => {
    const d = authorizeSystemNotificationsGet(otherShop);
    return d.ok === false && d.reason === "not_in_workshop";
  })()
);
ok(
  "GET lookup fail 403",
  (() => {
    const d = authorizeSystemNotificationsGet(lookupFail);
    return d.ok === false && d.reason === "lookup_failed";
  })()
);
ok(
  "GET revoked 403",
  authorizeSystemNotificationsGet(revoked).ok === false
);

// --- PUT privilege ---
ok(
  "PUT admin allow",
  authorizeSystemNotificationsPut(admin, { passwordProvided: false, passwordValid: null }).ok ===
    true
);
ok(
  "PUT full allow",
  authorizeSystemNotificationsPut(full, { passwordProvided: false, passwordValid: null }).ok ===
    true
);
ok(
  "PUT notif key allow",
  authorizeSystemNotificationsPut(notif, { passwordProvided: false, passwordValid: null }).ok ===
    true
);
ok(
  "PUT none sem senha 403",
  (() => {
    const d = authorizeSystemNotificationsPut(none, {
      passwordProvided: false,
      passwordValid: null,
    });
    return d.ok === false && d.httpStatus === 403;
  })()
);
ok(
  "PUT none + senha válida (legado)",
  (() => {
    const d = authorizeSystemNotificationsPut(none, {
      passwordProvided: true,
      passwordValid: true,
    });
    return d.ok === true && d.reason === "allow_password_elevation";
  })()
);
ok(
  "PUT none + senha inválida 403",
  authorizeSystemNotificationsPut(none, {
    passwordProvided: true,
    passwordValid: false,
  }).ok === false
);
ok(
  "PUT privilegiado + senha inválida 403",
  (() => {
    const d = authorizeSystemNotificationsPut(full, {
      passwordProvided: true,
      passwordValid: false,
    });
    return d.ok === false && d.reason === "bad_admin_password";
  })()
);
ok(
  "PUT unauth + senha válida → 401 (não eleva)",
  (() => {
    const d = authorizeSystemNotificationsPut(unauth, {
      passwordProvided: true,
      passwordValid: true,
    });
    return d.ok === false && d.httpStatus === 401;
  })()
);
ok(
  "PUT lookup fail + senha válida (legado com sessão)",
  authorizeSystemNotificationsPut(lookupFail, {
    passwordProvided: true,
    passwordValid: true,
  }).ok === true
);
ok(
  "PUT lookup fail sem senha 403",
  authorizeSystemNotificationsPut(lookupFail, {
    passwordProvided: false,
    passwordValid: null,
  }).ok === false
);
ok(
  "PUT other workshop + senha válida (legado)",
  authorizeSystemNotificationsPut(otherShop, {
    passwordProvided: true,
    passwordValid: true,
  }).ok === true
);

// --- mensagens / logs ---
{
  const deny = authorizeSystemNotificationsGet(none);
  ok(
    "mensagem GET deny sem senha fictícia",
    deny.ok === false && !systemNotificationsAuthzErrorMessage(deny).includes(FAKE_PASS)
  );
  const badPw = authorizeSystemNotificationsPut(full, {
    passwordProvided: true,
    passwordValid: false,
  });
  ok(
    "mensagem bad password",
    badPw.ok === false &&
      systemNotificationsAuthzErrorMessage(badPw).includes("Senha da gerência incorreta")
  );
  const log = systemNotificationsAuthzLogFields(deny, {
    route: "GET /api/workshop/system-notifications",
    role: "user",
    passwordProvided: false,
  });
  ok("log kind sec04_system_notifications", log.kind === "sec04_system_notifications");
  ok("log sem FAKE_PASS", !JSON.stringify(log).includes(FAKE_PASS));
}

// --- wiring estático ---
const apiApp = readFileSync(join(ROOT, "apiApp.ts"), "utf8");
ok("apiApp importa systemNotificationsAuthz", apiApp.includes("authorizeSystemNotificationsGet"));
ok(
  "GET chama authz antes de listar users",
  (() => {
    const start = apiApp.indexOf('app.get("/api/workshop/system-notifications"');
    const authzAt = apiApp.indexOf("authorizeSystemNotificationsGet", start);
    const usersAt = apiApp.indexOf('from("workshop_system_users")', start);
    return authzAt > start && authzAt < usersAt;
  })()
);
ok(
  "PUT chama authz antes de normalize/upsert",
  (() => {
    const start = apiApp.indexOf('app.put("/api/workshop/system-notifications"');
    const authzAt = apiApp.indexOf("authorizeSystemNotificationsPut", start);
    const normAt = apiApp.indexOf("normalizedAdmin", start);
    const upsertAt = apiApp.indexOf(".upsert(", start);
    return authzAt > start && authzAt < normAt && authzAt < upsertAt;
  })()
);
ok(
  "PUT referencia access_notificacoes_sistema via módulo",
  apiApp.includes("authorizeSystemNotificationsPut") &&
    readFileSync(join(ROOT, "utils/systemNotificationsAuthz.ts"), "utf8").includes(
      "access_notificacoes_sistema"
    )
);
ok(
  "inbox /api/notifications não usa systemNotificationsAuthz",
  (() => {
    const start = apiApp.indexOf('app.get("/api/notifications"');
    const slice = apiApp.slice(start, start + 800);
    return !slice.includes("authorizeSystemNotifications");
  })()
);

// SEC-03 family notifications mode unchanged
const policy = productionAuthorizationPolicy();
ok(
  "SEC-03 notifications mode off",
  policy.families.find((f) => f.id === "notifications")?.mode === "off"
);
ok(
  "system-notifications fora do prefixo /api/notifications",
  !policy.families.some((f) =>
    f.prefixes.some((p) => p.includes("system-notifications") || p.includes("workshop/system"))
  )
);

{
  const verdict = await decideAuthorization({
    method: "PUT",
    path: "/api/workshop/system-notifications",
    actor: { role: "user", userId: "u-none" },
    workshopId: "11111111-1111-4111-8111-111111111111",
    source: {
      async loadUser() {
        return { ok: true, row: { permissions: {} } };
      },
    },
    policy,
  });
  ok("SEC-03 não bloqueia system-notifications (handler cuida)", verdict.block === false);
}

console.log(`\n${passed} ok, ${failed} falhas`);
if (failed > 0) process.exit(1);
console.log(
  "NÃO TESTADO: HTTP live Express+Supabase real; verifyAdmin com hash real; upsert integração."
);
