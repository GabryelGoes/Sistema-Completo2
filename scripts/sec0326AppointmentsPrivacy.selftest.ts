/**
 * SEC-03.26: a lista da agenda esconde CPF, telefone, e-mail e observação
 * de quem só precisa da Home e dos lembretes.
 * npm run test:sec0326-appointments-privacy
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { APPOINTMENT_LIST_PUBLIC_FIELDS } from "../utils/appointmentListPrivacy.js";

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
const BOTH = "22222222-2222-4222-8222-222222222290";
const PASS_USER = "senha-ficticia-sec0326";
const PASS_ADMIN = "gerencia-ficticia-sec0326";
const PRIVATE = ["12345678901", "11911110000", "cliente@exemplo.test", "Observação interna", "trello-secreto"];
const HOME = ["ag-1", "Freio", "Cliente desta", "VW", "Gol", "ABC1D23", "2026-11-16", "09:00", "scheduled"];

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

function rowsOf(body: string): Row[] {
  const parsed = JSON.parse(body) as unknown;
  return Array.isArray(parsed) ? (parsed as Row[]) : [];
}

function hasPrivate(body: string): boolean {
  return PRIVATE.some((value) => body.includes(value));
}

function hasHome(body: string): boolean {
  return HOME.every((value) => body.includes(value));
}

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const off = production.families.filter((family) => family.mode === "off").map((family) => family.id);
  record(
    "as oito famílias em enforce permanecem e a política não ganhou chave nova",
    enforced.join(",") === "customers,appointments,service_orders,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications" &&
      off.join(",") === "quality_radar,rda" &&
      !production.rules.some((rule) => rule.id === "appointments_read"),
    `enforce=${enforced.join(",")}`
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
      user(BOTH, "patioeagenda", { access_patio: true, access_agenda: true }),
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
        trello_card_id: "trello-secreto",
        created_at: "2026-11-01T12:00:00.000Z",
        updated_at: "2026-11-01T12:00:00.000Z",
      },
      {
        id: "ag-outra",
        workshop_id: OTHER,
        title: "Outra",
        customer_name: "Cliente de outra",
        phone: "11922220000",
        customer_cpf: "99999999999",
        notes: "Segredo de outra oficina",
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
  process.env.SESSION_SECRET = "homolog-session-sec0326-local";
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
    const bare = await hit(base, "/api/appointments", "GET");
    record("sem sessão", bare.status === 401 && bare.code === "session_invalid", `${bare.status} ${bare.code}`);
    const bad = await hit(base, "/api/appointments", "GET", "sessao-invalida");
    record("sessão inválida", bad.status === 401 && bad.code === "session_invalid", `${bad.status} ${bad.code}`);
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
    const both = await login(base, "patioeagenda", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    for (const [name, token] of [
      ["agenda", agenda],
      ["recepção", recep],
      ["gerência", manager],
      ["acesso total", full],
      ["pátio com agenda", both],
    ] as const) {
      const listed = await hit(base, "/api/appointments", "GET", token);
      const rows = listed.status === 200 ? rowsOf(listed.body) : [];
      const row = rows.find((item) => item.id === "ag-1");
      record(
        `${name} recebe a ficha completa`,
        listed.status === 200 &&
          hasHome(listed.body) &&
          PRIVATE.every((value) => listed.body.includes(value)) &&
          row?.phone === "11911110000" &&
          row?.customer_cpf === "12345678901" &&
          row?.notes === "Observação interna" &&
          row?.trello_card_id === "trello-secreto" &&
          !listed.body.includes("Cliente de outra") &&
          !listed.body.includes("99999999999") &&
          !listed.body.includes("Segredo de outra oficina"),
        listed.body.slice(0, 180)
      );
    }

    for (const [name, token] of [
      ["pátio", patio],
      ["laboratório", lab],
      ["orçamentos", orc],
      ["sem chave", none],
    ] as const) {
      const listed = await hit(base, "/api/appointments", "GET", token);
      const rows = listed.status === 200 ? rowsOf(listed.body) : [];
      const row = rows.find((item) => item.id === "ag-1");
      const keys = row ? Object.keys(row).sort() : [];
      record(
        `${name} recebe só o que a Home e os lembretes usam`,
        listed.status === 200 &&
          hasHome(listed.body) &&
          !hasPrivate(listed.body) &&
          keys.join(",") === [...APPOINTMENT_LIST_PUBLIC_FIELDS].sort().join(",") &&
          row?.customer_name === "Cliente desta" &&
          row?.vehicle_brand === "VW" &&
          row?.vehicle_model === "Gol" &&
          row?.plate === "ABC1D23" &&
          row?.scheduled_time === "09:00" &&
          row?.status === "scheduled" &&
          row?.title === "Freio" &&
          !listed.body.includes("Cliente de outra") &&
          !("phone" in (row ?? {})) &&
          !("email" in (row ?? {})) &&
          !("customer_cpf" in (row ?? {})) &&
          !("notes" in (row ?? {})) &&
          !("trello_card_id" in (row ?? {})) &&
          !("workshop_id" in (row ?? {})),
        keys.join(",")
      );
    }

    const failedLookup = await hit(base, "/api/appointments", "GET", fail);
    record(
      "falha ao ler permissão devolve a lista reduzida",
      failedLookup.status === 200 && hasHome(failedLookup.body) && !hasPrivate(failedLookup.body),
      failedLookup.body.slice(0, 120)
    );

    const agendaUser = tables.workshop_system_users.find((item) => item.id === AGENDA);
    if (agendaUser) agendaUser.workshop_id = OTHER;
    const left = await hit(base, "/api/appointments", "GET", agenda);
    record(
      "agenda que saiu da oficina perde a ficha completa e não vê a outra oficina",
      left.status === 200 && hasHome(left.body) && !hasPrivate(left.body) && !left.body.includes("Cliente de outra"),
      left.body.slice(0, 120)
    );
    if (agendaUser) agendaUser.workshop_id = WORKSHOP;
    const back = await hit(base, "/api/appointments", "GET", agenda);
    record("agenda de volta à oficina recupera a ficha completa", back.status === 200 && hasPrivate(back.body), back.body.slice(0, 80));

    const created = await hit(base, "/api/appointments", "POST", agenda, {
      title: "Revisão",
      customerName: "Novo da agenda",
      phone: "11933330000",
      email: "novo@exemplo.test",
      customerCpf: "11122233344",
      notes: "Nota nova",
      vehicleBrand: "Fiat",
      vehicleModel: "Uno",
      plate: "DEF2E34",
      date: "2026-11-17",
      time: "11:00",
    });
    record("agenda continua criando", created.status === 201, String(created.status));
    const patioAfter = await hit(base, "/api/appointments", "GET", patio);
    record(
      "pátio vê o novo horário e o veículo, sem o telefone novo",
      patioAfter.body.includes("Novo da agenda") &&
        patioAfter.body.includes("11:00") &&
        patioAfter.body.includes("Uno") &&
        patioAfter.body.includes("DEF2E34") &&
        !patioAfter.body.includes("11933330000") &&
        !patioAfter.body.includes("novo@exemplo.test") &&
        !patioAfter.body.includes("11122233344") &&
        !patioAfter.body.includes("Nota nova"),
      patioAfter.body.slice(0, 160)
    );
    const deniedWrite = await hit(base, "/api/appointments", "POST", patio, {
      title: "Não",
      customerName: "Não nasce",
      date: "2026-11-18",
      time: "08:00",
      vehicleModel: "Ka",
    });
    record(
      "pátio continua sem criar",
      deniedWrite.status === 403 && deniedWrite.code === "permission_denied" && !tables.workshop_appointments.some((row) => row.customer_name === "Não nasce"),
      `${deniedWrite.status} ${deniedWrite.code}`
    );

    record("sem chave continua bloqueado em clientes", (await hit(base, "/api/customers", "POST", none, { name: "X", phone: "1" })).status === 403, "");
    record("sem chave continua bloqueado no estoque", (await hit(base, "/api/workshop-parts", "GET", none)).status === 403, "");
    record("sem chave continua bloqueado em técnicos", (await hit(base, "/api/workshop-technicians", "GET", none)).status === 403, "");
    record("sem chave continua bloqueado em serviços", (await hit(base, "/api/workshop-services", "GET", none)).status === 403, "");
    record("sem chave continua bloqueado em boletins", (await hit(base, "/api/error-bulletins", "GET", none)).status === 403, "");
    record("sem chave continua bloqueado em relatórios", (await hit(base, "/api/reports/technician-services", "GET", none)).status === 403, "");
    record("sem chave continua bloqueado na TV", (await hit(base, "/api/tv/slides", "GET", none)).status === 403, "");
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
