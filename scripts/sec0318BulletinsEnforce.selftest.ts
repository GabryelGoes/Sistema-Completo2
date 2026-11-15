/**
 * SEC-03.18: bloqueio real dos boletins técnicos, por HTTP.
 * Usuários, oficina e senhas são fictícios. Não imprime credencial.
 * npm run test:sec0318-bulletins-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";
import { authAllowsToolPermission } from "../services/rdaIntelligence/permissions.js";
import { RDA_PRODUCTION_TOOLS } from "../services/rdaIntelligence/tools/definitions.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const BOL = "22222222-2222-4222-8222-222222222251";
const PATIO = "22222222-2222-4222-8222-222222222252";
const LAB = "22222222-2222-4222-8222-222222222253";
const REL = "22222222-2222-4222-8222-222222222254";
const NONE = "22222222-2222-4222-8222-222222222255";
const FULL = "22222222-2222-4222-8222-222222222256";
const FAIL = "22222222-2222-4222-8222-222222222257";
const PASS_USER = "senha-ficticia-sec0318";
const PASS_ADMIN = "gerencia-ficticia-sec0318";
const SLIDE = { slide: { slideType: "notice", title: "Aviso ficticio" } };
const SERVICE = { name: "Troca", category: "Freio" };

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
    is_technician: false,
    job_title: null,
    photo_url: null,
    accent_color: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

async function startMock(tables: Record<string, Row[]>): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (!tables[table]) tables[table] = [];
      const select = url.searchParams.get("select") || "";
      const id = url.searchParams.get("id") || "";
      if (table === "workshop_system_users" && select === "permissions,is_technician" && id === `eq.${FAIL}`) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "falha ficticia de leitura" }));
        return;
      }
      const skip = new Set(["select", "on_conflict", "columns", "limit", "order", "offset"]);
      const filters: Array<[string, string]> = [];
      url.searchParams.forEach((value, key) => {
        if (!skip.has(key)) filters.push([key, value]);
      });
      const matches = (row: Row) =>
        filters.every(([key, raw]) => (raw.startsWith("eq.") ? String(row[key] ?? "") === raw.slice(3) : false));
      const project = (row: Row): Row => {
        if (!select || select === "*") return { ...row };
        const out: Row = {};
        for (const col of select.split(",").map((item) => item.trim())) {
          if (!col || col.includes("(") || col.includes(")")) continue;
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
          res.end(req.method === "HEAD" ? "" : JSON.stringify(rows[0]));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(req.method === "HEAD" ? "" : JSON.stringify(rows));
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
      if (req.method === "PATCH" || req.method === "PUT") {
        const updated = tables[table].filter(matches);
        for (const row of updated) Object.assign(row, body);
        const projected = updated.map(project);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? projected[0] ?? {} : projected));
        return;
      }
      if (req.method === "DELETE") {
        const doomed = tables[table].filter(matches);
        tables[table] = tables[table].filter((row) => !matches(row));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? doomed[0] ?? {} : doomed));
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

function denied(name: string, result: Hit) {
  record(name, result.status === 403 && result.code === "permission_denied", `${result.status} ${result.code}`);
}

function allowed(name: string, result: Hit, status: number) {
  record(name, result.status === status && result.code !== "permission_denied", `${result.status} ${result.code}`);
}

function open(name: string, result: Hit) {
  record(name, result.status !== 403 && result.code !== "permission_denied", `${result.status} ${result.code}`);
}

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const shadow = production.families.filter((family) => family.mode === "shadow").map((family) => family.id).sort();
  const bulletinTool = RDA_PRODUCTION_TOOLS.find((tool) => tool.id === "rda_search_error_bulletins");
  record(
    "política bloqueia boletins e estoque",
    enforced.join(",") === "customers,appointments,budgets,comments,parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" &&
      shadow.join(",") === "" &&
      authorizationHasEnforce(production, {}) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "bulletins" }) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "customers,appointments,budgets,comments,parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" }) === false,
    enforced.join(",")
  );
  record(
    "ferramenta do RDA continua exigindo a chave do boletim",
    !!bulletinTool &&
      bulletinTool.requiredPermission === "access_boletim_erros" &&
      authAllowsToolPermission({ role: "user", permissions: { access_boletim_erros: true } }, bulletinTool) &&
      !authAllowsToolPermission({ role: "user", permissions: { access_patio: true } }, bulletinTool) &&
      !authAllowsToolPermission({ role: "user", permissions: { access_laboratorio: true } }, bulletinTool) &&
      authAllowsToolPermission({ role: "admin" }, bulletinTool) &&
      authAllowsToolPermission({ role: "user", permissions: { full_access: true } }, bulletinTool),
    bulletinTool?.requiredPermission ?? "ausente"
  );

  const tables: Record<string, Row[]> = {
    workshop_settings: [
      ["admin_password", hashPassword(PASS_ADMIN)],
      ["patio_pin", "pin-ficticio"],
      ["vehicle_delete_password", "excluir-ficticio"],
      ["stock_guard_password", "estoque-ficticio"],
    ].map(([key, value]) => ({
      workshop_id: WORKSHOP,
      key,
      value,
      updated_at: "2026-01-01T00:00:00.000Z",
    })),
    workshop_system_users: [
      user(BOL, "boletim", { access_boletim_erros: true }),
      user(PATIO, "patio", { access_patio: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(REL, "relatorio", { access_relatorios: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_boletim_erros: true }),
    ],
    workshop_error_bulletins: [
      {
        id: "boletim-1",
        workshop_id: WORKSHOP,
        title: "Pastilha ficticia",
        status: "published",
        dtc_codes: "C1234",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
      {
        id: "boletim-2",
        workshop_id: WORKSHOP,
        title: "Outro boletim",
        status: "draft",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    workshop_error_bulletin_attachments: [
      {
        id: "anexo-1",
        workshop_id: WORKSHOP,
        bulletin_id: "boletim-1",
        kind: "link",
        name: "Manual",
        url: "https://example.invalid/manual",
        storage_path: null,
      },
    ],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    service_orders: [{ id: "os-1", workshop_id: WORKSHOP }],
    customers: [],
  };
  const mock = await startMock(tables);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec0318-local";
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
    const direct = await Promise.all([
      hit(base, "/api/error-bulletins", "GET"),
      hit(base, "/api/error-bulletins/boletim-1", "GET"),
      hit(base, "/api/error-bulletins", "POST", undefined, { title: "Novo" }),
      hit(base, "/api/error-bulletins/boletim-1", "PATCH", undefined, { title: "Novo" }),
      hit(base, "/api/error-bulletins/boletim-1", "DELETE"),
      hit(base, "/api/error-bulletins/boletim-1/links", "POST", undefined, { url: "https://example.invalid/a" }),
      hit(base, "/api/error-bulletins/boletim-1/attachments/anexo-1", "DELETE"),
    ]);
    record(
      "acesso direto sem sessão",
      direct.every((item) => item.status === 401 && item.code === "session_invalid"),
      direct.map((item) => item.status).join(",")
    );
    const invalid = await hit(base, "/api/error-bulletins", "GET", "sessao-invalida");
    record("sessão inválida", invalid.status === 401 && invalid.code === "session_invalid", `${invalid.status} ${invalid.code}`);

    const bol = await login(base, "boletim", PASS_USER);
    const patio = await login(base, "patio", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const rel = await login(base, "relatorio", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    const listed = await hit(base, "/api/error-bulletins", "GET", bol);
    const filtered = await hit(base, "/api/error-bulletins?status=published&q=pastilha", "GET", bol);
    const empty = await hit(base, "/api/error-bulletins?q=xyzvazio", "GET", bol);
    allowed("boletim lista", listed, 200);
    allowed("filtro por status e texto", filtered, 200);
    record(
      "filtro devolve o boletim publicado",
      filtered.body.includes("Pastilha ficticia") && !filtered.body.includes("Outro boletim"),
      filtered.status === 200 ? "corpo" : String(filtered.status)
    );
    allowed("filtro sem correspondência", empty, 200);
    record("filtro vazio não traz boletim", empty.body === "[]", empty.body.slice(0, 40));
    allowed("boletim lê um item", await hit(base, "/api/error-bulletins/boletim-1", "GET", bol), 200);
    allowed("boletim cria", await hit(base, "/api/error-bulletins", "POST", bol, { title: "Novo boletim" }), 201);
    allowed("boletim edita", await hit(base, "/api/error-bulletins/boletim-1", "PATCH", bol, { title: "Pastilha editada" }), 200);
    allowed(
      "boletim cria vínculo",
      await hit(base, "/api/error-bulletins/boletim-1/links", "POST", bol, { name: "Manual", url: "https://example.invalid/manual" }),
      201
    );
    const ownFile = await hit(base, "/api/error-bulletins/boletim-1/attachments", "POST", bol, {});
    record(
      "anexo do boletim autorizado passa do guard",
      ownFile.status === 400 && ownFile.code !== "permission_denied",
      `${ownFile.status} ${ownFile.code}`
    );
    allowed("boletim exclui vínculo", await hit(base, "/api/error-bulletins/boletim-1/attachments/anexo-1", "DELETE", bol), 204);
    record(
      "exclusão do vínculo remove só o anexo",
      !tables.workshop_error_bulletin_attachments.some((row) => row.id === "anexo-1") &&
        tables.workshop_error_bulletins.some((row) => row.id === "boletim-1"),
      "anexo ou boletim"
    );

    for (const [who, token] of [
      ["patio", patio],
      ["lab", lab],
    ] as const) {
      denied(`${who} não lista`, await hit(base, "/api/error-bulletins", "GET", token));
      denied(`${who} não lê`, await hit(base, "/api/error-bulletins/boletim-1", "GET", token));
      denied(`${who} não cria`, await hit(base, "/api/error-bulletins", "POST", token, { title: who }));
      denied(`${who} não edita`, await hit(base, "/api/error-bulletins/boletim-1", "PATCH", token, { title: who }));
      denied(`${who} não exclui`, await hit(base, "/api/error-bulletins/boletim-2", "DELETE", token));
      denied(
        `${who} não cria vínculo`,
        await hit(base, "/api/error-bulletins/boletim-1/links", "POST", token, { url: "https://example.invalid/x" })
      );
      denied(`${who} não envia anexo`, await hit(base, "/api/error-bulletins/boletim-1/attachments", "POST", token, {}));
      denied(`${who} não exclui anexo`, await hit(base, "/api/error-bulletins/boletim-1/attachments/anexo-1", "DELETE", token));
    }
    denied("relatório não abre boletim", await hit(base, "/api/error-bulletins", "GET", rel));
    denied("sem chave não lista", await hit(base, "/api/error-bulletins", "GET", none));
    denied("falha de leitura", await hit(base, "/api/error-bulletins", "GET", fail));

    allowed("full_access lista", await hit(base, "/api/error-bulletins", "GET", full), 200);
    allowed("full_access exclui", await hit(base, "/api/error-bulletins/boletim-2", "DELETE", full), 204);
    allowed("gerência lista", await hit(base, "/api/error-bulletins", "GET", manager), 200);
    allowed("gerência edita", await hit(base, "/api/error-bulletins/boletim-1", "PATCH", manager, { title: "Gerência" }), 200);
    allowed("boletim exclui o próprio cadastro", await hit(base, "/api/error-bulletins/boletim-1", "DELETE", bol), 204);

    open("rota do RDA não entra na família de boletins", await hit(base, "/api/rda/proactive/summary", "GET", patio));
    allowed("painel público da TV", await hit(base, "/api/tv/display", "GET"), 200);
    denied("TV administrativa sem a chave", await hit(base, "/api/tv/slides", "POST", patio, SLIDE));
    allowed("pátio consulta serviços", await hit(base, "/api/workshop-services", "GET", patio), 200);
    denied("pátio não cria serviço", await hit(base, "/api/workshop-services", "POST", patio, SERVICE));
    allowed("pátio consulta checklists", await hit(base, "/api/workshop/checklist-templates", "GET", patio), 200);
    allowed("pátio consulta técnicos", await hit(base, "/api/workshop-technicians", "GET", patio), 200);
    denied("pátio não exclui técnico", await hit(base, "/api/workshop-technicians/tecnico-1", "DELETE", patio));
    denied("pátio não lê relatório", await hit(base, "/api/reports/technician-services", "GET", patio));
    allowed("relatórios lê o próprio módulo", await hit(base, "/api/reports/technician-services", "GET", rel), 200);

    process.env.SEC03_DISABLE_FAMILIES = "reports";
    const reportsOff = await hit(base, "/api/error-bulletins", "GET", patio);
    delete process.env.SEC03_DISABLE_FAMILIES;
    denied("desligar relatórios não abre o boletim", reportsOff);

    process.env.SEC03_DISABLE_FAMILIES = "bulletins";
    const rolled = await hit(base, "/api/error-bulletins", "GET", patio);
    const tvStill = await hit(base, "/api/tv/slides", "POST", patio, SLIDE);
    const reportStill = await hit(base, "/api/reports/technician-services", "GET", patio);
    const techStill = await hit(base, "/api/workshop-technicians/tecnico-1", "DELETE", patio);
    const serviceStill = await hit(base, "/api/workshop-services", "POST", patio, SERVICE);
    delete process.env.SEC03_DISABLE_FAMILIES;
    const restored = await hit(base, "/api/error-bulletins", "GET", patio);
    record(
      "SEC03_DISABLE_FAMILIES=bulletins tira o bloqueio e preserva TV, relatórios, técnicos e catálogos",
      rolled.status !== 403 &&
        rolled.code !== "permission_denied" &&
        tvStill.status === 403 &&
        tvStill.code === "permission_denied" &&
        reportStill.status === 403 &&
        reportStill.code === "permission_denied" &&
        techStill.status === 403 &&
        techStill.code === "permission_denied" &&
        serviceStill.status === 403 &&
        serviceStill.code === "permission_denied" &&
        restored.status === 403 &&
        restored.code === "permission_denied",
      `boletim ${rolled.status}; tv ${tvStill.status}; relatório ${reportStill.status}; técnico ${techStill.status}; serviço ${serviceStill.status}; restaurado ${restored.status}`
    );
  } finally {
    delete process.env.SEC03_DISABLE_FAMILIES;
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
