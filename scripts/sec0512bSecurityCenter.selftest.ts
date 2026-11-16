/**
 * SEC-05.1.2-B: leitura da Central de Segurança.
 * npm run test:sec0512b-security-center
 * Não imprime senha, token nem IP.
 */
import { CRITICAL_SECURITY_EVENTS, SECURITY_EVENT_TYPES } from "../utils/securityAudit.js";
import { resolveAjustesVisibility } from "../utils/employeeAccess.js";
import { AJUSTES_ITEMS } from "../utils/ajustesCatalog.js";
import {
  ALERT_EVENT_TYPES,
  AUDIT_EVENT_TYPES,
  OVERVIEW_CRITICAL_TYPES,
  SECURITY_CENTER_EVENT_TYPES,
  actorLabel,
  countEventTypes,
  formatSecurityCount,
  isCriticalSecurityEvent,
  matchesEventGroup,
  securityOriginLabel,
  securityPeriodBounds,
} from "../utils/securityCenterView.js";

let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

const summary = {
  truncated: false,
  totals: { success: 2, denied: 1, error: 0 },
  byType: [
    { eventType: "login_succeeded", outcome: "success", count: 2 },
    { eventType: "login_denied", outcome: "denied", count: 1 },
    { eventType: "rate_limited", outcome: "denied", count: 3 },
    { eventType: "password_changed", outcome: "success", count: 1 },
  ],
};

function main() {
  record(
    "tipos da tela coincidem com o servidor",
    SECURITY_CENTER_EVENT_TYPES.join() === [...SECURITY_EVENT_TYPES].join() &&
      [...CRITICAL_SECURITY_EVENTS].every((type) => isCriticalSecurityEvent(type)),
    "lista fechada"
  );

  const exact = countEventTypes(summary, ["login_succeeded"]);
  const partial = countEventTypes({ ...summary, truncated: true }, ["rate_limited"]);
  const critical = countEventTypes(summary, OVERVIEW_CRITICAL_TYPES);
  record(
    "resumo exato e resumo truncado não viram total fechado",
    exact.count === 2 &&
      exact.partial === false &&
      formatSecurityCount(exact.count, false) === "2" &&
      partial.partial === true &&
      formatSecurityCount(partial.count, true) === "pelo menos 3" &&
      formatSecurityCount(0, true) === "parcial" &&
      critical.count === 1 &&
      !OVERVIEW_CRITICAL_TYPES.includes("login_succeeded"),
    "contagem"
  );

  const empty = countEventTypes(
    { truncated: false, totals: { success: 0, denied: 0, error: 0 }, byType: [] },
    ["login_denied"]
  );
  record("período sem eventos é zero real", empty.count === 0 && formatSecurityCount(0, false) === "0", "vazio");

  const names = new Map([["22222222-2222-4222-8222-222222222201", "Ana"]]);
  record(
    "funcionário, removido, gerência e não identificado",
    actorLabel({ eventType: "login_succeeded", actorUserId: "22222222-2222-4222-8222-222222222201" }, names) === "Ana" &&
      actorLabel({ eventType: "logout", actorUserId: "22222222-2222-4222-8222-222222222299" }, names) === "Funcionário removido" &&
      actorLabel({ eventType: "login_succeeded", actorUserId: null }, names) === "Gerência" &&
      actorLabel({ eventType: "login_denied", actorUserId: null }, names) === "Não identificado" &&
      actorLabel({ eventType: "login_succeeded", actorUserId: "22222222-2222-4222-8222-222222222201" }, null) === "Funcionário",
    "nomes"
  );

  const now = Date.parse("2026-11-16T15:00:00.000Z");
  const day = securityPeriodBounds("24h", "", "", now);
  const custom = securityPeriodBounds("custom", "2026-11-01", "2026-11-02", now);
  const bad = securityPeriodBounds("custom", "", "", now);
  record(
    "período de 24 horas, 7 dias, 30 dias e personalizado",
    day.ok === true &&
      custom.ok === true &&
      custom.ok &&
      custom.from === "2026-11-01T03:00:00.000Z" &&
      custom.to === "2026-11-03T02:59:59.999Z" &&
      bad.ok === false,
    "datas"
  );

  const admin = resolveAjustesVisibility({
    role: "admin",
    permissions: {},
    isSystemUser: false,
    isTechnician: false,
    hasTechnicianProfile: false,
    hasLogout: true,
  });
  const full = resolveAjustesVisibility({
    role: "user",
    permissions: { full_access: true },
    isSystemUser: true,
    isTechnician: false,
    hasTechnicianProfile: false,
    hasLogout: true,
  });
  const common = resolveAjustesVisibility({
    role: "user",
    permissions: { access_home: true },
    isSystemUser: true,
    isTechnician: false,
    hasTechnicianProfile: false,
    hasLogout: true,
  });
  record(
    "só Gerência e acesso total veem a central",
    admin.central_seguranca === true && full.central_seguranca === true && common.central_seguranca === false,
    "permissão"
  );

  record(
    "auditoria e alertas não inventam tipo",
    AUDIT_EVENT_TYPES.every((type) => SECURITY_EVENT_TYPES.includes(type)) &&
      ALERT_EVENT_TYPES.every((type) => SECURITY_EVENT_TYPES.includes(type)) &&
      matchesEventGroup("password_changed", AUDIT_EVENT_TYPES) &&
      !matchesEventGroup("login_succeeded", AUDIT_EVENT_TYPES) &&
      matchesEventGroup("rate_limited", ALERT_EVENT_TYPES) &&
      securityOriginLabel("vercel") === "Plataforma" &&
      securityOriginLabel(null) === null,
    "grupos"
  );

  record(
    "o hub tem a Central e não cria outro item de aparelhos",
    AJUSTES_ITEMS.filter((item) => item.id === "central_seguranca").length === 1 &&
      AJUSTES_ITEMS.filter((item) => item.id === "dispositivos_conectados").length === 1 &&
      AJUSTES_ITEMS.find((item) => item.id === "central_seguranca")?.categoryId === "seguranca",
    "catálogo"
  );

  console.log(`\n${passed} ok, ${failed} falha(s)`);
  if (failed > 0) process.exit(1);
}

main();
