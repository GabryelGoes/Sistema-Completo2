/**
 * SEC-05.1.2-C: alertas determinísticos da Central de Segurança.
 * npm run test:sec0512c-security-alerts
 * Não imprime senha, token, IP nem chave.
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import {
  SECURITY_ALERT_VOLUME_UNAVAILABLE,
  classifyRateLimitBuckets,
  nextSecurityAlertStatus,
  planSecurityAlerts,
  publicAlertEvidence,
  type StoredSecurityAlert,
} from "../utils/securityAlertRules.js";

const WORKSHOP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSHOP = "11111111-1111-4111-8111-111111111199";
const USER_ANA = "22222222-2222-4222-8222-222222222201";
const SESSION_SECRET = "homolog-session-sec0512c";
const MIGRATION = "supabase/migrations/20261116150000_workshop_security_alerts.sql";
const IP = "203.0.113.50";

let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function event(id: string, eventType: string, occurredAt: string) {
  return { id, eventType, occurredAt };
}

function stored(partial: Partial<StoredSecurityAlert> & Pick<StoredSecurityAlert, "dedupeKey" | "status">): StoredSecurityAlert {
  return {
    id: partial.id || crypto.randomUUID(),
    dedupeKey: partial.dedupeKey,
    status: partial.status,
    severity: partial.severity || "warning",
    occurrenceCount: partial.occurrenceCount || 1,
    evidence: partial.evidence || {},
  };
}

function rules() {
  const quiet = planSecurityAlerts({
    volumeSource: "unavailable",
    buckets: [],
    events: [
      event("00000000-0000-4000-8000-000000000001", "login_succeeded", "2026-11-16T12:00:00.000Z"),
      event("00000000-0000-4000-8000-000000000002", "login_denied", "2026-11-16T12:01:00.000Z"),
      event("00000000-0000-4000-8000-000000000003", "logout", "2026-11-16T12:02:00.000Z"),
    ],
    stored: [],
  });
  record(
    "login e recusa isolada não viram alerta",
    quiet.plans.length === 0 && quiet.limitations.includes(SECURITY_ALERT_VOLUME_UNAVAILABLE),
    "sem conclusão de volume"
  );

  const classified = classifyRateLimitBuckets(
    [
      { bucket_key: `login:ip:${IP}`, hit_count: 6, reset_at: "2026-11-16T12:10:00.000Z" },
      { bucket_key: "login:account:ana", hit_count: 2, reset_at: "2026-11-16T12:10:00.000Z" },
      { bucket_key: "outro", hit_count: 99, reset_at: "2026-11-16T12:10:00.000Z" },
    ],
    Date.parse("2026-11-16T12:00:00.000Z")
  );
  const volume = planSecurityAlerts({
    volumeSource: "postgres",
    buckets: classified.buckets,
    events: [],
    stored: [],
  });
  const visible = `${volume.plans[0]?.title || ""} ${volume.plans[0]?.explanation || ""} ${JSON.stringify(volume.plans[0]?.evidence || {})}`;
  record(
    "volume usa o contador e não o histórico nem o IP",
    volume.plans.length === 1 &&
      volume.plans[0].ruleId === "volume_login_ip" &&
      volume.plans[0].severity === "warning" &&
      !visible.includes(IP) &&
      !visible.includes("login:account") &&
      volume.plans[0].explanation.includes("contador"),
    "origem"
  );

  const blocked = planSecurityAlerts({
    volumeSource: "postgres",
    buckets: [{ kind: "login_ip", hitCount: 10, resetAt: "2026-11-16T12:10:00.000Z" }],
    events: [],
    stored: [],
  });
  record("contador no limite fica importante", blocked.plans[0]?.severity === "important", "10 de 10");

  const below = planSecurityAlerts({
    volumeSource: "postgres",
    buckets: [{ kind: "login_ip", hitCount: 5, resetAt: "2026-11-16T12:10:00.000Z" }],
    events: [],
    stored: [],
  });
  record("abaixo do patamar não alerta", below.plans.length === 0, "5 de 10");

  const ignored = planSecurityAlerts({
    volumeSource: "unavailable",
    buckets: [{ kind: "login_ip", hitCount: 10, resetAt: "2026-11-16T12:10:00.000Z" }],
    events: [],
    stored: [],
  });
  record("sem contador compartilhado não inventa volume", ignored.plans.length === 0, "memória");

  const first = planSecurityAlerts({
    volumeSource: "unavailable",
    buckets: [],
    events: [event("00000000-0000-4000-8000-000000000010", "rate_limited", "2026-11-16T12:00:00.000Z")],
    stored: [],
  });
  const open = stored({
    dedupeKey: "recorded_rate_limit",
    status: "new",
    occurrenceCount: 1,
    evidence: first.plans[0].evidence,
  });
  const again = planSecurityAlerts({
    volumeSource: "unavailable",
    buckets: [],
    events: [event("00000000-0000-4000-8000-000000000010", "rate_limited", "2026-11-16T12:00:00.000Z")],
    stored: [open],
  });
  const more = planSecurityAlerts({
    volumeSource: "unavailable",
    buckets: [],
    events: [
      event("00000000-0000-4000-8000-000000000010", "rate_limited", "2026-11-16T12:00:00.000Z"),
      event("00000000-0000-4000-8000-000000000011", "rate_limited", "2026-11-16T12:06:00.000Z"),
      event("00000000-0000-4000-8000-000000000012", "rate_limited", "2026-11-16T12:12:00.000Z"),
    ],
    stored: [open],
  });
  record(
    "bloqueio registrado agrupa e não conta de novo",
    first.plans.length === 1 &&
      first.plans[0].severity === "warning" &&
      first.plans[0].explanation.includes("cinco minutos") &&
      again.plans.length === 0 &&
      more.plans[0]?.occurrenceCount === 3 &&
      more.plans[0]?.severity === "important" &&
      !JSON.stringify(first).includes("ataque"),
    "rate limit"
  );

  const resolved = stored({
    dedupeKey: "recorded_session_check",
    status: "resolved",
    evidence: { countedUntil: "2026-11-16T12:00:00.000Z", countedId: "00000000-0000-4000-8000-000000000020" },
  });
  const stale = planSecurityAlerts({
    volumeSource: "unavailable",
    buckets: [],
    events: [event("00000000-0000-4000-8000-000000000020", "session_check_unavailable", "2026-11-16T12:00:00.000Z")],
    stored: [resolved],
  });
  const fresh = planSecurityAlerts({
    volumeSource: "unavailable",
    buckets: [],
    events: [event("00000000-0000-4000-8000-000000000021", "session_check_unavailable", "2026-11-16T13:00:00.000Z")],
    stored: [resolved],
  });
  record(
    "resolvido não reabre o mesmo registro e abre um novo",
    stale.plans.length === 0 && fresh.plans.length === 1 && fresh.plans[0].severity === "warning",
    "sessão"
  );

  const down = planSecurityAlerts({
    volumeSource: "unavailable",
    buckets: [],
    events: [event("00000000-0000-4000-8000-000000000030", "rate_limit_unavailable", "2026-11-16T12:00:00.000Z")],
    stored: [],
  });
  const admin = planSecurityAlerts({
    volumeSource: "unavailable",
    buckets: [],
    events: [
      event("00000000-0000-4000-8000-000000000031", "password_changed", "2026-11-16T12:00:00.000Z"),
      event("00000000-0000-4000-8000-000000000032", "employee_removed", "2026-11-16T12:01:00.000Z"),
      event("00000000-0000-4000-8000-000000000033", "device_blocked_admin", "2026-11-16T12:02:00.000Z"),
    ],
    stored: [],
  });
  record(
    "indisponibilidade e ações administrativas têm alerta próprio",
    down.plans[0]?.severity === "important" &&
      admin.plans.map((plan) => plan.ruleId).sort().join() === "admin_device_session,admin_employee,admin_password" &&
      admin.plans.every((plan) => plan.severity === "important"),
    "admin"
  );

  record(
    "mudança de estado segue novo, visto e resolvido",
    nextSecurityAlertStatus("new", "seen") === "seen" &&
      nextSecurityAlertStatus("seen", "resolved") === "resolved" &&
      nextSecurityAlertStatus("resolved", "seen") === null &&
      nextSecurityAlertStatus("new", "invented") === null,
    "estado"
  );

  const leaked = publicAlertEvidence({ source: "counter", maxHits: 6, bucket_key: `login:ip:${IP}`, note: IP });
  record("evidência pública não carrega texto livre", JSON.stringify(leaked) === JSON.stringify({ source: "counter", maxHits: 6 }), "sanitização");

  const sql = fs.readFileSync(MIGRATION, "utf8");
  const modal = fs.readFileSync("components/SecurityCenterModal.tsx", "utf8");
  record(
    "migration isola a oficina e não libera o navegador",
    sql.includes("FORCE ROW LEVEL SECURITY") &&
      sql.includes("workshop_id") &&
      sql.includes("REVOKE ALL ON TABLE public.workshop_security_alerts FROM anon, authenticated") &&
      !sql.includes("GRANT SELECT, INSERT, UPDATE, DELETE") &&
      sql.includes("workshop_security_alert_updates"),
    "sql"
  );
  record(
    "a central atualiza só enquanto está aberta",
    modal.includes("SECURITY_ALERT_REFRESH_MS") && modal.includes("clearInterval") && modal.includes("evaluateSecurityAlerts"),
    "intervalo"
  );
}

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function matches(row: Row, filters: Array<[string, string]>): boolean {
  return filters.every(([key, raw]) => {
    if (raw.startsWith("eq.")) return String(row[key] ?? "") === raw.slice(3);
    if (raw.startsWith("neq.")) return String(row[key] ?? "") !== raw.slice(4);
    if (raw === "is.null") return row[key] == null;
    if (raw.startsWith("gte.")) return String(row[key] ?? "") >= raw.slice(4);
    if (raw.startsWith("lte.")) return String(row[key] ?? "") <= raw.slice(4);
    if (raw.startsWith("gt.")) return String(row[key] ?? "") > raw.slice(3);
    if (raw.startsWith("in.(") && raw.endsWith(")")) {
      const parts = raw.slice(4, -1).split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
      return parts.includes(String(row[key] ?? ""));
    }
    return false;
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function startMock(): Promise<{ url: string; close: () => Promise<void> }> {
  tables.workshop_settings = [{
    workshop_id: WORKSHOP_ID,
    key: "admin_password",
    value: hashPassword("gerencia-sec0512c"),
    updated_at: "2026-01-01T00:00:00.000Z",
  }];
  tables.workshop_system_users = [{
    id: USER_ANA,
    workshop_id: WORKSHOP_ID,
    username: "ana",
    display_name: "Ana",
    password_hash: hashPassword("senha-ana-sec0512c"),
    permissions: {},
    is_technician: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  }];
  tables.workshop_device_sessions = [];
  tables.workshop_blocked_devices = [];
  tables.workshop_security_events = [
    {
      id: "00000000-0000-4000-8000-0000000000a1",
      workshop_id: WORKSHOP_ID,
      occurred_at: "2026-11-16T11:00:00.000Z",
      event_type: "login_succeeded",
      outcome: "success",
      metadata: { area: "login" },
    },
    {
      id: "00000000-0000-4000-8000-0000000000a2",
      workshop_id: WORKSHOP_ID,
      occurred_at: "2026-11-16T11:05:00.000Z",
      event_type: "rate_limited",
      outcome: "denied",
      metadata: { area: "login" },
    },
    {
      id: "00000000-0000-4000-8000-0000000000a3",
      workshop_id: OTHER_WORKSHOP,
      occurred_at: "2026-11-16T11:06:00.000Z",
      event_type: "rate_limited",
      outcome: "denied",
      metadata: { area: "login" },
    },
    {
      id: "00000000-0000-4000-8000-0000000000a4",
      workshop_id: WORKSHOP_ID,
      occurred_at: "2026-11-16T11:07:00.000Z",
      event_type: "password_changed",
      outcome: "success",
      metadata: { area: "gerencia" },
    },
  ];
  tables.workshop_security_alerts = [];
  tables.workshop_security_alert_updates = [];
  tables.workshop_auth_rate_limits = [{
    bucket_key: `login:ip:${IP}`,
    hit_count: 9,
    reset_at: "2099-01-01T00:00:00.000Z",
  }];
  let racedAlertInsert = false;
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (!table || table.startsWith("rpc/")) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
        return;
      }
      if (!tables[table]) tables[table] = [];
      const filters: Array<[string, string]> = [];
      url.searchParams.forEach((value, key) => {
        if (!["select", "on_conflict", "columns", "limit", "order", "offset"].includes(key)) filters.push([key, value]);
      });
      if (req.method === "GET" || req.method === "HEAD") {
        let rows = tables[table].filter((row) => matches(row, filters));
        const limit = Number(url.searchParams.get("limit") || "0");
        if (limit > 0) rows = rows.slice(0, limit);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(req.method === "HEAD" ? "" : JSON.stringify(rows));
        return;
      }
      const raw = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
      });
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === "POST") {
        const incoming = (Array.isArray(body) ? body : [body]) as Row[];
        if (table === "workshop_security_alerts" && !racedAlertInsert) {
          racedAlertInsert = true;
          const winner = { id: crypto.randomUUID(), ...incoming[0] };
          tables[table].push(winner);
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "23505", message: "duplicate key value violates unique constraint" }));
          return;
        }
        const storedRows = incoming.map((row) => {
          const created = { id: crypto.randomUUID(), ...row };
          tables[table].push(created);
          return created;
        });
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(storedRows));
        return;
      }
      if (req.method === "PATCH") {
        const matched = tables[table].filter((row) => matches(row, filters));
        for (const row of matched) Object.assign(row, body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(matched));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end("[]");
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "erro" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () => closeServer(server),
  };
}

async function call(base: string, token: string | null, method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: response.status, json };
}

async function httpFlow() {
  const mock = await startMock();
  let app: http.Server | null = null;
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-sec0512c";
  process.env.WORKSHOP_ID = WORKSHOP_ID;
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.ADMIN_PASSWORD = "gerencia-sec0512c";
  delete process.env.AUTH_RATE_LIMIT_STORE;
  try {
  const { createApiApp } = await import("../apiApp.ts");
  app = http.createServer(createApiApp());
  await new Promise<void>((resolve) => app!.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;
  const admin = await call(base, null, "POST", "/api/auth/login", {
    username: "Gerência",
    password: "gerencia-sec0512c",
    deviceId: "device-admin-sec0512c",
  });
  const ana = await call(base, null, "POST", "/api/auth/login", {
    username: "ana",
    password: "senha-ana-sec0512c",
    deviceId: "device-ana-sec0512c",
  });
  const token = admin.json?.token as string;
  const anaToken = ana.json?.token as string;
  const denied = await call(base, anaToken, "POST", "/api/security-alerts/evaluate", {
    title: "Alerta falso",
    severity: "important",
    explanation: "inventado",
  });
  const evaluated = await call(base, token, "POST", "/api/security-alerts/evaluate", {
    title: "Alerta falso",
    explanation: IP,
  });
  const body = JSON.stringify(evaluated.json);
  const titles = (evaluated.json?.alerts || []).map((alert: { title?: string; occurrenceCount?: number }) => `${alert.title}:${alert.occurrenceCount}`).sort();
  const blocked = (evaluated.json?.alerts || []).find((alert: { title?: string }) => alert.title === "Bloqueio por excesso de tentativas");
  const password = (evaluated.json?.alerts || []).find((alert: { title?: string }) => alert.title === "Senha alterada");
  record(
    "funcionário não grava alerta e a gerência não recebe texto do cliente",
    admin.status === 200 &&
      ana.status === 200 &&
      denied.status === 403 &&
      evaluated.status === 200 &&
      titles.join("|") === "Bloqueio por excesso de tentativas:1|Senha alterada:1" &&
      !body.includes(IP) &&
      !body.includes("Alerta falso") &&
      (evaluated.json?.limitations || []).includes(SECURITY_ALERT_VOLUME_UNAVAILABLE) &&
      Array.isArray(blocked?.updates) &&
      blocked.updates.length === 0 &&
      password?.updates?.some((update: { toStatus?: string; actorRole?: string }) => update.toStatus === "new" && update.actorRole === "system"),
    "acesso"
  );
  const repeated = await call(base, token, "POST", "/api/security-alerts/evaluate", {});
  record("reavaliação imediata não duplica", repeated.json?.evaluated === false && repeated.json?.alerts?.length === 2, "intervalo");
  const alertId = evaluated.json.alerts.find((alert: { title?: string }) => alert.title === "Senha alterada").id;
  const seen = await call(base, token, "POST", `/api/security-alerts/${alertId}/state`, { status: "seen", title: "trocado" });
  const resolved = await call(base, token, "POST", `/api/security-alerts/${alertId}/state`, { status: "resolved" });
  const back = await call(base, token, "POST", `/api/security-alerts/${alertId}/state`, { status: "seen" });
  const employeeState = await call(base, anaToken, "POST", `/api/security-alerts/${alertId}/state`, { status: "resolved" });
  record(
    "estado muda por administrador e para no resolvido",
    seen.status === 200 &&
      seen.json?.alert?.status === "seen" &&
      seen.json?.alert?.title === "Senha alterada" &&
      resolved.json?.alert?.status === "resolved" &&
      back.status === 409 &&
      employeeState.status === 403,
    "estado http"
  );
  } finally {
    if (app) await closeServer(app);
    await mock.close();
  }
}

async function main() {
  rules();
  await httpFlow();
  console.log(`\n${passed} ok, ${failed} falha(s)`);
  if (failed) process.exit(1);
}

main();
