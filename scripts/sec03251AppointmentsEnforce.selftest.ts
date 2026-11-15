/**
 * SEC-03.25.1: a lista de compromissos segue para qualquer sessão desta oficina.
 * Criar, editar e excluir exigem agenda ou recepção.
 * npm run test:sec03251-appointments-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const AGENDA = "22222222-2222-4222-8222-222222222281";
const RECEP = "22222222-2222-4222-8222-222222222282";
const PATIO = "22222222-2222-4222-8222-222222222283";
const LAB = "22222222-2222-4222-8222-222222222284";
const ORC = "22222222-2222-4222-8222-222222222285";
const NONE = "22222222-2222-4222-8222-222222222286";
const FULL = "22222222-2222-4222-8222-222222222287";
const FAIL = "22222222-2222-4222-8222-222222222288";
const PASS_USER = "senha-ficticia-sec03251";
const PASS_ADMIN = "gerencia-ficticia-sec03251";
const WRITE = ["access_agenda", "access_reception"];

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
        if (wantsObject && updated.length !== 1) {
          res.writeHead(406, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? project(updated[0] ?? {}) : updated.map(project)));
        return;
      }
      if (req.method === "DELETE") {
        tables[table] = tables[table].filter((row) => !matches(row));
        res.writeHead(200, { "content-type": "application/json" });
        res.end("[]");
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

function keysOf(id: string): string[] {
  const rule = productionAuthorizationPolicy().rules.find((item) => item.id === id);
  return [...(rule?.anyOf ?? [])].sort();
}

const draft = (name: string, date = "2026-11-16") => ({
  title: "Queixa",
  customerName: name,
  phone: "11900000000",
  vehicleModel: "Gol",
  plate: "ABC1D23",
  date,
  time: "09:00",
});

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const off = production.families.filter((family) => family.mode === "off").map((family) => family.id);
  const listRule = production.rules.find((item) => item.id === "appointments_read");
  record(
    "política bloqueia a agenda e preserva as outras famílias",
    enforced.join(",") === "customers,appointments,parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" &&
      off.join(",") === "service_orders,budgets,comments,photos,abs_stock,notifications,quality_radar,rda" &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "appointments" }) === true &&
      authorizationHasEnforce(production, {
        SEC03_DISABLE_FAMILIES: "customers,appointments,parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports",
      }) === false,
    `enforce=${enforced.join(",")}`
  );
  record(
    "a lista não tem regra de chave e a escrita fica com agenda ou recepção",
    !listRule &&
      ["appointments_create", "appointments_update", "appointments_delete", "appointment_create", "appointment_update", "appointment_delete", "appointment_read"].every(
        (id) => keysOf(id).join(",") === WRITE.join(",")
      ),
    `lista=${listRule ? "existe" : "ausente"}`
  );

  const tables: Record<string, Row[]> = {
    workshop_settings: [
      {
        workshop_id: WORKSHOP,
        key: "admin_password",
        value: hashPassword(PASS_ADMIN),
        updated_at: "2026-01-01T00:00:00.000Z",
      },
    ],
    workshop_system_users: [
      user(AGENDA, "agenda", { access_agenda: true }),
      user(RECEP, "recepcao", { access_reception: true }),
      user(PATIO, "patio", { access_patio: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(ORC, "orcamento", { access_orcamentos: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_agenda: true }),
      user("22222222-2222-4222-8222-222222222289", "outraoficina", { access_agenda: true }, OTHER),
    ],
    workshop_appointments: [
      {
        id: "ag-1",
        workshop_id: WORKSHOP,
        title: "Freio",
        customer_name: "Cliente desta",
        phone: "11911110000",
        email: "cliente@exemplo.test",
        customer_cpf: "12345678901",
        notes: "Observação interna",
        vehicle_brand: "VW",
        vehicle_model: "Gol",
        plate: "ABC1D23",
        scheduled_date: "2026-11-16",
        scheduled_time: "09:00",
        status: "scheduled",
        trello_card_id: null,
      },
      {
        id: "ag-outra",
        workshop_id: OTHER,
        title: "Outra",
        customer_name: "Cliente de outra",
        phone: "11922220000",
        customer_cpf: "99999999999",
        vehicle_model: "Uno",
        plate: "XYZ9Z99",
        scheduled_date: "2026-11-16",
        scheduled_time: "10:00",
        status: "scheduled",
      },
    ],
    customers: [],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    workshop_parts: [{ id: "peca-1", workshop_id: WORKSHOP, name: "Pastilha" }],
  };

  const mock = await startMock(tables);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec03251-local";
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
  const count = () => tables.workshop_appointments.length;

  try {
    const bare = await hit(base, "/api/appointments", "GET");
    const bad = await hit(base, "/api/appointments", "POST", "sessao-invalida", draft("Invasor"));
    record("sem sessão", bare.status === 401 && bare.code === "session_invalid", `${bare.status} ${bare.code}`);
    record("sessão inválida não cria", bad.status === 401 && count() === 2, String(bad.status));
    const otherLogin = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "outraoficina", password: PASS_USER }),
    });
    record("usuário de outra oficina não entra", otherLogin.status === 401, String(otherLogin.status));

    const agenda = await login(base, "agenda", PASS_USER);
    const recep = await login(base, "recepcao", PASS_USER);
    const patio = await login(base, "patio", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const orc = await login(base, "orcamento", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    for (const [name, token] of [
      ["agenda", agenda],
      ["recepção", recep],
      ["pátio", patio],
      ["laboratório", lab],
      ["orçamentos", orc],
      ["sem chave", none],
      ["gerência", manager],
      ["acesso total", full],
    ] as const) {
      const listed = await hit(base, "/api/appointments", "GET", token);
      allowed(`${name} lista para a home e os lembretes`, listed, 200);
      if (name === "pátio") {
        record(
          "a lista do pátio traz esta oficina e esconde a outra",
          listed.body.includes("Cliente desta") && !listed.body.includes("Cliente de outra") && !listed.body.includes("99999999999"),
          listed.body.slice(0, 180)
        );
        record(
          "a lista do pátio omite CPF, telefone, e-mail e observação",
          !listed.body.includes("12345678901") &&
            !listed.body.includes("11911110000") &&
            !listed.body.includes("cliente@exemplo.test") &&
            !listed.body.includes("Observação interna") &&
            listed.body.includes("Freio") &&
            listed.body.includes("ABC1D23"),
          "campos da home"
        );
      }
    }
    denied("falha de leitura não cria", await hit(base, "/api/appointments", "POST", fail, draft("Falha não nasce")));

    const before = count();
    allowed("agenda cria", await hit(base, "/api/appointments", "POST", agenda, draft("Novo da agenda")), 201);
    allowed("recepção cria", await hit(base, "/api/appointments", "POST", recep, draft("Novo da recepção")), 201);
    allowed("gerência cria", await hit(base, "/api/appointments", "POST", manager, draft("Novo da gerência")), 201);
    allowed("acesso total cria", await hit(base, "/api/appointments", "POST", full, draft("Novo do acesso total")), 201);
    denied("pátio não cria", await hit(base, "/api/appointments", "POST", patio, draft("Novo do pátio")));
    denied("laboratório não cria", await hit(base, "/api/appointments", "POST", lab, draft("Novo do lab")));
    denied("orçamentos não cria", await hit(base, "/api/appointments", "POST", orc, draft("Novo do orçamento")));
    denied("sem chave não cria", await hit(base, "/api/appointments", "POST", none, draft("Não nasce")));
    record(
      "só quem tem agenda, recepção, gerência ou acesso total gravou",
      ["Novo da agenda", "Novo da recepção", "Novo da gerência", "Novo do acesso total"].every((name) =>
        tables.workshop_appointments.some((row) => row.customer_name === name && row.workshop_id === WORKSHOP)
      ) &&
        !tables.workshop_appointments.some((row) =>
          ["Novo do pátio", "Novo do lab", "Novo do orçamento", "Não nasce", "Falha não nasce"].includes(String(row.customer_name))
        ) &&
        count() === before + 4,
      tables.workshop_appointments.map((row) => String(row.customer_name)).join(",")
    );

    allowed("agenda reagenda", await hit(base, "/api/appointments/ag-1", "PATCH", agenda, { date: "2026-11-20", time: "14:30" }), 200);
    const row = tables.workshop_appointments.find((item) => item.id === "ag-1");
    record("data e hora mudaram", row?.scheduled_date === "2026-11-20" && row?.scheduled_time === "14:30", `${row?.scheduled_date} ${row?.scheduled_time}`);
    allowed("recepção muda o status", await hit(base, "/api/appointments/ag-1", "PATCH", recep, { status: "cancelled" }), 200);
    record("status cancelado ficou gravado", row?.status === "cancelled", String(row?.status));
    denied("pátio não reagenda", await hit(base, "/api/appointments/ag-1", "PATCH", patio, { date: "2026-12-01" }));
    denied("laboratório não muda o status", await hit(base, "/api/appointments/ag-1", "PATCH", lab, { status: "scheduled" }));
    denied("orçamentos não edita", await hit(base, "/api/appointments/ag-1", "PATCH", orc, { title: "Trocado" }));
    denied("sem chave não edita", await hit(base, "/api/appointments/ag-1", "PATCH", none, { title: "Trocado" }));
    denied("falha de leitura não altera", await hit(base, "/api/appointments/ag-1", "PATCH", fail, { time: "23:59" }));
    record(
      "recusas deixam data, hora, status e título",
      row?.scheduled_date === "2026-11-20" && row?.scheduled_time === "14:30" && row?.status === "cancelled" && row?.title === "Freio",
      `${row?.scheduled_date} ${row?.scheduled_time} ${row?.status} ${row?.title}`
    );

    const foreign = await hit(base, "/api/appointments/ag-outra", "PATCH", recep, { customerName: "Invadiu" });
    const foreignRow = tables.workshop_appointments.find((item) => item.id === "ag-outra");
    record(
      "compromisso de outra oficina não muda",
      foreign.status !== 200 && foreignRow?.customer_name === "Cliente de outra" && foreignRow?.workshop_id === OTHER,
      `${foreign.status} ${foreignRow?.customer_name}`
    );

    const agendaUser = tables.workshop_system_users.find((item) => item.id === AGENDA);
    if (agendaUser) agendaUser.workshop_id = OTHER;
    denied("usuário que saiu da oficina não exclui", await hit(base, "/api/appointments/ag-1", "DELETE", agenda));
    record("compromisso continua depois da troca de oficina", tables.workshop_appointments.some((item) => item.id === "ag-1"), String(count()));
    if (agendaUser) agendaUser.workshop_id = WORKSHOP;

    const removed = await hit(base, "/api/appointments/ag-1", "DELETE", recep);
    record("recepção exclui", removed.status === 204 && !tables.workshop_appointments.some((item) => item.id === "ag-1"), String(removed.status));
    const survivor = tables.workshop_appointments.find((item) => item.customer_name === "Novo da agenda");
    denied("pátio não exclui", await hit(base, `/api/appointments/${survivor?.id}`, "DELETE", patio));
    denied("laboratório não exclui", await hit(base, `/api/appointments/${survivor?.id}`, "DELETE", lab));
    denied("orçamentos não exclui", await hit(base, `/api/appointments/${survivor?.id}`, "DELETE", orc));
    denied("sem chave não exclui", await hit(base, `/api/appointments/${survivor?.id}`, "DELETE", none));
    record("compromisso da agenda continua", tables.workshop_appointments.some((item) => item.id === survivor?.id), String(survivor?.id));
    const gone = await hit(base, "/api/appointments/ag-1", "DELETE", agenda);
    record("excluir id que já saiu não ressuscita a linha", gone.status === 204 && !tables.workshop_appointments.some((item) => item.id === "ag-1"), String(gone.status));

    const home = await hit(base, "/api/appointments", "GET", none);
    allowed("sem chave ainda lê a lista da home", home, 200);
    record(
      "a home do sem chave vê o compromisso da agenda e não o de outra oficina",
      home.body.includes("Novo da agenda") && !home.body.includes("Cliente de outra"),
      home.body.slice(0, 120)
    );

    denied("sem chave continua bloqueado em clientes", await hit(base, "/api/customers", "POST", none, { name: "X", phone: "1" }));
    denied("sem chave continua bloqueado no estoque", await hit(base, "/api/workshop-parts", "GET", none));
    denied("sem chave continua bloqueado em técnicos", await hit(base, "/api/workshop-technicians", "GET", none));
    denied("sem chave continua bloqueado em serviços", await hit(base, "/api/workshop-services", "GET", none));
    denied("sem chave continua bloqueado em boletins", await hit(base, "/api/error-bulletins", "GET", none));
    denied("sem chave continua bloqueado em relatórios", await hit(base, "/api/reports/technician-services", "GET", none));
    denied("sem chave continua bloqueado na TV", await hit(base, "/api/tv/slides", "GET", none));

    process.env.SEC03_DISABLE_FAMILIES = "appointments";
    const rolled = await hit(base, "/api/appointments", "POST", patio, draft("Nasceu na reversão"));
    record(
      "SEC03_DISABLE_FAMILIES=appointments libera a escrita do pátio",
      rolled.status === 201 && tables.workshop_appointments.some((item) => item.customer_name === "Nasceu na reversão"),
      `${rolled.status} ${rolled.code}`
    );
    denied("reversão não libera cadastro de cliente", await hit(base, "/api/customers", "POST", none, { name: "Y", phone: "1" }));
    denied("reversão não libera o estoque", await hit(base, "/api/workshop-parts", "GET", none));
    denied("reversão não libera técnicos", await hit(base, "/api/workshop-technicians", "GET", none));
    denied("reversão não libera serviços", await hit(base, "/api/workshop-services", "GET", none));
    denied("reversão não libera boletins", await hit(base, "/api/error-bulletins", "GET", none));
    denied("reversão não libera relatórios", await hit(base, "/api/reports/technician-services", "GET", none));
    denied("reversão não libera a TV", await hit(base, "/api/tv/slides", "GET", none));
    delete process.env.SEC03_DISABLE_FAMILIES;
    const closed = await hit(base, "/api/appointments", "POST", patio, draft("Não nasce de novo"));
    denied("sem a variável o pátio volta a tomar 403 na escrita", closed);
    record("o compromisso da segunda tentativa não existe", !tables.workshop_appointments.some((item) => item.customer_name === "Não nasce de novo"), String(count()));
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
