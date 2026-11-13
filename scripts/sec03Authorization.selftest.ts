/**
 * SEC-03.0: autorizador centralizado, com usuários fictícios.
 * npm run test:sec03-authorization
 * Não imprime senha, PIN, token nem dado pessoal.
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { classifyNewLoginPassword } from "../utils/loginPasswordPolicy.js";
import { shouldClearSession } from "../utils/shouldClearSession.js";
import { rejectCredentialChange, responseExposesSecrets } from "../utils/workshopSettingsSecrets.js";
import {
  productionAuthorizationPolicy,
  type AuthorizationFamilyId,
  type AuthorizationPolicy,
  type FamilyMode,
} from "../utils/authorizationPolicy.js";
import {
  authorizationHasEnforce,
  decideAuthorization,
  observeHttpAuthorization,
  permissionSourceFromSupabase,
  toShadowRecord,
  type CachedLookup,
  type PermissionSource,
  type SessionActor,
  type ShadowRecord,
} from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER_WORKSHOP = "99999999-9999-4999-8999-999999999999";
const USER = "22222222-2222-4222-8222-222222222201";
const SESSION_SECRET = "homolog-session-sec030-local";
const PASS_USER = "senha-ficticia-sec03";
const PASS_ADMIN = "gerencia-ficticia-sec03";
const SECRET = "segredo-pin-unico-sec03";
const TOKEN = "token-bearer-unico-sec03";
const CPF = "529.982.247-25";

let passed = 0;
let failed = 0;
function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function withFamily(
  id: AuthorizationFamilyId,
  mode: FamilyMode,
  extra?: { unmatched?: "ignore" | "deny"; prefixes?: readonly string[] }
): AuthorizationPolicy {
  const base = productionAuthorizationPolicy();
  return {
    rules: base.rules,
    families: base.families.map((family) =>
      family.id === id
        ? {
            ...family,
            mode,
            unmatched: extra?.unmatched ?? family.unmatched,
            prefixes: extra?.prefixes ?? family.prefixes,
          }
        : family
    ),
  };
}

type MemoryRow = {
  id: string;
  workshopId: string;
  permissions: Record<string, unknown>;
  isTechnician?: boolean;
};

function memorySource(rows: MemoryRow[], fail: "no" | "error" | "throw" = "no") {
  let calls = 0;
  const source: PermissionSource = {
    async loadUser(workshopId: string, userId: string) {
      calls += 1;
      if (fail === "throw") throw new Error("consulta indisponivel");
      if (fail === "error") return { ok: false };
      const row = rows.find((item) => item.id === userId && item.workshopId === workshopId);
      if (!row) return { ok: true, row: null };
      return {
        ok: true,
        row: { permissions: row.permissions, is_technician: row.isTechnician === true },
      };
    },
  };
  return { source, calls: () => calls };
}

async function decide(input: {
  method: string;
  path: string;
  actor: SessionActor | null;
  rows?: MemoryRow[];
  fail?: "no" | "error" | "throw";
  policy?: AuthorizationPolicy;
  cache?: Map<string, CachedLookup>;
  log?: (record: ShadowRecord) => void;
  env?: NodeJS.ProcessEnv;
  workshopId?: string;
}) {
  const memory = memorySource(input.rows ?? [], input.fail ?? "no");
  const verdict = await decideAuthorization({
    method: input.method,
    path: input.path,
    actor: input.actor,
    workshopId: input.workshopId === undefined ? WORKSHOP : input.workshopId,
    source: memory.source,
    policy: input.policy,
    cache: input.cache,
    log: input.log,
    env: input.env,
  });
  return { verdict, calls: memory.calls() };
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

type Row = Record<string, unknown>;

async function startMock(tables: Record<string, Row[]>): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (!tables[table]) tables[table] = [];
      const skip = new Set(["select", "on_conflict", "columns", "limit", "order", "offset"]);
      const filters: Array<[string, string]> = [];
      url.searchParams.forEach((value, key) => {
        if (!skip.has(key)) filters.push([key, value]);
      });
      const matches = (row: Row) =>
        filters.every(([key, raw]) => (raw.startsWith("eq.") ? String(row[key] ?? "") === raw.slice(3) : false));
      const select = url.searchParams.get("select");
      const project = (row: Row): Row => {
        if (!select || select === "*") return { ...row };
        const out: Row = {};
        for (const col of select.split(",").map((item) => item.trim())) out[col] = row[col] ?? null;
        return out;
      };
      const wantsObject = String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");
      if (req.method === "GET") {
        const rows = tables[table].filter(matches).map(project);
        if (wantsObject) {
          if (rows.length !== 1) {
            res.writeHead(406, { "content-type": "application/json" });
            res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested" }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(rows[0]));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(rows));
        return;
      }
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === "POST") {
        const incoming = (Array.isArray(body) ? body : [body]) as Row[];
        const stored = incoming.map((row) => {
          const created = { id: crypto.randomUUID(), ...row };
          tables[table].push(created);
          return project(created);
        });
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? stored[0] ?? {} : stored));
        return;
      }
      if (req.method === "PATCH" || req.method === "DELETE") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? {} : []));
        return;
      }
      res.writeHead(405).end();
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "mock" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function main() {
  const production = productionAuthorizationPolicy();
  record(
    "produção nasce sem bloqueio",
    production.families.every((family) => family.mode === "off" && family.unmatched === "ignore") &&
      authorizationHasEnforce(production, {}) === false,
    `${production.families.length} famílias desligadas`
  );

  const inactive = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
  });
  record(
    "família desligada não consulta o banco nem bloqueia",
    inactive.verdict.effect === "skipped" && inactive.verdict.block === false && inactive.calls === 0,
    inactive.verdict.reason
  );

  const enforcedParts = withFamily("parts_stock", "enforce");
  const admin = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "admin" },
    policy: enforcedParts,
  });
  record(
    "Gerência autoriza sem ler funcionário",
    admin.verdict.effect === "allow" && admin.verdict.reason === "admin" && admin.verdict.block === false && admin.calls === 0,
    admin.verdict.reason
  );

  const full = await decide({
    method: "DELETE",
    path: "/api/notifications",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { full_access: true } }],
    policy: withFamily("notifications", "enforce"),
  });
  record(
    "full_access autoriza ação sem chave específica",
    full.verdict.effect === "allow" && full.verdict.reason === "full_access" && full.calls === 1,
    full.verdict.reason
  );

  const stockUser = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_estoque_pecas: true } }],
    policy: enforcedParts,
  });
  record(
    "permissão específica da ação autoriza",
    stockUser.verdict.effect === "allow" && stockUser.verdict.reason === "permission" && stockUser.verdict.block === false,
    stockUser.verdict.action || ""
  );

  const patioOnDelete = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_patio: true } }],
    policy: enforcedParts,
  });
  const patioOnMove = await decide({
    method: "POST",
    path: "/api/workshop-parts/movements",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_patio: true } }],
    policy: enforcedParts,
  });
  record(
    "acesso visual não libera exclusão; movimento compartilhado segue",
    patioOnDelete.verdict.effect === "deny" &&
      patioOnDelete.verdict.block === true &&
      patioOnMove.verdict.effect === "allow" &&
      patioOnMove.verdict.action === "move",
    `delete ${patioOnDelete.verdict.effect}; move ${patioOnMove.verdict.effect}`
  );

  const nobody = await decide({
    method: "POST",
    path: "/api/workshop-parts",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
    policy: enforcedParts,
  });
  const absent = await decide({
    method: "PUT",
    path: "/api/service-orders/os-1/budgets/orc-1",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_patio: true } }],
    policy: withFamily("budgets", "enforce"),
  });
  const explicitFalse = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_estoque_pecas: false } }],
    policy: enforcedParts,
  });
  record(
    "sem permissão, chave ausente e chave falsa negam",
    nobody.verdict.effect === "deny" && absent.verdict.effect === "deny" && explicitFalse.verdict.effect === "deny",
    "missing_permission"
  );

  const inherited = await decide({
    method: "POST",
    path: "/api/service-orders/os-1/budgets/orc-1/verify",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { patio_edit_budgets: true } }],
    policy: withFamily("budgets", "enforce"),
  });
  const approveOff = await decide({
    method: "POST",
    path: "/api/service-orders/os-1/budgets/orc-1/verify",
    actor: { role: "user", userId: USER },
    rows: [{
      id: USER,
      workshopId: WORKSHOP,
      permissions: { patio_edit_budgets: true, patio_approve_budget_items: false },
    }],
    policy: withFamily("budgets", "enforce"),
  });
  const commentByPatioOnly = await decide({
    method: "POST",
    path: "/api/service-orders/os-1/comments",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_patio: true } }],
    policy: withFamily("comments", "enforce"),
  });
  record(
    "aprovação herda a chave da ação e comentário não herda a aba",
    inherited.verdict.effect === "allow" &&
      inherited.verdict.action === "approve" &&
      approveOff.verdict.effect === "deny" &&
      commentByPatioOnly.verdict.effect === "deny",
    `herda ${inherited.verdict.effect}; false ${approveOff.verdict.effect}`
  );

  const otherShop = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: OTHER_WORKSHOP, permissions: { full_access: true } }],
    policy: enforcedParts,
  });
  record(
    "usuário de outra oficina não é autorizado",
    otherShop.verdict.effect === "deny" && otherShop.verdict.reason === "not_in_workshop" && otherShop.verdict.block === true,
    otherShop.verdict.reason
  );

  const anonymous = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: null,
    policy: enforcedParts,
  });
  const nameless = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user" },
    policy: enforcedParts,
  });
  record(
    "sessão ausente ou sem identidade nega no bloqueio",
    anonymous.verdict.reason === "unauthenticated" &&
      anonymous.verdict.block === true &&
      nameless.verdict.reason === "missing_identity" &&
      anonymous.calls === 0,
    `${anonymous.verdict.reason}; ${nameless.verdict.reason}`
  );

  const lookupEnforce = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    fail: "error",
    policy: enforcedParts,
  });
  const lookupThrow = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    fail: "throw",
    policy: enforcedParts,
  });
  const lookupShadowLogs: ShadowRecord[] = [];
  const lookupShadow = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    fail: "error",
    policy: withFamily("parts_stock", "shadow"),
    log(entry) {
      lookupShadowLogs.push(entry);
    },
  });
  record(
    "falha de consulta não vira autorização",
    lookupEnforce.verdict.effect === "lookup_failed" &&
      lookupEnforce.verdict.block === true &&
      lookupThrow.verdict.effect === "lookup_failed" &&
      lookupShadow.verdict.effect === "lookup_failed" &&
      lookupShadow.verdict.block === false &&
      lookupShadowLogs[0]?.decision === "lookup_failed",
    `enforce ${lookupEnforce.verdict.block}; sombra ${lookupShadow.verdict.block}`
  );

  const row: MemoryRow = { id: USER, workshopId: WORKSHOP, permissions: {} };
  const firstCache = new Map();
  const before = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    rows: [row],
    policy: enforcedParts,
    cache: firstCache,
  });
  row.permissions = { access_estoque_pecas: true };
  const stale = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    rows: [row],
    policy: enforcedParts,
    cache: firstCache,
  });
  const nextRequest = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    rows: [row],
    policy: enforcedParts,
  });
  record(
    "permissão nova vale na requisição seguinte e não no cache da atual",
    before.verdict.effect === "deny" && stale.verdict.effect === "deny" && stale.calls === 0 && nextRequest.verdict.effect === "allow",
    `antes ${before.verdict.effect}; depois ${nextRequest.verdict.effect}`
  );

  const technician = await decide({
    method: "PUT",
    path: "/api/service-orders/os-1/service-technicians",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {}, isTechnician: true }],
    policy: withFamily("service_orders", "enforce"),
  });
  const assigner = await decide({
    method: "PUT",
    path: "/api/service-orders/os-1/service-technicians",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { patio_assign_technician: true } }],
    policy: withFamily("service_orders", "enforce"),
  });
  record(
    "is_technician não autoriza; a chave da ação autoriza",
    technician.verdict.effect === "deny" && assigner.verdict.effect === "allow",
    `${technician.verdict.effect}; ${assigner.verdict.effect}`
  );

  let responseStatus = 200;
  const shadow = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
    policy: withFamily("parts_stock", "shadow"),
    log() {
      throw new Error(SECRET);
    },
  });
  if (shadow.verdict.block) responseStatus = 403;
  record(
    "modo sombra preserva o HTTP e ignora falha da telemetria",
    shadow.verdict.effect === "deny" && shadow.verdict.block === false && responseStatus === 200,
    `status ${responseStatus}`
  );

  const logs: ShadowRecord[] = [];
  await decide({
    method: "DELETE",
    path: `/api/workshop-parts/peca-1?pin=${SECRET}`,
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { nome: CPF } }],
    policy: withFamily("parts_stock", "shadow"),
    log(entry) {
      logs.push(entry);
    },
  });
  const scrubbed = toShadowRecord({
    family: SECRET,
    rule: TOKEN,
    action: CPF,
    method: "TRACE",
    decision: "deny",
    reason: SECRET,
  });
  const encoded = JSON.stringify({ logs, scrubbed });
  record(
    "registro não leva senha, token, corpo nem dado pessoal",
    logs.length === 1 &&
      logs[0].kind === "sec03" &&
      logs[0].family === "parts_stock" &&
      logs[0].rule === "part_delete" &&
      !encoded.includes(SECRET) &&
      !encoded.includes(TOKEN) &&
      !encoded.includes(CPF) &&
      !encoded.includes(USER) &&
      scrubbed.family === "unknown" &&
      scrubbed.reason === "missing_permission",
    logs[0] ? logs[0].reason : "sem registro"
  );

  const tv = await decide({
    method: "GET",
    path: "/api/tv/display",
    actor: null,
    policy: withFamily("tv_admin", "enforce"),
  });
  const playlist = await decide({
    method: "GET",
    path: "/api/tv/playlist",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
    policy: withFamily("tv_admin", "enforce"),
  });
  const tvWrite = await decide({
    method: "POST",
    path: "/api/tv/slides",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
    policy: withFamily("tv_admin", "enforce"),
  });
  const board = await decide({
    method: "GET",
    path: "/api/service-orders",
    actor: null,
    policy: withFamily("service_orders", "enforce"),
  });
  const boardStaff = await decide({
    method: "GET",
    path: "/api/service-orders",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
    policy: withFamily("service_orders", "enforce"),
  });
  const cron = await decide({
    method: "POST",
    path: "/api/rda/proactive/scan/cron",
    actor: null,
    policy: withFamily("rda", "enforce"),
  });
  record(
    "TV pública, quadro sem sessão e cron ficam fora da regra de funcionário",
    tv.verdict.effect === "exempt" &&
      tv.calls === 0 &&
      playlist.verdict.effect === "exempt" &&
      tvWrite.verdict.effect === "deny" &&
      board.verdict.effect === "exempt" &&
      boardStaff.verdict.effect === "deny" &&
      cron.verdict.effect === "exempt",
    `tv ${tv.verdict.effect}; escrita ${tvWrite.verdict.effect}`
  );

  const disabled = await decide({
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor: { role: "user", userId: USER },
    policy: enforcedParts,
    env: { SEC03_DISABLE_FAMILIES: "parts_stock" },
  });
  const stillOn = await decide({
    method: "DELETE",
    path: "/api/notifications",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
    policy: withFamily("notifications", "enforce"),
    env: { SEC03_DISABLE_FAMILIES: "parts_stock" },
  });
  const globalOff = await decide({
    method: "DELETE",
    path: "/api/notifications",
    actor: null,
    policy: withFamily("notifications", "enforce"),
    env: { SEC03_AUTHORIZATION_DISABLED: "1" },
  });
  record(
    "desligamento individual e global só desativam",
    disabled.verdict.effect === "skipped" &&
      disabled.calls === 0 &&
      stillOn.verdict.effect === "deny" &&
      globalOff.verdict.effect === "skipped" &&
      globalOff.verdict.block === false,
    `peças ${disabled.verdict.reason}; avisos ${stillOn.verdict.effect}`
  );

  const openPut = await decide({
    method: "PUT",
    path: "/api/service-orders/os-1",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
    policy: withFamily("service_orders", "enforce"),
  });
  const closedPut = await decide({
    method: "PUT",
    path: "/api/service-orders/os-1",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
    policy: withFamily("service_orders", "enforce", { unmatched: "deny" }),
  });
  record(
    "rota ainda sem regra não bloqueia até a família pedir negação",
    openPut.verdict.effect === "skipped" && openPut.verdict.block === false && closedPut.verdict.block === true,
    `${openPut.verdict.reason}; ${closedPut.verdict.reason}`
  );

  let adapterEqs: string[] = [];
  const adapter = permissionSourceFromSupabase({
    from(table: string) {
      if (table !== "workshop_system_users") throw new Error("tabela");
      return {
        select() {
          return {
            eq(column: string, value: string) {
              adapterEqs.push(`${column}=${value}`);
              return {
                eq(column2: string, value2: string) {
                  adapterEqs.push(`${column2}=${value2}`);
                  return {
                    async maybeSingle() {
                      return { data: { permissions: { access_patio: true }, is_technician: false }, error: null };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  });
  const loaded = await adapter.loadUser(WORKSHOP, USER);
  const broken = await permissionSourceFromSupabase({
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    async maybeSingle() {
                      return { data: null, error: { message: "falha" } };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  }).loadUser(WORKSHOP, USER);
  record(
    "consulta usa id da sessão e oficina e trata erro como falha",
    loaded.ok === true &&
      adapterEqs.includes(`id=${USER}`) &&
      adapterEqs.includes(`workshop_id=${WORKSHOP}`) &&
      broken.ok === false,
    adapterEqs.join(",")
  );

  record(
    "SEC-02 e SEC-02.1 seguem iguais",
    classifyNewLoginPassword("12345").status === "invalid" &&
      classifyNewLoginPassword("123456").status === "ready" &&
      rejectCredentialChange(false, { patioPin: SECRET }) === true &&
      rejectCredentialChange(true, { patioPin: SECRET }) === false &&
      responseExposesSecrets({ patioPin: SECRET }) === true &&
      shouldClearSession(401, { code: "invalid_credentials" }) === false &&
      shouldClearSession(401, { code: "session_invalid" }) === true &&
      shouldClearSession(403, { error: "Sem permissão para esta operação.", code: "permission_denied" }) === false &&
      shouldClearSession(403, { error: "Este dispositivo foi bloqueado e não pode acessar o sistema." }) === true,
    "senha, segredo e sessão"
  );

  const mock = await startMock({
    workshop_settings: [
      ["admin_password", hashPassword(PASS_ADMIN)],
      ["patio_pin", SECRET],
      ["vehicle_delete_password", "excluir-ficticio"],
      ["stock_guard_password", "estoque-ficticio"],
    ].map(([key, value]) => ({
      workshop_id: WORKSHOP,
      key,
      value,
      updated_at: "2026-01-01T00:00:00.000Z",
    })),
    workshop_system_users: [
      {
        id: USER,
        workshop_id: WORKSHOP,
        username: "ana",
        display_name: "Ana",
        password_hash: hashPassword(PASS_USER),
        permissions: {},
        is_technician: true,
        job_title: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    customers: [],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    service_orders: [],
  });

  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.HOMOLOGATION_MODE = "true";
  process.env.RDA_INTELLIGENCE_ENABLED = "false";
  process.env.RDA_ALLOW_LLM_CALLS = "false";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.TV_API_TOKEN;
  process.env.NODE_ENV = "development";

  const { createApiApp } = await import("../apiApp.ts");
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const login = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-device-id": "aparelho-sec03" },
      body: JSON.stringify({ username: "ana", password: PASS_USER, deviceId: "aparelho-sec03" }),
    });
    const loginJson = await login.json().catch(() => ({}));
    const token = typeof loginJson.token === "string" ? loginJson.token : "";
    const created = token
      ? await fetch(`${base}/api/customers`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({
            name: "Cliente ficticio",
            phone: "11999990000",
            permissions: { full_access: true },
            password: PASS_USER,
            patioPin: SECRET,
          }),
        })
      : null;
    const createdJson = created ? await created.json().catch(() => ({})) : {};
    const noSession = await fetch(`${base}/api/customers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Cliente ficticio", phone: "11999990000" }),
    });
    const noSessionJson = await noSession.json().catch(() => ({}));
    const expiredBody = Buffer.from(JSON.stringify({ r: "user", u: USER, n: "ana", exp: Date.now() - 1000 })).toString("base64url");
    const expiredSig = crypto.createHmac("sha256", SESSION_SECRET).update(expiredBody).digest("base64url");
    const expired = await fetch(`${base}/api/customers`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${expiredBody}.${expiredSig}` },
      body: JSON.stringify({ name: "Cliente ficticio", phone: "11999990000" }),
    });
    const expiredJson = await expired.json().catch(() => ({}));
    const display = await fetch(`${base}/api/tv/display`);
    const boardOpen = await fetch(`${base}/api/service-orders`);
    record(
      "HTTP real não ganha bloqueio e a TV pública permanece",
      login.status === 200 &&
        !!token &&
        created?.status === 201 &&
        createdJson?.code !== "permission_denied" &&
        noSession.status === 401 &&
        noSessionJson?.code === "session_invalid" &&
        expired.status === 401 &&
        expiredJson?.code === "session_invalid" &&
        display.status === 200 &&
        boardOpen.status !== 401 &&
        boardOpen.status !== 403,
      `login ${login.status}; cliente ${created?.status}; tv ${display.status}; quadro ${boardOpen.status}`
    );
  } finally {
    server.close();
    mock.server.close();
  }

  console.log(`\n${passed} ok, ${failed} falha(s)`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.name : "erro");
  process.exit(1);
});
