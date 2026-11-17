/**
 * SEC-05.1.2-C.2: motivo da auditoria, token e gravidade.
 * npm run test:sec0512c2-auth-diagnostics
 * Não imprime senha, token nem IP.
 */
import { createSecurityAudit, securityMetadata } from "../utils/securityAudit.js";
import { planSecurityAlerts } from "../utils/securityAlertRules.js";
import { expiredSessionPayload, inspectSessionToken, sessionFailureReason, signSessionToken } from "../utils/sessionToken.js";

const WORKSHOP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ANA = "22222222-2222-4222-8222-222222222201";
const SESSION_ID = "33333333-3333-4333-8333-333333333301";

let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function tokens() {
  process.env.SESSION_SECRET = "homolog-session-sec0512c2";
  delete process.env.SESSION_SECRET_PREVIOUS;
  const current = signSessionToken({ r: "user", u: USER_ANA, sid: SESSION_ID, did: "aparelho" }, 60_000);
  const expired = signSessionToken({ r: "user", u: USER_ANA, sid: SESSION_ID, did: "aparelho" }, -1000);
  const missing = signSessionToken({ r: "user", u: USER_ANA, did: "aparelho" }, 60_000);
  const forged = current ? `${current.slice(0, -1)}${current.endsWith("a") ? "b" : "a"}` : "";
  const currentRead = inspectSessionToken(current);
  const expiredRead = inspectSessionToken(expired);
  const missingRead = inspectSessionToken(missing);
  const forgedRead = inspectSessionToken(forged);
  const formatRead = inspectSessionToken("abc");
  const expiredReason = sessionFailureReason(expiredRead);
  const missingReason = sessionFailureReason(missingRead);
  const forgedReason = sessionFailureReason(forgedRead);
  const formatReason = sessionFailureReason(formatRead);
  const expiredPayload = expiredSessionPayload(expiredRead);
  record(
    "token válido, expirado, sem sid, assinatura e formato ficam separados",
    !!current &&
      currentRead.status === "ok" &&
      expiredReason === "expired" &&
      expiredPayload?.u === USER_ANA &&
      expiredPayload?.sid === SESSION_ID &&
      missingReason === "missing_sid" &&
      forgedReason === "invalid_signature" &&
      forgedRead.status === "invalid_signature" &&
      formatReason === "invalid_format" &&
      formatRead.status === "invalid_format",
    expiredReason || "ok"
  );
}

function metadataAndDedup() {
  const dirty = securityMetadata({
    area: "login",
    reason: "device_session_read",
    changedKeys: ["admin_password"],
  });
  const rejected = securityMetadata({ area: "login", reason: "select * from users" as never });
  record(
    "motivo fechado entra e texto livre sai",
    dirty.reason === "device_session_read" && !rejected.reason && !JSON.stringify(rejected).includes("select"),
    dirty.reason || "sem motivo"
  );

  const inserted: Array<{ event_type: string; metadata: { reason?: string } }> = [];
  const audit = createSecurityAudit({
    workshopId: () => WORKSHOP_ID,
    secret: () => "chave-de-teste",
    insert: async (row) => {
      inserted.push(row as { event_type: string; metadata: { reason?: string } });
      return { ok: true };
    },
  });
  const day = Date.parse("2026-11-16T17:00:00.000Z");
  const first = audit.record({
    eventType: "session_check_unavailable",
    outcome: "error",
    actorUserId: USER_ANA,
    sessionId: SESSION_ID,
    metadata: { area: "login", reason: "device_session_read" },
  }, day);
  const repeat = audit.record({
    eventType: "session_check_unavailable",
    outcome: "error",
    actorUserId: USER_ANA,
    sessionId: SESSION_ID,
    metadata: { area: "login", reason: "device_session_read" },
  }, day + 1000);
  const other = audit.record({
    eventType: "session_check_unavailable",
    outcome: "error",
    actorUserId: USER_ANA,
    sessionId: SESSION_ID,
    metadata: { area: "login", reason: "blocked_devices_read" },
  }, day + 2000);
  return Promise.all([first, repeat, other]).then(() => {
    record(
      "a mesma falha não duplica e outra consulta continua visível",
      inserted.length === 2 &&
        inserted[0]?.metadata.reason === "device_session_read" &&
        inserted[1]?.metadata.reason === "blocked_devices_read",
      String(inserted.length)
    );
  });
}

function severity() {
  const plan = planSecurityAlerts({
    volumeSource: "postgres",
    buckets: [],
    events: [0, 1, 2, 3].map((index) => ({
      id: `00000000-0000-4000-8000-00000000003${index}`,
      eventType: "session_check_unavailable",
      occurredAt: `2026-11-16T${17 + index}:00:00.000Z`,
    })),
    stored: [],
  });
  record(
    "quatro falhas de sessão permanecem aviso",
    plan.plans.length === 1 && plan.plans[0].severity === "warning" && plan.plans[0].occurrenceCount === 4,
    plan.plans[0]?.severity || "sem plano"
  );
}

async function main() {
  tokens();
  await metadataAndDedup();
  severity();
  console.log(`\n${passed} ok, ${failed} falha(s)`);
  if (failed) process.exit(1);
}

main();
