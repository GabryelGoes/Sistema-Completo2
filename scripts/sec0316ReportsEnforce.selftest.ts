/**
 * SEC-03.16: bloqueio real do relatório de serviços por técnico, por HTTP.
 * Boletins permanecem em sombra. Usuários, oficina e senhas são fictícios.
 * npm run test:sec0316-reports-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const REL = "22222222-2222-4222-8222-222222222241";
const PATIO = "22222222-2222-4222-8222-222222222242";
const BOLETIM = "22222222-2222-4222-8222-222222222243";
const NONE = "22222222-2222-4222-8222-222222222244";
const FULL = "22222222-2222-4222-8222-222222222245";
const FAIL = "22222222-2222-4222-8222-222222222246";
const PASS_USER = "senha-ficticia-sec0316";
const PASS_ADMIN = "gerencia-ficticia-sec0316";
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
        if (row.service_orders) out.service_orders = row.service_orders;
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
  record(
    "política bloqueia relatórios e boletins",
    enforced.join(",") === "customers,appointments,budgets,parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" &&
      shadow.join(",") === "" &&
      authorizationHasEnforce(production, {}) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "reports" }) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "customers,appointments,budgets,parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" }) === false,
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
      user(REL, "relatorio", { access_relatorios: true }),
      user(PATIO, "patio", { access_patio: true }),
      user(BOLETIM, "boletim", { access_boletim_erros: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_relatorios: true, access_boletim_erros: true }),
    ],
    service_orders: [
      {
        id: "os-1",
        workshop_id: WORKSHOP,
        os_number: 10,
        plate: "ABC1D23",
        vehicle_brand: "Fiat",
        vehicle_model: "Uno",
        status: "em_andamento",
        updated_at: "2026-01-01T00:00:00.000Z",
        order_type: "vehicle",
      },
    ],
    service_order_service_technicians: [
      {
        id: "linha-1",
        workshop_id: WORKSHOP,
        service_order_id: "os-1",
        description: "Troca de pastilha",
        technician_id: "tecnico-1",
        budget_id: null,
        recorded_at: "2026-01-02T00:00:00.000Z",
        service_orders: {
          id: "os-1",
          os_number: 10,
          plate: "ABC1D23",
          vehicle_brand: "Fiat",
          vehicle_model: "Uno",
          status: "em_andamento",
          updated_at: "2026-01-01T00:00:00.000Z",
          order_type: "vehicle",
        },
      },
      {
        id: "linha-2",
        workshop_id: WORKSHOP,
        service_order_id: "os-1",
        description: "Alinhamento",
        technician_id: "tecnico-1",
        budget_id: null,
        recorded_at: "2026-01-03T00:00:00.000Z",
        service_orders: {
          id: "os-1",
          os_number: 10,
          plate: "ABC1D23",
          status: "em_andamento",
          order_type: "vehicle",
        },
      },
    ],
    workshop_error_bulletins: [
      {
        id: "boletim-1",
        workshop_id: WORKSHOP,
        title: "Boletim ficticio",
        status: "published",
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
    workshop_technicians: [],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    customers: [],
  };
  const mock = await startMock(tables);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec0316-local";
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
      hit(base, "/api/reports/technician-services", "GET"),
      hit(base, "/api/reports/technician-services/linha-1", "DELETE"),
      hit(base, "/api/error-bulletins", "GET"),
    ]);
    record(
      "acesso direto sem sessão",
      direct.every((item) => item.status === 401 && item.code === "session_invalid"),
      direct.map((item) => item.status).join(",")
    );
    const invalid = await hit(base, "/api/reports/technician-services", "GET", "sessao-invalida");
    record("sessão inválida", invalid.status === 401 && invalid.code === "session_invalid", `${invalid.status} ${invalid.code}`);

    const rel = await login(base, "relatorio", PASS_USER);
    const patio = await login(base, "patio", PASS_USER);
    const boletim = await login(base, "boletim", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    const listed = await hit(base, "/api/reports/technician-services", "GET", rel);
    allowed("relatórios lê o próprio módulo", listed, 200);
    record(
      "leitura devolve a linha vinculada à OS",
      listed.body.includes("linha-1") && listed.body.includes("os-1") && listed.body.includes("Troca de pastilha"),
      listed.status === 200 ? "corpo sem a linha" : String(listed.status)
    );
    allowed(
      "relatórios exclui o vínculo do relatório",
      await hit(base, "/api/reports/technician-services/linha-1", "DELETE", rel),
      204
    );
    record(
      "exclusão remove só a linha do relatório",
      !tables.service_order_service_technicians.some((row) => row.id === "linha-1") &&
        tables.service_orders.some((row) => row.id === "os-1"),
      "linha ou OS"
    );
    denied("pátio não lê relatório", await hit(base, "/api/reports/technician-services", "GET", patio));
    denied("pátio não exclui vínculo do relatório", await hit(base, "/api/reports/technician-services/linha-2", "DELETE", patio));
    denied("boletim não abre relatório", await hit(base, "/api/reports/technician-services", "GET", boletim));
    denied("sem chave não lê relatório", await hit(base, "/api/reports/technician-services", "GET", none));
    denied("falha de leitura do relatório", await hit(base, "/api/reports/technician-services", "GET", fail));
    allowed("full_access lê relatório", await hit(base, "/api/reports/technician-services", "GET", full), 200);
    allowed("full_access exclui vínculo", await hit(base, "/api/reports/technician-services/linha-2", "DELETE", full), 204);
    allowed("gerência lê relatório", await hit(base, "/api/reports/technician-services", "GET", manager), 200);

    allowed("boletim lista boletins", await hit(base, "/api/error-bulletins", "GET", boletim), 200);
    allowed("boletim lê um boletim", await hit(base, "/api/error-bulletins/boletim-1", "GET", boletim), 200);
    allowed("boletim cria boletim", await hit(base, "/api/error-bulletins", "POST", boletim, { title: "Novo boletim" }), 201);
    allowed("boletim edita boletim", await hit(base, "/api/error-bulletins/boletim-1", "PATCH", boletim, { title: "Editado" }), 200);
    allowed(
      "boletim grava vínculo",
      await hit(base, "/api/error-bulletins/boletim-1/links", "POST", boletim, { name: "Manual", url: "https://example.invalid/manual" }),
      201
    );
    allowed("boletim remove anexo", await hit(base, "/api/error-bulletins/boletim-1/attachments/anexo-1", "DELETE", boletim), 204);
    denied("pátio não cria boletim", await hit(base, "/api/error-bulletins", "POST", patio, { title: "Sem chave" }));
    denied("falha de leitura bloqueia boletim", await hit(base, "/api/error-bulletins", "GET", fail));

    open(
      "fechamento da OS não usa a família de relatórios",
      await hit(base, "/api/service-orders/os-1/service-technicians", "PUT", patio, { lines: [] })
    );
    open("rota do RDA não usa a família de relatórios", await hit(base, "/api/rda/proactive/summary", "GET", patio));

    allowed("painel público da TV", await hit(base, "/api/tv/display", "GET"), 200);
    denied("TV administrativa sem a chave", await hit(base, "/api/tv/slides", "POST", patio, SLIDE));
    allowed("pátio consulta serviços", await hit(base, "/api/workshop-services", "GET", patio), 200);
    denied("pátio não cria serviço", await hit(base, "/api/workshop-services", "POST", patio, SERVICE));
    allowed("pátio consulta checklists", await hit(base, "/api/workshop/checklist-templates", "GET", patio), 200);
    allowed("pátio consulta técnicos", await hit(base, "/api/workshop-technicians", "GET", patio), 200);
    denied("pátio não exclui técnico", await hit(base, "/api/workshop-technicians/tecnico-1", "DELETE", patio));

    process.env.SEC03_DISABLE_FAMILIES = "bulletins";
    const bulletinOff = await hit(base, "/api/reports/technician-services", "GET", patio);
    delete process.env.SEC03_DISABLE_FAMILIES;
    denied("desligar boletins não abre o relatório", bulletinOff);

    process.env.SEC03_DISABLE_FAMILIES = "reports";
    const rolled = await hit(base, "/api/reports/technician-services", "GET", patio);
    const tvStill = await hit(base, "/api/tv/slides", "POST", patio, SLIDE);
    const techStill = await hit(base, "/api/workshop-technicians/tecnico-1", "DELETE", patio);
    const serviceStill = await hit(base, "/api/workshop-services", "POST", patio, SERVICE);
    delete process.env.SEC03_DISABLE_FAMILIES;
    const restored = await hit(base, "/api/reports/technician-services", "GET", patio);
    record(
      "SEC03_DISABLE_FAMILIES=reports tira o bloqueio e preserva TV, técnicos e catálogos",
      rolled.status !== 403 &&
        rolled.code !== "permission_denied" &&
        tvStill.status === 403 &&
        tvStill.code === "permission_denied" &&
        techStill.status === 403 &&
        techStill.code === "permission_denied" &&
        serviceStill.status === 403 &&
        serviceStill.code === "permission_denied" &&
        restored.status === 403 &&
        restored.code === "permission_denied",
      `relatório ${rolled.status}; tv ${tvStill.status}; técnico ${techStill.status}; serviço ${serviceStill.status}; restaurado ${restored.status}`
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
