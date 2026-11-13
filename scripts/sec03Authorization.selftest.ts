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
  guardHttpAuthorization,
  permissionSourceFromSupabase,
  resetShadowLogLimiter,
  SHADOW_LOG_WINDOW_MS,
  shadowLogIdentity,
  shouldEmitShadowLog,
  toShadowRecord,
  unexpectedFailureDenies,
  type CachedLookup,
  type PermissionSource,
  type SessionActor,
  type ShadowRecord,
  type AuthorizationVerdict,
} from "../utils/authorizeRequest.js";
import { auditAuthorizationCoverage, type ScannedRoute } from "../utils/authorizationCoverage.js";
import { ownProfilePatch, sessionProfileUserId } from "../utils/ownProfile.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

type MemoryLink = { workshopId: string; systemUserId: string; technicianId: string };

function memorySource(
  rows: MemoryRow[],
  fail: "no" | "error" | "throw" = "no",
  links: MemoryLink[] = [],
  linkFail: "no" | "error" | "throw" = "no"
) {
  let calls = 0;
  let linkCalls = 0;
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
    async loadTechnicianLink(workshopId, systemUserId, technicianId) {
      linkCalls += 1;
      if (linkFail === "throw") throw new Error("vinculo indisponivel");
      if (linkFail === "error") return { ok: false };
      const linked = links.some(
        (link) =>
          link.workshopId === workshopId &&
          link.systemUserId === systemUserId &&
          link.technicianId === technicianId
      );
      return { ok: true, linked };
    },
  };
  return { source, calls: () => calls, linkCalls: () => linkCalls };
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
  links?: MemoryLink[];
  linkFail?: "no" | "error" | "throw";
}) {
  const memory = memorySource(input.rows ?? [], input.fail ?? "no", input.links ?? [], input.linkFail ?? "no");
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
  return { verdict, calls: memory.calls(), linkCalls: memory.linkCalls() };
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
      if (req.method === "PATCH") {
        const updated = tables[table].filter(matches);
        for (const row of updated) Object.assign(row, body);
        const projected = updated.map(project);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? projected[0] ?? {} : projected));
        return;
      }
      if (req.method === "DELETE") {
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
    production.families.every((family) => family.unmatched === "ignore" && family.mode !== "enforce") &&
      production.families
        .filter((family) => family.mode === "shadow")
        .map((family) => family.id)
        .sort()
        .join(",") === "technicians,tv_admin,workshop_catalogs" &&
      authorizationHasEnforce(production, {}) === false,
    "sombra só nas famílias administrativas"
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
  resetShadowLogLimiter();
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
  resetShadowLogLimiter();
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

  const mixed = {
    rules: production.rules,
    families: production.families.map((family) => {
      if (family.id === "parts_stock") return { ...family, mode: "enforce" as const };
      if (family.id === "budgets") return { ...family, mode: "shadow" as const };
      if (family.id === "customers") return { ...family, mode: "off" as const };
      return family;
    }),
  };
  const actor = { role: "user" as const, userId: USER };
  const emptyDeps = { workshopId: WORKSHOP, supabase: null, policy: mixed };
  async function boom(): Promise<AuthorizationVerdict> {
    throw new Error("falha inesperada");
  }
  const partsBoom = await guardHttpAuthorization(
    { method: "DELETE", path: "/api/workshop-parts/peca-1", auth: { r: "user", u: USER } },
    emptyDeps,
    boom
  );
  const budgetBoom = await guardHttpAuthorization(
    { method: "PUT", path: "/api/service-orders/os-1/budgets/orc-1", auth: { r: "user", u: USER } },
    emptyDeps,
    boom
  );
  const customerBoom = await guardHttpAuthorization(
    { method: "POST", path: "/api/customers", auth: { r: "user", u: USER } },
    emptyDeps,
    boom
  );
  const tvBoom = await guardHttpAuthorization(
    { method: "GET", path: "/api/tv/display" },
    emptyDeps,
    boom
  );
  const openBoom = await guardHttpAuthorization(
    { method: "PUT", path: "/api/service-orders/os-1", auth: { r: "user", u: USER } },
    emptyDeps,
    boom
  );
  record(
    "exceção só nega a família em enforce",
    partsBoom.block === true &&
      budgetBoom.block === false &&
      customerBoom.block === false &&
      tvBoom.block === false &&
      openBoom.block === false &&
      unexpectedFailureDenies({ method: "DELETE", path: "/api/workshop-parts/peca-1", actor, policy: mixed }) === true &&
      unexpectedFailureDenies({ method: "PUT", path: "/api/service-orders/os-1/budgets/orc-1", actor, policy: mixed }) === false &&
      unexpectedFailureDenies({ method: "POST", path: "/api/customers", actor, policy: mixed }) === false &&
      unexpectedFailureDenies({ method: "GET", path: "/api/tv/display", actor: null, policy: mixed }) === false &&
      unexpectedFailureDenies({ method: "POST", path: "/api/rda/proactive/scan/cron", actor: null, policy: mixed }) === false,
    `peças ${partsBoom.block}; orçamento ${budgetBoom.block}; cliente ${customerBoom.block}`
  );

  resetShadowLogLimiter();
  const repeated: string[] = [];
  const shadowPolicy = withFamily("parts_stock", "shadow");
  const shadowInput = {
    method: "DELETE",
    path: "/api/workshop-parts/peca-1",
    actor,
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: {} }],
    policy: shadowPolicy,
    log(entry: ShadowRecord) {
      repeated.push(shadowLogIdentity(entry));
    },
  };
  await decide(shadowInput);
  await decide(shadowInput);
  const otherReason = shouldEmitShadowLog(
    toShadowRecord({
      family: "parts_stock",
      rule: "part_delete",
      action: "delete",
      method: "DELETE",
      decision: "deny",
      reason: "not_in_workshop",
    }),
    1
  );
  const againLater = shouldEmitShadowLog(
    toShadowRecord({
      family: "parts_stock",
      rule: "part_delete",
      action: "delete",
      method: "DELETE",
      decision: "deny",
      reason: "not_in_workshop",
    }),
    1 + SHADOW_LOG_WINDOW_MS
  );
  const poisoned = shadowLogIdentity({
    kind: "sec03",
    family: SECRET,
    rule: TOKEN,
    action: "delete",
    method: "DELETE",
    decision: "deny",
    reason: CPF,
  });
  record(
    "log repetido da mesma família, regra e motivo é limitado",
    repeated.length === 1 &&
      repeated[0] === "parts_stock|part_delete|missing_permission" &&
      otherReason === true &&
      againLater === true &&
      !poisoned.includes(SECRET) &&
      !poisoned.includes(TOKEN) &&
      !poisoned.includes(CPF),
    repeated[0] || "sem registro"
  );

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const scanned: ScannedRoute[] = [];
  const skipDirs = new Set(["node_modules", "dist", "scripts", ".git"]);
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) {
        const text = fs.readFileSync(full, "utf8");
        const lines = text.split("\n");
        for (let index = 0; index < lines.length; index += 1) {
          if (!/app\.(get|post|put|patch|delete)\(/.test(lines[index])) continue;
          const window = `${lines[index]}\n${lines[index + 1] ?? ""}`;
          const match = /app\.(get|post|put|patch|delete)\(\s*(['"`])([^'"`]+)\2/.exec(window);
          if (!match || !match[3].startsWith("/api/")) continue;
          scanned.push({
            method: match[1].toUpperCase(),
            path: match[3],
            file: path.relative(root, full),
            line: index + 1,
          });
        }
      }
    }
  };
  walk(root);
  const coverage = auditAuthorizationCoverage(scanned, production);
  const has = (kind: "public" | "protected" | "uncovered", method: string, routePath: string) =>
    coverage.routes.some((route) => route.kind === kind && route.method === method && route.path === routePath);
  const uncoveredStaysOpen = coverage.uncoveredRoutes.every((route) => {
    return unexpectedFailureDenies({
      method: route.method,
      path: route.samplePath,
      actor,
      policy: production,
    }) === false;
  });
  const syntheticConflict = auditAuthorizationCoverage(
    [{ method: "GET", path: "/api/exemplo", file: "exemplo.ts", line: 1 }],
    {
      families: [{ id: "customers", mode: "off", unmatched: "ignore", prefixes: ["/api/exemplo"] }],
      rules: [
        {
          id: "exemplo_a",
          family: "customers",
          action: "read",
          methods: ["GET"],
          path: /^\/api\/exemplo$/,
          anyOf: [],
          priority: 10,
        },
        {
          id: "exemplo_b",
          family: "customers",
          action: "read",
          methods: ["GET"],
          path: /^\/api\/exemplo$/,
          anyOf: [],
          priority: 10,
        },
      ],
    }
  );
  record(
    "cobertura separa rota protegida, pública e sem regra",
    scanned.length > 100 &&
      coverage.conflicts.length === 0 &&
      syntheticConflict.conflicts.length === 1 &&
      has("public", "GET", "/api/health") &&
      has("public", "POST", "/api/auth/login") &&
      has("public", "GET", "/api/tv/display") &&
      has("public", "GET", "/api/tv/playlist") &&
      has("public", "GET", "/api/service-orders") &&
      has("public", "POST", "/api/rda/proactive/scan/cron") &&
      has("protected", "POST", "/api/customers") &&
      has("protected", "DELETE", "/api/workshop-parts/:id") &&
      has("uncovered", "PUT", "/api/service-orders/:id") &&
      coverage.overlaps.length > 0 &&
      coverage.overlaps.every((route) => route.conflict === false) &&
      uncoveredStaysOpen &&
      authorizationHasEnforce(production, {}) === false,
    `rotas ${scanned.length}; protegidas ${coverage.protectedRoutes.length}; públicas ${coverage.publicRoutes.length}; sem regra ${coverage.uncoveredRoutes.length}; sobrepostas ${coverage.overlaps.length}`
  );

  resetShadowLogLimiter();
  const shadowLogs: string[] = [];
  const shadowLog = (entry: ShadowRecord) => {
    shadowLogs.push(`${entry.family}|${entry.rule}|${entry.decision}`);
  };
  const patio = { role: "user" as const, userId: USER };
  const patioRow = {
    id: USER,
    workshopId: WORKSHOP,
    permissions: { access_patio: true, access_laboratorio: true },
  };
  const serviceRead = await decide({
    method: "GET",
    path: "/api/workshop-services",
    actor: patio,
    rows: [patioRow],
    log: shadowLog,
  });
  const checklistRead = await decide({
    method: "GET",
    path: "/api/workshop/checklist-templates",
    actor: patio,
    rows: [patioRow],
    log: shadowLog,
  });
  const serviceWrite = await decide({
    method: "POST",
    path: "/api/workshop-services",
    actor: patio,
    rows: [patioRow],
    log: shadowLog,
  });
  const checklistWrite = await decide({
    method: "DELETE",
    path: "/api/workshop/checklist-templates/modelo-1",
    actor: patio,
    rows: [patioRow],
    log: shadowLog,
  });
  const techRead = await decide({
    method: "GET",
    path: "/api/workshop-technicians",
    actor: patio,
    rows: [patioRow],
    log: shadowLog,
  });
  const techWrite = await decide({
    method: "DELETE",
    path: "/api/workshop-technicians/tecnico-1",
    actor: patio,
    rows: [patioRow],
    log: shadowLog,
  });
  const techPhoto = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-1/photo",
    actor: patio,
    rows: [patioRow],
    log: shadowLog,
  });
  const catalogAdmin = await decide({
    method: "POST",
    path: "/api/workshop-services",
    actor: patio,
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_servicos_oficina: true } }],
    log: shadowLog,
  });
  const checklistAdmin = await decide({
    method: "DELETE",
    path: "/api/workshop/checklist-templates/modelo-1",
    actor: patio,
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_checklists_patio: true } }],
    log: shadowLog,
  });
  const tvAdmin = await decide({
    method: "PUT",
    path: "/api/tv/weekly-goal",
    actor: patio,
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_tv_patio: true } }],
    log: shadowLog,
  });
  const tvDenied = await decide({
    method: "POST",
    path: "/api/tv/slides",
    actor: patio,
    rows: [patioRow],
    log: shadowLog,
  });
  const tvPublic = await decide({
    method: "GET",
    path: "/api/tv/display",
    actor: null,
    log: shadowLog,
  });
  const tvPlaylist = await decide({
    method: "GET",
    path: "/api/tv/playlist",
    actor: null,
    log: shadowLog,
  });
  const osMove = await decide({
    method: "PUT",
    path: "/api/service-orders/os-1",
    actor: patio,
    rows: [patioRow],
    log: shadowLog,
  });
  const lookup = await decide({
    method: "POST",
    path: "/api/tv/slides",
    actor: patio,
    fail: "error",
    log: shadowLog,
  });
  const manager = await decide({
    method: "DELETE",
    path: "/api/workshop-technicians/tecnico-1",
    actor: { role: "admin" },
    log: shadowLog,
  });
  const fullAccess = await decide({
    method: "POST",
    path: "/api/workshop/checklist-templates",
    actor: patio,
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { full_access: true } }],
    log: shadowLog,
  });
  record(
    "sombra administrativa não bloqueia e separa leitura de escrita",
    serviceRead.verdict.effect === "allow" &&
      serviceRead.verdict.block === false &&
      checklistRead.verdict.effect === "allow" &&
      serviceWrite.verdict.effect === "deny" &&
      serviceWrite.verdict.block === false &&
      checklistWrite.verdict.effect === "deny" &&
      checklistWrite.verdict.block === false &&
      techRead.verdict.effect === "allow" &&
      techWrite.verdict.effect === "deny" &&
      techWrite.verdict.block === false &&
      techPhoto.verdict.effect === "deny" &&
      catalogAdmin.verdict.effect === "allow" &&
      checklistAdmin.verdict.effect === "allow" &&
      tvAdmin.verdict.effect === "allow" &&
      tvDenied.verdict.effect === "deny" &&
      tvDenied.verdict.block === false &&
      tvPublic.verdict.effect === "exempt" &&
      tvPublic.calls === 0 &&
      tvPlaylist.verdict.effect === "exempt" &&
      osMove.verdict.effect === "skipped" &&
      osMove.calls === 0 &&
      lookup.verdict.effect === "lookup_failed" &&
      lookup.verdict.block === false &&
      manager.verdict.effect === "allow" &&
      manager.calls === 0 &&
      fullAccess.verdict.effect === "allow" &&
      shadowLogs.every((line) => line.endsWith("|deny") || line.endsWith("|lookup_failed")) &&
      !shadowLogs.some((line) => line.includes(SECRET) || line.includes(USER)),
    `serviço ${serviceRead.verdict.effect}/${serviceWrite.verdict.effect}; tv ${tvDenied.verdict.block}`
  );

  const OTHER = "22222222-2222-4222-8222-222222222202";
  const ownLink = [{ workshopId: WORKSHOP, systemUserId: USER, technicianId: "tecnico-1" }];
  const ownRow = {
    id: USER,
    workshopId: WORKSHOP,
    permissions: { access_patio: true, is_technician: true },
    isTechnician: true,
  };
  const enforceTechnicians = withFamily("technicians", "enforce");
  const ownPhoto = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-1/photo",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    links: ownLink,
  });
  const otherPhoto = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-2/photo",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    links: ownLink,
  });
  const ownName = await decide({
    method: "PUT",
    path: "/api/workshop-technicians/tecnico-1",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    links: ownLink,
  });
  const otherName = await decide({
    method: "PUT",
    path: "/api/workshop-technicians/tecnico-2",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    links: ownLink,
    policy: enforceTechnicians,
  });
  const managerPhoto = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-2/photo",
    actor: { role: "admin" },
    links: ownLink,
  });
  const techAdmin = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-2/photo",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { access_technicians: true } }],
  });
  const fullPhoto = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-2/photo",
    actor: { role: "user", userId: USER },
    rows: [{ id: USER, workshopId: WORKSHOP, permissions: { full_access: true } }],
  });
  const noLink = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-1/photo",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    policy: enforceTechnicians,
  });
  const otherWorkshop = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-1/photo",
    actor: { role: "user", userId: OTHER },
    rows: [{ id: OTHER, workshopId: OTHER_WORKSHOP, permissions: { access_patio: true } }],
    links: [{ workshopId: OTHER_WORKSHOP, systemUserId: OTHER, technicianId: "tecnico-1" }],
  });
  const linkDown = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-1/photo",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    linkFail: "error",
  });
  const linkDownEnforce = await decide({
    method: "POST",
    path: "/api/workshop-technicians/tecnico-1/photo",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    linkFail: "error",
    policy: enforceTechnicians,
  });
  const selfProfile = await decide({
    method: "PATCH",
    path: "/api/auth/my-profile",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    policy: enforceTechnicians,
  });
  const selfPhotoProfile = await decide({
    method: "POST",
    path: "/api/auth/my-profile/photo",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
  });
  const selfPassword = await decide({
    method: "POST",
    path: "/api/auth/change-my-password",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    policy: enforceTechnicians,
  });
  const createTech = await decide({
    method: "POST",
    path: "/api/workshop-technicians",
    actor: { role: "user", userId: USER },
    rows: [ownRow],
    links: ownLink,
    policy: enforceTechnicians,
  });
  const profilePatch = ownProfilePatch({
    displayName: "Ana",
    username: "outra",
    permissions: { full_access: true },
    isTechnician: false,
    password: PASS_USER,
  });
  record(
    "perfil próprio não exige chave administrativa e não herda nome",
    ownPhoto.verdict.effect === "allow" &&
      ownPhoto.verdict.reason === "self" &&
      ownPhoto.verdict.block === false &&
      ownName.verdict.effect === "allow" &&
      otherPhoto.verdict.effect === "deny" &&
      otherPhoto.verdict.reason === "not_self" &&
      otherPhoto.verdict.block === false &&
      otherName.verdict.block === true &&
      otherName.verdict.reason === "not_self" &&
      managerPhoto.verdict.effect === "allow" &&
      managerPhoto.linkCalls === 0 &&
      techAdmin.verdict.effect === "allow" &&
      techAdmin.linkCalls === 0 &&
      fullPhoto.verdict.effect === "allow" &&
      fullPhoto.linkCalls === 0 &&
      noLink.verdict.effect === "deny" &&
      noLink.verdict.reason === "not_self" &&
      noLink.verdict.block === true &&
      otherWorkshop.verdict.reason === "not_in_workshop" &&
      linkDown.verdict.effect === "lookup_failed" &&
      linkDown.verdict.block === false &&
      linkDownEnforce.verdict.block === true &&
      selfProfile.verdict.effect === "allow" &&
      selfProfile.verdict.reason === "self" &&
      selfProfile.verdict.block === false &&
      selfPhotoProfile.verdict.effect === "allow" &&
      selfPhotoProfile.verdict.block === false &&
      selfPassword.verdict.effect === "allow" &&
      selfPassword.verdict.block === false &&
      createTech.verdict.effect === "deny" &&
      createTech.verdict.block === true &&
      sessionProfileUserId(USER) === USER &&
      sessionProfileUserId("  ") === null &&
      profilePatch.display_name === "Ana" &&
      !("permissions" in profilePatch) &&
      !("full_access" in profilePatch) &&
      authorizationHasEnforce() === false,
    `própria ${ownPhoto.verdict.reason}; outra ${otherPhoto.verdict.reason}; perfil ${selfProfile.verdict.block}`
  );

  const tables: Record<string, Row[]> = {
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
  };
  const mock = await startMock(tables);

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
    const slide = token
      ? await fetch(`${base}/api/tv/slides`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ title: "aviso", password: PASS_USER, patioPin: SECRET }),
        })
      : null;
    const slideJson = slide ? await slide.json().catch(() => ({})) : {};
    const profile = token
      ? await fetch(`${base}/api/auth/my-profile`, {
          method: "PATCH",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({
            username: "outra-pessoa",
            displayName: "Nova",
            permissions: { full_access: true },
            password: PASS_USER,
          }),
        })
      : null;
    const profileJson = profile ? await profile.json().catch(() => ({})) : {};
    const storedUser = tables.workshop_system_users?.[0];
    record(
      "HTTP real não ganha bloqueio e a TV pública permanece",
      login.status === 200 &&
        !!token &&
        created?.status === 201 &&
        profile?.status === 200 &&
        profileJson?.code !== "permission_denied" &&
        profileJson?.displayName === "Nova" &&
        profileJson?.username === "ana" &&
        storedUser?.display_name === "Nova" &&
        !(storedUser?.permissions as { full_access?: boolean } | undefined)?.full_access &&
        createdJson?.code !== "permission_denied" &&
        noSession.status === 401 &&
        noSessionJson?.code === "session_invalid" &&
        expired.status === 401 &&
        expiredJson?.code === "session_invalid" &&
        display.status === 200 &&
        boardOpen.status !== 401 &&
        boardOpen.status !== 403 &&
        slide?.status !== 403 &&
        slideJson?.code !== "permission_denied",
      `login ${login.status}; cliente ${created?.status}; tv ${display.status}; quadro ${boardOpen.status}; slide ${slide?.status}`
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
