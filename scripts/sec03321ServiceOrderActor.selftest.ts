/**
 * SEC-03.32.1: a autoria do PUT da OS sai da sessão, não do body.
 * Oficinas, funcionários e OS são fictícios.
 * npm run test:sec03321-service-order-actor
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { resolveServiceOrderNotificationActor } from "../utils/serviceOrderActor.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const PATIO = "22222222-2222-4222-8222-222222222501";
const LAB = "22222222-2222-4222-8222-222222222502";
const RECEP = "22222222-2222-4222-8222-222222222503";
const FULL = "22222222-2222-4222-8222-222222222504";
const COMMON = "22222222-2222-4222-8222-222222222505";
const QUEIXA = "22222222-2222-4222-8222-222222222506";
const DELIVERY = "22222222-2222-4222-8222-222222222507";
const OTHER = "22222222-2222-4222-8222-222222222508";
const BLANK = "22222222-2222-4222-8222-222222222509";
const NAMEFAIL = "22222222-2222-4222-8222-222222222510";
const PASS_USER = "senha-ficticia-sec03321";
const PASS_ADMIN = "gerencia-ficticia-sec03321";
const OS = "os-sec03321";
const OS_MODULE = "os-sec03321-module";
const FORGED_NAME = "Nome Forjado";
const FORGED_SLUG = OTHER;

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

function user(
  id: string,
  username: string,
  displayName: string,
  permissions: Record<string, boolean>,
  technician = false
): Row {
  return {
    id,
    workshop_id: WORKSHOP,
    username,
    display_name: displayName,
    password_hash: hashPassword(PASS_USER),
    permissions,
    is_technician: technician,
    job_title: null,
    photo_url: null,
    accent_color: null,
    created_at: "2026-11-15T12:00:00.000Z",
  };
}

function matchesFilter(row: Row, key: string, raw: string): boolean {
  const value = row[key];
  const text = value == null ? "" : String(value);
  if (raw.startsWith("eq.")) return text === raw.slice(3);
  if (raw.startsWith("neq.")) return text !== raw.slice(4);
  if (raw.startsWith("gte.")) return text >= raw.slice(4);
  if (raw === "is.null") return value == null;
  if (raw.startsWith("in.(") && raw.endsWith(")")) return new Set(raw.slice(4, -1).split(",")).has(text);
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
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "PGRST202", message: "function does not exist" }));
        return;
      }
      const table = resource;
      if (!tables[table]) tables[table] = [];
      const body = raw.length ? (JSON.parse(raw.toString("utf8")) as Row) : {};
      const select = url.searchParams.get("select") || "";
      const id = url.searchParams.get("id") || "";
      if (
        table === "workshop_system_users" &&
        select.includes("display_name") &&
        select.includes("is_technician") &&
        id === `eq.${NAMEFAIL}`
      ) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "falha ficticia de identidade" }));
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
      if (req.method === "GET") {
        const projected = tables[table].filter(matches).map(project);
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
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(projected));
        return;
      }
      if (req.method === "POST") {
        const incoming = (Array.isArray(body) ? body : [body]) as Row[];
        const stored = incoming.map((row) => {
          const created = { id: row.id ?? crypto.randomUUID(), created_at: new Date().toISOString(), ...row };
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

function order(id: string, status: string, orderType = "vehicle"): Row {
  return {
    id,
    workshop_id: WORKSHOP,
    customer_id: "cliente-sec03321",
    os_number: id,
    status,
    order_type: orderType,
    plate: orderType === "vehicle" ? "ABC1D23" : null,
    vehicle_model: "Fusca",
    issue_description: "barulho",
    delivery_date: null,
    created_at: "2026-11-15T12:00:00.000Z",
    updated_at: "2026-11-15T12:00:00.000Z",
  };
}

function notesSince(tables: Record<string, Row[]>, from: number): Row[] {
  return tables.notifications.slice(from);
}

function forged(rows: Row[]): boolean {
  return JSON.stringify(rows).includes(FORGED_NAME) || JSON.stringify(rows).includes(FORGED_SLUG);
}

async function main() {
  const management = resolveServiceOrderNotificationActor({
    role: "admin",
    adminDisplayName: "Rei do ABS",
  });
  const full = resolveServiceOrderNotificationActor({
    role: "user",
    userId: FULL,
    displayName: "Acesso Completo",
    fullAccess: true,
    isTechnician: true,
    permissions: { full_access: true, access_patio: true },
  });
  const patio = resolveServiceOrderNotificationActor({
    role: "user",
    userId: PATIO,
    displayName: "Técnico do Pátio",
    isTechnician: true,
    permissions: { access_patio: true },
  });
  const lab = resolveServiceOrderNotificationActor({
    role: "user",
    userId: LAB,
    username: "lab",
    isTechnician: true,
    permissions: { access_laboratorio: true },
  });
  const reception = resolveServiceOrderNotificationActor({
    role: "user",
    userId: RECEP,
    displayName: "Recepção",
    permissions: { access_reception: true },
  });
  const employee = resolveServiceOrderNotificationActor({
    role: "user",
    userId: COMMON,
    displayName: "Funcionário Comum",
    permissions: { access_patio: true },
  });
  const blank = resolveServiceOrderNotificationActor({
    role: "user",
    userId: BLANK,
    displayName: "  ",
    username: "",
    permissions: { access_patio: true },
  });
  record(
    "sessão separa Gerência, acesso completo, pátio, laboratório, recepção e funcionário",
    management.ok &&
      management.audience === "technicians" &&
      management.area === "management" &&
      full.ok &&
      full.audience === "management" &&
      full.area === "full_access" &&
      patio.ok &&
      patio.area === "patio" &&
      lab.ok &&
      lab.area === "laboratory" &&
      lab.displayName === "lab" &&
      reception.ok &&
      reception.area === "reception" &&
      employee.ok &&
      employee.area === "employee" &&
      employee.audience === "management" &&
      blank.ok === false,
    `${management.ok} ${full.ok} ${patio.ok} ${lab.ok}`
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

  const adminTypes = JSON.stringify(["stage_change", "complaint_edited", "delivery_date_changed", "lab_sem_conserto"]);
  const subscribers = JSON.stringify([
    { systemUserId: PATIO, notificationTypes: ["stage_change", "complaint_edited", "delivery_date_changed", "lab_sem_conserto"] },
  ]);
  const tables: Record<string, Row[]> = {
    workshop_settings: [
      { workshop_id: WORKSHOP, key: "admin_password", value: PASS_ADMIN },
      { workshop_id: WORKSHOP, key: "admin_display_name", value: "Rei do ABS" },
      { workshop_id: WORKSHOP, key: "system_notifications_admin_types", value: adminTypes },
      { workshop_id: WORKSHOP, key: "system_notifications_user_subscribers", value: subscribers },
    ],
    device_sessions: [],
    workshop_system_users: [
      user(PATIO, "patio", "Técnico do Pátio", { access_patio: true }, true),
      user(LAB, "lab", "Técnico do Laboratório", { access_laboratorio: true }, true),
      user(RECEP, "recepcao", "Recepção", { access_reception: true }),
      user(FULL, "completo", "Acesso Completo", { full_access: true }),
      user(COMMON, "comum", "Funcionário Comum", { access_patio: true }),
      user(QUEIXA, "queixa", "Editor da Queixa", { patio_edit_queixa: true }),
      user(DELIVERY, "entrega", "Editor da Entrega", { patio_edit_delivery_date: true }),
      user(OTHER, "outro", "Outro Funcionário", { access_patio: true }, true),
      user(BLANK, "semnome", "Temporário", { access_patio: true }),
      user(NAMEFAIL, "falhanome", "Falha de Nome", { access_patio: true }),
    ],
    customers: [{ id: "cliente-sec03321", workshop_id: WORKSHOP, name: "Cliente ficticio" }],
    service_orders: [order(OS, "AGUARDANDO_AVALIACAO"), order(OS_MODULE, "AGUARDANDO_AVALIACAO", "module")],
    service_order_stage_events: [],
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
    const patioToken = await login(base, "patio", PASS_USER);
    const labToken = await login(base, "lab", PASS_USER);
    const recepToken = await login(base, "recepcao", PASS_USER);
    const fullToken = await login(base, "completo", PASS_USER);
    const commonToken = await login(base, "comum", PASS_USER);
    const queixaToken = await login(base, "queixa", PASS_USER);
    const deliveryToken = await login(base, "entrega", PASS_USER);
    const blankToken = await login(base, "semnome", PASS_USER);
    const failToken = await login(base, "falhanome", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    const forge = {
      actor: "admin",
      actorTechnicianSlug: FORGED_SLUG,
      actorTechnicianName: FORGED_NAME,
      actorDisplayName: FORGED_NAME,
    };
    const beforePatio = tables.notifications.length;
    const patioHit = await hit(base, `/api/service-orders/${OS}`, "PUT", patioToken, { status: "EM_SERVICO", ...forge });
    const patioNotes = notesSince(tables, beforePatio);
    const patioEvent = tables.service_order_stage_events.find((row) => row.service_order_id === OS && row.to_status === "EM_SERVICO");
    record(
      "técnico do pátio avisa a Gerência com o próprio nome",
      patioHit.status === 200 &&
        tables.service_orders.find((row) => row.id === OS)?.status === "EM_SERVICO" &&
        patioNotes.length === 1 &&
        patioNotes[0].target_type === "admin" &&
        patioNotes[0].type === "stage_change" &&
        (patioNotes[0].payload as Row).technician_name === "Técnico do Pátio" &&
        (patioNotes[0].payload as Row).technician_user_id === PATIO &&
        !forged(patioNotes) &&
        patioEvent?.actor_user_id === PATIO,
      `${patioHit.status} ${patioNotes.length} ${JSON.stringify(patioNotes[0] || {})}`
    );

    const beforeManager = tables.notifications.length;
    const managerHit = await hit(base, `/api/service-orders/${OS}`, "PUT", manager, {
      status: "AGUARDANDO_AVALIACAO",
      actor: "technician",
      actorTechnicianSlug: FORGED_SLUG,
      actorTechnicianName: FORGED_NAME,
    });
    const managerNotes = notesSince(tables, beforeManager);
    record(
      "Gerência avisa o técnico inscrito e ignora o nome forjado",
      managerHit.status === 200 &&
        managerNotes.length === 1 &&
        managerNotes[0].target_type === "technician" &&
        managerNotes[0].target_slug === PATIO &&
        managerNotes.every((row) => row.target_type !== "admin") &&
        !forged(managerNotes),
      `${managerHit.status} ${JSON.stringify(managerNotes)}`
    );

    const beforeFull = tables.notifications.length;
    const fullHit = await hit(base, `/api/service-orders/${OS}`, "PUT", fullToken, { status: "EM_SERVICO", actor: "admin", actorDisplayName: FORGED_NAME });
    const fullNotes = notesSince(tables, beforeFull);
    record(
      "acesso completo não vira Gerência nem escolhe destinatário",
      fullHit.status === 200 &&
        fullNotes.length === 1 &&
        fullNotes[0].target_type === "admin" &&
        (fullNotes[0].payload as Row).technician_name === "Acesso Completo" &&
        (fullNotes[0].payload as Row).technician_user_id === FULL &&
        !forged(fullNotes),
      `${fullHit.status} ${JSON.stringify(fullNotes)}`
    );

    const beforeCommon = tables.notifications.length;
    const commonHit = await hit(base, `/api/service-orders/${OS}`, "PUT", commonToken, { status: "AGUARDANDO_AVALIACAO" });
    const commonNotes = notesSince(tables, beforeCommon);
    record(
      "funcionário comum autorizado avisa a Gerência sem campos de autoria",
      commonHit.status === 200 &&
        commonNotes.length === 1 &&
        commonNotes[0].target_type === "admin" &&
        (commonNotes[0].payload as Row).technician_name === "Funcionário Comum" &&
        (commonNotes[0].payload as Row).technician_user_id === COMMON,
      `${commonHit.status} ${JSON.stringify(commonNotes)}`
    );

    const beforeRecep = tables.notifications.length;
    const recepHit = await hit(base, `/api/service-orders/${OS}`, "PUT", recepToken, {
      status: "EM_SERVICO",
      actor: "admin",
      actorTechnicianName: FORGED_NAME,
    });
    const recepNotes = notesSince(tables, beforeRecep);
    record(
      "recepção não se declara Gerência",
      recepHit.status === 200 &&
        recepNotes.length === 1 &&
        recepNotes[0].target_type === "admin" &&
        (recepNotes[0].payload as Row).technician_name === "Recepção" &&
        !forged(recepNotes),
      `${recepHit.status} ${JSON.stringify(recepNotes)}`
    );

    const beforeLab = tables.notifications.length;
    const labHit = await hit(base, `/api/service-orders/${OS_MODULE}`, "PUT", labToken, {
      status: "SEM_CONSERTO",
      actor: "admin",
      actorTechnicianSlug: FORGED_SLUG,
      actorTechnicianName: FORGED_NAME,
    });
    const labNotes = notesSince(tables, beforeLab);
    const labEvent = tables.service_order_stage_events.find((row) => row.service_order_id === OS_MODULE);
    record(
      "laboratório gera o alerta de sem conserto com a própria identidade",
      labHit.status === 200 &&
        tables.service_orders.find((row) => row.id === OS_MODULE)?.status === "SEM_CONSERTO" &&
        labNotes.length === 1 &&
        labNotes[0].type === "lab_sem_conserto" &&
        labNotes[0].target_type === "admin" &&
        (labNotes[0].payload as Row).technician_name === "Técnico do Laboratório" &&
        (labNotes[0].payload as Row).technician_user_id === LAB &&
        labEvent?.actor_user_id === LAB &&
        !forged(labNotes),
      `${labHit.status} ${JSON.stringify(labNotes)}`
    );

    const beforeQueixa = tables.notifications.length;
    const queixaHit = await hit(base, `/api/service-orders/${OS}`, "PUT", queixaToken, {
      issueDescription: "relato verdadeiro",
      actorTechnicianName: FORGED_NAME,
    });
    const queixaNotes = notesSince(tables, beforeQueixa);
    record(
      "queixa continua avisando a Gerência com o editor real",
      queixaHit.status === 200 &&
        tables.service_orders.find((row) => row.id === OS)?.issue_description === "relato verdadeiro" &&
        queixaNotes.length === 1 &&
        queixaNotes[0].type === "complaint_edited" &&
        queixaNotes[0].target_type === "admin" &&
        (queixaNotes[0].payload as Row).technician_name === "Editor da Queixa",
      `${queixaHit.status} ${JSON.stringify(queixaNotes)}`
    );

    const beforeDelivery = tables.notifications.length;
    const deliveryHit = await hit(base, `/api/service-orders/${OS}`, "PUT", deliveryToken, { deliveryDate: "2026-12-20" });
    const deliveryNotes = notesSince(tables, beforeDelivery);
    record(
      "entrega continua avisando a Gerência",
      deliveryHit.status === 200 &&
        deliveryNotes.length === 1 &&
        deliveryNotes[0].type === "delivery_date_changed" &&
        deliveryNotes[0].target_type === "admin" &&
        (deliveryNotes[0].payload as Row).technician_name === "Editor da Entrega",
      `${deliveryHit.status} ${JSON.stringify(deliveryNotes)}`
    );

    const beforeDenied = tables.notifications.length;
    const statusBeforeDenied = tables.service_orders.find((row) => row.id === OS)?.status;
    const denied = await hit(base, `/api/service-orders/${OS}`, "PUT", commonToken, {
      plate: "FORJ1A23",
      actor: "admin",
      actorTechnicianName: FORGED_NAME,
    });
    record(
      "operação negada não grava OS nem aviso",
      denied.status === 403 &&
        tables.service_orders.find((row) => row.id === OS)?.plate === "ABC1D23" &&
        tables.service_orders.find((row) => row.id === OS)?.status === statusBeforeDenied &&
        tables.notifications.length === beforeDenied,
      `${denied.status} ${tables.notifications.length}`
    );

    const blankRow = tables.workshop_system_users.find((row) => row.id === BLANK);
    if (blankRow) {
      blankRow.display_name = "";
      blankRow.username = "";
    }
    const beforeBlank = JSON.stringify(tables.service_orders.find((row) => row.id === OS));
    const beforeBlankNotes = tables.notifications.length;
    const blankHit = await hit(base, `/api/service-orders/${OS}`, "PUT", blankToken, { status: "ORCAMENTO_APROVADO", actor: "admin" });
    record(
      "identidade sem nome não grava nem gera aviso privilegiado",
      blankHit.status === 403 &&
        blankHit.code === "permission_denied" &&
        JSON.stringify(tables.service_orders.find((row) => row.id === OS)) === beforeBlank &&
        tables.notifications.length === beforeBlankNotes,
      `${blankHit.status} ${blankHit.code}`
    );

    const beforeFail = JSON.stringify(tables.service_orders.find((row) => row.id === OS));
    const beforeFailNotes = tables.notifications.length;
    const failHit = await hit(base, `/api/service-orders/${OS}`, "PUT", failToken, { status: "EM_SERVICO", actor: "technician", actorTechnicianName: FORGED_NAME });
    record(
      "falha ao resolver a identidade não grava",
      failHit.status === 403 &&
        JSON.stringify(tables.service_orders.find((row) => row.id === OS)) === beforeFail &&
        tables.notifications.length === beforeFailNotes &&
        !JSON.stringify(tables.notifications).includes(FORGED_NAME),
      `${failHit.status}`
    );
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
