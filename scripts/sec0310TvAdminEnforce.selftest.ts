/**
 * SEC-03.10: bloqueio real da administração da TV, por HTTP.
 * Usuários, oficina e senhas são fictícios. Não imprime credencial.
 * npm run test:sec0310-tv-admin-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const ANA = "22222222-2222-4222-8222-222222222201";
const BIA = "22222222-2222-4222-8222-222222222203";
const CAIO = "22222222-2222-4222-8222-222222222204";
const DORA = "22222222-2222-4222-8222-222222222205";
const SESSION_SECRET = "homolog-session-sec0310-local";
const PASS_USER = "senha-ficticia-sec0310";
const PASS_ADMIN = "gerencia-ficticia-sec0310";
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
    is_technician: false,
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
      if (table === "workshop_system_users" && select === "permissions,is_technician" && id === `eq.${DORA}`) {
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

type Hit = { status: number; code: string; body: string };

async function hit(base: string, path: string, method: string, token?: string, body?: unknown): Promise<Hit> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      accept: method === "GET" && path === "/api/tv/display" ? "text/html" : "application/json",
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
  record(`login ${username}`, response.status === 200 && typeof json.token === "string" && json.token.length > 0, String(response.status));
  return typeof json.token === "string" ? json.token : "";
}

function denied(name: string, result: Hit) {
  record(name, result.status === 403 && result.code === "permission_denied" && !result.body.includes(ANA), `${result.status} ${result.code}`);
}

function allowed(name: string, result: Hit, status: number) {
  record(name, result.status === status && result.code !== "permission_denied", `${result.status} ${result.code}`);
}

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const shadow = production.families.filter((family) => family.mode === "shadow").map((family) => family.id).sort();
  record(
    "política mantém a TV e passa a incluir os catálogos",
    enforced.join(",") === "customers,appointments,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications" &&
      shadow.join(",") === "" &&
      authorizationHasEnforce(production, {}) === true,
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
      user(ANA, "ana", { access_patio: true }),
      user(BIA, "bia", { access_tv_patio: true }),
      user(CAIO, "caio", { full_access: true }),
      user(DORA, "dora", { access_tv_patio: true }),
    ],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    workshop_tv_media: [
      {
        id: "midia-1",
        workshop_id: WORKSHOP,
        tv_scope: "patio",
        media_type: "image",
        title: "Foto",
        file_name: "foto.png",
        media_url: "https://exemplo.invalid/foto.png",
        storage_path: "",
        size_bytes: 10,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    customers: [],
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
    const display = await hit(base, "/api/tv/display", "GET");
    record(
      "painel público sem login",
      display.status === 200 && display.body.includes("<") && display.code !== "permission_denied",
      String(display.status)
    );
    const playlist = await hit(base, "/api/tv/playlist", "GET");
    record(
      "playlist pública sem login",
      playlist.status === 200 && playlist.body.includes("slides") && playlist.code !== "permission_denied",
      String(playlist.status)
    );

    const direct = await Promise.all([
      hit(base, "/api/tv/slides", "POST", undefined, SLIDE),
      hit(base, "/api/tv/slides/slide-1", "PATCH", undefined, { slide: { title: "Direto" } }),
      hit(base, "/api/tv/slides/slide-1", "DELETE"),
      hit(base, "/api/tv/manage", "GET"),
      hit(base, "/api/tv/media", "GET"),
      hit(base, "/api/tv/weekly-goal", "PUT", undefined, { label: "Meta", currentAmount: 1, targetAmount: 2 }),
    ]);
    record(
      "acesso direto sem sessão",
      direct.every((item) => item.status === 401 && item.code === "session_invalid"),
      direct.map((item) => item.status).join(",")
    );
    const invalid = await hit(base, "/api/tv/manage", "GET", "sessao-invalida");
    record("sessão inválida", invalid.status === 401 && invalid.code === "session_invalid", `${invalid.status} ${invalid.code}`);

    const ana = await login(base, "ana", PASS_USER);
    const bia = await login(base, "bia", PASS_USER);
    const caio = await login(base, "caio", PASS_USER);
    const dora = await login(base, "dora", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    const adminRoutes: Array<[string, string, unknown?]> = [
      ["GET", "/api/tv/manage"],
      ["POST", "/api/tv/slides", SLIDE],
      ["PATCH", "/api/tv/slides/slide-1", { slide: { title: "Aviso editado" } }],
      ["DELETE", "/api/tv/slides/slide-1"],
      ["GET", "/api/tv/media"],
      ["DELETE", "/api/tv/media/midia-1"],
      ["PUT", "/api/tv/weekly-goal", { label: "Meta", currentAmount: 1, targetAmount: 2 }],
      ["PUT", "/api/tv/video-settings", { layoutMode: "single_rotate" }],
      ["PUT", "/api/tv/chime-schedule", { config: { masterEnabled: false, alerts: [] } }],
      ["POST", "/api/tv/media/upload-init", { fileName: "foto.png", fileSize: 10, contentType: "image/png" }],
    ];
    const expected: Record<string, number> = {
      "GET /api/tv/manage": 200,
      "POST /api/tv/slides": 201,
      "PATCH /api/tv/slides/slide-1": 200,
      "DELETE /api/tv/slides/slide-1": 204,
      "GET /api/tv/media": 200,
      "DELETE /api/tv/media/midia-1": 204,
      "PUT /api/tv/weekly-goal": 200,
      "PUT /api/tv/video-settings": 200,
      "PUT /api/tv/chime-schedule": 200,
    };

    for (const [method, path, body] of adminRoutes) {
      const key = `${method} ${path}`;
      denied(`ana sem chave ${key}`, await hit(base, path, method, ana, body));
    }
    for (const [who, token] of [
      ["bia", bia],
      ["caio", caio],
      ["gerencia", manager],
    ] as const) {
      for (const [method, path, body] of adminRoutes) {
        const key = `${method} ${path}`;
        const result = await hit(base, path, method, token, body);
        if (key in expected) allowed(`${who} ${key}`, result, expected[key]);
        else record(`${who} ${key} passa do guard`, result.status !== 403 && result.code !== "permission_denied", `${result.status} ${result.code}`);
      }
    }

    denied("dora com falha de leitura", await hit(base, "/api/tv/slides", "POST", dora, SLIDE));

    denied("relatório sem a chave", await hit(base, "/api/reports/technician-services", "GET", ana));
    denied("boletim sem a chave", await hit(base, "/api/error-bulletins", "GET", ana));
    denied("exclusão de peça sem a chave", await hit(base, "/api/workshop-parts/peca-1", "DELETE", ana));
    const others = await Promise.all([
      hit(base, "/api/workshop-technicians", "GET", ana),
      hit(base, "/api/workshop-services", "GET", ana),
      hit(base, "/api/customers", "POST", ana, { name: "Cliente ficticio", phone: "11999990000" }),
    ]);
    record(
      "outras famílias não ganham 403",
      others.every((item) => item.status !== 403 && item.code !== "permission_denied"),
      others.map((item) => item.status).join(",")
    );

    process.env.SEC03_DISABLE_FAMILIES = "tv_admin";
    const rolled = await hit(base, "/api/tv/slides", "POST", ana, SLIDE);
    const publicStill = await hit(base, "/api/tv/display", "GET");
    const reportsStill = await hit(base, "/api/reports/technician-services", "GET", ana);
    delete process.env.SEC03_DISABLE_FAMILIES;
    const restored = await hit(base, "/api/tv/slides", "POST", ana, SLIDE);
    record(
      "SEC03_DISABLE_FAMILIES=tv_admin tira o 403 e o próximo pedido volta a bloquear",
      rolled.status === 201 &&
        rolled.code !== "permission_denied" &&
        publicStill.status === 200 &&
        reportsStill.status === 403 &&
        reportsStill.code === "permission_denied" &&
        restored.status === 403 &&
        restored.code === "permission_denied",
      `reversão ${rolled.status}; público ${publicStill.status}; relatório ${reportsStill.status}; restaurado ${restored.status}`
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
