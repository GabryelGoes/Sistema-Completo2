/**
 * SEC-03.28: comentários da OS exigem leitura, escrita e autoria.
 * npm run test:sec0328-comments-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce, findMatchingRules } from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const PATIO = "22222222-2222-4222-8222-222222222281";
const RECEP = "22222222-2222-4222-8222-222222222282";
const LAB = "22222222-2222-4222-8222-222222222283";
const ORC = "22222222-2222-4222-8222-222222222284";
const AGENDA = "22222222-2222-4222-8222-222222222285";
const NONE = "22222222-2222-4222-8222-222222222286";
const FULL = "22222222-2222-4222-8222-222222222287";
const FAIL = "22222222-2222-4222-8222-222222222288";
const OS = "33333333-3333-4333-8333-333333333331";
const OS_OTHER = "33333333-3333-4333-8333-333333333332";
const PASS_USER = "senha-ficticia-sec0328";
const PASS_ADMIN = "gerencia-ficticia-sec0328";
const STAMP = "2026-11-15T12:00:00.000Z";
const SECRET = "Segredo de outra oficina";

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

function user(id: string, username: string, permissions: Record<string, boolean>, photo: string | null = null): Row {
  return {
    id,
    workshop_id: WORKSHOP,
    username,
    display_name: username,
    password_hash: hashPassword(PASS_USER),
    permissions,
    is_technician: false,
    job_title: null,
    photo_url: photo,
    accent_color: null,
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function matchesFilter(row: Row, key: string, raw: string): boolean {
  const value = row[key];
  const text = value == null ? "" : String(value);
  if (raw.startsWith("eq.")) return text === raw.slice(3);
  if (raw.startsWith("neq.")) return text !== raw.slice(4);
  if (raw === "is.null") return value == null || text === "";
  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    const set = new Set(raw.slice(4, -1).split(",").map((item) => item.replace(/^"|"$/g, "")));
    return set.has(text);
  }
  return false;
}

async function startMock(tables: Record<string, Row[]>): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (table.startsWith("rpc/")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "PGRST202", message: "function does not exist" }));
        return;
      }
      if (!tables[table]) tables[table] = [];
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
      const matches = (row: Row) => filters.every(([key, raw]) => matchesFilter(row, key, raw));
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
      if (req.method === "GET" || req.method === "HEAD") {
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
      const body = raw ? (JSON.parse(raw) as Row | Row[]) : {};
      if (req.method === "POST") {
        const incoming = (Array.isArray(body) ? body : [body]) as Row[];
        const stored = incoming.map((row) => {
          const conflict = url.searchParams.get("on_conflict");
          if (conflict) {
            const keys = conflict.split(",");
            const found = tables[table].find((item) => keys.every((key) => item[key] === row[key]));
            if (found) {
              Object.assign(found, row);
              return project(found);
            }
          }
          const created = { id: row.id ?? crypto.randomUUID(), ...row };
          tables[table].push(created);
          return project(created);
        });
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? stored[0] ?? {} : stored));
        return;
      }
      if (req.method === "PATCH") {
        const found = tables[table].filter(matches);
        if (wantsObject && found.length !== 1) {
          res.writeHead(406, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested" }));
          return;
        }
        for (const row of found) Object.assign(row, body as Row);
        const projected = found.map(project);
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
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "mock" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

type Hit = { status: number; code: string; body: string };

async function hit(base: string, path: string, method: string, token?: string, body?: unknown): Promise<Hit> {
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
  if (text.startsWith("{")) {
    try {
      const json = JSON.parse(text) as { code?: unknown };
      if (typeof json.code === "string") code = json.code;
    } catch {
      code = "";
    }
  }
  return { status: response.status, code, body: text };
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

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const off = production.families.filter((family) => family.mode === "off").map((family) => family.id);
  const liveRules = findMatchingRules(production, "GET", `/api/service-orders/${OS}/live`);
  record(
    "comments entra em enforce e as outras nove permanecem",
    enforced.join(",") === "customers,appointments,budgets,comments,parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" &&
      off.join(",") === "service_orders,photos,abs_stock,notifications,quality_radar,rda" &&
      production.rules.some((rule) => rule.id === "comment_list_read") &&
      production.rules.some((rule) => rule.id === "comment_unread_read") &&
      liveRules.every((rule) => rule.family !== "comments"),
    `enforce=${enforced.join(",")}`
  );
  record(
    "desligar comments não abre as outras famílias",
    authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "comments" }) === true,
    "reversão"
  );

  const tables: Record<string, Row[]> = {
    workshop_settings: [
      { workshop_id: WORKSHOP, key: "admin_password", value: hashPassword(PASS_ADMIN), updated_at: STAMP },
      { workshop_id: WORKSHOP, key: "admin_photo_url", value: "https://foto.local/gerencia.png", updated_at: STAMP },
    ],
    workshop_system_users: [
      user(PATIO, "patio", { access_patio: true }),
      user(RECEP, "recepcao", { access_reception: true }, "https://foto.local/recepcao.png"),
      user(LAB, "lab", { access_laboratorio: true }),
      user(ORC, "orcamento", { access_orcamentos: true }),
      user(AGENDA, "agenda", { access_agenda: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_reception: true, patio_add_comments: true }),
    ],
    service_orders: [
      { id: OS, workshop_id: WORKSHOP, status: "EM_SERVICO", plate: "ABC1D23", vehicle_model: "Gol", order_type: "vehicle" },
      { id: OS_OTHER, workshop_id: OTHER, status: "EM_SERVICO", plate: "XYZ9Z99", vehicle_model: "Uno", order_type: "vehicle" },
    ],
    service_order_comments: [
      { id: "c-own", service_order_id: OS, author_display_name: "recepcao", author_key: RECEP, text: "Mensagem da recepção", created_at: STAMP, author_photo_url: null },
      { id: "c-lab", service_order_id: OS, author_display_name: "lab", author_key: LAB, text: "Mensagem do laboratório", created_at: STAMP, author_photo_url: null },
      { id: "c-admin", service_order_id: OS, author_display_name: "Rei do ABS", author_key: "admin", text: "Mensagem da gerência", created_at: STAMP, author_photo_url: null },
      { id: "c-legacy", service_order_id: OS, author_display_name: "recepcao", author_key: null, text: "Mensagem antiga", created_at: STAMP, author_photo_url: null },
      { id: "c-drop", service_order_id: OS, author_display_name: "lab", author_key: LAB, text: "Pode sair pelo acesso total", created_at: STAMP, author_photo_url: null },
      { id: "c-rollback", service_order_id: OS, author_display_name: "lab", author_key: LAB, text: "Texto estável", created_at: STAMP, author_photo_url: null },
      { id: "c-other", service_order_id: OS_OTHER, author_display_name: "outra", author_key: "outra", text: SECRET, created_at: STAMP, author_photo_url: null },
    ],
    service_order_comment_views: [],
    service_order_comment_reads: [],
    service_order_comment_reactions: [],
    notifications: [],
    workshop_parts: [{ id: "peca-1", workshop_id: WORKSHOP, name: "Sensor", quantity: 7 }],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    customers: [],
  };

  const mock = await startMock(tables);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec0328-local";
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
  const row = (id: string) => tables.service_order_comments.find((item) => item.id === id)!;

  try {
    const patio = await login(base, "patio", PASS_USER);
    const recep = await login(base, "recepcao", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const orc = await login(base, "orcamento", PASS_USER);
    const agenda = await login(base, "agenda", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const gerencia = await login(base, "Gerência", PASS_ADMIN);

    const anon = await hit(base, `/api/service-orders/${OS}/comments`, "GET");
    const invalid = await hit(base, `/api/service-orders/${OS}/comments`, "GET", "sessao-invalida");
    record("sessão ausente ou inválida", anon.status === 401 && invalid.status === 401, `${anon.status}/${invalid.status}`);

    const listed = await hit(base, `/api/service-orders/${OS}/comments`, "GET", patio);
    const listedLab = await hit(base, `/api/service-orders/${OS}/comments`, "GET", lab);
    const listedRecep = await hit(base, `/api/service-orders/${OS}/comments`, "GET", recep);
    const listedOrc = await hit(base, `/api/service-orders/${OS}/comments`, "GET", orc);
    record(
      "pátio, laboratório, recepção e orçamentos leem os comentários",
      [listed, listedLab, listedRecep, listedOrc].every((item) => item.status === 200 && item.body.includes("Mensagem da recepção")),
      [listed, listedLab, listedRecep, listedOrc].map((item) => item.status).join("/")
    );
    const listedAgenda = await hit(base, `/api/service-orders/${OS}/comments`, "GET", agenda);
    const listedNone = await hit(base, `/api/service-orders/${OS}/comments`, "GET", none);
    record("agenda e sessão sem chave não leem", listedAgenda.status === 403 && listedNone.status === 403, `${listedAgenda.status}/${listedNone.status}`);

    const otherList = await hit(base, `/api/service-orders/${OS_OTHER}/comments`, "GET", patio);
    record(
      "leitura de outra oficina não devolve o texto",
      otherList.status === 404 && !otherList.body.includes(SECRET) && row("c-other").text === SECRET,
      String(otherList.status)
    );

    const beforeCreate = tables.service_order_comments.length;
    const forged = await hit(base, `/api/service-orders/${OS}/comments`, "POST", recep, {
      text: "Recado verdadeiro",
      authorDisplayName: "Gerência",
      actor: "admin",
      authorUserId: LAB,
    });
    const created = tables.service_order_comments.find((item) => item.text === "Recado verdadeiro");
    record(
      "a autoria gravada é a da sessão",
      forged.status === 201 &&
        !!created &&
        created.author_key === RECEP &&
        created.author_display_name === "recepcao" &&
        created.author_photo_url === "https://foto.local/recepcao.png" &&
        tables.notifications.some((item) => item.type === "comment"),
      `${forged.status} ${String(created?.author_display_name)}`
    );
    const byLab = await hit(base, `/api/service-orders/${OS}/comments`, "POST", lab, { text: "Nota do laboratório", authorDisplayName: "lab" });
    const byOrc = await hit(base, `/api/service-orders/${OS}/comments`, "POST", orc, { text: "Nota do orçamento", authorDisplayName: "orcamento" });
    const byPatio = await hit(base, `/api/service-orders/${OS}/comments`, "POST", patio, { text: "Pátio não grava" });
    record(
      "laboratório e orçamentos criam; pátio sem a chave não cria",
      byLab.status === 201 &&
        byOrc.status === 201 &&
        byPatio.status === 403 &&
        tables.service_order_comments.some((item) => item.text === "Nota do laboratório") &&
        tables.service_order_comments.some((item) => item.text === "Nota do orçamento") &&
        !tables.service_order_comments.some((item) => item.text === "Pátio não grava") &&
        tables.service_order_comments.length === beforeCreate + 3,
      `${byLab.status}/${byOrc.status}/${byPatio.status}`
    );

    const ownEdit = await hit(base, `/api/service-orders/${OS}/comments/c-own`, "PATCH", recep, { text: "Recepção editou a própria" });
    const legacyEdit = await hit(base, `/api/service-orders/${OS}/comments/c-legacy`, "PATCH", recep, { text: "Recepção editou a antiga" });
    const deniedEdit = await hit(base, `/api/service-orders/${OS}/comments/c-lab`, "PATCH", recep, { text: "Recepção não pode" });
    record(
      "cada um edita o próprio comentário e não o de outro",
      ownEdit.status === 200 &&
        row("c-own").text === "Recepção editou a própria" &&
        legacyEdit.status === 200 &&
        row("c-legacy").text === "Recepção editou a antiga" &&
        deniedEdit.status === 403 &&
        row("c-lab").text === "Mensagem do laboratório",
      `${ownEdit.status}/${legacyEdit.status}/${deniedEdit.status}`
    );
    const deniedDelete = await hit(base, `/api/service-orders/${OS}/comments/c-lab`, "DELETE", recep);
    record("recepção não exclui comentário do laboratório", deniedDelete.status === 403 && row("c-lab").text === "Mensagem do laboratório", String(deniedDelete.status));

    const adminEdit = await hit(base, `/api/service-orders/${OS}/comments/c-lab`, "PATCH", gerencia, { text: "Gerência ajustou" });
    const adminName = await hit(base, `/api/service-orders/${OS}/comments`, "POST", gerencia, {
      text: "Aviso da gerência",
      authorDisplayName: "Rei do ABS",
      actor: "technician",
      authorUserId: RECEP,
    });
    const adminRow = tables.service_order_comments.find((item) => item.text === "Aviso da gerência");
    record(
      "Gerência administra e a chave continua admin",
      adminEdit.status === 200 &&
        row("c-lab").text === "Gerência ajustou" &&
        adminName.status === 201 &&
        adminRow?.author_key === "admin" &&
        adminRow?.author_display_name === "Rei do ABS",
      `${adminEdit.status}/${adminName.status}`
    );
    const fullDelete = await hit(base, `/api/service-orders/${OS}/comments/c-drop`, "DELETE", full);
    record("acesso total exclui comentário de terceiro", fullDelete.status === 204 && !tables.service_order_comments.some((item) => item.id === "c-drop"), String(fullDelete.status));

    const reaction = await hit(base, `/api/service-orders/${OS}/comments/c-own/reactions`, "POST", patio, { emoji: "👍" });
    const view = await hit(base, `/api/service-orders/${OS}/comments/c-own/view`, "POST", patio);
    const read = await hit(base, `/api/service-orders/${OS}/comments/read`, "POST", patio);
    record(
      "pátio sem permissão de criar reage, visualiza e marca como lido",
      reaction.status === 200 &&
        tables.service_order_comment_reactions.some((item) => item.reactor_key === PATIO && item.emoji === "👍") &&
        view.status === 200 &&
        tables.service_order_comment_views.some((item) => item.reader_key === PATIO) &&
        read.status === 200 &&
        tables.service_order_comment_reads.some((item) => item.reader_key === PATIO),
      `${reaction.status}/${view.status}/${read.status}`
    );
    const unread = await hit(base, "/api/service-orders/comment-unread-counts", "GET", patio);
    const unreadAgenda = await hit(base, "/api/service-orders/comment-unread-counts", "GET", agenda);
    record(
      "o indicador de não lidas fica com quem lê comentários",
      unread.status === 200 && unread.body.includes(PATIO) && unreadAgenda.status === 403,
      `${unread.status}/${unreadAgenda.status}`
    );

    const failWrite = await hit(base, `/api/service-orders/${OS}/comments`, "POST", fail, { text: "Falha não grava" });
    record(
      "falha de permissão não grava",
      failWrite.status === 403 && !tables.service_order_comments.some((item) => item.text === "Falha não grava"),
      String(failWrite.status)
    );

    const crossPatch = await hit(base, `/api/service-orders/${OS_OTHER}/comments/c-other`, "PATCH", recep, { text: "Invadiu" });
    record("não há escrita cruzada entre oficinas", crossPatch.status === 404 && row("c-other").text === SECRET, String(crossPatch.status));

    const stock = await hit(base, "/api/workshop-parts", "GET", none);
    const customers = await hit(base, "/api/customers", "GET", none);
    const appointment = await hit(base, "/api/appointments", "POST", none, { title: "Não" });
    const bulletins = await hit(base, "/api/error-bulletins", "GET", none);
    const reports = await hit(base, "/api/reports/technician-services", "GET", none);
    const technicians = await hit(base, "/api/workshop-technicians", "GET", none);
    const catalogs = await hit(base, "/api/workshop-services", "POST", none, { name: "Não" });
    const tv = await hit(base, "/api/tv/manage", "GET", none);
    const budgets = await hit(base, `/api/service-orders/${OS}/budgets`, "POST", none, { diagnosis: "Não" });
    record(
      "as nove famílias já protegidas continuam negando a sessão sem chave",
      [stock, customers, appointment, bulletins, reports, technicians, catalogs, tv, budgets].every((item) => item.status === 403),
      [stock, customers, appointment, bulletins, reports, technicians, catalogs, tv, budgets].map((item) => item.status).join("/")
    );
    const rda = await hit(base, "/api/rda/health", "GET", none);
    record("RDA não recebe bloqueio da família de comentários", rda.status !== 403, String(rda.status));
    record("a peça não se move com os comentários", tables.workshop_parts[0].quantity === 7, String(tables.workshop_parts[0].quantity));

    process.env.SEC03_DISABLE_FAMILIES = "comments";
    const rolled = await hit(base, `/api/service-orders/${OS}/comments/c-rollback`, "PATCH", recep, { text: "Nasceu na reversão" });
    const stockStill = await hit(base, "/api/workshop-parts", "GET", none);
    const agendaOpen = await hit(base, `/api/service-orders/${OS}/comments`, "GET", agenda);
    delete process.env.SEC03_DISABLE_FAMILIES;
    const closed = await hit(base, `/api/service-orders/${OS}/comments/c-lab`, "PATCH", recep, { text: "Depois da reversão" });
    record(
      "SEC03_DISABLE_FAMILIES=comments abre só comentários",
      rolled.status === 200 &&
        row("c-rollback").text === "Nasceu na reversão" &&
        agendaOpen.status === 200 &&
        stockStill.status === 403 &&
        closed.status === 403 &&
        row("c-lab").text === "Gerência ajustou",
      `${rolled.status}/${agendaOpen.status}/${stockStill.status}/${closed.status}`
    );
  } finally {
    delete process.env.SEC03_DISABLE_FAMILIES;
    server.close();
    mock.server.close();
  }

  console.log(`\n${passed} ok, ${failed} falhas`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
