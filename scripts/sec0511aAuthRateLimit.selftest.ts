/**
 * SEC-05.1.1-A: contador distribuído, sem banco real.
 * npm run test:sec0511a-auth-rate-limit
 * Não imprime senha, chave nem segredo.
 */
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import { MemoryAuthRateLimitStore } from "../utils/authRateLimit.js";
import {
  PostgresAuthRateLimitStore,
  resolveAuthRateLimitStore,
  type AuthRateLimitDb,
} from "../utils/postgresAuthRateLimit.js";

const WORKSHOP_ID = "11111111-1111-4111-8111-111111111111";
const USER_ANA = "22222222-2222-4222-8222-222222222201";
const USER_BIA = "22222222-2222-4222-8222-222222222202";
const SESSION_SECRET = "homolog-session-sec0511a";
const SERVICE_ROLE = "homolog-service-role-sec0511a";
const PASS_ANA = "senha-ana-sec0511a";
const PASS_BIA = "senha-bia-sec0511a";
const PASS_ADMIN = "gerencia-sec0511a";
const PASS_WRONG = "senha-errada-sec0511a";
const MIGRATION = "supabase/migrations/20261116020000_workshop_auth_rate_limits.sql";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

type Row = Record<string, unknown>;
type Bucket = { count: number; resetAt: number };

let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Espelha o INSERT ... ON CONFLICT da migration, com cadeado por chave.
 * O relógio é o do banco fictício, não o argumento now da instância.
 */
class LockedRateDb implements AuthRateLimitDb {
  readonly buckets = new Map<string, Bucket>();
  clock = 1_700_000_000_000;
  fail = false;
  readonly calls: string[] = [];
  private tails = new Map<string, Promise<void>>();

  private lock<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    const run = prev.then(fn, fn);
    this.tails.set(
      key,
      run.then(
        () => undefined,
        () => undefined
      )
    );
    return run;
  }

  async rpc(fn: string, args: Record<string, unknown>) {
    this.calls.push(fn);
    if (this.fail) return { data: null, error: { message: "falha do contador" } };
    if (fn === "hit_auth_rate_limit") {
      const key = String(args.p_key);
      const windowMs = Number(args.p_window_ms);
      const max = Number(args.p_max);
      const row = await this.lock(key, async () => {
        await delay(2);
        return this.bump(key, windowMs, max);
      });
      return { data: [row], error: null };
    }
    if (fn === "peek_auth_rate_limit") {
      const key = String(args.p_key);
      const max = Number(args.p_max);
      const current = this.buckets.get(key);
      const limited = !!current && current.resetAt > this.clock && current.count >= max;
      return { data: limited, error: null };
    }
    if (fn === "reset_auth_rate_limit") {
      this.buckets.delete(String(args.p_key));
      return { data: null, error: null };
    }
    if (fn === "purge_expired_auth_rate_limits") {
      return { data: 0, error: null };
    }
    return { data: null, error: { message: "rpc desconhecida" } };
  }

  private bump(key: string, windowMs: number, max: number) {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= this.clock) {
      const resetAt = this.clock + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { hit_count: 1, reset_at: new Date(resetAt).toISOString(), limited: 1 > max };
    }
    current.count = Math.min(current.count, 999_999) + 1;
    return {
      hit_count: current.count,
      reset_at: new Date(current.resetAt).toISOString(),
      limited: current.count > max,
    };
  }
}

function migrationSql(): string {
  return fs.readFileSync(MIGRATION, "utf8");
}

function grantsTo(sql: string, role: string): boolean {
  return new RegExp(`GRANT\\s+[^;]*\\bTO\\s+${role}\\b`, "i").test(sql);
}

async function storeChecks() {
  const memoryA = new MemoryAuthRateLimitStore();
  const memoryB = new MemoryAuthRateLimitStore();
  const now = 5_000;
  let blocked = false;
  for (let i = 0; i < 3; i += 1) blocked = (await memoryA.hit("login:ip:a", now, 1000, 2)).limited || blocked;
  const other = await memoryB.hit("login:ip:a", now, 1000, 2);
  record(
    "memória continua isolada por instância",
    blocked && other.limited === false && (await memoryA.peek("login:ip:a", now, 2)) === true,
    "rollback"
  );

  const db = new LockedRateDb();
  const left = new PostgresAuthRateLimitStore(db, 60_000);
  const right = new PostgresAuthRateLimitStore(db, 60_000);
  const hits = await Promise.all(
    Array.from({ length: 20 }, () => left.hit("login:ip:oficina", 0, 60_000, 10).then((hit) => hit.limited))
  );
  const fromRight = await right.hit("login:ip:oficina", 9_999_999_999_999, 60_000, 10);
  const limitedCount = hits.filter(Boolean).length;
  record(
    "instâncias compartilham o contador e serializam a rajada",
    limitedCount === 10 &&
      fromRight.count === 21 &&
      fromRight.limited === true &&
      db.buckets.get("login:ip:oficina")?.count === 21 &&
      db.calls.filter((name) => name === "purge_expired_auth_rate_limits").length === 0,
    `bloqueios na rajada ${limitedCount}, contagem ${fromRight.count}`
  );

  const expiredDb = new LockedRateDb();
  const expiring = new PostgresAuthRateLimitStore(expiredDb, 60_000);
  await expiring.hit("login:account:ana", 0, 1000, 10);
  expiredDb.clock += 1000;
  const reopened = await expiring.hit("login:account:ana", 0, 1000, 10);
  record(
    "janela vencida no relógio do banco reabre a contagem",
    reopened.count === 1 && reopened.limited === false,
    `contagem ${reopened.count}`
  );

  const clockDb = new LockedRateDb();
  const clockStore = new PostgresAuthRateLimitStore(clockDb, 60_000);
  await clockStore.hit("k", 0, 10_000, 10);
  const ignored = await clockStore.hit("k", clockDb.clock + 999_999, 10_000, 10);
  record(
    "relógio da instância não expira a janela",
    ignored.count === 2,
    `contagem ${ignored.count}`
  );

  const resetDb = new LockedRateDb();
  const resetting = new PostgresAuthRateLimitStore(resetDb, 60_000);
  await resetting.hit("login:ip:a", 0, 10_000, 2);
  await resetting.hit("login:account:ana", 0, 10_000, 2);
  await resetting.peek("login:account:ana", 0, 2);
  await resetting.reset("login:ip:a");
  await resetting.reset("login:account:ana");
  const afterReset = await resetting.hit("login:ip:a", 0, 10_000, 2);
  record(
    "sucesso apaga ip e conta sem incrementar no peek",
    afterReset.count === 1 && !resetDb.buckets.has("login:account:ana"),
    `contagem ${afterReset.count}`
  );

  const broken = new PostgresAuthRateLimitStore(new LockedRateDb(), 60_000);
  (broken as unknown as { db: LockedRateDb }).db.fail = true;
  let threw = false;
  try {
    await broken.hit("login:ip:a", 0, 1000, 2);
  } catch (err) {
    threw = err instanceof Error && err.name === "AuthRateLimitUnavailable";
  }
  const malformed = new PostgresAuthRateLimitStore(
    {
      async rpc() {
        return { data: [{ hit_count: "1", limited: "sim" }], error: null };
      },
    },
    60_000
  );
  let malformedThrew = false;
  try {
    await malformed.hit("login:ip:a", 0, 1000, 2);
  } catch (err) {
    malformedThrew = err instanceof Error && err.name === "AuthRateLimitUnavailable";
  }
  const missing = resolveAuthRateLimitStore({ AUTH_RATE_LIMIT_STORE: "postgres" }, null);
  const typo = resolveAuthRateLimitStore({ AUTH_RATE_LIMIT_STORE: "postgress" }, new LockedRateDb());
  const fallback = resolveAuthRateLimitStore({}, new LockedRateDb());
  let missingThrew = false;
  let typoThrew = false;
  try {
    await missing.peek("login:ip:a", 0, 2);
  } catch (err) {
    missingThrew = err instanceof Error && err.name === "AuthRateLimitUnavailable";
  }
  try {
    await typo.hit("login:ip:a", 0, 1000, 2);
  } catch (err) {
    typoThrew = err instanceof Error && err.name === "AuthRateLimitUnavailable";
  }
  record(
    "falha, resposta inválida, flag ausente no modo postgres e flag desconhecida negam",
    threw && malformedThrew && missingThrew && typoThrew && fallback instanceof MemoryAuthRateLimitStore,
    "503 no endpoint"
  );

  const purgeDb = new LockedRateDb();
  const purging = new PostgresAuthRateLimitStore(purgeDb, 0);
  await purging.hit("login:ip:a", 0, 1000, 10);
  const purges = purgeDb.calls.filter((name) => name === "purge_expired_auth_rate_limits").length;
  record("limpeza física não acompanha cada tentativa", purges === 1, `limpezas ${purges}`);

  const sql = migrationSql();
  const noBrowserGrant = !grantsTo(sql, "anon") && !grantsTo(sql, "authenticated") && !grantsTo(sql, "PUBLIC");
  record(
    "migration trava RLS, EXECUTE e a limpeza",
    sql.includes("ENABLE ROW LEVEL SECURITY") &&
      sql.includes("FORCE ROW LEVEL SECURITY") &&
      sql.includes("ON CONFLICT (bucket_key)") &&
      sql.includes("pg_catalog.now()") &&
      sql.includes("SECURITY INVOKER") &&
      sql.includes("SET search_path = ''") &&
      !sql.includes("SECURITY DEFINER") &&
      sql.includes("FOR UPDATE SKIP LOCKED") &&
      sql.includes("GRANT EXECUTE ON FUNCTION public.hit_auth_rate_limit(text, integer, integer) TO service_role") &&
      sql.includes("REVOKE ALL ON TABLE public.workshop_auth_rate_limits FROM anon, authenticated") &&
      noBrowserGrant,
    "sql local, sem aplicar"
  );
}

type Tables = Record<string, Row[]>;

function endpointFixture(): { tables: Tables; db: LockedRateDb } {
  const tables: Tables = {
    workshop_settings: [
      {
        workshop_id: WORKSHOP_ID,
        key: "admin_password",
        value: hashPassword(PASS_ADMIN),
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    workshop_system_users: [
      {
        id: USER_ANA,
        workshop_id: WORKSHOP_ID,
        username: "ana",
        display_name: "Ana",
        password_hash: hashPassword(PASS_ANA),
        permissions: {},
        is_technician: false,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: USER_BIA,
        workshop_id: WORKSHOP_ID,
        username: "bia",
        display_name: "Bia",
        password_hash: hashPassword(PASS_BIA),
        permissions: {},
        is_technician: false,
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
  };
  return { tables, db: new LockedRateDb() };
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

async function startMock(state: { tables: Tables; db: LockedRateDb }): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const path = decodeURIComponent(url.pathname.replace(/\/$/, ""));
      if (path.startsWith("/rest/v1/rpc/")) {
        const fn = path.slice("/rest/v1/rpc/".length);
        const raw = await readBody(req);
        const args = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
        const result = await state.db.rpc(fn, args);
        if (result.error) {
          res.writeHead(500, { "content-type": "application/json" });
          res.end(JSON.stringify({ message: "falha do contador" }));
          return;
        }
        if (fn === "reset_auth_rate_limit") {
          res.writeHead(204).end();
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(result.data));
        return;
      }
      const table = path.replace(/^\/rest\/v1\//, "");
      if (!state.tables[table]) state.tables[table] = [];
      const filters = parseFilters(url);
      const select = url.searchParams.get("select");
      const wantsObject = String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");
      if (req.method === "GET" || req.method === "HEAD") {
        const rows = state.tables[table].filter((row) => matches(row, filters)).map((row) => project(row, select));
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
        const created = { id: crypto.randomUUID(), ...body };
        state.tables[table].push(created);
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? created : [created]));
        return;
      }
      if (req.method === "PATCH") {
        const matched = state.tables[table].filter((row) => matches(row, filters));
        for (const row of matched) Object.assign(row, body);
        const projected = matched.map((row) => project(row, select));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? projected[0] ?? {} : projected));
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

async function listen(app: http.RequestListener): Promise<{ server: http.Server; base: string }> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, base: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
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

function login(base: string, username: string, password: string, ip: string) {
  return call(base, null, "POST", "/api/auth/login", { username, password, deviceId: `aparelho-${username}` }, {
    "x-vercel-forwarded-for": ip,
    "x-forwarded-for": "203.0.113.50",
    "x-real-ip": "203.0.113.51",
    "x-device-id": `aparelho-${username}`,
  });
}

async function endpointChecks() {
  const state = endpointFixture();
  const mock = await startMock(state);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE;
  process.env.WORKSHOP_ID = WORKSHOP_ID;
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.HOMOLOGATION_MODE = "true";
  process.env.RDA_INTELLIGENCE_ENABLED = "false";
  process.env.RDA_ALLOW_LLM_CALLS = "false";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ADMIN_PASSWORD;
  process.env.NODE_ENV = "development";
  process.env.VERCEL = "1";
  process.env.AUTH_RATE_LIMIT_STORE = "postgres";

  const { createApiApp } = await import("../apiApp.ts");
  const first = await listen(createApiApp());
  const second = await listen(createApiApp());

  try {
    const sharedIp = "198.51.100.10";
    const failures: number[] = [];
    for (let i = 0; i < 10; i += 1) failures.push((await login(first.base, "ana", PASS_WRONG, sharedIp)).status);
    const colleague = await login(second.base, "bia", PASS_BIA, sharedIp);
    const anaAccount = state.db.buckets.get("login:account:ana")?.count ?? 0;
    const biaAccount = state.db.buckets.get("login:account:bia")?.count ?? 0;
    record(
      "IP compartilhado bloqueia o colega com senha certa; a conta dele não entra no contador",
      failures.every((status) => status === 401) &&
        colleague.status === 429 &&
        colleague.json?.code === "rate_limited" &&
        !colleague.json?.token &&
        anaAccount === 10 &&
        biaAccount === 0,
      `falhas ${failures.join(",")}, colega ${colleague.status}, conta bia ${biaAccount}`
    );

    const otherIp = "198.51.100.20";
    const biaElsewhere = await login(first.base, "bia", PASS_BIA, otherIp);
    record(
      "outro IP ainda entra com a senha certa",
      biaElsewhere.status === 200 && !!biaElsewhere.json?.token,
      `status ${biaElsewhere.status}`
    );

    const unknownIp = "198.51.100.30";
    const anaBeforeUnknown = state.db.buckets.get("login:account:ana")?.count ?? 0;
    const unknownStatuses: number[] = [];
    for (let i = 0; i < 10; i += 1) {
      unknownStatuses.push((await login(first.base, "ninguem", PASS_WRONG, unknownIp)).status);
    }
    const anaAfterUnknown = state.db.buckets.get("login:account:ana")?.count ?? 0;
    const knownAfterUnknown = await login(second.base, "ana", PASS_ANA, unknownIp);
    record(
      "usuário inexistente não conta na conta real, mas enche o IP da oficina",
      unknownStatuses.every((status) => status === 401) &&
        anaAfterUnknown === anaBeforeUnknown &&
        !state.db.buckets.has("login:account:ninguem") &&
        knownAfterUnknown.status === 429 &&
        !knownAfterUnknown.json?.token,
      `ana ${knownAfterUnknown.status}, conta ${anaAfterUnknown}`
    );

    const successIp = "198.51.100.40";
    const firstTry = await login(first.base, "ana", PASS_WRONG, successIp);
    const success = await login(second.base, "ana", PASS_ANA, successIp);
    const cleared =
      !state.db.buckets.has(`login:ip:${successIp}`) && !state.db.buckets.has("login:account:ana");
    const after: number[] = [];
    for (let i = 0; i < 10; i += 1) after.push((await login(first.base, "ana", PASS_WRONG, successIp)).status);
    const eleventh = await login(second.base, "bia", PASS_BIA, successIp);
    record(
      "login certo zera o contador e a janela recomeça",
      firstTry.status === 401 &&
        success.status === 200 &&
        cleared &&
        after.every((status) => status === 401) &&
        eleventh.status === 429,
      `sucesso ${success.status}, seguinte ${eleventh.status}`
    );

    state.db.clock += 5 * 60 * 1000;
    const afterWindow = await login(first.base, "bia", PASS_BIA, successIp);
    record(
      "cinco minutos no relógio do banco liberam o IP compartilhado",
      afterWindow.status === 200 && !!afterWindow.json?.token,
      `status ${afterWindow.status}`
    );

    const sequentialIp = "198.51.100.50";
    const anaOk = await login(first.base, "ana", PASS_ANA, sequentialIp);
    const biaOk = await login(second.base, "bia", PASS_BIA, sequentialIp);
    record(
      "dois logins certos seguidos no mesmo IP não se bloqueiam",
      anaOk.status === 200 && biaOk.status === 200,
      `${anaOk.status}/${biaOk.status}`
    );

    state.db.fail = true;
    const sessionsBefore = state.tables.workshop_device_sessions.length;
    const hashBefore = String(
      state.tables.workshop_system_users.find((row) => row.id === USER_ANA)?.password_hash || ""
    );
    const denied = await login(first.base, "ana", PASS_ANA, "198.51.100.60");
    const hashAfter = String(
      state.tables.workshop_system_users.find((row) => row.id === USER_ANA)?.password_hash || ""
    );
    record(
      "falha do contador responde 503 e não autentica",
      denied.status === 503 &&
        denied.json?.code === "rate_limit_unavailable" &&
        !denied.json?.token &&
        state.tables.workshop_device_sessions.length === sessionsBefore &&
        hashAfter === hashBefore,
      `status ${denied.status}`
    );

    state.db.fail = false;
    const session = await login(first.base, "ana", PASS_ANA, "198.51.100.70");
    state.db.fail = true;
    const changed = await call(
      first.base,
      session.json?.token,
      "POST",
      "/api/auth/change-my-password",
      { currentPassword: PASS_ANA, newPassword: "senha-nova-sec0511a" },
      { "x-vercel-forwarded-for": "198.51.100.70", "x-device-id": "aparelho-ana" }
    );
    const hashStill = String(
      state.tables.workshop_system_users.find((row) => row.id === USER_ANA)?.password_hash || ""
    );
    const revoked = state.tables.workshop_device_sessions.some((row) => row.revoked_at);
    record(
      "falha do contador não troca a senha nem revoga a sessão",
      session.status === 200 &&
        changed.status === 503 &&
        changed.json?.code === "rate_limit_unavailable" &&
        hashStill === hashBefore &&
        !revoked,
      `troca ${changed.status}`
    );

    state.db.fail = false;
    const admin = await login(second.base, "Gerência", PASS_ADMIN, "198.51.100.80");
    const biaHashBefore = String(
      state.tables.workshop_system_users.find((row) => row.id === USER_BIA)?.password_hash || ""
    );
    state.db.fail = true;
    const reset = await call(
      second.base,
      admin.json?.token,
      "PUT",
      `/api/system-users/${USER_BIA}`,
      { adminPassword: PASS_ADMIN, password: "senha-bia-nova-sec0511a" },
      { "x-vercel-forwarded-for": "198.51.100.81", "x-device-id": "aparelho-Gerência" }
    );
    const biaHashAfter = String(
      state.tables.workshop_system_users.find((row) => row.id === USER_BIA)?.password_hash || ""
    );
    record(
      "falha do contador não efetiva o reset da senha pela Gerência",
      admin.status === 200 &&
        reset.status === 503 &&
        reset.json?.code === "rate_limit_unavailable" &&
        biaHashAfter === biaHashBefore &&
        biaHashAfter.length > 0,
      `reset ${reset.status}`
    );
  } finally {
    first.server.close();
    second.server.close();
    mock.server.close();
  }
}

async function main() {
  await storeChecks();
  await endpointChecks();
  console.log(`\n${passed} ok, ${failed} falhas`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : "falha");
  process.exit(1);
});
