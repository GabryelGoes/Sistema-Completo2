/**
 * SEC-03.23.1: a Agenda lista clientes; cadastro, edição e placa continuam fechados.
 * Usuários e clientes são fictícios. Não chama a PlacaFipe.
 * npm run test:sec03231-customers-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const RECEP = "22222222-2222-4222-8222-222222222271";
const PATIO = "22222222-2222-4222-8222-222222222272";
const LAB = "22222222-2222-4222-8222-222222222273";
const ORC = "22222222-2222-4222-8222-222222222274";
const AGENDA = "22222222-2222-4222-8222-222222222275";
const NONE = "22222222-2222-4222-8222-222222222276";
const FULL = "22222222-2222-4222-8222-222222222277";
const FAIL = "22222222-2222-4222-8222-222222222278";
const PASS_USER = "senha-ficticia-sec03231";
const PASS_ADMIN = "gerencia-ficticia-sec03231";
const FOUR = ["access_laboratorio", "access_orcamentos", "access_patio", "access_reception"];

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

function user(id: string, username: string, permissions: Record<string, boolean>, workshop = WORKSHOP): Row {
  return {
    id,
    workshop_id: workshop,
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

function matchesFilter(row: Row, key: string, raw: string): boolean {
  const value = String(row[key] ?? "");
  if (raw.startsWith("eq.")) return value === raw.slice(3);
  if (raw.startsWith("neq.")) return value !== raw.slice(4);
  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    const set = new Set(
      raw
        .slice(4, -1)
        .split(",")
        .map((item) => item.trim().replace(/^"|"$/g, ""))
        .filter(Boolean)
    );
    return set.has(value);
  }
  return false;
}

async function startMock(tables: Record<string, Row[]>): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (!tables[table]) tables[table] = [];
      const select = url.searchParams.get("select") || "";
      const id = url.searchParams.get("id") || "";
      if (table === "workshop_system_users" && select.startsWith("permissions") && id === `eq.${FAIL}`) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "falha ficticia de leitura" }));
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

function names(tables: Record<string, Row[]>): string[] {
  return tables.customers.map((row) => String(row.name));
}

function keysOf(id: string): string[] {
  const rule = productionAuthorizationPolicy().rules.find((item) => item.id === id);
  return [...(rule?.anyOf ?? [])].sort();
}

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  delete process.env.PLACAFIPE_TOKEN;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const off = production.families.filter((family) => family.mode === "off").map((family) => family.id);
  record(
    "política bloqueia clientes e preserva as outras famílias",
    enforced.join(",") === "customers,appointments,service_orders,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications" &&
      off.join(",") === "quality_radar,rda" &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "customers" }) === true &&
      authorizationHasEnforce(production, {
        SEC03_DISABLE_FAMILIES: "customers,appointments,service_orders,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications",
      }) === false,
    `enforce=${enforced.join(",")} off=${off.join(",")}`
  );
  record(
    "leitura da lista inclui a agenda e a escrita não",
    keysOf("customers_read").join(",") === [...FOUR, "access_agenda"].sort().join(",") &&
      ["customers_create", "customers_update", "customers_delete", "customer_read", "customer_create", "customer_update", "customer_delete", "consulta_placa_read"].every(
        (id) => keysOf(id).join(",") === FOUR.join(",")
      ),
    `lista=${keysOf("customers_read").join(",")}`
  );

  const tables: Record<string, Row[]> = {
    workshop_settings: [["admin_password", hashPassword(PASS_ADMIN)]].map(([key, value]) => ({
      workshop_id: WORKSHOP,
      key,
      value,
      updated_at: "2026-01-01T00:00:00.000Z",
    })),
    workshop_system_users: [
      user(RECEP, "recepcao", { access_reception: true }),
      user(PATIO, "patio", { access_patio: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(ORC, "orcamento", { access_orcamentos: true }),
      user(AGENDA, "agenda", { access_agenda: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_reception: true }),
      user("22222222-2222-4222-8222-222222222279", "outraoficina", { access_reception: true }, OTHER),
    ],
    customers: [
      {
        id: "cli-1",
        workshop_id: WORKSHOP,
        name: "Cliente desta oficina",
        phone: "11900000001",
        cpf: null,
        email: null,
        cep: null,
        address: null,
        city: null,
        address_number: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "cli-outra",
        workshop_id: OTHER,
        name: "Cliente de outra oficina",
        phone: "11900000002",
        cpf: null,
        email: null,
        cep: null,
        address: null,
        city: null,
        address_number: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    service_orders: [
      {
        id: "os-1",
        workshop_id: WORKSHOP,
        customer_id: "cli-1",
        order_type: "vehicle",
        status: "EM_ANDAMENTO",
        plate: "ABC1D23",
        vehicle_model: "Gol",
        os_number: 41,
        created_at: "2026-01-02T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
      },
    ],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    workshop_parts: [{ id: "peca-1", workshop_id: WORKSHOP, name: "Pastilha", stock_qty: 1 }],
  };

  const mock = await startMock(tables);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec03231-local";
  process.env.HOMOLOGATION_MODE = "true";
  process.env.RDA_INTELLIGENCE_ENABLED = "false";
  process.env.RDA_ALLOW_LLM_CALLS = "false";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ADMIN_PASSWORD;
  delete process.env.TV_API_TOKEN;
  delete process.env.PLACAFIPE_TOKEN;
  process.env.NODE_ENV = "development";

  const { createApiApp } = await import("../apiApp.ts");
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const bare = await hit(base, "/api/customers", "GET");
    const bad = await hit(base, "/api/customers", "POST", "sessao-invalida", { name: "Invasor", phone: "1191" });
    record("sem sessão", bare.status === 401 && bare.code === "session_invalid", `${bare.status} ${bare.code}`);
    record(
      "sessão inválida não cria cliente",
      bad.status === 401 && bad.code === "session_invalid" && names(tables).length === 2,
      `${bad.status} ${names(tables).join(",")}`
    );

    const otherLogin = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "outraoficina", password: PASS_USER }),
    });
    record("usuário de outra oficina não entra", otherLogin.status === 401, String(otherLogin.status));

    const recep = await login(base, "recepcao", PASS_USER);
    const patio = await login(base, "patio", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const orc = await login(base, "orcamento", PASS_USER);
    const agenda = await login(base, "agenda", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    const agendaList = await hit(base, "/api/customers", "GET", agenda);
    allowed("agenda lista clientes", agendaList, 200);
    record(
      "agenda vê só esta oficina",
      agendaList.body.includes("Cliente desta oficina") && !agendaList.body.includes("Cliente de outra oficina"),
      agendaList.body.slice(0, 180)
    );
    allowed("recepção lista clientes", await hit(base, "/api/customers", "GET", recep), 200);
    allowed("pátio lista clientes", await hit(base, "/api/customers", "GET", patio), 200);
    allowed("laboratório lista clientes", await hit(base, "/api/customers", "GET", lab), 200);
    allowed("orçamentos lista clientes", await hit(base, "/api/customers", "GET", orc), 200);
    allowed("gerência lista clientes", await hit(base, "/api/customers", "GET", manager), 200);
    allowed("acesso total lista clientes", await hit(base, "/api/customers", "GET", full), 200);
    denied("sem chave não lista", await hit(base, "/api/customers", "GET", none));
    denied("falha de leitura não lista", await hit(base, "/api/customers", "GET", fail));

    const agendaItem = await hit(base, "/api/customers/cli-1", "GET", agenda);
    const recepItem = await hit(base, "/api/customers/cli-1", "GET", recep);
    denied("agenda não lê o cliente por id", agendaItem);
    record(
      "não existe GET por id: recepção passa da regra e cai em 404",
      recepItem.status === 404 && recepItem.code !== "permission_denied",
      `${recepItem.status} ${recepItem.code}`
    );
    record("o GET por id não alterou o cliente", names(tables).includes("Cliente desta oficina"), names(tables).join(","));

    const before = names(tables).length;
    const created = await hit(base, "/api/customers", "POST", recep, { name: "Novo da recepção", phone: "11933330000", cpf: "123" });
    allowed("recepção cadastra cliente", created, 201);
    record(
      "cadastro grava nome, telefone e oficina",
      tables.customers.some((row) => row.name === "Novo da recepção" && row.workshop_id === WORKSHOP && row.phone === "11933330000"),
      names(tables).join(",")
    );
    allowed("pátio cadastra cliente", await hit(base, "/api/customers", "POST", patio, { name: "Novo do pátio", phone: "11944440000" }), 201);
    allowed("laboratório cadastra cliente", await hit(base, "/api/customers", "POST", lab, { name: "Novo do laboratório", phone: "11955550000" }), 201);
    allowed("orçamentos cadastra cliente", await hit(base, "/api/customers", "POST", orc, { name: "Novo do orçamento", phone: "11966660000" }), 201);
    denied("agenda não cadastra", await hit(base, "/api/customers", "POST", agenda, { name: "Agenda não cadastra", phone: "11988880000" }));
    denied("sem chave não cadastra", await hit(base, "/api/customers", "POST", none, { name: "Não pode nascer", phone: "11977770000" }));
    denied("falha de leitura não cadastra", await hit(base, "/api/customers", "POST", fail, { name: "Falha não cadastra", phone: "11999990000" }));
    record(
      "recusas não gravaram cliente",
      !names(tables).some((name) => name.startsWith("Agenda não") || name.startsWith("Não pode") || name.startsWith("Falha não")) &&
        names(tables).length === before + 4,
      names(tables).join(",")
    );

    const edited = await hit(base, "/api/customers/cli-1", "PATCH", patio, { name: "Cliente editado pelo pátio", phone: "11900000009" });
    allowed("pátio edita o cliente da OS", edited, 200);
    const row = tables.customers.find((item) => item.id === "cli-1");
    record("edição troca o nome e o telefone", row?.name === "Cliente editado pelo pátio" && row?.phone === "11900000009", String(row?.name));
    allowed("laboratório edita o cliente", await hit(base, "/api/customers/cli-1", "PATCH", lab, { email: "lab@exemplo.test" }), 200);
    record("e-mail do laboratório ficou gravado", row?.email === "lab@exemplo.test", String(row?.email));
    allowed("orçamentos edita o cliente", await hit(base, "/api/customers/cli-1", "PATCH", orc, { city: "Campinas" }), 200);
    record("cidade do orçamento ficou gravada", row?.city === "Campinas", String(row?.city));
    allowed("recepção edita o cliente", await hit(base, "/api/customers/cli-1", "PATCH", recep, { cep: "13010000" }), 200);
    record("CEP da recepção ficou gravado", row?.cep === "13010000", String(row?.cep));
    denied("agenda não edita", await hit(base, "/api/customers/cli-1", "PATCH", agenda, { name: "Nome da agenda" }));
    denied("sem chave não edita", await hit(base, "/api/customers/cli-1", "PATCH", none, { name: "Nome roubado" }));
    denied("falha de leitura não edita", await hit(base, "/api/customers/cli-1", "PATCH", fail, { name: "Nome da falha" }));
    record("nome segue o do pátio", row?.name === "Cliente editado pelo pátio", String(row?.name));

    const foreign = await hit(base, "/api/customers/cli-outra", "PATCH", recep, { name: "Invadiu outra oficina" });
    const foreignRow = tables.customers.find((item) => item.id === "cli-outra");
    record(
      "edição de outra oficina não grava",
      foreign.status !== 200 && foreignRow?.name === "Cliente de outra oficina" && foreignRow?.workshop_id === OTHER,
      `${foreign.status} ${foreignRow?.name}`
    );

    const patioUser = tables.workshop_system_users.find((item) => item.id === PATIO);
    if (patioUser) patioUser.workshop_id = OTHER;
    denied("sessão cujo usuário saiu da oficina não edita", await hit(base, "/api/customers/cli-1", "PATCH", patio, { name: "Sessão de outra oficina" }));
    record("nome não muda depois da troca de oficina", row?.name === "Cliente editado pelo pátio", String(row?.name));
    if (patioUser) patioUser.workshop_id = WORKSHOP;

    const removed = await hit(base, "/api/customers/cli-1", "DELETE", recep);
    denied("agenda não exclui", await hit(base, "/api/customers/cli-1", "DELETE", agenda));
    denied("sem chave não exclui", await hit(base, "/api/customers/cli-1", "DELETE", none));
    record("não existe rota de exclusão para quem pode", removed.status === 404, String(removed.status));
    record("cliente da OS continua na tabela", tables.customers.some((item) => item.id === "cli-1" && item.name === "Cliente editado pelo pátio"), names(tables).join(","));

    allowed("recepção chega na consulta de placa", await hit(base, "/api/consulta-placa", "POST", recep, { placa: "ABC1D23" }), 503);
    allowed("pátio chega na consulta de placa", await hit(base, "/api/consulta-placa", "POST", patio, { placa: "ABC1D23" }), 503);
    allowed("laboratório chega na consulta de placa", await hit(base, "/api/consulta-placa", "POST", lab, { placa: "ABC1D23" }), 503);
    allowed("orçamentos chega na consulta de placa", await hit(base, "/api/consulta-placa", "POST", orc, { placa: "ABC1D23" }), 503);
    denied("agenda não consulta placa", await hit(base, "/api/consulta-placa", "POST", agenda, { placa: "ABC1D23" }));
    denied("sem chave não consulta placa", await hit(base, "/api/consulta-placa", "POST", none, { placa: "ABC1D23" }));
    denied("falha de leitura não consulta placa", await hit(base, "/api/consulta-placa", "POST", fail, { placa: "ABC1D23" }));
    record("consulta de placa não criou cliente", !names(tables).includes("ABC1D23"), names(tables).join(","));

    allowed("gerência cadastra cliente", await hit(base, "/api/customers", "POST", manager, { name: "Cliente da gerência", phone: "11912120000" }), 201);
    allowed("acesso total cadastra cliente", await hit(base, "/api/customers", "POST", full, { name: "Cliente acesso total", phone: "11913130000" }), 201);
    record(
      "gerência e acesso total gravaram",
      names(tables).includes("Cliente da gerência") && names(tables).includes("Cliente acesso total"),
      names(tables).join(",")
    );

    const appt = await hit(base, "/api/appointments", "GET", agenda);
    record("agenda continua lendo compromissos", appt.status === 200 && appt.code !== "permission_denied", `${appt.status} ${appt.code}`);

    denied("sem chave continua bloqueado no estoque", await hit(base, "/api/workshop-parts", "GET", none));
    denied("sem chave continua bloqueado em técnicos", await hit(base, "/api/workshop-technicians", "GET", none));
    denied("sem chave continua bloqueado em serviços", await hit(base, "/api/workshop-services", "GET", none));
    denied("sem chave continua bloqueado em boletins", await hit(base, "/api/error-bulletins", "GET", none));
    denied("sem chave continua bloqueado em relatórios", await hit(base, "/api/reports/technician-services", "GET", none));
    denied("sem chave continua bloqueado na TV administrativa", await hit(base, "/api/tv/slides", "GET", none));

    process.env.SEC03_DISABLE_FAMILIES = "customers";
    const rolled = await hit(base, "/api/customers", "POST", none, { name: "Nasceu na reversão", phone: "11914140000" });
    record(
      "SEC03_DISABLE_FAMILIES=customers libera o cadastro",
      rolled.status === 201 && names(tables).includes("Nasceu na reversão"),
      `${rolled.status} ${rolled.code}`
    );
    denied("reversão não libera o estoque", await hit(base, "/api/workshop-parts", "GET", none));
    denied("reversão não libera técnicos", await hit(base, "/api/workshop-technicians", "GET", none));
    denied("reversão não libera serviços", await hit(base, "/api/workshop-services", "GET", none));
    denied("reversão não libera boletins", await hit(base, "/api/error-bulletins", "GET", none));
    denied("reversão não libera relatórios", await hit(base, "/api/reports/technician-services", "GET", none));
    denied("reversão não libera a TV administrativa", await hit(base, "/api/tv/slides", "GET", none));
    delete process.env.SEC03_DISABLE_FAMILIES;
    const closedAgain = await hit(base, "/api/customers", "POST", none, { name: "Não nasce de novo", phone: "11915150000" });
    denied("sem a variável o bloqueio volta", closedAgain);
    record("o cliente da segunda tentativa não existe", !names(tables).includes("Não nasce de novo"), names(tables).join(","));
  } finally {
    server.close();
    mock.server.close();
  }

  console.log(`resumo ${passed} ok, ${failed} falhas`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
