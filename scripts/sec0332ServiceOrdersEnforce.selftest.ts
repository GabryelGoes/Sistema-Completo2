/**
 * SEC-03.32: ordens de serviço em enforce, com o PUT separado por campo.
 * Oficinas, funcionários e OS são fictícios.
 * npm run test:sec0332-service-orders-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";
import { assessServiceOrderPut } from "../utils/serviceOrderPutGuard.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const PATIO = "22222222-2222-4222-8222-222222222401";
const FICHA = "22222222-2222-4222-8222-222222222402";
const QUEIXA = "22222222-2222-4222-8222-222222222403";
const ARCHIVE = "22222222-2222-4222-8222-222222222404";
const ASSIGN = "22222222-2222-4222-8222-222222222405";
const LAB = "22222222-2222-4222-8222-222222222406";
const RECEPTION = "22222222-2222-4222-8222-222222222407";
const ORC = "22222222-2222-4222-8222-222222222408";
const APPROVE = "22222222-2222-4222-8222-222222222409";
const AGENDA = "22222222-2222-4222-8222-222222222410";
const REPORTS = "22222222-2222-4222-8222-222222222411";
const STOCK = "22222222-2222-4222-8222-222222222412";
const BULLETIN = "22222222-2222-4222-8222-222222222413";
const TV = "22222222-2222-4222-8222-222222222414";
const RADAR = "22222222-2222-4222-8222-222222222415";
const FULL = "22222222-2222-4222-8222-222222222416";
const NONE = "22222222-2222-4222-8222-222222222417";
const HOME = "22222222-2222-4222-8222-222222222418";
const FAIL = "22222222-2222-4222-8222-222222222419";
const MILEAGE = "22222222-2222-4222-8222-222222222420";
const DELIVERY = "22222222-2222-4222-8222-222222222421";
const DELETE_USER = "22222222-2222-4222-8222-222222222423";
const TECH = "22222222-2222-4222-8222-222222222422";
const PASS_USER = "senha-ficticia-sec0332";
const PASS_ADMIN = "gerencia-ficticia-sec0332";
const DELETE_PASSWORD = "apaga-ficticia";
const ENFORCED =
  "customers,appointments,service_orders,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications";
const OS = "os-sec0332-1";
const OS_CANCELLED = "os-sec0332-cancelled";
const OS_OTHER = "os-sec0332-other";
const OS_MODULE = "os-sec0332-module";
const CUSTOMER = "cliente-sec0332";
const CUSTOMER_OTHER = "cliente-outra-oficina";

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

function user(id: string, username: string, permissions: Record<string, boolean>, technician = false): Row {
  return {
    id,
    workshop_id: WORKSHOP,
    username,
    display_name: username,
    password_hash: hashPassword(PASS_USER),
    permissions,
    is_technician: technician,
    job_title: null,
    photo_url: null,
    accent_color: null,
    created_at: "2026-11-15T12:00:00.000Z",
    updated_at: "2026-11-15T12:00:00.000Z",
  };
}

function order(id: string, workshopId: string, status: string, extra: Row = {}): Row {
  return {
    id,
    workshop_id: workshopId,
    customer_id: workshopId === WORKSHOP ? CUSTOMER : CUSTOMER_OTHER,
    os_number: id,
    status,
    order_type: extra.order_type ?? "vehicle",
    plate: extra.plate ?? "ABC1D23",
    vehicle_model: "Fusca",
    issue_description: "barulho",
    assigned_technician: null,
    mileage_km: "10",
    delivery_date: null,
    created_at: "2026-11-15T12:00:00.000Z",
    updated_at: "2026-11-15T12:00:00.000Z",
    ...extra,
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
  if (raw.startsWith("gte.")) return text >= raw.slice(4);
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
      const resource = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (resource.startsWith("rpc/")) {
        if (resource === "rpc/get_next_os_number") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(9001));
          return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "PGRST202", message: "function does not exist" }));
        return;
      }
      const table = resource;
      if (!tables[table]) tables[table] = [];
      const body = raw.length ? (JSON.parse(raw.toString("utf8")) as Row) : {};
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
        if (!select || select === "*" || select.includes("*")) return { ...row };
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
        res.writeHead(200, { "content-type": "application/json", "content-range": `*/${rows.length}` });
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
  const json = (await response.json().catch(() => ({}))) as { token?: string };
  record(`login ${username}`, response.status === 200 && typeof json.token === "string", String(response.status));
  return typeof json.token === "string" ? json.token : "";
}

function row(tables: Record<string, Row[]>, id: string): Row | undefined {
  return tables.service_orders.find((item) => item.id === id);
}

async function main() {
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const off = production.families.filter((family) => family.mode === "off").map((family) => family.id);
  record(
    "service_orders entra em enforce e quality_radar e rda permanecem desligadas",
    enforced.join(",") === ENFORCED && off.join(",") === "quality_radar,rda",
    `${enforced.join(",")} | ${off.join(",")}`
  );
  record(
    "desligar só service_orders preserva as outras famílias",
    authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "service_orders" }) &&
      authorizationHasEnforce(production, { SEC03_AUTHORIZATION_DISABLED: "1" }) === false,
    "interruptor"
  );

  const guardPlate = assessServiceOrderPut({
    body: { plate: "NOVA1" },
    role: "user",
    fullAccess: false,
    permissions: { access_patio: true },
  });
  const guardStage = assessServiceOrderPut({
    body: { status: "EM_SERVICO" },
    role: "user",
    fullAccess: false,
    permissions: { access_patio: true },
  });
  const guardArchive = assessServiceOrderPut({
    body: { status: "CANCELLED" },
    role: "user",
    fullAccess: false,
    permissions: { access_patio: true },
  });
  const guardReopen = assessServiceOrderPut({
    body: { status: "EM_SERVICO" },
    role: "user",
    fullAccess: false,
    permissions: { access_reception: true },
    previousStatus: "CANCELLED",
  });
  record(
    "pátio move etapa e não edita a ficha nem arquiva",
    guardPlate.ok === false && guardStage.ok === true && guardArchive.ok === false && guardReopen.ok === true,
    `${guardPlate.ok} ${guardStage.ok} ${guardArchive.ok} ${guardReopen.ok}`
  );

  process.env.HOMOLOGATION_MODE = "true";
  process.env.RDA_INTELLIGENCE_ENABLED = "false";
  process.env.NODE_ENV = "development";
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  process.env.SUPABASE_URL = "http://127.0.0.1:9";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-ficticia";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.ADMIN_PASSWORD = PASS_ADMIN;

  const tables: Record<string, Row[]> = {
    workshop_settings: [
      { workshop_id: WORKSHOP, key: "admin_password", value: PASS_ADMIN },
      { workshop_id: WORKSHOP, key: "vehicle_delete_password", value: DELETE_PASSWORD },
    ],
    device_sessions: [],
    workshop_system_users: [
      user(PATIO, "patio", { access_patio: true }),
      user(FICHA, "ficha", { patio_edit_ficha: true }),
      user(QUEIXA, "queixa", { patio_edit_queixa: true }),
      user(ARCHIVE, "arquivo", { patio_archive_card: true }),
      user(ASSIGN, "atribuir", { patio_assign_technician: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(RECEPTION, "recepcao", { access_reception: true }),
      user(ORC, "orcamento", { access_orcamentos: true }),
      user(APPROVE, "aprovar", { patio_approve_budget_items: true }),
      user(AGENDA, "agenda", { access_agenda: true }),
      user(REPORTS, "relatorios", { access_relatorios: true }),
      user(STOCK, "estoque", { access_estoque_pecas: true }),
      user(BULLETIN, "boletim", { access_boletim_erros: true }),
      user(TV, "tv", { access_tv_patio: true }),
      user(RADAR, "radar", { access_radar_qualidade: true }),
      user(FULL, "completo", { full_access: true }),
      user(NONE, "nenhuma", {}),
      user(HOME, "inicio", { access_home: true }),
      user(MILEAGE, "km", { patio_edit_mileage: true }),
      user(DELIVERY, "entrega", { patio_edit_delivery_date: true }),
      user(DELETE_USER, "excluir", { patio_delete_cards: true }),
      user(FAIL, "falha", { access_patio: true }),
      user(TECH, "tecnico", { access_patio: true }, true),
    ],
    customers: [
      { id: CUSTOMER, workshop_id: WORKSHOP, name: "Cliente ficticio" },
      { id: CUSTOMER_OTHER, workshop_id: OTHER, name: "Outra oficina" },
    ],
    service_orders: [
      order(OS, WORKSHOP, "AGUARDANDO_AVALIACAO"),
      order(OS_CANCELLED, WORKSHOP, "CANCELLED", { plate: "CAN1C23" }),
      order(OS_OTHER, OTHER, "AGUARDANDO_AVALIACAO", { plate: "OUT1R99" }),
      order(OS_MODULE, WORKSHOP, "AGUARDANDO_AVALIACAO", { order_type: "module", plate: null }),
    ],
    service_order_stage_events: [],
    service_order_checklist_checks: [],
    notifications: [],
  };

  const mock = await startMock(tables);
  process.env.SUPABASE_URL = mock.url;
  const { createApiApp } = await import("../apiApp.js");
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const patio = await login(base, "patio", PASS_USER);
    const ficha = await login(base, "ficha", PASS_USER);
    const queixa = await login(base, "queixa", PASS_USER);
    const archive = await login(base, "arquivo", PASS_USER);
    const assign = await login(base, "atribuir", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const reception = await login(base, "recepcao", PASS_USER);
    const orc = await login(base, "orcamento", PASS_USER);
    const approve = await login(base, "aprovar", PASS_USER);
    const agenda = await login(base, "agenda", PASS_USER);
    const reports = await login(base, "relatorios", PASS_USER);
    const stock = await login(base, "estoque", PASS_USER);
    const bulletin = await login(base, "boletim", PASS_USER);
    const tv = await login(base, "tv", PASS_USER);
    const radar = await login(base, "radar", PASS_USER);
    const full = await login(base, "completo", PASS_USER);
    const none = await login(base, "nenhuma", PASS_USER);
    const home = await login(base, "inicio", PASS_USER);
    const mileage = await login(base, "km", PASS_USER);
    const delivery = await login(base, "entrega", PASS_USER);
    const remove = await login(base, "excluir", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    const publicList = await hit(base, "/api/service-orders", "GET");
    record("TV sem sessão continua lendo o painel", publicList.status === 200, String(publicList.status));

    const readers = [
      ["pátio", patio],
      ["laboratório", lab],
      ["recepção", reception],
      ["orçamentos", orc],
      ["agenda", agenda],
      ["relatórios", reports],
      ["estoque", stock],
      ["boletim", bulletin],
      ["tv", tv],
      ["radar", radar],
      ["acesso completo", full],
    ] as const;
    for (const [name, token] of readers) {
      const listed = await hit(base, "/api/service-orders", "GET", token);
      record(`${name} consulta a lista`, listed.status === 200 && !listed.body.includes("OUT1R99"), `${listed.status}`);
    }
    const deniedReaders = [
      ["sem chave", none],
      ["só início", home],
      ["só ficha", ficha],
    ] as const;
    for (const [name, token] of deniedReaders) {
      const listed = await hit(base, "/api/service-orders", "GET", token);
      record(`${name} não consulta a lista`, listed.status === 403 && listed.code === "permission_denied", `${listed.status} ${listed.code}`);
    }
    const missing = await hit(base, "/api/service-orders", "GET");
    // public TV is the no-session case; invalid token is different
    const invalid = await hit(base, `/api/service-orders/${OS}`, "GET", "sessao-invalida");
    record("sessão inválida não lê a OS", invalid.status === 401, String(invalid.status));
    const failRead = await hit(base, `/api/service-orders/${OS}`, "GET", fail);
    record("falha ao ler permissão não abre a OS", failRead.status === 403 && failRead.code === "permission_denied", `${failRead.status}`);
    void missing;

    const created = await hit(base, "/api/service-orders", "POST", reception, {
      customerId: CUSTOMER,
      orderType: "vehicle",
      plate: "NOV1A23",
      vehicleModel: "Gol",
    });
    const createdRow = tables.service_orders.find((item) => item.plate === "NOV1A23");
    record(
      "recepção cadastra OS do cliente da oficina",
      created.status === 201 && createdRow?.workshop_id === WORKSHOP && createdRow.customer_id === CUSTOMER,
      `${created.status} ${created.body.slice(0, 180)}`
    );
    const foreign = await hit(base, "/api/service-orders", "POST", patio, {
      customerId: CUSTOMER_OTHER,
      orderType: "vehicle",
      plate: "ESTR1A99",
    });
    record(
      "cliente de outra oficina não gera OS",
      foreign.status === 400 && !tables.service_orders.some((item) => item.plate === "ESTR1A99"),
      `${foreign.status}`
    );
    const orcCreate = await hit(base, "/api/service-orders", "POST", orc, {
      customerId: CUSTOMER,
      orderType: "vehicle",
      plate: "ORC1A23",
    });
    record(
      "orçamento não cadastra OS",
      orcCreate.status === 403 && !tables.service_orders.some((item) => item.plate === "ORC1A23"),
      `${orcCreate.status}`
    );

    const beforeStage = String(row(tables, OS)?.status);
    const stage = await hit(base, `/api/service-orders/${OS}`, "PUT", patio, { status: "EM_SERVICO" });
    record(
      "pátio muda a etapa e preserva a placa",
      stage.status === 200 && row(tables, OS)?.status === "EM_SERVICO" && row(tables, OS)?.plate === "ABC1D23",
      `${stage.status} ${row(tables, OS)?.status}`
    );
    const mixed = await hit(base, `/api/service-orders/${OS}`, "PUT", patio, { status: "AGUARDANDO_AVALIACAO", plate: "MIST1A23" });
    record(
      "pátio não grava etapa junto com placa",
      mixed.status === 403 && row(tables, OS)?.status === "EM_SERVICO" && row(tables, OS)?.plate === "ABC1D23",
      `${mixed.status} ${row(tables, OS)?.plate}`
    );
    const extra = await hit(base, `/api/service-orders/${OS}`, "PUT", ficha, { plate: "FICH1A23", workshop_id: OTHER });
    record(
      "campo fora da ficha é ignorado e a oficina permanece",
      extra.status === 200 && row(tables, OS)?.plate === "FICH1A23" && row(tables, OS)?.workshop_id === WORKSHOP,
      `${extra.status} ${row(tables, OS)?.workshop_id}`
    );
    const queixaHit = await hit(base, `/api/service-orders/${OS}`, "PUT", queixa, { issueDescription: "novo relato" });
    const queixaDenied = await hit(base, `/api/service-orders/${OS}`, "PUT", patio, { issueDescription: "relato indevido" });
    record(
      "só quem edita a queixa altera o relato",
      queixaHit.status === 200 &&
        row(tables, OS)?.issue_description === "novo relato" &&
        queixaDenied.status === 403 &&
        row(tables, OS)?.issue_description === "novo relato",
      `${queixaHit.status} ${queixaDenied.status}`
    );
    const km = await hit(base, `/api/service-orders/${OS}`, "PUT", mileage, { mileageKm: "42" });
    const kmDenied = await hit(base, `/api/service-orders/${OS}`, "PUT", ficha, { mileageKm: "99" });
    record(
      "quilometragem exige a chave própria",
      km.status === 200 && row(tables, OS)?.mileage_km === "42" && kmDenied.status === 403 && row(tables, OS)?.mileage_km === "42",
      `${km.status} ${kmDenied.status} ${row(tables, OS)?.mileage_km}`
    );
    const date = await hit(base, `/api/service-orders/${OS}`, "PUT", delivery, { deliveryDate: "2026-12-01" });
    record("data de entrega exige a chave própria", date.status === 200 && row(tables, OS)?.delivery_date === "2026-12-01", `${date.status}`);
    const assigned = await hit(base, `/api/service-orders/${OS}`, "PUT", assign, { assignedTechnician: TECH });
    const assignedDenied = await hit(base, `/api/service-orders/${OS}`, "PUT", patio, { assignedTechnician: PATIO });
    record(
      "atribuição exige a chave de técnico",
      assigned.status === 200 &&
        row(tables, OS)?.assigned_technician === TECH &&
        assignedDenied.status === 403 &&
        row(tables, OS)?.assigned_technician === TECH,
      `${assigned.status} ${assignedDenied.status}`
    );
    const approveHit = await hit(base, `/api/service-orders/${OS}`, "PUT", approve, { status: "ORCAMENTO_APROVADO" });
    const orcMove = await hit(base, `/api/service-orders/${OS}`, "PUT", orc, { status: "EM_SERVICO" });
    record(
      "aprovação muda só o orçamento aprovado",
      approveHit.status === 200 &&
        row(tables, OS)?.status === "ORCAMENTO_APROVADO" &&
        orcMove.status === 403 &&
        row(tables, OS)?.status === "ORCAMENTO_APROVADO",
      `${approveHit.status} ${orcMove.status}`
    );
    const labMove = await hit(base, `/api/service-orders/${OS}`, "PUT", lab, { status: "EM_SERVICO" });
    record("laboratório muda a etapa", labMove.status === 200 && row(tables, OS)?.status === "EM_SERVICO", `${labMove.status}`);
    const archived = await hit(base, `/api/service-orders/${OS_CANCELLED}`, "PUT", archive, { status: "CANCELLED" });
    const patioArchive = await hit(base, `/api/service-orders/${OS}`, "PUT", patio, { status: "CANCELLED" });
    record(
      "arquivo exige a chave e o pátio comum não arquiva",
      archived.status === 200 && patioArchive.status === 403 && row(tables, OS)?.status === "EM_SERVICO",
      `${archived.status} ${patioArchive.status} ${row(tables, OS)?.status}`
    );
    const reopen = await hit(base, `/api/service-orders/${OS_CANCELLED}`, "PUT", reception, { status: "EM_SERVICO" });
    record(
      "recepção reabre OS arquivada",
      reopen.status === 200 && row(tables, OS_CANCELLED)?.status === "EM_SERVICO",
      `${reopen.status} ${row(tables, OS_CANCELLED)?.status}`
    );
    const cross = await hit(base, `/api/service-orders/${OS_OTHER}`, "PUT", full, { plate: "HACK1A23" });
    record(
      "OS de outra oficina não é alterada",
      cross.status !== 200 && row(tables, OS_OTHER)?.plate === "OUT1R99" && row(tables, OS_OTHER)?.workshop_id === OTHER,
      `${cross.status} ${row(tables, OS_OTHER)?.plate}`
    );
    const managerPut = await hit(base, `/api/service-orders/${OS}`, "PUT", manager, { plate: "GER1A23" });
    record("gerência edita a ficha", managerPut.status === 200 && row(tables, OS)?.plate === "GER1A23", `${managerPut.status}`);
    const fullPut = await hit(base, `/api/service-orders/${OS}`, "PUT", full, { issueDescription: "gerência completa" });
    record("acesso completo edita a queixa", fullPut.status === 200 && row(tables, OS)?.issue_description === "gerência completa", `${fullPut.status}`);

    const benchDenied = await hit(base, `/api/service-orders/${OS_MODULE}/bench-slot`, "PUT", patio, { slot: 1 });
    const beforeBench = row(tables, OS_MODULE)?.bench_slot ?? null;
    const bench = await hit(base, `/api/service-orders/${OS_MODULE}/bench-slot`, "PUT", lab, { slot: 3 });
    record(
      "bancada é do laboratório",
      benchDenied.status === 403 && beforeBench == null && bench.status === 200 && row(tables, OS_MODULE)?.bench_slot === 3,
      `${benchDenied.status} ${bench.status} ${row(tables, OS_MODULE)?.bench_slot}`
    );
    const checklistDenied = await hit(base, `/api/service-orders/${OS}/checklist-state`, "PATCH", reports, {
      templateItemId: "item-1",
      state: "complete",
    });
    const checklist = await hit(base, `/api/service-orders/${OS}/checklist-state`, "PATCH", orc, {
      templateItemId: "item-1",
      state: "complete",
    });
    record(
      "checklist fica com pátio, laboratório, recepção e orçamento",
      checklistDenied.status === 403 &&
        checklist.status === 200 &&
        tables.service_order_checklist_checks.some((item) => item.template_item_id === "item-1" && item.state === "complete"),
      `${checklistDenied.status} ${checklist.status}`
    );

    const wrongPassword = await hit(base, `/api/service-orders/${OS}/delete-with-password`, "POST", remove, { password: "errada" });
    const statusAfterWrong = row(tables, OS)?.status;
    const noDeleteKey = await hit(base, `/api/service-orders/${OS}/delete-with-password`, "POST", patio, { password: DELETE_PASSWORD });
    const deleted = await hit(base, `/api/service-orders/${OS}/delete-with-password`, "POST", remove, { password: DELETE_PASSWORD });
    record(
      "exclusão exige chave e senha e não apaga a linha",
      wrongPassword.status === 401 &&
        statusAfterWrong !== "CANCELLED" &&
        noDeleteKey.status === 403 &&
        deleted.status === 200 &&
        row(tables, OS)?.status === "CANCELLED" &&
        tables.service_orders.some((item) => item.id === OS),
      `${wrongPassword.status} ${noDeleteKey.status} ${deleted.status} ${statusAfterWrong} ${row(tables, OS)?.status}`
    );

    const regressions: Array<[string, string, string]> = [
      ["clientes", "/api/customers", "GET"],
      ["agenda", "/api/appointments", "POST"],
      ["orçamentos", `/api/service-orders/${OS}/budgets`, "GET"],
      ["comentários", `/api/service-orders/${OS}/comments`, "GET"],
      ["fotos", `/api/service-orders/${OS}/photos`, "GET"],
      ["estoque", "/api/workshop-parts", "GET"],
      ["estoque ABS", "/api/abs-modules", "GET"],
      ["técnicos", "/api/workshop-technicians", "GET"],
      ["catálogo", "/api/workshop-services", "GET"],
      ["TV administrativa", "/api/tv/slides", "GET"],
      ["boletins", "/api/error-bulletins", "GET"],
      ["relatórios", "/api/reports/technician-services", "GET"],
      ["avisos", "/api/notifications", "POST"],
    ];
    let regressionOk = true;
    const regressionDetail: string[] = [];
    for (const [name, path, method] of regressions) {
      const response = await hit(base, path, method, none);
      if (response.status !== 403) {
        regressionOk = false;
        regressionDetail.push(`${name}:${response.status}`);
      }
    }
    record("as treze famílias continuam negando quem não tem chave", regressionOk, regressionDetail.join(" ") || "403");

    const snapshot = JSON.stringify(row(tables, OS_MODULE));
    const failPut = await hit(base, `/api/service-orders/${OS_MODULE}`, "PUT", fail, { plate: "FALH1A23" });
    record(
      "falha de permissão não grava a OS",
      failPut.status === 403 && JSON.stringify(row(tables, OS_MODULE)) === snapshot,
      `${failPut.status}`
    );

    process.env.SEC03_DISABLE_FAMILIES = "service_orders";
    const rolledList = await hit(base, "/api/service-orders", "GET", none);
    const rolledPut = await hit(base, `/api/service-orders/${OS_MODULE}`, "PUT", patio, { plate: "ROLL1A23" });
    const stillCustomers = await hit(base, "/api/customers", "GET", none);
    record(
      "desligar service_orders reabre a lista e mantém o campo e as outras famílias",
      rolledList.status === 200 &&
        rolledPut.status === 403 &&
        row(tables, OS_MODULE)?.plate == null &&
        stillCustomers.status === 403,
      `${rolledList.status} ${rolledPut.status} ${stillCustomers.status}`
    );
    delete process.env.SEC03_DISABLE_FAMILIES;
    void beforeStage;
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
