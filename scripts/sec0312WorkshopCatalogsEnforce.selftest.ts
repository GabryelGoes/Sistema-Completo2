/**
 * SEC-03.12: bloqueio real dos catálogos da oficina, por HTTP.
 * Usuários, oficina e senhas são fictícios. Não imprime credencial.
 * npm run test:sec0312-workshop-catalogs-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const PATIO = "22222222-2222-4222-8222-222222222211";
const LAB = "22222222-2222-4222-8222-222222222212";
const BUDGET = "22222222-2222-4222-8222-222222222213";
const NONE = "22222222-2222-4222-8222-222222222214";
const SERVICES = "22222222-2222-4222-8222-222222222215";
const CHECKS = "22222222-2222-4222-8222-222222222216";
const FULL = "22222222-2222-4222-8222-222222222217";
const FAIL = "22222222-2222-4222-8222-222222222218";
const TV = "22222222-2222-4222-8222-222222222219";
const PASS_USER = "senha-ficticia-sec0312";
const PASS_ADMIN = "gerencia-ficticia-sec0312";
const SERVICE = { name: "Troca ficticia", category: "Freio" };
const CHECKLIST = { name: "Entrada ficticia", items: ["Item ficticio"] };
const SLIDE = { slide: { slideType: "notice", title: "Aviso ficticio" } };

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
    is_technician: true,
    job_title: null,
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
        filters.every(([key, raw]) => (raw.startsWith("eq.") ? String(row[key] ?? "") === raw.slice(3) : true));
      const project = (row: Row): Row => {
        if (!select || select === "*") return { ...row };
        const out: Row = {};
        for (const col of select.split(",").map((item) => item.trim())) out[col] = row[col] ?? null;
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

type Hit = { status: number; code: string };

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
  return { status: response.status, code };
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

type Call = [string, string, unknown?];

const serviceReads: Call[] = [["GET", "/api/workshop-services"]];
const checklistReads: Call[] = [["GET", "/api/workshop/checklist-templates"]];
const serviceWrites: Call[] = [
  ["POST", "/api/workshop-services", SERVICE],
  ["PUT", "/api/workshop-services/servico-1", SERVICE],
  ["DELETE", "/api/workshop-services/servico-1"],
];
const checklistWrites: Call[] = [
  ["POST", "/api/workshop/checklist-templates", CHECKLIST],
  ["PUT", "/api/workshop/checklist-templates/modelo-1", CHECKLIST],
  ["DELETE", "/api/workshop/checklist-templates/modelo-1"],
];
const success: Record<string, number> = {
  "GET /api/workshop-services": 200,
  "GET /api/workshop/checklist-templates": 200,
  "POST /api/workshop-services": 201,
  "PUT /api/workshop-services/servico-1": 200,
  "DELETE /api/workshop-services/servico-1": 204,
  "POST /api/workshop/checklist-templates": 201,
  "PUT /api/workshop/checklist-templates/modelo-1": 200,
  "DELETE /api/workshop/checklist-templates/modelo-1": 204,
};

async function expectCalls(base: string, who: string, token: string, calls: Call[], mode: "allow" | "deny") {
  for (const [method, path, body] of calls) {
    const key = `${method} ${path}`;
    const result = await hit(base, path, method, token, body);
    if (mode === "deny") denied(`${who} ${key}`, result);
    else allowed(`${who} ${key}`, result, success[key]);
  }
}

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const shadow = production.families
    .filter((family) => family.mode === "shadow")
    .map((family) => family.id)
    .sort();
  record(
    "política bloqueia TV e catálogos",
    enforced.join(",") === "customers,appointments,service_orders,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications" &&
      shadow.join(",") === "" &&
      authorizationHasEnforce(production, {}) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "reports" }) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "customers,appointments,service_orders,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications" }) === false,
    enforced.join(",")
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
      user(PATIO, "patio", { access_patio: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(BUDGET, "orcamento", { access_orcamentos: true }),
      user(NONE, "semchave", {}),
      user(SERVICES, "servicos", { access_servicos_oficina: true }),
      user(CHECKS, "checklists", { access_checklists_patio: true }),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_patio: true, access_servicos_oficina: true }),
      user(TV, "tv", { access_tv_patio: true }),
    ],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    workshop_services: [
      {
        id: "servico-1",
        workshop_id: WORKSHOP,
        name: "Troca ficticia",
        category: "Freio",
        labor_hours: 1,
        sort_order: 0,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    workshop_checklist_templates: [
      {
        id: "modelo-1",
        workshop_id: WORKSHOP,
        name: "Entrada ficticia",
        sort_order: 0,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    workshop_checklist_template_items: [],
    service_orders: [{ id: "os-1", workshop_id: WORKSHOP }],
    service_order_checklist_checks: [],
    customers: [],
  };
  const mock = await startMock(tables);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec0312-local";
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
      hit(base, "/api/workshop-services", "GET"),
      hit(base, "/api/workshop-services", "POST", undefined, SERVICE),
      hit(base, "/api/workshop/checklist-templates", "GET"),
      hit(base, "/api/workshop/checklist-templates", "POST", undefined, CHECKLIST),
      hit(base, "/api/workshop-services/servico-1", "DELETE"),
    ]);
    record(
      "acesso direto sem sessão",
      direct.every((item) => item.status === 401 && item.code === "session_invalid"),
      direct.map((item) => `${item.status} ${item.code}`).join(",")
    );
    const invalid = await hit(base, "/api/workshop-services", "GET", "sessao-invalida");
    record("sessão inválida", invalid.status === 401 && invalid.code === "session_invalid", `${invalid.status} ${invalid.code}`);

    const patio = await login(base, "patio", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const budget = await login(base, "orcamento", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const services = await login(base, "servicos", PASS_USER);
    const checks = await login(base, "checklists", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const tv = await login(base, "tv", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    for (const [who, token] of [
      ["patio", patio],
      ["lab", lab],
    ] as const) {
      await expectCalls(base, who, token, [...serviceReads, ...checklistReads], "allow");
      await expectCalls(base, who, token, [...serviceWrites, ...checklistWrites], "deny");
    }
    await expectCalls(base, "orcamento", budget, serviceReads, "allow");
    await expectCalls(base, "orcamento", budget, checklistReads, "deny");
    await expectCalls(base, "orcamento", budget, [...serviceWrites, ...checklistWrites], "deny");
    await expectCalls(base, "semchave", none, [...serviceReads, ...checklistReads, ...serviceWrites, ...checklistWrites], "deny");

    await expectCalls(base, "servicos", services, [...serviceReads, ...serviceWrites], "allow");
    await expectCalls(base, "servicos", services, [...checklistReads, ...checklistWrites], "deny");
    await expectCalls(base, "checklists", checks, [...checklistReads, ...checklistWrites], "allow");
    await expectCalls(base, "checklists", checks, [...serviceReads, ...serviceWrites], "deny");
    for (const [who, token] of [
      ["total", full],
      ["gerencia", manager],
    ] as const) {
      await expectCalls(base, who, token, [...serviceReads, ...checklistReads, ...serviceWrites, ...checklistWrites], "allow");
    }

    denied("falha de leitura", await hit(base, "/api/workshop-services", "GET", fail));

    for (const [who, token] of [
      ["patio", patio],
      ["lab", lab],
      ["orcamento", budget],
    ] as const) {
      const read = await hit(base, "/api/service-orders/os-1/checklist-state", "GET", token);
      const mark = await hit(base, "/api/service-orders/os-1/checklist-state", "PATCH", token, {
        templateItemId: "item-1",
        state: "complete",
      });
      allowed(`${who} lê checklist da OS`, read, 200);
      allowed(`${who} marca checklist da OS`, mark, 200);
    }

    const display = await hit(base, "/api/tv/display", "GET");
    const playlist = await hit(base, "/api/tv/playlist", "GET");
    const tvDenied = await hit(base, "/api/tv/slides", "POST", patio, SLIDE);
    const tvAllowed = await hit(base, "/api/tv/slides", "POST", tv, SLIDE);
    record("painel público da TV", display.status === 200, String(display.status));
    record("playlist pública da TV", playlist.status === 200, String(playlist.status));
    denied("TV administrativa sem a chave", tvDenied);
    allowed("TV administrativa com a chave", tvAllowed, 201);

    denied("relatório sem a chave", await hit(base, "/api/reports/technician-services", "GET", patio));
    denied("boletim sem a chave", await hit(base, "/api/error-bulletins", "GET", patio));
    denied("exclusão de peça sem a chave", await hit(base, "/api/workshop-parts/peca-1", "DELETE", patio));
    const others = await Promise.all([
      hit(base, "/api/workshop-technicians", "GET", patio),
    ]);
    record(
      "técnicos não ganham 403",
      others.every((item) => item.status !== 403 && item.code !== "permission_denied"),
      others.map((item) => item.status).join(",")
    );

    process.env.SEC03_DISABLE_FAMILIES = "workshop_catalogs";
    const rolled = await hit(base, "/api/workshop-services", "POST", patio, SERVICE);
    const tvStill = await hit(base, "/api/tv/slides", "POST", patio, SLIDE);
    const osStill = await hit(base, "/api/service-orders/os-1/checklist-state", "PATCH", patio, {
      templateItemId: "item-1",
      state: "incomplete",
    });
    delete process.env.SEC03_DISABLE_FAMILIES;
    const restored = await hit(base, "/api/workshop-services", "POST", patio, SERVICE);
    record(
      "SEC03_DISABLE_FAMILIES=workshop_catalogs tira o bloqueio do catálogo e preserva a TV",
      rolled.status === 201 &&
        rolled.code !== "permission_denied" &&
        tvStill.status === 403 &&
        tvStill.code === "permission_denied" &&
        osStill.status === 200 &&
        restored.status === 403 &&
        restored.code === "permission_denied",
      `catálogo ${rolled.status}; tv ${tvStill.status}; os ${osStill.status}; restaurado ${restored.status}`
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
