/**
 * SEC-03.14: bloqueio real da administração de técnicos, por HTTP.
 * Usuários, oficina e senhas são fictícios. Não imprime credencial.
 * npm run test:sec0314-technicians-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const TEC = "22222222-2222-4222-8222-222222222231";
const PATIO = "22222222-2222-4222-8222-222222222232";
const LAB = "22222222-2222-4222-8222-222222222233";
const RADAR = "22222222-2222-4222-8222-222222222234";
const NONE = "22222222-2222-4222-8222-222222222235";
const ADMIN = "22222222-2222-4222-8222-222222222236";
const FULL = "22222222-2222-4222-8222-222222222237";
const FAIL = "22222222-2222-4222-8222-222222222238";
const PASS_USER = "senha-ficticia-sec0314";
const PASS_NEXT = "senha-nova-sec0314";
const PASS_ADMIN = "gerencia-ficticia-sec0314";
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
      if (req.method === "PATCH" || req.method === "PUT") {
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

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const shadow = production.families.filter((family) => family.mode === "shadow").map((family) => family.id).sort();
  record(
    "política bloqueia TV, catálogos e técnicos",
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
      user(TEC, "tec", { access_patio: true }),
      user(PATIO, "patio", { access_patio: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(RADAR, "radar", { access_radar_qualidade: true }),
      user(NONE, "semchave", {}),
      user(ADMIN, "cadastro", { access_technicians: true }),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_patio: true, access_technicians: true }),
    ],
    workshop_quality_person_links: [
      {
        id: "link-1",
        workshop_id: WORKSHOP,
        system_user_id: TEC,
        workshop_technician_id: "tecnico-1",
      },
    ],
    workshop_technicians: [
      {
        id: "tecnico-1",
        workshop_id: WORKSHOP,
        slug: "tec",
        name: "Tec",
        color_style: "zinc",
        sort_order: 0,
        photo_url: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "tecnico-2",
        workshop_id: WORKSHOP,
        slug: "outro",
        name: "Outro",
        color_style: "zinc",
        sort_order: 1,
        photo_url: null,
        created_at: "2026-01-01T00:00:00.000Z",
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
  process.env.SESSION_SECRET = "homolog-session-sec0314-local";
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
      hit(base, "/api/workshop-technicians", "GET"),
      hit(base, "/api/workshop-technicians", "POST", undefined, { slug: "novo", name: "Novo" }),
      hit(base, "/api/workshop-technicians/tecnico-1", "PUT", undefined, { name: "Novo" }),
      hit(base, "/api/auth/my-profile", "PATCH", undefined, { displayName: "Novo" }),
      hit(base, "/api/auth/change-my-password", "POST", undefined, { currentPassword: PASS_USER, newPassword: PASS_NEXT }),
    ]);
    record(
      "acesso direto sem sessão",
      direct.every((item) => item.status === 401 && item.code === "session_invalid"),
      direct.map((item) => item.status).join(",")
    );
    const invalid = await hit(base, "/api/workshop-technicians", "GET", "sessao-invalida");
    record("sessão inválida", invalid.status === 401 && invalid.code === "session_invalid", `${invalid.status} ${invalid.code}`);

    const tec = await login(base, "tec", PASS_USER);
    const patio = await login(base, "patio", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const radar = await login(base, "radar", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const admin = await login(base, "cadastro", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    allowed("técnico lista colegas", await hit(base, "/api/workshop-technicians", "GET", tec), 200);
    allowed("técnico lê o próprio acesso", await hit(base, "/api/auth/my-access", "GET", tec), 200);
    allowed("técnico lê o próprio perfil", await hit(base, "/api/auth/my-profile", "GET", tec), 200);
    const profile = await hit(base, "/api/auth/my-profile", "PATCH", tec, {
      displayName: "Tec Novo",
      username: "outra-conta",
      permissions: { full_access: true, access_technicians: true },
    });
    const stored = tables.workshop_system_users.find((row) => row.id === TEC);
    const storedPermissions = stored?.permissions as { full_access?: boolean; access_technicians?: boolean } | undefined;
    allowed("técnico altera o próprio perfil", profile, 200);
    record(
      "perfil próprio ignora permissões e usuário enviados",
      profile.body.includes("Tec Novo") &&
        stored?.username === "tec" &&
        storedPermissions?.full_access !== true &&
        storedPermissions?.access_technicians !== true,
      stored?.username ? "gravou" : "sem linha"
    );
    allowed(
      "técnico altera a própria senha",
      await hit(base, "/api/auth/change-my-password", "POST", tec, { currentPassword: PASS_USER, newPassword: PASS_NEXT }),
      200
    );
    const otherPassword = await hit(base, "/api/auth/change-my-password", "POST", tec, {
      username: "patio",
      currentPassword: PASS_NEXT,
      newPassword: "senha-seguinte-sec0314",
    });
    record(
      "técnico não altera a senha de outra conta",
      otherPassword.status === 403 && otherPassword.code === "password_target_mismatch",
      `${otherPassword.status} ${otherPassword.code}`
    );
    allowed("técnico altera o próprio nome do card", await hit(base, "/api/workshop-technicians/tecnico-1", "PUT", tec, { name: "Tec Novo" }), 200);
    denied("técnico não altera slug do próprio card", await hit(base, "/api/workshop-technicians/tecnico-1", "PUT", tec, { name: "Tec", slug: "outro-slug" }));
    denied("técnico não altera a cor do card", await hit(base, "/api/workshop-technicians/tecnico-1", "PUT", tec, { color_style: "red" }));
    denied("técnico não altera outro card", await hit(base, "/api/workshop-technicians/tecnico-2", "PUT", tec, { name: "Invadido" }));
    const ownPhoto = await hit(base, "/api/workshop-technicians/tecnico-1/photo", "POST", tec, {});
    record(
      "foto do próprio card passa do guard",
      ownPhoto.status !== 403 && ownPhoto.code !== "permission_denied",
      `${ownPhoto.status} ${ownPhoto.code}`
    );
    denied("técnico não envia foto de outro card", await hit(base, "/api/workshop-technicians/tecnico-2/photo", "POST", tec, {}));
    denied("técnico não cria funcionário", await hit(base, "/api/workshop-technicians", "POST", tec, { slug: "novo", name: "Novo" }));
    denied("técnico não exclui funcionário", await hit(base, "/api/workshop-technicians/tecnico-2", "DELETE", tec));

    for (const [who, token] of [
      ["patio", patio],
      ["lab", lab],
      ["radar", radar],
    ] as const) {
      allowed(`${who} consulta técnicos`, await hit(base, "/api/workshop-technicians", "GET", token), 200);
      denied(`${who} não cria técnico`, await hit(base, "/api/workshop-technicians", "POST", token, { slug: who, name: who }));
      denied(`${who} não exclui técnico`, await hit(base, "/api/workshop-technicians/tecnico-2", "DELETE", token));
      denied(`${who} não edita card sem vínculo`, await hit(base, "/api/workshop-technicians/tecnico-1", "PUT", token, { name: "Invadido" }));
    }
    denied("sem chave não consulta técnicos", await hit(base, "/api/workshop-technicians", "GET", none));
    denied("falha de leitura", await hit(base, "/api/workshop-technicians", "GET", fail));

    for (const [who, token] of [
      ["cadastro", admin],
      ["total", full],
      ["gerencia", manager],
    ] as const) {
      allowed(`${who} cria técnico`, await hit(base, "/api/workshop-technicians", "POST", token, { slug: who, name: who }), 201);
      allowed(`${who} edita outro card`, await hit(base, "/api/workshop-technicians/tecnico-2", "PUT", token, { name: "Outro", slug: "outro", color_style: "blue" }), 200);
    }
    allowed("cadastro exclui técnico", await hit(base, "/api/workshop-technicians/tecnico-2", "DELETE", admin), 204);

    const os = await hit(base, "/api/service-orders/os-1", "PUT", patio, { technicianId: "tecnico-1" });
    const rda = await hit(base, "/api/rda/proactive/summary", "GET", radar);
    record("vínculo na OS não entra na família de técnicos", os.status !== 403 && os.code !== "permission_denied", `${os.status} ${os.code}`);
    record("rota do RDA não entra na família de técnicos", rda.status !== 403 && rda.code !== "permission_denied", `${rda.status} ${rda.code}`);

    allowed("painel público da TV", await hit(base, "/api/tv/display", "GET"), 200);
    denied("TV administrativa sem a chave", await hit(base, "/api/tv/slides", "POST", patio, SLIDE));
    allowed("pátio consulta serviços", await hit(base, "/api/workshop-services", "GET", patio), 200);
    denied("pátio não cria serviço", await hit(base, "/api/workshop-services", "POST", patio, { name: "Troca", category: "Freio" }));
    allowed("pátio consulta checklists", await hit(base, "/api/workshop/checklist-templates", "GET", patio), 200);

    process.env.SEC03_DISABLE_FAMILIES = "technicians";
    const rolled = await hit(base, "/api/workshop-technicians/tecnico-1", "PUT", patio, { name: "Sem bloqueio" });
    const tvStill = await hit(base, "/api/tv/slides", "POST", patio, SLIDE);
    const serviceStill = await hit(base, "/api/workshop-services", "POST", patio, { name: "Troca", category: "Freio" });
    delete process.env.SEC03_DISABLE_FAMILIES;
    const restored = await hit(base, "/api/workshop-technicians/tecnico-1", "PUT", patio, { name: "De novo" });
    record(
      "SEC03_DISABLE_FAMILIES=technicians tira o bloqueio e preserva TV e catálogos",
      rolled.status !== 403 &&
        rolled.code !== "permission_denied" &&
        tvStill.status === 403 &&
        tvStill.code === "permission_denied" &&
        serviceStill.status === 403 &&
        serviceStill.code === "permission_denied" &&
        restored.status === 403 &&
        restored.code === "permission_denied",
      `técnico ${rolled.status}; tv ${tvStill.status}; serviço ${serviceStill.status}; restaurado ${restored.status}`
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
