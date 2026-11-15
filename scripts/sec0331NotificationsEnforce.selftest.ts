/**
 * SEC-03.31: a caixa de avisos usa a sessão como destinatário.
 * Oficinas, funcionários e notificações são fictícios.
 * npm run test:sec0331-notifications-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce, findMatchingRules } from "../utils/authorizeRequest.js";
import { notificationScope } from "../utils/notificationAudience.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const PATIO = "22222222-2222-4222-8222-222222222331";
const FEW = "22222222-2222-4222-8222-222222222332";
const NONE = "22222222-2222-4222-8222-222222222333";
const FULL = "22222222-2222-4222-8222-222222222334";
const FAIL = "22222222-2222-4222-8222-222222222335";
const ORC = "22222222-2222-4222-8222-222222222336";
const PASS_USER = "senha-ficticia-sec0331";
const PASS_ADMIN = "gerencia-ficticia-sec0331";
const ENFORCED =
  "customers,appointments,service_orders,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications";

const ADMIN_NOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const LEGACY_NOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const PATIO_NOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";
const PATIO_USER_NOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4";
const PATIO_READ_NOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5";
const ORC_NOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6";
const OTHER_NOTE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa7";

let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) {
    passed += 1;
    console.log(`ok  ${name}`);
    return;
  }
  failed += 1;
  console.error(`falha  ${name} — ${detail}`);
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

type Row = Record<string, unknown>;

function user(id: string, username: string, permissions: Record<string, boolean>): Row {
  return {
    id,
    workshop_id: WORKSHOP,
    username,
    display_name: username,
    password_hash: hashPassword(PASS_USER),
    permissions,
    is_technician: id === PATIO,
    job_title: null,
    photo_url: null,
    accent_color: null,
    created_at: "2026-11-15T12:00:00.000Z",
    updated_at: "2026-11-15T12:00:00.000Z",
  };
}

function note(
  id: string,
  workshopId: string,
  targetType: string | null,
  targetSlug: string | null,
  readAt: string | null,
  createdAt: string,
  customer: string
): Row {
  return {
    id,
    workshop_id: workshopId,
    type: "comment",
    payload: { customer_name: customer, text: "aviso ficticio" },
    target_type: targetType,
    target_slug: targetSlug,
    read_at: readAt,
    created_at: createdAt,
  };
}

function splitOr(raw: string): string[] {
  const inner = raw.startsWith("(") && raw.endsWith(")") ? raw.slice(1, -1) : raw;
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of inner) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf) parts.push(buf);
  return parts;
}

function matchesClause(row: Row, clause: string): boolean {
  const eq = clause.match(/^([a-z0-9_]+)\.eq\.(.*)$/i);
  if (eq) return String(row[eq[1]] ?? "") === eq[2];
  const isNull = clause.match(/^([a-z0-9_]+)\.is\.null$/i);
  if (isNull) return row[isNull[1]] == null;
  const inn = clause.match(/^([a-z0-9_]+)\.in\.\((.*)\)$/i);
  if (inn) return new Set(inn[2].split(",")).has(String(row[inn[1]] ?? ""));
  return false;
}

function matchesFilter(row: Row, key: string, raw: string): boolean {
  if (key === "or") return splitOr(raw).some((clause) => matchesClause(row, clause));
  const value = row[key];
  const text = value == null ? "" : String(value);
  if (raw.startsWith("eq.")) return text === raw.slice(3);
  if (raw.startsWith("neq.")) return text !== raw.slice(4);
  if (raw.startsWith("gt.")) return text > raw.slice(3);
  if (raw === "is.null") return value == null;
  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    return new Set(raw.slice(4, -1).split(",")).has(text);
  }
  return false;
}

async function startMock(tables: Record<string, Row[]>): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks);
      const json = (): Row => (raw.length ? (JSON.parse(raw.toString("utf8")) as Row) : {});
      const resource = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (resource.startsWith("rpc/")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "PGRST202", message: "function does not exist" }));
        return;
      }
      const table = resource;
      if (!tables[table]) tables[table] = [];
      const body = raw.length ? json() : {};
      const select = url.searchParams.get("select") || "";
      const id = url.searchParams.get("id") || "";
      if (table === "workshop_system_users" && select.startsWith("permissions") && id === `eq.${FAIL}`) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "falha ficticia" }));
        return;
      }
      const skip = new Set(["select", "on_conflict", "columns", "limit", "order", "offset"]);
      const filters: Array<[string, string]> = [];
      url.searchParams.forEach((value, key) => {
        if (!skip.has(key)) filters.push([key, value]);
      });
      const matches = (row: Row) => filters.every(([key, rawValue]) => matchesFilter(row, key, rawValue));
      const project = (row: Row): Row => {
        if (!select || select === "*") return { ...row };
        const out: Row = {};
        for (const col of select.split(",").map((item) => item.trim())) {
          if (!col || col.includes("(")) continue;
          out[col] = row[col] ?? null;
        }
        return out;
      };
      const wantsObject = String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");
      const limit = Number(url.searchParams.get("limit") || "0");
      if (req.method === "HEAD") {
        const rows = tables[table].filter(matches);
        res.writeHead(200, {
          "content-type": "application/json",
          "content-range": `*/${rows.length}`,
        });
        res.end();
        return;
      }
      if (req.method === "GET") {
        let rows = tables[table].filter(matches);
        rows.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
        if (limit > 0) rows = rows.slice(0, limit);
        const projected = rows.map(project);
        if (wantsObject) {
          if (projected.length !== 1) {
            res.writeHead(406, { "content-type": "application/json" });
            res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested" }));
            return;
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(projected[0]));
          return;
        }
        res.writeHead(200, { "content-type": "application/json", "content-range": `*/${projected.length}` });
        res.end(JSON.stringify(projected));
        return;
      }
      if (req.method === "POST") {
        const incoming = (Array.isArray(body) ? body : [body]) as Row[];
        const stored = incoming.map((row) => {
          const created = { id: row.id ?? crypto.randomUUID(), created_at: row.created_at ?? new Date().toISOString(), ...row };
          tables[table].push(created);
          return project(created);
        });
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? stored[0] ?? {} : stored));
        return;
      }
      if (req.method === "PATCH") {
        const found = tables[table].filter(matches);
        for (const row of found) Object.assign(row, body);
        const projected = found.map(project);
        if (wantsObject && projected.length !== 1) {
          res.writeHead(406, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? projected[0] ?? {} : projected));
        return;
      }
      if (req.method === "DELETE") {
        const removed = tables[table].filter(matches);
        tables[table] = tables[table].filter((row) => !matches(row));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(removed.map(project)));
        return;
      }
      res.writeHead(405).end();
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : "mock" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

type Hit = { status: number; body: string; code: string };

async function hit(
  base: string,
  path: string,
  method: string,
  token?: string,
  body?: unknown
): Promise<Hit> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let code = "";
  try {
    code = String((JSON.parse(text) as { code?: string }).code || "");
  } catch {
    code = "";
  }
  return { status: response.status, body: text, code };
}

async function login(base: string, username: string, password: string): Promise<string> {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-device-id": `aparelho-${username}` },
    body: JSON.stringify({ username, password, deviceId: `aparelho-${username}` }),
  });
  const json = await response.json().catch(() => ({}));
  record(`login ${username}`, response.status === 200 && typeof json.token === "string", String(response.status));
  return typeof json.token === "string" ? json.token : "";
}

function ids(body: string): string[] {
  try {
    const rows = JSON.parse(body) as Array<{ id?: string }>;
    return Array.isArray(rows) ? rows.map((row) => String(row.id || "")) : [];
  } catch {
    return [];
  }
}

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const off = production.families.filter((family) => family.mode === "off").map((family) => family.id);
  const winner = (method: string, path: string) => {
    const matches = findMatchingRules(production, method, path);
    const top = matches.reduce((best, rule) => Math.max(best, rule.priority), 0);
    return matches.filter((rule) => rule.priority === top);
  };
  const samples: Array<[string, string, string]> = [
    ["GET", "/api/notifications", "notifications_list_read"],
    ["GET", "/api/notifications/unread-count", "notifications_unread_read"],
    ["PATCH", "/api/notifications/aviso-1/read", "notifications_mark_read"],
    ["POST", "/api/notifications/read-all", "notifications_mark_all_read"],
    ["POST", "/api/notifications", "notifications_create"],
    ["DELETE", "/api/notifications", "notifications_purge"],
  ];
  const rules = production.rules.filter((rule) => rule.family === "notifications");
  record(
    "notifications entra em enforce e as outras treze permanecem",
    enforced.join(",") === ENFORCED &&
      off.join(",") === "quality_radar,rda" &&
      samples.every(([method, path, id]) => winner(method, path).length === 1 && winner(method, path)[0].id === id) &&
      rules.every((rule) => !rule.anyOf.includes("access_notificacoes_sistema")) &&
      winner("POST", "/api/notifications")[0].ownership === undefined &&
      winner("GET", "/api/notifications")[0].ownership === "session_user" &&
      winner("DELETE", "/api/notifications")[0].ownership === "session_user" &&
      findMatchingRules(production, "GET", "/api/workshop/system-notifications").every(
        (rule) => rule.family !== "notifications"
      ) &&
      findMatchingRules(production, "GET", "/api/customers").every((rule) => rule.family === "customers"),
    `enforce=${enforced.join(",")}`
  );
  record(
    "desligar notifications não abre as outras famílias",
    authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "notifications" }) === true &&
      production.families.filter((family) => family.mode === "enforce" && family.id !== "notifications").length === 13,
    "reversão"
  );
  const self = notificationScope({
    role: "user",
    userId: PATIO,
    fullAccess: false,
    requestedFor: "all",
    requestedSlug: ORC,
  });
  const adminAll = notificationScope({ role: "admin", fullAccess: false, requestedFor: "all" });
  const fullBell = notificationScope({
    role: "user",
    userId: FULL,
    fullAccess: true,
    requestedFor: "technician",
    requestedSlug: ORC,
  });
  record(
    "o slug do cliente não troca o destinatário",
    self?.kind === "person" &&
      self.userId === PATIO &&
      adminAll?.kind === "workshop" &&
      fullBell?.kind === "person" &&
      fullBell.userId === FULL,
    self ? `${self.kind}` : "nulo"
  );

  const tables: Record<string, Row[]> = {
    workshop_settings: [
      { workshop_id: WORKSHOP, key: "admin_password", value: hashPassword(PASS_ADMIN), updated_at: "2026-11-15T12:00:00.000Z" },
    ],
    workshop_system_users: [
      user(PATIO, "patio", { access_patio: true }),
      user(FEW, "poucas", { access_home: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_patio: true }),
      user(ORC, "orcamento", { access_orcamentos: true }),
    ],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    customers: [],
    notifications: [
      note(ADMIN_NOTE, WORKSHOP, "admin", null, null, "2026-11-15T12:06:00.000Z", "Cliente Sigiloso"),
      note(LEGACY_NOTE, WORKSHOP, null, null, null, "2026-11-15T12:05:00.000Z", "Historico antigo"),
      note(PATIO_NOTE, WORKSHOP, "technician", PATIO, null, "2026-11-15T12:04:00.000Z", "Patio proprio"),
      note(PATIO_USER_NOTE, WORKSHOP, "user", PATIO, null, "2026-11-15T12:03:00.000Z", "Responsavel proprio"),
      note(PATIO_READ_NOTE, WORKSHOP, "technician", PATIO, "2026-11-15T11:00:00.000Z", "2026-11-15T12:02:00.000Z", "Patio lido"),
      note(ORC_NOTE, WORKSHOP, "technician", ORC, null, "2026-11-15T12:01:00.000Z", "Outro funcionario"),
      note(OTHER_NOTE, OTHER, "admin", null, null, "2026-11-15T12:00:00.000Z", "Outra oficina"),
    ],
  };

  const mock = await startMock(tables);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec0331-local";
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
  const row = (id: string) => tables.notifications.find((item) => item.id === id);
  const workshopIds = () => tables.notifications.filter((item) => item.workshop_id === WORKSHOP).map((item) => item.id);

  try {
    const patio = await login(base, "patio", PASS_USER);
    const few = await login(base, "poucas", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const orc = await login(base, "orcamento", PASS_USER);
    const gerencia = await login(base, "Gerência", PASS_ADMIN);

    const before = workshopIds().slice();
    const anon = await hit(base, "/api/notifications", "GET");
    const bad = await hit(base, "/api/notifications", "GET", "token-invalido");
    record(
      "sessão ausente ou inválida não lê a caixa",
      anon.status === 401 && bad.status === 401 && workshopIds().join(",") === before.join(","),
      `${anon.status} ${bad.status}`
    );

    const own = await hit(base, "/api/notifications?for=technician&slug=" + encodeURIComponent(PATIO), "GET", patio);
    const forgedAll = await hit(base, "/api/notifications?for=all", "GET", patio);
    const forgedSlug = await hit(base, "/api/notifications?for=technician&slug=" + encodeURIComponent(ORC), "GET", patio);
    const forgedAdmin = await hit(base, "/api/notifications?for=admin", "GET", patio);
    const ownIds = [PATIO_NOTE, PATIO_USER_NOTE, PATIO_READ_NOTE];
    const sameOwn = (body: string) => ids(body).slice().sort().join(",") === ownIds.slice().sort().join(",");
    record(
      "funcionário lê a própria caixa mesmo forjando for e slug",
      own.status === 200 &&
        sameOwn(own.body) &&
        sameOwn(forgedAll.body) &&
        sameOwn(forgedSlug.body) &&
        sameOwn(forgedAdmin.body) &&
        !own.body.includes("Cliente Sigiloso") &&
        !own.body.includes("Outro funcionario") &&
        !own.body.includes("Outra oficina") &&
        own.body.includes("Responsavel proprio"),
      ids(forgedSlug.body).join(",")
    );

    const count = await hit(base, "/api/notifications/unread-count?for=all", "GET", patio);
    record(
      "contador não revela avisos de outras pessoas",
      count.status === 200 && count.body.includes('"count":2'),
      count.body
    );

    const fewList = await hit(base, "/api/notifications?for=all", "GET", few);
    const noneList = await hit(base, "/api/notifications", "GET", none);
    record(
      "poucas permissões e nenhuma chave ainda leem a própria caixa",
      fewList.status === 200 &&
        ids(fewList.body).length === 0 &&
        noneList.status === 200 &&
        ids(noneList.body).length === 0 &&
        !fewList.body.includes("Cliente Sigiloso"),
      `${fewList.status} ${noneList.status}`
    );

    const markOther = await hit(base, `/api/notifications/${ORC_NOTE}/read?for=all`, "PATCH", patio);
    const markOwn = await hit(base, `/api/notifications/${PATIO_NOTE}/read?for=technician&slug=${ORC}`, "PATCH", patio);
    record(
      "marcar lida vale só para o próprio aviso",
      markOther.status === 404 &&
        row(ORC_NOTE)?.read_at == null &&
        markOwn.status === 204 &&
        typeof row(PATIO_NOTE)?.read_at === "string" &&
        row(ADMIN_NOTE)?.read_at == null,
      `${markOther.status} ${markOwn.status}`
    );

    const readAll = await hit(base, "/api/notifications/read-all", "POST", patio, { for: "all", slug: ORC });
    record(
      "marcar todas não alcança a caixa administrativa nem a de outro funcionário",
      readAll.status === 204 &&
        typeof row(PATIO_USER_NOTE)?.read_at === "string" &&
        row(ADMIN_NOTE)?.read_at == null &&
        row(ORC_NOTE)?.read_at == null &&
        row(OTHER_NOTE)?.read_at == null,
      readAll.status + ""
    );

    const purge = await hit(base, "/api/notifications?for=all", "DELETE", patio);
    record(
      "limpeza do funcionário apaga só a própria caixa",
      purge.status === 204 &&
        !tables.notifications.some((item) => item.target_slug === PATIO) &&
        !!row(ADMIN_NOTE) &&
        !!row(LEGACY_NOTE) &&
        !!row(ORC_NOTE) &&
        !!row(OTHER_NOTE),
      workshopIds().join(",")
    );

    const adminList = await hit(base, "/api/notifications", "GET", gerencia);
    const adminCount = await hit(base, "/api/notifications/unread-count", "GET", gerencia);
    const adminPerson = await hit(
      base,
      "/api/notifications?for=technician&slug=" + encodeURIComponent(ORC),
      "GET",
      gerencia
    );
    record(
      "Gerência lê a caixa administrativa e o histórico sem alvo",
      adminList.status === 200 &&
        ids(adminList.body).slice().sort().join(",") === [ADMIN_NOTE, LEGACY_NOTE].sort().join(",") &&
        adminCount.body.includes('"count":2') &&
        ids(adminPerson.body).join(",") === ORC_NOTE &&
        !adminList.body.includes("Outra oficina"),
      ids(adminList.body).join(",")
    );

    const adminClear = await hit(base, "/api/notifications", "DELETE", gerencia);
    record(
      "limpeza da Gerência remove a caixa administrativa e preserva a pessoal",
      adminClear.status === 204 && !row(ADMIN_NOTE) && !row(LEGACY_NOTE) && !!row(ORC_NOTE) && !!row(OTHER_NOTE),
      workshopIds().join(",")
    );

    const created = await hit(base, "/api/notifications", "POST", gerencia, {
      type: "comment",
      payload: { customer_name: "Criado pela gerencia" },
      targetType: "admin",
    });
    const createdId = (() => {
      try {
        return String((JSON.parse(created.body) as { id?: string }).id || "");
      } catch {
        return "";
      }
    })();
    const forgedCreate = await hit(base, "/api/notifications", "POST", patio, {
      type: "comment",
      payload: { customer_name: "Forjado" },
      targetType: "technician",
      targetSlug: ORC,
    });
    record(
      "só Gerência cria aviso e o funcionário não grava um destinatário",
      created.status === 201 &&
        !!row(createdId) &&
        row(createdId)?.target_type === "admin" &&
        forgedCreate.status === 403 &&
        forgedCreate.code === "permission_denied" &&
        !tables.notifications.some((item) => JSON.stringify(item.payload).includes("Forjado")),
      `${created.status} ${forgedCreate.status}`
    );

    const fullOwn = await hit(base, "/api/notifications?for=technician&slug=" + encodeURIComponent(ORC), "GET", full);
    const fullAdmin = await hit(base, "/api/notifications", "GET", full);
    record(
      "full_access no sino vê a própria caixa e sem for vê a administrativa",
      fullOwn.status === 200 &&
        ids(fullOwn.body).length === 0 &&
        fullAdmin.status === 200 &&
        ids(fullAdmin.body).join(",") === createdId &&
        !fullOwn.body.includes("Outro funcionario"),
      ids(fullAdmin.body).join(",")
    );

    const fullClear = await hit(base, "/api/notifications?for=all", "DELETE", full);
    record(
      "full_access limpa a oficina e não alcança a outra",
      fullClear.status === 204 &&
        tables.notifications.filter((item) => item.workshop_id === WORKSHOP).length === 0 &&
        row(OTHER_NOTE)?.workshop_id === OTHER,
      workshopIds().join(",")
    );

    const orcList = await hit(base, "/api/notifications?for=technician&slug=" + encodeURIComponent(ORC), "GET", orc);
    record(
      "orçamento ainda lê a própria caixa vazia depois da limpeza autorizada",
      orcList.status === 200 && ids(orcList.body).length === 0,
      orcList.body
    );

    const deniedCustomers = await hit(base, "/api/customers", "GET", none);
    const allowedCustomers = await hit(base, "/api/customers", "GET", patio);
    const deniedReports = await hit(base, "/api/reports", "GET", none);
    const deniedParts = await hit(base, "/api/workshop-parts", "GET", none);
    const deniedAbs = await hit(base, "/api/abs-modules", "GET", none);
    const deniedBulletins = await hit(base, "/api/error-bulletins", "GET", none);
    record(
      "as famílias já protegidas continuam bloqueando quem não tem a chave",
      deniedCustomers.status === 403 &&
        deniedCustomers.code === "permission_denied" &&
        allowedCustomers.status === 200 &&
        deniedReports.status === 403 &&
        deniedParts.status === 403 &&
        deniedAbs.status === 403 &&
        deniedBulletins.status === 403,
      `clientes ${deniedCustomers.status}/${allowedCustomers.status} relatórios ${deniedReports.status}`
    );

    const beforeFail = JSON.stringify(tables.notifications);
    const failGet = await hit(base, "/api/notifications?for=all", "GET", fail);
    const failDelete = await hit(base, "/api/notifications?for=all", "DELETE", fail);
    record(
      "falha ao consultar a permissão não altera avisos",
      failGet.status === 403 &&
        failGet.code === "permission_denied" &&
        failDelete.status === 403 &&
        JSON.stringify(tables.notifications) === beforeFail,
      `${failGet.status} ${failDelete.status}`
    );

    const settingsDenied = await hit(base, "/api/workshop/system-notifications", "GET", patio);
    const settingsAllowed = await hit(base, "/api/workshop/system-notifications", "GET", full);
    record(
      "preferências do sistema continuam fora da caixa de avisos",
      settingsDenied.status === 403 && settingsDenied.code === "permission_denied" && settingsAllowed.status === 200,
      `${settingsDenied.status} ${settingsAllowed.status}`
    );

    process.env.SEC03_DISABLE_FAMILIES = "notifications";
    const rolled = await hit(base, "/api/notifications?for=all&slug=" + encodeURIComponent(ORC), "GET", patio);
    const stillCustomers = await hit(base, "/api/customers", "GET", none);
    const rolledDelete = await hit(base, "/api/notifications?for=all", "DELETE", none);
    record(
      "desligar notifications mantém o destinatário da sessão e as outras famílias",
      rolled.status === 200 &&
        ids(rolled.body).length === 0 &&
        !rolled.body.includes("Outra oficina") &&
        stillCustomers.status === 403 &&
        rolledDelete.status === 204 &&
        row(OTHER_NOTE)?.workshop_id === OTHER &&
        tables.notifications.length === 1,
      `${rolled.status} ${stillCustomers.status} ${rolledDelete.status}`
    );
    delete process.env.SEC03_DISABLE_FAMILIES;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await new Promise<void>((resolve) => mock.server.close(() => resolve()));
  }

  console.log(`\n${passed} ok, ${failed} falha`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
