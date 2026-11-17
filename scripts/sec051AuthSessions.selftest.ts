/**
 * SEC-05.1: sessão, limite de tentativas e revogação, com banco fictício.
 * npm run test:sec051-auth-sessions
 * Não imprime segredos nem senhas.
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { MemoryAuthRateLimitStore } from "../utils/authRateLimit.js";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { clientIp } from "../utils/clientIp.js";
import { resolveSessionKeyRing } from "../utils/sessionKeys.js";
import { shouldClearSession } from "../utils/shouldClearSession.js";

const WORKSHOP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ANA = "22222222-2222-4222-8222-222222222201";
const USER_BIA = "22222222-2222-4222-8222-222222222202";
const USER_SEM = "22222222-2222-4222-8222-222222222203";
const USER_CONTA = "22222222-2222-4222-8222-222222222204";
const SESSION_SECRET = "homolog-session-sec051-atual";
const SESSION_SECRET_PREVIOUS = "homolog-session-sec051-anterior";
const SERVICE_ROLE = "homolog-service-role-sec051";

const PASS_ANA = "senha-ana-sec051";
const PASS_ANA_NOVA = "senha-ana-nova-sec051";
const PASS_BIA = "senha-bia-sec051";
const PASS_BIA_NOVA = "senha-bia-nova-sec051";
const PASS_CONTA = "senha-conta-sec051";
const PASS_ADMIN = "gerencia-sec051";
const PASS_ADMIN_NOVA = "gerencia-nova-sec051";
const PASS_WRONG = "senha-errada-sec051";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  workshop_settings: [
    ["admin_password", hashPassword(PASS_ADMIN)],
    ["patio_login_enabled", "true"],
  ].map(([key, value]) => ({
    workshop_id: WORKSHOP_ID,
    key,
    value,
    updated_at: "2026-01-01T00:00:00.000Z",
  })),
  workshop_system_users: [USER_ANA, USER_BIA, USER_SEM, USER_CONTA].map((id, index) => ({
    id,
    workshop_id: WORKSHOP_ID,
    username: ["ana", "bia", "sem", "conta"][index],
    display_name: ["Ana", "Bia", "Sem", "Conta"][index],
    password_hash: hashPassword([PASS_ANA, PASS_BIA, PASS_ANA, PASS_CONTA][index]),
    permissions: {},
    is_technician: false,
    job_title: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    profile_token: null,
    profile_token_expires_at: null,
  })),
  customers: [],
  workshop_device_sessions: [],
  workshop_blocked_devices: [],
};

let failDeviceReads = false;
let failBlockedReads = false;
let failSessionReads = false;
let failEmployeeReads = false;
const authReadCounts: Record<string, number> = {};

function resetAuthReads(): void {
  authReadCounts.workshop_device_sessions = 0;
  authReadCounts.workshop_blocked_devices = 0;
}
let failSessionRevoke = false;
let failPasswordWrite = false;
let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signToken(payload: Record<string, unknown>, key: string): string {
  const body = b64url(JSON.stringify(payload));
  const sig = b64url(crypto.createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
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
      if (
        req.method === "GET" &&
        (table === "workshop_device_sessions" || table === "workshop_blocked_devices")
      ) {
        authReadCounts[table] = (authReadCounts[table] || 0) + 1;
      }
      if (
        req.method === "GET" &&
        ((failDeviceReads && (table === "workshop_device_sessions" || table === "workshop_blocked_devices")) ||
          (failBlockedReads && table === "workshop_blocked_devices") ||
          (failSessionReads && table === "workshop_device_sessions") ||
          (failEmployeeReads && table === "workshop_system_users"))
      ) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "segredo-do-banco-nao-deve-vazar", code: "XX000" }));
        return;
      }
      const filters = parseFilters(url);
      const select = url.searchParams.get("select");
      const wantsObject = String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");
      if (req.method === "GET" || req.method === "HEAD") {
        const rows = tables[table].filter((row) => matches(row, filters)).map((row) => project(row, select));
        if (wantsObject) {
          if (rows.length !== 1) {
            res.writeHead(406, { "content-type": "application/json" });
            res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested" }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(req.method === "HEAD" ? "" : JSON.stringify(rows[0]));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(req.method === "HEAD" ? "" : JSON.stringify(rows));
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
        if (failSessionRevoke && table === "workshop_device_sessions") {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ message: "falha ficticia de revogacao" }));
          return;
        }
        if (failPasswordWrite && table === "workshop_system_users" && Object.prototype.hasOwnProperty.call(body, "password_hash")) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ message: "falha ficticia de gravacao" }));
          return;
        }
        const matched = tables[table].filter((row) => matches(row, filters));
        for (const row of matched) Object.assign(row, body);
        const projected = matched.map((row) => project(row, select));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? projected[0] ?? {} : projected));
        return;
      }
      res.writeHead(405).end();
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: err instanceof Error ? err.message : "erro" }));
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

let loginIpSerial = 0;

function nextLoginIp(): string {
  loginIpSerial += 1;
  return `192.0.2.${((loginIpSerial - 1) % 250) + 1}`;
}

async function login(
  base: string,
  username: string,
  password: string,
  ip: string = nextLoginIp(),
  deviceId: string = `aparelho-${crypto.randomUUID()}`
): Promise<{ status: number; json: any; deviceId: string }> {
  const result = await call(base, null, "POST", "/api/auth/login", { username, password, deviceId }, {
    "x-vercel-forwarded-for": ip,
    "x-forwarded-for": "192.0.2.254",
    "x-real-ip": "192.0.2.253",
    "x-device-id": deviceId,
  });
  return { ...result, deviceId };
}

function userRow(id: string): Row | undefined {
  return tables.workshop_system_users.find((row) => row.id === id);
}

function sessionRow(id: string): Row | undefined {
  return tables.workshop_device_sessions.find((row) => row.id === id);
}

function setting(key: string): string {
  return String(tables.workshop_settings.find((row) => row.key === key)?.value ?? "");
}

async function listen(app: http.RequestListener): Promise<{ server: http.Server; base: string }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

function familyMode(id: string): string {
  return productionAuthorizationPolicy().families.find((family) => family.id === id)?.mode || "";
}

async function main() {
  const dedicated = resolveSessionKeyRing({
    NODE_ENV: "production",
    SESSION_SECRET: "chave-atual",
    SESSION_SECRET_PREVIOUS: "chave-anterior",
    SUPABASE_SERVICE_ROLE_KEY: "nao-deve-assinar",
  });
  const inherited = resolveSessionKeyRing({
    NODE_ENV: "production",
    SUPABASE_SERVICE_ROLE_KEY: "chave-ja-em-uso",
  });
  const missing = resolveSessionKeyRing({ NODE_ENV: "production" });
  const dev = resolveSessionKeyRing({ NODE_ENV: "development" });
  record(
    "produção não usa segredo fixo e preserva a chave atual",
    dedicated?.dedicated === true &&
      dedicated.verify.length === 2 &&
      dedicated.current !== dedicated.verify[1] &&
      inherited?.dedicated === false &&
      inherited?.current === "chave-ja-em-uso" &&
      missing === null &&
      !!dev?.current &&
      dev.dedicated === false,
    "anel de chaves"
  );

  const shared = new MemoryAuthRateLimitStore();
  const now = 1_000_000;
  let sharedBlocked = false;
  for (let i = 0; i < 3; i += 1) {
    sharedBlocked = (await shared.hit("login:ip:a", now, 1000, 2)).limited || sharedBlocked;
  }
  const stillLimited = await shared.peek("login:ip:a", now, 2);
  const other = new MemoryAuthRateLimitStore();
  const independent = await other.hit("login:ip:a", now, 1000, 2);
  const expired = await shared.hit("login:ip:a", now + 1000, 1000, 2);
  const capped = new MemoryAuthRateLimitStore(2);
  await capped.hit("a", now, 5000, 10);
  await capped.hit("b", now, 5000, 10);
  await capped.hit("c", now, 5000, 10);
  record(
    "instâncias independentes e janela que expira",
    sharedBlocked &&
      stillLimited &&
      independent.limited === false &&
      expired.limited === false &&
      (await capped.peek("a", now, 1)) === false &&
      (await capped.peek("c", now, 1)) === true,
    "memória"
  );
  const forgedHeaders = {
    ip: "127.0.0.1",
    headers: {
      "x-forwarded-for": "203.0.113.99, 198.51.100.8",
      "x-real-ip": "203.0.113.77",
      "x-vercel-forwarded-for": "198.51.100.10",
    },
  };
  record(
    "cabeçalho forjado não escolhe a chave do limite",
    clientIp(forgedHeaders, { VERCEL: "1" }) === "198.51.100.10" &&
      clientIp(
        { ...forgedHeaders, headers: { "x-forwarded-for": "203.0.113.99", "x-real-ip": "203.0.113.77" } },
        { VERCEL: "1" }
      ) === "vercel-unknown" &&
      clientIp(forgedHeaders, {}) === "127.0.0.1",
    "ip confiável"
  );

  record(
    "503 não encerra a sessão no navegador",
    shouldClearSession(503, { code: "session_check_unavailable" }) === false &&
      shouldClearSession(401, { code: "session_revoked" }) === true &&
      shouldClearSession(403, { error: "Este dispositivo foi bloqueado e não pode acessar o sistema." }) === true,
    "interceptor"
  );
  record(
    "Radar e RDA continuam fora de enforce",
    familyMode("quality_radar") === "off" &&
      familyMode("rda") === "off" &&
      familyMode("service_orders") === "enforce" &&
      familyMode("notifications") === "enforce",
    "SEC-03"
  );

  const mock = await startMock();
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  process.env.WORKSHOP_ID = WORKSHOP_ID;
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.SESSION_SECRET_PREVIOUS = SESSION_SECRET_PREVIOUS;
  process.env.HOMOLOGATION_MODE = "true";
  process.env.RDA_INTELLIGENCE_ENABLED = "false";
  process.env.RDA_ALLOW_LLM_CALLS = "false";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ADMIN_PASSWORD;
  process.env.NODE_ENV = "development";
  process.env.VERCEL = "1";
  process.env.AUTH_RATE_LIMIT_STORE = "memory";

  const { createApiApp } = await import("../apiApp.ts");
  const first = await listen(createApiApp());
  const second = await listen(createApiApp());
  const base = first.base;

  try {
    const anaUpdated = String(userRow(USER_ANA)?.updated_at);
    const valid = await login(base, "ana", PASS_ANA);
    const invalid = await login(base, "ana", PASS_WRONG);
    const unknown = await login(base, "ninguem", PASS_WRONG);
    record(
      "login válido e inválido",
      valid.status === 200 &&
        !!valid.json?.token &&
        !("profileToken" in (valid.json || {})) &&
        String(userRow(USER_ANA)?.updated_at) === anaUpdated &&
        invalid.status === 401 &&
        !invalid.json?.token &&
        unknown.status === 401,
      `válido ${valid.status}, inválido ${invalid.status}, desconhecido ${unknown.status}`
    );

    const previousSid = "33333333-3333-4333-8333-333333333301";
    tables.workshop_device_sessions.push({
      id: previousSid,
      workshop_id: WORKSHOP_ID,
      device_id: "aparelho-chave-anterior",
      role: "user",
      user_id: USER_ANA,
      username: "ana",
      revoked_at: null,
    });
    const previous = signToken(
      {
        r: "user",
        u: USER_ANA,
        n: "ana",
        sid: previousSid,
        did: "aparelho-chave-anterior",
        exp: Date.now() + 60_000,
      },
      SESSION_SECRET_PREVIOUS
    );
    const previousHit = await call(base, previous, "GET", "/api/auth/my-access");
    const forged = signToken({ r: "user", u: USER_ANA, n: "ana", exp: Date.now() + 60_000 }, "chave-alheia");
    const forgedHit = await call(base, forged, "GET", "/api/auth/my-access");
    const expiredToken = signToken({ r: "user", u: USER_ANA, n: "ana", exp: Date.now() - 1000 }, SESSION_SECRET);
    const expiredHit = await call(base, expiredToken, "GET", "/api/auth/my-access");
    const missingSid = signToken({ r: "user", u: USER_ANA, n: "ana", exp: Date.now() + 60_000 }, SESSION_SECRET);
    const missingSidHit = await call(base, missingSid, "GET", "/api/auth/my-access");
    const unknownSid = signToken(
      { r: "user", u: USER_ANA, n: "ana", sid: "00000000-0000-4000-8000-000000000099", exp: Date.now() + 60_000 },
      SESSION_SECRET
    );
    const unknownSidHit = await call(base, unknownSid, "GET", "/api/auth/my-access");
    record(
      "chave anterior com sid vale; token sem sid, sid inexistente ou expirado não",
      previousHit.status === 200 &&
        forgedHit.status === 401 &&
        expiredHit.status === 401 &&
        expiredHit.json?.code === "session_invalid" &&
        missingSidHit.status === 401 &&
        missingSidHit.json?.code === "session_invalid" &&
        unknownSidHit.status === 401 &&
        unknownSidHit.json?.code === "session_revoked",
      `anterior ${previousHit.status}, alheia ${forgedHit.status}, expirado ${expiredHit.status}, sem sid ${missingSidHit.status}, sid ${unknownSidHit.status}`
    );
    const invalidRows = (tables.workshop_security_events || []).filter((row) => row.event_type === "session_invalid");
    const reason = (row: Row | undefined) => String((row?.metadata as { reason?: string } | undefined)?.reason || "");
    const expiredRow = [...invalidRows].reverse().find((row) => reason(row) === "expired");
    const missingRowAudit = [...invalidRows].reverse().find((row) => reason(row) === "missing_sid");
    const forgedRow = [...invalidRows].reverse().find((row) => reason(row) === "invalid_signature");
    const invalidDump = JSON.stringify(invalidRows);
    record(
      "token antigo, sem sid e com assinatura alheia ficam distintos e sem segredo",
      reason(expiredRow) === "expired" &&
        expiredRow?.actor_user_id === USER_ANA &&
        expiredRow?.session_id == null &&
        reason(missingRowAudit) === "missing_sid" &&
        missingRowAudit?.actor_user_id === USER_ANA &&
        reason(forgedRow) === "invalid_signature" &&
        forgedRow?.actor_user_id == null &&
        forgedRow?.session_id == null &&
        !invalidDump.includes(SESSION_SECRET) &&
        !invalidDump.includes("chave-alheia") &&
        !invalidDump.includes("\"n\""),
      `${reason(expiredRow)}/${reason(missingRowAudit)}/${reason(forgedRow)}`
    );
    const formatHit = await call(base, "abc", "GET", "/api/auth/my-access");
    const formatRow = [...(tables.workshop_security_events || [])].reverse().find((row) => row.event_type === "session_invalid" && reason(row) === "invalid_format");
    record(
      "token ilegível não autoriza e não copia o texto",
      formatHit.status === 401 &&
        formatHit.json?.code === "session_invalid" &&
        !formatHit.json?.token &&
        reason(formatRow) === "invalid_format" &&
        formatRow?.actor_user_id == null,
      `status ${formatHit.status}`
    );

    const blockedId = `bloqueado-${crypto.randomUUID()}`;
    tables.workshop_blocked_devices.push({
      id: crypto.randomUUID(),
      workshop_id: WORKSHOP_ID,
      device_id: blockedId,
    });
    const beforeBlocked = tables.workshop_device_sessions.length;
    const blocked = await login(base, "ana", PASS_ANA, "203.0.113.70", blockedId);
    record(
      "dispositivo bloqueado não entra",
      blocked.status === 403 &&
        /bloqueado/i.test(String(blocked.json?.error || "")) &&
        tables.workshop_device_sessions.length === beforeBlocked,
      `status ${blocked.status}`
    );

    const trackedDevice = `vivo-${crypto.randomUUID()}`;
    const tracked = await login(base, "bia", PASS_BIA, "203.0.113.71", trackedDevice);
    resetAuthReads();
    const trackedOk = await call(base, tracked.json?.token, "GET", "/api/auth/my-access", undefined, {
      "x-device-id": trackedDevice,
    });
    const sessionReads = authReadCounts.workshop_device_sessions || 0;
    const blockReads = authReadCounts.workshop_blocked_devices || 0;
    tables.workshop_blocked_devices.push({
      id: crypto.randomUUID(),
      workshop_id: WORKSHOP_ID,
      device_id: trackedDevice,
    });
    const trackedBlocked = await call(base, tracked.json?.token, "GET", "/api/auth/my-access", undefined, {
      "x-device-id": trackedDevice,
    });
    record(
      "dispositivo bloqueado é recusado na próxima requisição",
      tracked.status === 200 &&
        trackedOk.status === 200 &&
        sessionReads === 1 &&
        blockReads === 1 &&
        trackedBlocked.status === 403 &&
        /bloqueado/i.test(String(trackedBlocked.json?.error || "")),
      `antes ${trackedOk.status}, depois ${trackedBlocked.status}, leituras ${sessionReads}/${blockReads}`
    );

    const live = await login(base, "bia", PASS_BIA);
    const liveRow = sessionRow(String(live.json?.sessionId || ""));
    if (liveRow) liveRow.revoked_at = new Date().toISOString();
    const revokedHit = await call(base, live.json?.token, "GET", "/api/auth/my-access");
    record(
      "sessão revogada é recusada",
      live.status === 200 && revokedHit.status === 401 && revokedHit.json?.code === "session_revoked",
      `status ${revokedHit.status}`
    );

    const missingLogin = await login(base, "ana", PASS_ANA);
    const missingRow = sessionRow(String(missingLogin.json?.sessionId || ""));
    tables.workshop_device_sessions = tables.workshop_device_sessions.filter((row) => row !== missingRow);
    const missingHit = await call(base, missingLogin.json?.token, "GET", "/api/auth/my-access");
    record(
      "sessão ausente não é tratada como falha temporária",
      missingHit.status === 401 && missingHit.json?.code === "session_revoked",
      `status ${missingHit.status}`
    );

    const recover = await login(base, "ana", PASS_ANA);
    const recoverRow = sessionRow(String(recover.json?.sessionId || ""));
    failDeviceReads = true;
    const downLogin = await login(base, "ana", PASS_ANA);
    const down = await call(base, recover.json?.token, "GET", "/api/auth/my-access");
    const stillActive = recoverRow?.revoked_at == null;
    failDeviceReads = false;
    const back = await call(base, recover.json?.token, "GET", "/api/auth/my-access");
    record(
      "falha de banco responde 503 e a sessão volta sozinha",
      downLogin.status === 503 &&
        downLogin.json?.code === "session_check_unavailable" &&
        down.status === 503 &&
        stillActive &&
        back.status === 200,
      `login ${downLogin.status}, sessão ${down.status}, retorno ${back.status}`
    );

    const anaA = await login(base, "ana", PASS_ANA);
    const anaB = await login(base, "ana", PASS_ANA);
    const hashBefore = String(userRow(USER_ANA)?.password_hash);
    const wrongChange = await call(base, anaA.json?.token, "POST", "/api/auth/change-my-password", {
      currentPassword: PASS_WRONG,
      newPassword: PASS_ANA_NOVA,
    }, { "x-vercel-forwarded-for": "203.0.113.40", "x-forwarded-for": "192.0.2.254" });
    const hashAfterWrong = String(userRow(USER_ANA)?.password_hash);
    const changed = await call(base, anaA.json?.token, "POST", "/api/auth/change-my-password", {
      currentPassword: PASS_ANA,
      newPassword: PASS_ANA_NOVA,
    }, { "x-vercel-forwarded-for": "203.0.113.40", "x-forwarded-for": "192.0.2.254" });
    const otherAna = await call(base, anaB.json?.token, "GET", "/api/auth/my-access");
    const sameAna = await call(base, anaA.json?.token, "GET", "/api/auth/my-access");
    const oldAna = await login(base, "ana", PASS_ANA);
    const newAna = await login(base, "ana", PASS_ANA_NOVA);
    record(
      "troca do funcionário encerra o outro aparelho e mantém o atual",
      wrongChange.status === 401 &&
        hashAfterWrong === hashBefore &&
        String(userRow(USER_ANA)?.password_hash) !== hashBefore &&
        changed.status === 200 &&
        otherAna.status === 401 &&
        otherAna.json?.code === "session_revoked" &&
        sameAna.status === 200 &&
        oldAna.status === 401 &&
        newAna.status === 200 &&
        sessionRow(String(anaA.json?.sessionId))?.revoked_at == null,
      `troca ${changed.status}, outro ${otherAna.status}, atual ${sameAna.status}`
    );

    const adminA = await login(base, "Gerência", PASS_ADMIN);
    const adminB = await login(base, "Gerência", PASS_ADMIN);
    const employeeDuring = await login(base, "bia", PASS_BIA);
    const adminSelf = await call(base, adminA.json?.token, "POST", "/api/auth/change-my-password", {
      currentPassword: PASS_ADMIN,
      newPassword: PASS_ADMIN_NOVA,
    });
    const adminPut = await call(base, adminA.json?.token, "PUT", "/api/workshop-settings", {
      adminPassword: PASS_ADMIN_NOVA,
    });
    const adminOther = await call(base, adminB.json?.token, "GET", "/api/auth/my-access");
    const adminSame = await call(base, adminA.json?.token, "GET", "/api/auth/my-access");
    const employeeStill = await call(base, employeeDuring.json?.token, "GET", "/api/auth/my-access");
    record(
      "troca da Gerência encerra a outra sessão de Gerência",
      adminSelf.status === 403 &&
        adminSelf.json?.code === "not_system_user" &&
        adminPut.status === 200 &&
        adminOther.status === 401 &&
        adminOther.json?.code === "session_revoked" &&
        adminSame.status === 403 &&
        adminSame.json?.code === "not_system_user" &&
        employeeStill.status === 200,
      `própria ${adminSelf.status}, outra ${adminOther.status}, funcionário ${employeeStill.status}`
    );

    const biaSession = await login(base, "bia", PASS_BIA);
    const reset = await call(base, adminA.json?.token, "PUT", `/api/system-users/${USER_BIA}`, {
      adminPassword: PASS_ADMIN_NOVA,
      password: PASS_BIA_NOVA,
    });
    const biaAfter = await call(base, biaSession.json?.token, "GET", "/api/auth/my-access");
    const biaOld = await login(base, "bia", PASS_BIA);
    const biaNew = await login(base, "bia", PASS_BIA_NOVA);
    const adminStill = await call(base, adminA.json?.token, "GET", "/api/auth/my-access");
    record(
      "reset da Gerência encerra as sessões daquele funcionário",
      reset.status === 200 &&
        reset.json?.passwordUpdated === true &&
        biaAfter.status === 401 &&
        biaOld.status === 401 &&
        biaNew.status === 200 &&
        adminStill.status === 403,
      `reset ${reset.status}, sessão ${biaAfter.status}`
    );

    const semSession = await login(base, "sem", PASS_ANA);
    const anaControl = await login(base, "ana", PASS_ANA_NOVA);
    const semHash = String(userRow(USER_SEM)?.password_hash);
    const semRow = sessionRow(String(semSession.json?.sessionId || ""));
    const profileOnly = await call(base, adminA.json?.token, "PUT", `/api/system-users/${USER_SEM}`, {
      adminPassword: PASS_ADMIN_NOVA,
      displayName: "Sem Dois",
    });
    const semAfterProfile = await call(base, semSession.json?.token, "GET", "/api/auth/my-access");
    const anaAfterProfile = await call(base, anaControl.json?.token, "GET", "/api/auth/my-access");
    record(
      "cadastro sem senha não revoga sessões",
      profileOnly.status === 200 &&
        profileOnly.json?.passwordUpdated === false &&
        String(userRow(USER_SEM)?.password_hash) === semHash &&
        semRow?.revoked_at == null &&
        semAfterProfile.status === 200 &&
        anaAfterProfile.status === 200,
      `status ${profileOnly.status}`
    );

    failSessionRevoke = true;
    const revokeFail = await call(base, adminA.json?.token, "PUT", `/api/system-users/${USER_SEM}`, {
      adminPassword: PASS_ADMIN_NOVA,
      password: "senha-sem-nova",
    });
    const semAfterRevokeFail = await call(base, semSession.json?.token, "GET", "/api/auth/my-access");
    const anaAfterRevokeFail = await call(base, anaControl.json?.token, "GET", "/api/auth/my-access");
    failSessionRevoke = false;
    record(
      "falha ao revogar não grava a senha nova",
      revokeFail.status === 503 &&
        revokeFail.json?.code === "sessions_not_revoked" &&
        revokeFail.json?.passwordUpdated !== true &&
        String(userRow(USER_SEM)?.password_hash) === semHash &&
        semRow?.revoked_at == null &&
        semAfterRevokeFail.status === 200 &&
        anaAfterRevokeFail.status === 200 &&
        sessionRow(String(anaControl.json?.sessionId || ""))?.revoked_at == null,
      `status ${revokeFail.status}`
    );

    await call(base, semSession.json?.token, "GET", "/api/auth/my-access");
    failPasswordWrite = true;
    const writeFail = await call(base, adminA.json?.token, "PUT", `/api/system-users/${USER_SEM}`, {
      adminPassword: PASS_ADMIN_NOVA,
      password: "senha-sem-nova",
    });
    const semAfterWriteFail = await call(base, semSession.json?.token, "GET", "/api/auth/my-access");
    const anaAfterWriteFail = await call(base, anaControl.json?.token, "GET", "/api/auth/my-access");
    const semOldLogin = await login(base, "sem", PASS_ANA);
    failPasswordWrite = false;
    record(
      "falha ao gravar a senha deixa a senha antiga e encerra só aquele funcionário",
      writeFail.status === 500 &&
        writeFail.json?.passwordUpdated !== true &&
        String(userRow(USER_SEM)?.password_hash) === semHash &&
        semRow?.revoked_at != null &&
        semAfterWriteFail.status === 401 &&
        anaAfterWriteFail.status === 200 &&
        sessionRow(String(anaControl.json?.sessionId || ""))?.revoked_at == null &&
        semOldLogin.status === 200,
      `status ${writeFail.status}, sessão ${semAfterWriteFail.status}`
    );

    const contaSession = await login(base, "conta", PASS_CONTA);
    const legacy = signToken({ r: "user", u: USER_CONTA, n: "conta", exp: Date.now() + 60_000 }, SESSION_SECRET);
    const legacyBefore = await call(base, legacy, "GET", "/api/auth/my-access");
    const contaChanged = await call(base, contaSession.json?.token, "POST", "/api/auth/change-my-password", {
      currentPassword: PASS_CONTA,
      newPassword: "senha-conta-nova",
    }, { "x-vercel-forwarded-for": "203.0.113.41", "x-forwarded-for": "192.0.2.254" });
    const legacyAfter = await call(base, legacy, "GET", "/api/auth/my-access");
    const contaStill = await call(base, contaSession.json?.token, "GET", "/api/auth/my-access");
    record(
      "token sem sid é recusado e a sessão com sid permanece após a troca",
      legacyBefore.status === 401 &&
        legacyBefore.json?.code === "session_invalid" &&
        contaChanged.status === 200 &&
        contaStill.status === 200 &&
        legacyAfter.status === 401 &&
        legacyAfter.json?.code === "session_invalid" &&
        sessionRow(String(contaSession.json?.sessionId || ""))?.revoked_at == null,
      `legado ${legacyBefore.status}/${legacyAfter.status}, atual ${contaStill.status}`
    );

    const cached = await login(base, "ana", PASS_ANA_NOVA);
    const cachedOk = await call(base, cached.json?.token, "GET", "/api/auth/my-access");
    const cachedRow = sessionRow(String(cached.json?.sessionId || ""));
    if (cachedRow) cachedRow.revoked_at = new Date().toISOString();
    const duringWindow = await call(base, cached.json?.token, "GET", "/api/auth/my-access");
    const revokedBurst = await Promise.all(
      Array.from({ length: 8 }, () => call(base, cached.json?.token, "GET", "/api/auth/my-access"))
    );
    record(
      "revogação fora do processo vale na próxima requisição e na rajada",
      cachedOk.status === 200 &&
        duringWindow.status === 401 &&
        duringWindow.json?.code === "session_revoked" &&
        revokedBurst.every((item) => item.status === 401 && item.json?.code === "session_revoked"),
      `seguinte ${duringWindow.status}, rajada ${revokedBurst.map((item) => item.status).join(",")}`
    );

    const floodIp = "203.0.113.10";
    const flood: number[] = [];
    for (let i = 0; i < 11; i += 1) flood.push((await login(base, "ninguem", PASS_WRONG, floodIp)).status);
    const otherIp = await login(base, "ninguem", PASS_WRONG, "203.0.113.11");
    const accountStatuses: number[] = [];
    for (let i = 0; i < 31; i += 1) {
      accountStatuses.push((await login(base, "conta", PASS_WRONG, `198.51.100.${i}`)).status);
    }
    const anaAfterAccount = await login(base, "ana", PASS_ANA_NOVA);
    record(
      "limite por IP e por conta expira e não trava outra conta",
      flood.filter((status) => status === 429).length === 1 &&
        flood.filter((status) => status === 401).length === 10 &&
        otherIp.status === 401 &&
        accountStatuses.filter((status) => status === 429).length === 1 &&
        anaAfterAccount.status === 200,
      `ip 429=${flood.filter((status) => status === 429).length}, conta 429=${accountStatuses.filter((status) => status === 429).length}`
    );
    const spoofed: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      spoofed.push(
        (
          await call(
            base,
            null,
            "POST",
            "/api/auth/login",
            { username: "ninguem", password: PASS_WRONG, deviceId: `spoof-${i}` },
            {
              "x-vercel-forwarded-for": "203.0.113.60",
              "x-forwarded-for": `198.51.100.${i}`,
              "x-real-ip": `192.0.2.${i}`,
              "x-device-id": `spoof-${i}`,
            }
          )
        ).status
      );
    }
    const freshPlatform = await login(base, "ninguem", PASS_WRONG, "203.0.113.61");
    record(
      "rodar x-forwarded-for não abre outro limite",
      spoofed.filter((status) => status === 429).length === 1 &&
        spoofed.filter((status) => status === 401).length === 10 &&
        freshPlatform.status === 401,
      spoofed.join(",")
    );

    const parallelIp = "203.0.113.50";
    const parallel = await Promise.all(
      Array.from({ length: 12 }, () => login(base, "ninguem", PASS_WRONG, parallelIp))
    );
    record(
      "requisições concorrentes não derrubam o login",
      parallel.every((item) => item.status === 401 || item.status === 429) &&
        parallel.some((item) => item.status === 429),
      parallel.map((item) => item.status).join(",")
    );

    const isolatedIp = "203.0.113.80";
    const onFirst = await login(base, "ninguem", PASS_WRONG, isolatedIp);
    for (let i = 0; i < 10; i += 1) await login(base, "ninguem", PASS_WRONG, isolatedIp);
    const onSecond = await login(second.base, "ninguem", PASS_WRONG, isolatedIp);
    record(
      "outra instância não herda o limite em memória",
      onFirst.status === 401 && onSecond.status === 401,
      `primeira ${onFirst.status}, segunda ${onSecond.status}`
    );

    const sem = await login(base, "sem", PASS_ANA);
    const beforeCustomers = tables.customers.length;
    const beforeSetting = setting("patio_login_enabled");
    const customerWrite = await call(base, sem.json?.token, "POST", "/api/customers", { name: "Cliente fictício" });
    const settingsWrite = await call(base, sem.json?.token, "PUT", "/api/workshop-settings", { patioLoginEnabled: false });
    record(
      "falha de autorização não grava e o SEC-04 continua negando",
      customerWrite.status === 403 &&
        tables.customers.length === beforeCustomers &&
        settingsWrite.status === 403 &&
        setting("patio_login_enabled") === beforeSetting,
      `cliente ${customerWrite.status}, configuração ${settingsWrite.status}`
    );

    const passwordIp = "203.0.113.90";
    const holder = await login(base, "sem", PASS_ANA);
    const hashSem = String(userRow(USER_SEM)?.password_hash);
    const attempts: number[] = [];
    for (let i = 0; i < 9; i += 1) {
      attempts.push(
        (
          await call(base, holder.json?.token, "POST", "/api/auth/change-my-password", {
            currentPassword: PASS_WRONG,
            newPassword: "senha-nova-sem",
          }, { "x-vercel-forwarded-for": passwordIp, "x-forwarded-for": "192.0.2.254" })
        ).status
      );
    }
    record(
      "troca de senha também é limitada e a senha fica igual",
      attempts.filter((status) => status === 401).length === 8 &&
        attempts.filter((status) => status === 429).length === 1 &&
        String(userRow(USER_SEM)?.password_hash) === hashSem,
      attempts.join(",")
    );

    const missingHeader: number[] = [];
    const badValues = ["", "   ", "nao-e-ip", "999.1.1.1", "08.8.8.8"];
    for (let i = 0; i < 12; i += 1) {
      missingHeader.push(
        (
          await call(
            base,
            null,
            "POST",
            "/api/auth/login",
            { username: "ninguem", password: PASS_WRONG, deviceId: `socket-${i}` },
            {
              "x-forwarded-for": `203.0.113.${i}`,
              "x-real-ip": `192.0.2.${i}`,
              "x-vercel-forwarded-for": badValues[i % badValues.length],
              "x-device-id": `socket-${i}`,
            }
          )
        ).status
      );
    }
    const stillSeparate = await login(base, "ninguem", PASS_WRONG, "203.0.113.62");
    const v6Hits: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      v6Hits.push((await login(base, "ninguem", PASS_WRONG, "2001:0db8:0000:0000:0000:0000:0000:0010")).status);
    }
    const v6Same = await login(base, "ninguem", PASS_WRONG, "2001:db8::10");
    const v6Other = await login(base, "ninguem", PASS_WRONG, "2001:db8::11");
    record(
      "sem o cabeçalho válido da plataforma o limite usa um identificador fixo",
      missingHeader.slice(0, 10).every((status) => status === 401) &&
        missingHeader[10] === 429 &&
        missingHeader[11] === 429 &&
        stillSeparate.status === 401,
      `${missingHeader.join(",")}, outro ${stillSeparate.status}`
    );
    record(
      "IPv6 normalizado compartilha o contador",
      v6Hits.every((status) => status === 401) && v6Same.status === 429 && v6Other.status === 401,
      `${v6Hits.join(",")}, igual ${v6Same.status}, outro ${v6Other.status}`
    );

    const sessionsBeforeDiag = tables.workshop_device_sessions.length;
    failEmployeeReads = true;
    const employeesDown = await login(base, "ana", PASS_WRONG, "203.0.113.82", "aparelho-cadastro");
    const sessionsDuringOutage = tables.workshop_device_sessions.length;
    failEmployeeReads = false;
    const employeesBack = await login(base, "ana", PASS_ANA_NOVA, "203.0.113.83", "aparelho-cadastro-ok");
    const employeeEvent = [...(tables.workshop_security_events || [])].reverse().find((row) => row.event_type === "login_unavailable");
    const employeeDump = JSON.stringify(employeeEvent || {});
    record(
      "consulta de funcionários indisponível não vira senha incorreta",
      employeesDown.status === 503 &&
        employeesDown.json?.code === "login_unavailable" &&
        !employeesDown.json?.token &&
        !String(employeesDown.json?.error || "").toLowerCase().includes("senha") &&
        sessionsDuringOutage === sessionsBeforeDiag &&
        String((employeeEvent?.metadata as { reason?: string } | undefined)?.reason) === "employees_read" &&
        !employeeDump.includes("segredo-do-banco") &&
        employeesBack.status === 200,
      `falha ${employeesDown.status} ${employeesDown.json?.code || ""}, retorno ${employeesBack.status}`
    );

    failBlockedReads = true;
    const blockedRead = await login(base, "bia", PASS_WRONG, "203.0.113.84", "aparelho-lista");
    failBlockedReads = false;
    const blockedEvent = [...(tables.workshop_security_events || [])].reverse().find((row) =>
      row.event_type === "session_check_unavailable" &&
      (row.metadata as { reason?: string } | undefined)?.reason === "blocked_devices_read"
    );
    record(
      "falha na lista de aparelhos não autoriza",
      blockedRead.status === 503 &&
        blockedRead.json?.code === "session_check_unavailable" &&
        !blockedRead.json?.token &&
        !!blockedEvent &&
        !JSON.stringify(blockedEvent).includes("segredo-do-banco"),
      `status ${blockedRead.status}`
    );

    const diag = await login(base, "bia", PASS_BIA_NOVA, "203.0.113.85", "aparelho-sessao-diag");
    const diagHeaders = {
      "x-vercel-forwarded-for": "203.0.113.85",
      "x-forwarded-for": "192.0.2.254",
      "x-device-id": diag.deviceId,
    };
    failSessionReads = true;
    const beforeReads = (tables.workshop_security_events || []).filter((row) =>
      row.event_type === "session_check_unavailable" &&
      (row.metadata as { reason?: string } | undefined)?.reason === "device_session_read"
    ).length;
    const firstRead = await call(base, diag.json?.token, "GET", "/api/auth/my-access", undefined, diagHeaders);
    const secondRead = await call(base, diag.json?.token, "GET", "/api/auth/my-access", undefined, diagHeaders);
    failSessionReads = false;
    const readEvents = (tables.workshop_security_events || []).filter((row) =>
      row.event_type === "session_check_unavailable" &&
      (row.metadata as { reason?: string } | undefined)?.reason === "device_session_read"
    );
    const readBack = await call(base, diag.json?.token, "GET", "/api/auth/my-access", undefined, diagHeaders);
    const readRow = readEvents[readEvents.length - 1];
    record(
      "falha da sessão identificada fica visível uma vez e não autoriza",
      diag.status === 200 &&
        firstRead.status === 503 &&
        secondRead.status === 503 &&
        readEvents.length === beforeReads + 1 &&
        readRow?.actor_user_id === USER_BIA &&
        readRow?.session_id === diag.json?.sessionId &&
        !JSON.stringify(readRow || {}).includes("segredo-do-banco") &&
        readBack.status === 200,
      `primeira ${firstRead.status}, segunda ${secondRead.status}, retorno ${readBack.status}`
    );
  } finally {
    first.server.close();
    second.server.close();
    mock.server.close();
  }

  console.log(`\n${passed} ok, ${failed} falha(s)`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "falha");
  process.exit(1);
});
