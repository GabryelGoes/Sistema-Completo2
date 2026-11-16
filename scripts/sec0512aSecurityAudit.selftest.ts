/**
 * SEC-05.1.2-A: auditoria de segurança, com banco fictício e PostgreSQL local.
 * npm run test:sec0512a-security-audit
 * Não imprime senha, token, IP nem chave.
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AddressInfo } from "node:net";
import {
  createSecurityAudit,
  decodeSecurityCursor,
  encodeSecurityCursor,
  pageSecurityEvents,
  parseSecurityEventQuery,
  securityClientRef,
  securityMetadata,
  summarizeSecurityEvents,
  type SecurityEventRow,
} from "../utils/securityAudit.js";

const execFileAsync = promisify(execFile);
const WORKSHOP_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSHOP = "11111111-1111-4111-8111-111111111199";
const USER_ANA = "22222222-2222-4222-8222-222222222201";
const USER_CHEFE = "22222222-2222-4222-8222-222222222209";
const SESSION_SECRET = "homolog-session-sec0512a";
const SERVICE_ROLE = "homolog-service-role-sec0512a";
const PASS_ANA = "senha-ana-sec0512a";
const PASS_ANA_NOVA = "senha-ana-nova-sec0512a";
const PASS_ADMIN = "gerencia-sec0512a";
const PASS_WRONG = "senha-errada-sec0512a";
const PASS_NOVO = "senha-novo-sec0512a";
const MIGRATION = "supabase/migrations/20261116050000_workshop_security_events.sql";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  workshop_settings: [{
    workshop_id: WORKSHOP_ID,
    key: "admin_password",
    value: hashPassword(PASS_ADMIN),
    updated_at: "2026-01-01T00:00:00.000Z",
  }],
  workshop_system_users: [
    {
      id: USER_ANA,
      workshop_id: WORKSHOP_ID,
      username: "ana",
      display_name: "Ana",
      password_hash: hashPassword(PASS_ANA),
      permissions: {},
      is_technician: false,
      job_title: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: USER_CHEFE,
      workshop_id: WORKSHOP_ID,
      username: "chefe",
      display_name: "Chefe",
      password_hash: hashPassword(PASS_ANA),
      permissions: { full_access: true },
      is_technician: false,
      job_title: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  workshop_device_sessions: [],
  workshop_blocked_devices: [],
  workshop_security_events: [],
};

let failAuditInsert = false;
let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function parseFilters(url: URL): Array<[string, string]> {
  const skip = new Set(["select", "on_conflict", "columns", "limit", "order", "offset"]);
  const out: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    if (!skip.has(key)) out.push([key, value]);
  });
  return out;
}

function matches(row: Row, filters: Array<[string, string]>): boolean {
  return filters.every(([key, raw]) => {
    if (raw.startsWith("eq.")) return String(row[key] ?? "") === raw.slice(3);
    if (raw.startsWith("neq.")) return String(row[key] ?? "") !== raw.slice(4);
    if (raw === "is.null") return row[key] == null;
    if (raw.startsWith("gte.")) return String(row[key] ?? "") >= raw.slice(4);
    if (raw.startsWith("lte.")) return String(row[key] ?? "") <= raw.slice(4);
    if (raw.startsWith("in.(") && raw.endsWith(")")) {
      const parts = raw.slice(4, -1).split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
      return parts.includes(String(row[key] ?? ""));
    }
    return false;
  });
}

function project(row: Row, select: string | null): Row {
  if (!select || select === "*") return { ...row };
  const out: Row = {};
  for (const col of select.split(",").map((item) => item.trim())) out[col] = row[col] ?? null;
  return out;
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function startMock(): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (!tables[table]) tables[table] = [];
      if (failAuditInsert && table === "workshop_security_events" && req.method === "POST") {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "falha ficticia de auditoria" }));
        return;
      }
      const filters = parseFilters(url);
      const select = url.searchParams.get("select");
      const wantsObject = String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");
      if (req.method === "GET" || req.method === "HEAD") {
        let rows = tables[table].filter((row) => matches(row, filters));
        const order = url.searchParams.get("order") || "";
        if (order.includes("occurred_at.desc")) {
          rows = [...rows].sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)));
        }
        const limit = Number(url.searchParams.get("limit") || "0");
        if (limit > 0) rows = rows.slice(0, limit);
        const projected = rows.map((row) => project(row, select));
        if (wantsObject) {
          if (projected.length !== 1) {
            res.writeHead(406, { "content-type": "application/json" });
            res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested" }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(req.method === "HEAD" ? "" : JSON.stringify(projected[0]));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(req.method === "HEAD" ? "" : JSON.stringify(projected));
        return;
      }
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === "POST") {
        const conflict = (url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
        const incoming = (Array.isArray(body) ? body : [body]) as Row[];
        const stored: Row[] = [];
        for (const row of incoming) {
          const idx = conflict.length
            ? tables[table].findIndex((current) => conflict.every((col) => String(current[col] ?? "") === String(row[col] ?? "")))
            : -1;
          if (idx >= 0) {
            tables[table][idx] = { ...tables[table][idx], ...row };
            stored.push(tables[table][idx]);
          } else {
            const created = { id: crypto.randomUUID(), ...row };
            tables[table].push(created);
            stored.push(created);
          }
        }
        const payload = stored.map((row) => project(row, select));
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? payload[0] ?? {} : payload));
        return;
      }
      if (req.method === "PATCH") {
        const matched = tables[table].filter((row) => matches(row, filters));
        for (const row of matched) Object.assign(row, body);
        const projected = matched.map((row) => project(row, select));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? projected[0] ?? {} : projected));
        return;
      }
      if (req.method === "DELETE") {
        const matched = tables[table].filter((row) => matches(row, filters));
        tables[table] = tables[table].filter((row) => !matched.includes(row));
        const projected = matched.map((row) => project(row, select));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(projected));
        return;
      }
      res.writeHead(405).end();
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "erro" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function call(
  base: string,
  token: string | null,
  method: string,
  path: string,
  body?: unknown,
  extra?: Record<string, string>
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json", ...(extra || {}) };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

let loginIpSerial = 20;
function nextLoginIp(): string {
  loginIpSerial += 1;
  return `198.51.100.${loginIpSerial}`;
}

async function login(base: string, username: string, password: string, ip = nextLoginIp(), deviceId = `aparelho-${crypto.randomUUID()}`) {
  const result = await call(base, null, "POST", "/api/auth/login", { username, password, deviceId }, {
    "x-vercel-forwarded-for": ip,
    "x-forwarded-for": "192.0.2.254",
    "x-device-id": deviceId,
  });
  return { ...result, deviceId };
}

function events(type?: string): Row[] {
  return tables.workshop_security_events.filter((row) => !type || row.event_type === type);
}

function containsSecret(value: string): boolean {
  return [PASS_ANA, PASS_ANA_NOVA, PASS_ADMIN, PASS_WRONG, PASS_NOVO, SESSION_SECRET, SERVICE_ROLE].some((secret) => value.includes(secret));
}

async function psql(database: string, sql: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execFileAsync(
      "sudo",
      ["-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
      { maxBuffer: 2_000_000 }
    );
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    const error = err as { code?: number; stdout?: string; stderr?: string };
    return { code: typeof error.code === "number" ? error.code : 1, stdout: error.stdout || "", stderr: error.stderr || "" };
  }
}

async function psqlFile(database: string, file: string): Promise<{ code: number; stderr: string }> {
  try {
    const result = await execFileAsync(
      "sudo",
      ["-u", "postgres", "psql", "-d", database, "-v", "ON_ERROR_STOP=1", "-f", file],
      { maxBuffer: 2_000_000 }
    );
    return { code: 0, stderr: result.stderr };
  } catch (err) {
    const error = err as { code?: number; stderr?: string };
    return { code: typeof error.code === "number" ? error.code : 1, stderr: error.stderr || "" };
  }
}

async function main() {
  const ip = "203.0.113.21";
  const day = Date.parse("2026-11-16T12:00:00.000Z");
  const nextDay = Date.parse("2026-11-17T12:00:00.000Z");
  const ref = securityClientRef(ip, "chave-de-teste", day);
  const plain = crypto.createHash("sha256").update(ip).digest("base64url").slice(0, 22);
  record(
    "pseudônimo não é hash simples e não guarda o IP",
    !!ref &&
      ref !== plain &&
      !ref.includes("203") &&
      ref === securityClientRef(ip, "chave-de-teste", day) &&
      ref !== securityClientRef(ip, "chave-de-teste", nextDay) &&
      securityClientRef("vercel-unknown", "chave-de-teste", day) === null &&
      securityClientRef(ip, "", day) === null,
    "referência diária"
  );

  const dirty = securityMetadata({ area: "login", changedKeys: ["admin_password", "aparencia"], targetUserId: "nao-uuid" } as never);
  record(
    "metadados recusam campo fora da lista",
    dirty.area === "login" &&
      dirty.changedKeys?.join(",") === "admin_password" &&
      !("targetUserId" in dirty) &&
      !JSON.stringify(dirty).includes("aparencia"),
    "lista fechada"
  );

  const inserted: Row[] = [];
  let criticalLogs = 0;
  const audit = createSecurityAudit({
    workshopId: () => WORKSHOP_ID,
    secret: () => "chave-de-teste",
    env: { VERCEL: "1" },
    insert: async (row) => {
      inserted.push(row as unknown as Row);
      return { ok: true };
    },
    logCritical: () => {
      criticalLogs += 1;
    },
  });
  const firstDenied = await audit.record({ eventType: "login_denied", outcome: "denied", ip, metadata: { area: "login" } }, day);
  const secondDenied = await audit.record({ eventType: "login_denied", outcome: "denied", ip, metadata: { area: "login" } }, day + 1000);
  const success = await audit.record({ eventType: "login_succeeded", outcome: "success", ip }, day + 2000);
  record(
    "evento barulhento não duplica e o sucesso continua",
    firstDenied.recorded && !secondDenied.recorded && success.recorded && inserted.length === 2,
    "janela de cinco minutos"
  );

  const broken = createSecurityAudit({
    workshopId: () => WORKSHOP_ID,
    secret: () => "chave-de-teste",
    insert: async () => {
      throw new Error("senha-nao-deve-aparecer token-nao-deve-aparecer");
    },
    logCritical: () => {
      criticalLogs += 1;
    },
  });
  let thrown = false;
  try {
    await broken.record({ eventType: "password_changed", outcome: "success" }, day);
  } catch {
    thrown = true;
  }
  const quiet = await broken.record({ eventType: "login_denied", outcome: "denied" }, day);
  record(
    "falha ao gravar não muda o fluxo e só o crítico é avisado",
    !thrown && !quiet.recorded && criticalLogs === 1,
    "melhor esforço"
  );

  const older: SecurityEventRow = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
    workshop_id: WORKSHOP_ID,
    occurred_at: "2026-11-16T10:00:00.000Z",
    event_type: "login_succeeded",
    outcome: "success",
    actor_user_id: USER_ANA,
    session_id: null,
    device_id: null,
    origin: "vercel",
    client_ref: "abc",
    metadata: {},
  };
  const newer: SecurityEventRow = { ...older, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", occurred_at: "2026-11-16T11:00:00.000Z", event_type: "logout" };
  const foreign: SecurityEventRow = { ...older, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3", workshop_id: OTHER_WORKSHOP };
  const parsed = parseSecurityEventQuery(WORKSHOP_ID, new URLSearchParams({ limit: "1", eventType: "logout" }));
  const page = parsed.ok ? pageSecurityEvents([foreign, older, newer], parsed.query) : null;
  const cursor = page?.nextCursor ? decodeSecurityCursor(page.nextCursor) : null;
  record(
    "página, filtro e cursor ficam na própria oficina",
    parsed.ok && page?.events.length === 1 && page.events[0].event_type === "logout" && page.nextCursor === null && cursor === null,
    "leitura"
  );
  const wide = pageSecurityEvents([newer, older, foreign], { workshopId: WORKSHOP_ID, limit: 1, cursor: null });
  const rest = pageSecurityEvents([newer, older, foreign], {
    workshopId: WORKSHOP_ID,
    limit: 1,
    cursor: decodeSecurityCursor(wide.nextCursor),
  });
  record(
    "a página seguinte não repete o último evento",
    wide.events.length === 1 &&
      wide.events[0].id === newer.id &&
      rest.events.length === 1 &&
      rest.events[0].id === older.id &&
      encodeSecurityCursor(newer.occurred_at, newer.id) === wide.nextCursor,
    "cursor"
  );
  const summary = summarizeSecurityEvents([older, newer, foreign], WORKSHOP_ID);
  record(
    "resumo ignora a outra oficina",
    summary.totals.success === 2 && summary.byType.some((item) => item.eventType === "logout" && item.count === 1) && !summary.byType.some((item) => item.count > 1),
    "agregado"
  );

  const mock = await startMock();
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  process.env.WORKSHOP_ID = WORKSHOP_ID;
  process.env.SESSION_SECRET = SESSION_SECRET;
  delete process.env.SESSION_SECRET_PREVIOUS;
  process.env.HOMOLOGATION_MODE = "true";
  process.env.RDA_INTELLIGENCE_ENABLED = "false";
  process.env.RDA_ALLOW_LLM_CALLS = "false";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ADMIN_PASSWORD;
  process.env.NODE_ENV = "development";
  process.env.VERCEL = "1";
  process.env.AUTH_RATE_LIMIT_STORE = "memory";

  const { createApiApp } = await import("../apiApp.ts");
  const app = http.createServer(createApiApp());
  await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(app.address() as AddressInfo).port}`;

  try {
    const ana = await login(base, "ana", PASS_ANA, "203.0.113.40", "aparelho-ana");
    const denied = await login(base, "ana", PASS_WRONG, "203.0.113.41", "aparelho-ana");
    const deniedAgain = await login(base, "ana", PASS_WRONG, "203.0.113.41", "aparelho-ana");
    record(
      "login autorizado e recusado geram o resultado real",
      ana.status === 200 &&
        denied.status === 401 &&
        deniedAgain.status === 401 &&
        denied.json?.error === "Usuário ou senha incorretos." &&
        events("login_succeeded").length === 1 &&
        events("login_denied").length === 1 &&
        events("login_succeeded")[0].actor_user_id === USER_ANA &&
        events("login_succeeded")[0].session_id === ana.json?.sessionId,
      `login ${ana.status}, recusa ${denied.status}`
    );

    const limitedIp = "203.0.113.50";
    let lastStatus = 0;
    for (let i = 0; i < 11; i += 1) {
      const attempt = await login(base, "ninguem", PASS_WRONG, limitedIp, "aparelho-limite");
      lastStatus = attempt.status;
    }
    record(
      "excesso de tentativas registra bloqueio sem multiplicar a recusa",
      lastStatus === 429 && events("rate_limited").some((row) => row.device_id === "aparelho-limite") && events("login_denied").length === 2,
      `última ${lastStatus}`
    );

    const logout = await call(base, ana.json.token, "POST", "/api/auth/logout", {}, { "x-device-id": "aparelho-ana" });
    const afterLogout = await call(base, ana.json.token, "GET", "/api/auth/my-profile", undefined, { "x-device-id": "aparelho-ana" });
    record(
      "logout e sessão revogada",
      logout.status === 200 &&
        afterLogout.status === 401 &&
        afterLogout.json?.code === "session_revoked" &&
        events("logout").length === 1 &&
        events("session_revoked").length === 1,
      `logout ${logout.status}, seguinte ${afterLogout.status}`
    );

    const ana2 = await login(base, "ana", PASS_ANA, "203.0.113.60", "aparelho-bloquear");
    const admin = await login(base, "Gerência", PASS_ADMIN, "203.0.113.61", "aparelho-admin");
    const blocked = await call(base, admin.json.token, "POST", "/api/auth/devices/block", {
      deviceId: "aparelho-bloquear",
      sessionId: ana2.json.sessionId,
      reason: "texto que não pode ir para o histórico",
    }, { "x-device-id": "aparelho-admin" });
    const blockedUse = await call(base, ana2.json.token, "GET", "/api/auth/my-profile", undefined, { "x-device-id": "aparelho-bloquear" });
    const blockEvent = events("device_blocked_admin")[0];
    record(
      "bloqueio administrativo e acesso seguinte",
      blocked.status === 200 &&
        blockedUse.status === 403 &&
        blockEvent?.device_id === "aparelho-bloquear" &&
        !JSON.stringify(blockEvent?.metadata || {}).includes("texto que"),
      `bloqueio ${blocked.status}, uso ${blockedUse.status}`
    );
    const unblocked = await call(base, admin.json.token, "DELETE", "/api/auth/devices/block/aparelho-bloquear", undefined, {
      "x-device-id": "aparelho-admin",
    });
    const anaRevoke = await login(base, "ana", PASS_ANA, "203.0.113.62", "aparelho-revogar");
    const revokedAdmin = await call(
      base,
      admin.json.token,
      "POST",
      `/api/auth/devices/${anaRevoke.json.sessionId}/revoke`,
      {},
      { "x-device-id": "aparelho-admin" }
    );
    const afterRevoke = await call(base, anaRevoke.json.token, "GET", "/api/auth/my-profile", undefined, {
      "x-device-id": "aparelho-revogar",
    });
    record(
      "desbloqueio e revogação administrativa",
      unblocked.status === 200 &&
        revokedAdmin.status === 200 &&
        afterRevoke.status === 401 &&
        afterRevoke.json?.code === "session_revoked" &&
        events("device_unblocked").length === 1 &&
        events("session_revoked_admin").length === 1,
      `desbloqueio ${unblocked.status}, revogação ${revokedAdmin.status}`
    );

    const ana3 = await login(base, "ana", PASS_ANA, "203.0.113.70", "aparelho-senha");
    const changed = await call(base, ana3.json.token, "POST", "/api/auth/change-my-password", {
      currentPassword: PASS_ANA,
      newPassword: PASS_ANA_NOVA,
    }, { "x-device-id": "aparelho-senha" });
    record(
      "troca de senha só depois da gravação",
      changed.status === 200 && changed.json?.passwordUpdated === true && events("password_changed").length === 1,
      `senha ${changed.status}`
    );

    const created = await call(base, admin.json.token, "POST", "/api/system-users", {
      adminPassword: PASS_ADMIN,
      username: "novo",
      password: PASS_NOVO,
      displayName: "Novo",
      permissions: {},
    }, { "x-device-id": "aparelho-admin" });
    const createdId = created.json?.id;
    const permissions = await call(base, admin.json.token, "PUT", `/api/system-users/${USER_ANA}`, {
      adminPassword: PASS_ADMIN,
      permissions: { access_patio: true },
    }, { "x-device-id": "aparelho-admin" });
    const removed = await call(base, admin.json.token, "DELETE", `/api/system-users/${createdId}`, undefined, {
      "x-device-id": "aparelho-admin",
    });
    const permissionEvent = events("permissions_changed")[0];
    record(
      "criação, permissão e remoção de funcionário",
      created.status === 201 &&
        permissions.status === 200 &&
        removed.status === 204 &&
        events("employee_created").length === 1 &&
        events("employee_removed").length === 1 &&
        Array.isArray((permissionEvent?.metadata as { permissionKeys?: string[] } | undefined)?.permissionKeys) &&
        ((permissionEvent?.metadata as { permissionKeys?: string[] }).permissionKeys || []).includes("access_patio"),
      `criar ${created.status}, permissão ${permissions.status}, remover ${removed.status}`
    );

    const chefe = await login(base, "chefe", PASS_ANA, "203.0.113.80", "aparelho-chefe");
    const allowed = await call(base, chefe.json.token, "GET", "/api/security-events?limit=5&eventType=login_succeeded", undefined, {
      "x-device-id": "aparelho-chefe",
    });
    const anaDenied = await login(base, "ana", PASS_ANA_NOVA, "203.0.113.81", "aparelho-ana-leitura");
    const forbidden = await call(base, anaDenied.json.token, "GET", "/api/security-events", undefined, {
      "x-device-id": "aparelho-ana-leitura",
    });
    const forbiddenAgain = await call(base, anaDenied.json.token, "GET", "/api/security-events", undefined, {
      "x-device-id": "aparelho-ana-leitura",
    });
    tables.workshop_security_events.push({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      workshop_id: OTHER_WORKSHOP,
      occurred_at: new Date().toISOString(),
      event_type: "login_succeeded",
      outcome: "success",
      actor_user_id: null,
      session_id: null,
      device_id: "aparelho-outra-oficina",
      origin: "vercel",
      client_ref: null,
      metadata: {},
    });
    const isolated = await call(base, admin.json.token, "GET", "/api/security-events?limit=100", undefined, {
      "x-device-id": "aparelho-admin",
    });
    const summaryHttp = await call(base, admin.json.token, "GET", "/api/security-events/summary", undefined, {
      "x-device-id": "aparelho-admin",
    });
    const listed = Array.isArray(isolated.json?.events) ? isolated.json.events : [];
    record(
      "leitura administrativa, recusa e isolamento",
      allowed.status === 200 &&
        forbidden.status === 403 &&
        forbiddenAgain.status === 403 &&
        events("admin_access_denied").length === 1 &&
        listed.length > 0 &&
        listed.every((row: { deviceId?: string }) => row.deviceId !== "aparelho-outra-oficina") &&
        summaryHttp.status === 200 &&
        summaryHttp.json?.totals?.success >= 1,
      `chefe ${allowed.status}, ana ${forbidden.status}, lista ${isolated.status}`
    );

    const beforeFail = events("login_succeeded").length;
    failAuditInsert = true;
    const errors: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args.map((item) => String(item)).join(" "));
    };
    const duringFailure = await login(base, "chefe", PASS_ANA, "203.0.113.90", "aparelho-falha");
    console.error = originalError;
    failAuditInsert = false;
    record(
      "auditoria indisponível não altera o login",
      duringFailure.status === 200 &&
        events("login_succeeded").length === beforeFail &&
        errors.some((line) => line === "[audit] Não foi possível registrar o evento.") &&
        !errors.some((line) => containsSecret(line)),
      `login ${duringFailure.status}`
    );

    const dumped = JSON.stringify(tables.workshop_security_events);
    record(
      "histórico não contém senha, token nem IP",
      !containsSecret(dumped) &&
        !dumped.includes("203.0.113") &&
        !dumped.includes("198.51.100") &&
        !dumped.includes(String(ana.json?.token || "token-ausente")) &&
        events().every((row) => row.origin === "vercel" || row.workshop_id === OTHER_WORKSHOP),
      "minimização"
    );
  } finally {
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await new Promise<void>((resolve) => mock.server.close(() => resolve()));
  }

  const db = "sec0512a_security_audit";
  await psql("postgres", `DROP DATABASE IF EXISTS ${db}`);
  const createdDb = await psql("postgres", `CREATE DATABASE ${db}`);
  if (createdDb.code !== 0) {
    record("PostgreSQL local da retenção", false, "banco não criado");
  } else {
    await psql(db, "CREATE TABLE public.workshops (id uuid PRIMARY KEY); CREATE TABLE public.workshop_system_users (id uuid PRIMARY KEY);");
    for (const role of ["anon", "authenticated", "service_role", "audit_reader"]) {
      const exists = await psql(db, `SELECT 1 FROM pg_roles WHERE rolname = '${role}'`);
      if (!exists.stdout.includes("1")) await psql("postgres", `CREATE ROLE ${role} NOLOGIN`);
    }
    await psql("postgres", "ALTER ROLE service_role BYPASSRLS");
    await psql("postgres", "ALTER ROLE audit_reader NOBYPASSRLS");
    const applied = await psqlFile(db, MIGRATION);
    const workshop = "33333333-3333-4333-8333-333333333301";
    await psql(db, `INSERT INTO public.workshops (id) VALUES ('${workshop}')`);
    const insert = await psql(
      db,
      `SET ROLE service_role; INSERT INTO public.workshop_security_events (workshop_id, event_type, outcome, metadata) VALUES ('${workshop}', 'login_denied', 'denied', '{}'::jsonb);`
    );
    const update = await psql(db, "SET ROLE service_role; UPDATE public.workshop_security_events SET outcome = 'success';");
    const remove = await psql(db, "SET ROLE service_role; DELETE FROM public.workshop_security_events;");
    const anon = await psql(db, "SET ROLE anon; SELECT count(*) FROM public.workshop_security_events;");
    const reader = await psql(
      db,
      "GRANT SELECT ON public.workshop_security_events TO audit_reader; SET ROLE audit_reader; SELECT count(*) FROM public.workshop_security_events;"
    );
    await psql(
      db,
      `RESET ROLE; DELETE FROM public.workshop_security_events; INSERT INTO public.workshop_security_events (workshop_id, occurred_at, event_type, outcome) VALUES ('${workshop}', now() - interval '100 days', 'login_denied', 'denied'), ('${workshop}', now() - interval '400 days', 'login_succeeded', 'success'), ('${workshop}', now() - interval '10 days', 'password_changed', 'success');`
    );
    const refused = await psql(db, "SET ROLE service_role; SELECT public.purge_security_events('nao');");
    const purged = await psql(db, "SET ROLE service_role; SELECT public.purge_security_events('purge-security-events');");
    const left = await psql(db, "RESET ROLE; SELECT event_type FROM public.workshop_security_events ORDER BY event_type;");
    const last = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean).at(-1) || "";
    record(
      "RLS, escrita só do backend e limpeza confirmada",
      applied.code === 0 &&
        insert.code === 0 &&
        update.code !== 0 &&
        remove.code !== 0 &&
        anon.code !== 0 &&
        last(reader.stdout) === "0" &&
        refused.code !== 0 &&
        last(purged.stdout) === "2" &&
        last(left.stdout) === "password_changed",
      applied.code === 0 ? "postgres" : "migration recusada"
    );
    await psql("postgres", `DROP DATABASE IF EXISTS ${db}`);
  }

  console.log(`\n${passed} ok, ${failed} falha(s)`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "falha");
  process.exit(1);
});
