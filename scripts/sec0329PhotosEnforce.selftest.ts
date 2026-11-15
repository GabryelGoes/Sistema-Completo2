/**
 * SEC-03.29: fotos e anexos da OS exigem leitura, envio e gestão separados.
 * npm run test:sec0329-photos-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce, findMatchingRules } from "../utils/authorizeRequest.js";
import { isSafeServiceOrderPhotoPath } from "../utils/serviceOrderPhotoGuard.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const PATIO = "22222222-2222-4222-8222-222222222291";
const FICHA = "22222222-2222-4222-8222-222222222292";
const RECEP = "22222222-2222-4222-8222-222222222293";
const LAB = "22222222-2222-4222-8222-222222222294";
const ORC = "22222222-2222-4222-8222-222222222295";
const REPORTS = "22222222-2222-4222-8222-222222222296";
const AGENDA = "22222222-2222-4222-8222-222222222297";
const NONE = "22222222-2222-4222-8222-222222222298";
const FULL = "22222222-2222-4222-8222-222222222299";
const FAIL = "22222222-2222-4222-8222-222222222290";
const OS = "33333333-3333-4333-8333-333333333341";
const OS_OTHER = "33333333-3333-4333-8333-333333333342";
const PASS_USER = "senha-ficticia-sec0329";
const PASS_ADMIN = "gerencia-ficticia-sec0329";
const STAMP = "2026-11-15T12:00:00.000Z";
const OLD_PATH = `${WORKSHOP}/${OS}/antigo.jpg`;
const SECRET_PATH = `${OTHER}/${OS_OTHER}/segredo.jpg`;
const BUCKET = "vehicle-photos";

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
type StoredFile = { bucket: string; path: string; contentType: string };

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
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function matchesFilter(row: Row, key: string, raw: string): boolean {
  const value = row[key];
  const text = value == null ? "" : String(value);
  if (raw.startsWith("eq.")) return text === raw.slice(3);
  if (raw.startsWith("neq.")) return text !== raw.slice(4);
  if (raw === "is.null") return value == null || text === "";
  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    const set = new Set(raw.slice(4, -1).split(",").map((item) => item.replace(/^"|"$/g, "")));
    return set.has(text);
  }
  if (raw.startsWith("ilike.")) return text.toLowerCase() === raw.slice(6).toLowerCase();
  return false;
}

async function startMock(
  tables: Record<string, Row[]>,
  files: StoredFile[],
  signed: string[]
): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? (JSON.parse(raw) as Row) : {};

      if (url.pathname.startsWith("/storage/v1/")) {
        const sign = url.pathname.match(/^\/storage\/v1\/object\/upload\/sign\/([^/]+)\/(.+)$/);
        if (req.method === "POST" && sign) {
          const path = decodeURIComponent(sign[2]);
          signed.push(path);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ url: `/object/upload/sign/${sign[1]}/${sign[2]}?token=tok-ficticio` }));
          return;
        }
        const list = url.pathname.match(/^\/storage\/v1\/object\/list\/([^/]+)$/);
        if (req.method === "POST" && list) {
          const prefix = String(body.prefix || "");
          const names = files
            .filter((file) => file.bucket === list[1] && file.path.startsWith(`${prefix}/`))
            .map((file) => ({ name: file.path.slice(prefix.length + 1) }));
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(names));
          return;
        }
        if (req.method === "DELETE" && url.pathname === `/storage/v1/object/${BUCKET}`) {
          const prefixes = Array.isArray(body.prefixes) ? body.prefixes.map(String) : [];
          const removed = files.filter((file) => prefixes.includes(file.path));
          for (let i = files.length - 1; i >= 0; i -= 1) {
            if (prefixes.includes(files[i].path)) files.splice(i, 1);
          }
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(removed));
          return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "storage" }));
        return;
      }

      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (table.startsWith("rpc/")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "PGRST202", message: "function does not exist" }));
        return;
      }
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
      const matches = (row: Row) => filters.every(([key, rawValue]) => matchesFilter(row, key, rawValue));
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
      if (req.method === "POST") {
        const incoming = (Array.isArray(body) ? body : [body]) as Row[];
        const stored = incoming.map((row) => {
          const conflict = url.searchParams.get("on_conflict");
          if (conflict) {
            const keys = conflict.split(",");
            const found = tables[table].find((item) => keys.every((key) => item[key] === row[key]));
            if (found) {
              Object.assign(found, row);
              return project(found);
            }
          }
          const created = { id: row.id ?? crypto.randomUUID(), created_at: STAMP, ...row };
          tables[table].push(created);
          return project(created);
        });
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? stored[0] ?? {} : stored));
        return;
      }
      if (req.method === "PATCH") {
        const found = tables[table].filter(matches);
        if (wantsObject && found.length !== 1) {
          res.writeHead(406, { "content-type": "application/json" });
          res.end(JSON.stringify({ code: "PGRST116", message: "JSON object requested" }));
          return;
        }
        for (const row of found) Object.assign(row, body);
        const projected = found.map(project);
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
    } catch {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: "mock" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

type Hit = { status: number; body: string };

async function hit(base: string, path: string, method: string, token?: string, body?: unknown): Promise<Hit> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.text() };
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

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const off = production.families.filter((family) => family.mode === "off").map((family) => family.id);
  const live = findMatchingRules(production, "GET", `/api/service-orders/${OS}/live`);
  const parts = findMatchingRules(production, "GET", "/api/workshop-parts/peca-1/photos");
  const abs = findMatchingRules(production, "POST", "/api/abs-modules/ABC/photo");
  const tv = findMatchingRules(production, "POST", "/api/tv/media/upload-init");
  record(
    "photos entra em enforce e as outras dez permanecem",
    enforced.join(",") === "customers,appointments,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" &&
      off.join(",") === "service_orders,notifications,quality_radar,rda" &&
      production.rules.some((rule) => rule.id === "photo_upload") &&
      production.rules.some((rule) => rule.id === "photo_delete") &&
      live.every((rule) => rule.family !== "photos") &&
      parts.every((rule) => rule.family === "parts_stock") &&
      abs.every((rule) => rule.family !== "photos") &&
      tv.every((rule) => rule.family !== "photos"),
    `enforce=${enforced.join(",")}`
  );
  record(
    "desligar photos não abre as outras famílias",
    authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "photos" }) === true,
    "reversão"
  );
  record(
    "caminho com .. não pertence à OS",
    isSafeServiceOrderPhotoPath(WORKSHOP, OS, `${WORKSHOP}/${OS}/../../${OTHER}/segredo.jpg`) === false &&
      isSafeServiceOrderPhotoPath(WORKSHOP, OS, OLD_PATH) === true,
    "guarda"
  );

  const files: StoredFile[] = [
    { bucket: BUCKET, path: OLD_PATH, contentType: "image/jpeg" },
    { bucket: BUCKET, path: SECRET_PATH, contentType: "image/jpeg" },
  ];
  const signed: string[] = [];
  const tables: Record<string, Row[]> = {
    workshop_settings: [
      { workshop_id: WORKSHOP, key: "admin_password", value: hashPassword(PASS_ADMIN), updated_at: STAMP },
    ],
    workshop_system_users: [
      user(PATIO, "patio", { access_patio: true }),
      user(FICHA, "ficha", { patio_edit_ficha: true }),
      user(RECEP, "recepcao", { access_reception: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(ORC, "orcamento", { access_orcamentos: true }),
      user(REPORTS, "relatorio", { access_relatorios: true }),
      user(AGENDA, "agenda", { access_agenda: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { patio_edit_ficha: true, access_patio: true }),
    ],
    service_orders: [
      { id: OS, workshop_id: WORKSHOP, status: "EM_SERVICO", plate: "ABC1D23" },
      { id: OS_OTHER, workshop_id: OTHER, status: "EM_SERVICO", plate: "XYZ9Z99" },
    ],
    service_order_photo_items: [
      {
        id: "item-antigo",
        workshop_id: WORKSHOP,
        service_order_id: OS,
        folder_id: "pasta-1",
        storage_path: OLD_PATH,
        file_name: "antigo.jpg",
        kind: "photo",
        created_at: STAMP,
      },
    ],
    service_order_photo_folders: [],
    workshop_parts: [{ id: "peca-1", workshop_id: WORKSHOP, name: "Sensor", quantity: 7 }],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    customers: [],
  };

  const mock = await startMock(tables, files, signed);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec0329-local";
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
  const hasFile = (path: string) => files.some((file) => file.path === path);

  try {
    const patio = await login(base, "patio", PASS_USER);
    const ficha = await login(base, "ficha", PASS_USER);
    const recep = await login(base, "recepcao", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const orc = await login(base, "orcamento", PASS_USER);
    const reports = await login(base, "relatorio", PASS_USER);
    const agenda = await login(base, "agenda", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const gerencia = await login(base, "Gerência", PASS_ADMIN);

    const anon = await hit(base, `/api/service-orders/${OS}/photos`, "GET");
    const invalid = await hit(base, `/api/service-orders/${OS}/photos`, "GET", "sessao-invalida");
    record("sessão ausente ou inválida", anon.status === 401 && invalid.status === 401, `${anon.status}/${invalid.status}`);

    const listed = await hit(base, `/api/service-orders/${OS}/photos`, "GET", patio);
    const listedLab = await hit(base, `/api/service-orders/${OS}/photos`, "GET", lab);
    const listedRecep = await hit(base, `/api/service-orders/${OS}/photos`, "GET", recep);
    const listedOrc = await hit(base, `/api/service-orders/${OS}/photos`, "GET", orc);
    const listedReports = await hit(base, `/api/service-orders/${OS}/photos`, "GET", reports);
    record(
      "pátio, laboratório, recepção, orçamentos e relatórios leem a foto antiga",
      [listed, listedLab, listedRecep, listedOrc, listedReports].every(
        (item) => item.status === 200 && item.body.includes("antigo.jpg") && item.body.includes("/object/public/")
      ),
      [listed, listedLab, listedRecep, listedOrc, listedReports].map((item) => item.status).join("/")
    );
    const listedAgenda = await hit(base, `/api/service-orders/${OS}/photos`, "GET", agenda);
    const listedNone = await hit(base, `/api/service-orders/${OS}/photos`, "GET", none);
    record("agenda e sessão sem chave não leem", listedAgenda.status === 403 && listedNone.status === 403, `${listedAgenda.status}/${listedNone.status}`);
    const otherList = await hit(base, `/api/service-orders/${OS_OTHER}/photos`, "GET", patio);
    record(
      "leitura de outra oficina não devolve o arquivo",
      otherList.status === 404 && !otherList.body.includes("segredo") && hasFile(SECRET_PATH),
      String(otherList.status)
    );

    const beforeSigns = signed.length;
    const uploaded = await hit(base, `/api/service-orders/${OS}/photos/upload-init`, "POST", recep, {
      fileName: "entrada_os.jpg",
      fileSize: 1200,
      contentType: "image/jpeg",
    });
    const byLab = await hit(base, `/api/service-orders/${OS}/photos/upload-init`, "POST", lab, {
      fileName: "modulo.png",
      fileSize: 800,
      contentType: "image/png",
    });
    const byPatio = await hit(base, `/api/service-orders/${OS}/photos/upload-init`, "POST", patio, {
      fileName: "comentario.webp",
      fileSize: 500,
      contentType: "image/webp",
    });
    record(
      "recepção, laboratório e pátio preparam o envio",
      uploaded.status === 200 &&
        byLab.status === 200 &&
        byPatio.status === 200 &&
        uploaded.body.includes("tok-ficticio") &&
        signed.length === beforeSigns + 3 &&
        signed.every((path) => path.startsWith(`${WORKSHOP}/${OS}/`)),
      `${uploaded.status}/${byLab.status}/${byPatio.status}`
    );
    const reportUpload = await hit(base, `/api/service-orders/${OS}/photos/upload-init`, "POST", reports, {
      fileName: "relatorio.jpg",
      fileSize: 100,
      contentType: "image/jpeg",
    });
    const orcUpload = await hit(base, `/api/service-orders/${OS}/photos/upload-init`, "POST", orc, {
      fileName: "orcamento.jpg",
      fileSize: 100,
      contentType: "image/jpeg",
    });
    record(
      "relatório e orçamento não enviam",
      reportUpload.status === 403 && orcUpload.status === 403 && signed.length === beforeSigns + 3,
      `${reportUpload.status}/${orcUpload.status}`
    );

    const invalidType = await hit(base, `/api/service-orders/${OS}/photos/upload-init`, "POST", patio, {
      fileName: "pagina.html",
      fileSize: 100,
      contentType: "text/html",
    });
    const traversal = await hit(base, `/api/service-orders/${OS}/photos/upload-init`, "POST", patio, {
      fileName: "foto.jpg",
      fileSize: 100,
      contentType: "image/jpeg",
      replacePath: `${WORKSHOP}/${OS}/../../${OTHER}/segredo.jpg`,
    });
    record(
      "tipo inválido e caminho atravessado não gravam",
      invalidType.status === 400 &&
        traversal.status === 403 &&
        signed.length === beforeSigns + 3 &&
        hasFile(SECRET_PATH),
      `${invalidType.status}/${traversal.status}`
    );

    const complete = await hit(base, `/api/service-orders/${OS}/photos/upload-complete`, "POST", recep, {
      path: `${WORKSHOP}/${OS}/170000_entrada_os.jpg`,
      folderSlug: "entrada",
    });
    record(
      "a confirmação grava o registro da foto nova",
      complete.status === 201 &&
        tables.service_order_photo_items.some((item) => item.storage_path === `${WORKSHOP}/${OS}/170000_entrada_os.jpg`),
      String(complete.status)
    );

    const deniedDelete = await hit(base, `/api/service-orders/${OS}/photos`, "DELETE", patio, { path: OLD_PATH });
    const deniedRecep = await hit(base, `/api/service-orders/${OS}/photos`, "DELETE", recep, { path: OLD_PATH });
    record(
      "quem só envia não exclui a foto de outro",
      deniedDelete.status === 403 &&
        deniedRecep.status === 403 &&
        hasFile(OLD_PATH) &&
        tables.service_order_photo_items.some((item) => item.id === "item-antigo"),
      `${deniedDelete.status}/${deniedRecep.status}`
    );
    const managed = await hit(base, `/api/service-orders/${OS}/photos`, "DELETE", ficha, { path: OLD_PATH });
    record(
      "editar a ficha exclui o arquivo e o registro",
      managed.status === 204 &&
        !hasFile(OLD_PATH) &&
        !tables.service_order_photo_items.some((item) => item.id === "item-antigo"),
      String(managed.status)
    );

    files.push({ bucket: BUCKET, path: `${WORKSHOP}/${OS}/gerencia.jpg`, contentType: "image/jpeg" });
    tables.service_order_photo_items.push({
      id: "item-gerencia",
      workshop_id: WORKSHOP,
      service_order_id: OS,
      storage_path: `${WORKSHOP}/${OS}/gerencia.jpg`,
      file_name: "gerencia.jpg",
      kind: "photo",
    });
    const byAdmin = await hit(base, `/api/service-orders/${OS}/photos`, "DELETE", gerencia, {
      path: `${WORKSHOP}/${OS}/gerencia.jpg`,
    });
    files.push({ bucket: BUCKET, path: `${WORKSHOP}/${OS}/total.jpg`, contentType: "image/jpeg" });
    tables.service_order_photo_items.push({
      id: "item-total",
      workshop_id: WORKSHOP,
      service_order_id: OS,
      storage_path: `${WORKSHOP}/${OS}/total.jpg`,
      file_name: "total.jpg",
      kind: "photo",
    });
    const byFull = await hit(base, `/api/service-orders/${OS}/photos`, "DELETE", full, {
      path: `${WORKSHOP}/${OS}/total.jpg`,
    });
    record(
      "Gerência e acesso total excluem",
      byAdmin.status === 204 &&
        byFull.status === 204 &&
        !hasFile(`${WORKSHOP}/${OS}/gerencia.jpg`) &&
        !hasFile(`${WORKSHOP}/${OS}/total.jpg`),
      `${byAdmin.status}/${byFull.status}`
    );

    const cross = await hit(base, `/api/service-orders/${OS}/photos`, "DELETE", ficha, { path: SECRET_PATH });
    record("não há exclusão cruzada entre oficinas", cross.status === 403 && hasFile(SECRET_PATH), String(cross.status));

    const failWrite = await hit(base, `/api/service-orders/${OS}/photos/upload-init`, "POST", fail, {
      fileName: "falha.jpg",
      fileSize: 100,
      contentType: "image/jpeg",
    });
    record(
      "falha de permissão não prepara upload",
      failWrite.status === 403 && !signed.some((path) => path.endsWith("falha.jpg")),
      String(failWrite.status)
    );

    const folder = await hit(base, `/api/service-orders/${OS}/photo-folders`, "POST", ficha, { name: "Diagnóstico" });
    const folderDenied = await hit(base, `/api/service-orders/${OS}/photo-folders`, "POST", patio, { name: "Não pode" });
    record(
      "organizar pasta exige editar a ficha",
      folder.status === 201 &&
        tables.service_order_photo_folders.some((item) => item.name === "Diagnóstico") &&
        folderDenied.status === 403 &&
        !tables.service_order_photo_folders.some((item) => item.name === "Não pode"),
      `${folder.status}/${folderDenied.status}`
    );

    const stock = await hit(base, "/api/workshop-parts", "GET", none);
    const customers = await hit(base, "/api/customers", "GET", none);
    const comments = await hit(base, `/api/service-orders/${OS}/comments`, "GET", none);
    const budgets = await hit(base, `/api/service-orders/${OS}/budgets`, "POST", none, { diagnosis: "Não" });
    const appointment = await hit(base, "/api/appointments", "POST", none, { title: "Não" });
    const bulletins = await hit(base, "/api/error-bulletins", "GET", none);
    const reportsRoute = await hit(base, "/api/reports/technician-services", "GET", none);
    const technicians = await hit(base, "/api/workshop-technicians", "GET", none);
    const catalogs = await hit(base, "/api/workshop-services", "POST", none, { name: "Não" });
    const tvRoute = await hit(base, "/api/tv/manage", "GET", none);
    record(
      "as dez famílias já protegidas continuam negando a sessão sem chave",
      [stock, customers, comments, budgets, appointment, bulletins, reportsRoute, technicians, catalogs, tvRoute].every(
        (item) => item.status === 403
      ),
      [stock, customers, comments, budgets, appointment, bulletins, reportsRoute, technicians, catalogs, tvRoute]
        .map((item) => item.status)
        .join("/")
    );
    const rda = await hit(base, "/api/rda/health", "GET", none);
    record("RDA não recebe bloqueio da família de fotos", rda.status !== 403, String(rda.status));
    record("a peça não se move com as fotos", tables.workshop_parts[0].quantity === 7, String(tables.workshop_parts[0].quantity));

    process.env.SEC03_DISABLE_FAMILIES = "photos";
    const rolled = await hit(base, `/api/service-orders/${OS}/photos`, "GET", agenda);
    const stockStill = await hit(base, "/api/workshop-parts", "GET", none);
    delete process.env.SEC03_DISABLE_FAMILIES;
    const closed = await hit(base, `/api/service-orders/${OS}/photos`, "GET", agenda);
    record(
      "SEC03_DISABLE_FAMILIES=photos abre só fotos",
      rolled.status === 200 && stockStill.status === 403 && closed.status === 403,
      `${rolled.status}/${stockStill.status}/${closed.status}`
    );
  } finally {
    delete process.env.SEC03_DISABLE_FAMILIES;
    server.close();
    mock.server.close();
  }

  console.log(`\n${passed} ok, ${failed} falhas`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
