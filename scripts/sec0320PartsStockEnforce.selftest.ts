/**
 * SEC-03.20: bloqueio real do estoque de peças, por HTTP.
 * Usuários, peças, fornecedores e OS são fictícios. Não imprime credencial.
 * npm run test:sec0320-parts-stock-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";
import { authAllowsToolPermission } from "../services/rdaIntelligence/permissions.js";
import { RDA_PRODUCTION_TOOLS } from "../services/rdaIntelligence/tools/definitions.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const PATIO = "22222222-2222-4222-8222-222222222261";
const LAB = "22222222-2222-4222-8222-222222222262";
const ORC = "22222222-2222-4222-8222-222222222263";
const STOCK = "22222222-2222-4222-8222-222222222264";
const REL = "22222222-2222-4222-8222-222222222265";
const NONE = "22222222-2222-4222-8222-222222222266";
const FULL = "22222222-2222-4222-8222-222222222267";
const FAIL = "22222222-2222-4222-8222-222222222268";
const PASS_USER = "senha-ficticia-sec0320";
const PASS_ADMIN = "gerencia-ficticia-sec0320";
const STOCK_GUARD = "estoque-ficticio";
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
      if (url.pathname.includes("/rpc/")) {
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "PGRST202", message: "apply_workshop_part_stock_outbound not found" }));
        return;
      }
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
  if (text.startsWith("{") || text.startsWith("[")) {
    try {
      const json = JSON.parse(text) as { code?: unknown };
      if (json && typeof json === "object" && !Array.isArray(json) && typeof json.code === "string") code = json.code;
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

function partQty(tables: Record<string, Row[]>, id: string): number {
  const row = tables.workshop_parts.find((item) => item.id === id);
  return Number(row?.stock_qty ?? NaN);
}

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const shadow = production.families.filter((family) => family.mode === "shadow").map((family) => family.id);
  const stockTool = RDA_PRODUCTION_TOOLS.find((tool) => tool.id === "rda_search_stock_parts");
  const stockTools = RDA_PRODUCTION_TOOLS.filter((tool) => tool.requiredPermission === "access_estoque_pecas");
  record(
    "política bloqueia o estoque e não deixa família em sombra",
    enforced.join(",") === "parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" &&
      shadow.length === 0 &&
      authorizationHasEnforce(production, {}) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "parts_stock" }) === true &&
      authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "parts_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports" }) === false,
    enforced.join(",")
  );
  record(
    "ferramentas de estoque do RDA continuam exigindo a chave do estoque",
    !!stockTool &&
      stockTool.requiredPermission === "access_estoque_pecas" &&
      stockTools.length >= 4 &&
      stockTools.every(
        (tool) =>
          authAllowsToolPermission({ role: "user", permissions: { access_estoque_pecas: true } }, tool) &&
          authAllowsToolPermission({ role: "admin" }, tool) &&
          authAllowsToolPermission({ role: "user", permissions: { full_access: true } }, tool) &&
          !authAllowsToolPermission({ role: "user", permissions: { access_patio: true } }, tool) &&
          !authAllowsToolPermission({ role: "user", permissions: { access_laboratorio: true } }, tool) &&
          !authAllowsToolPermission({ role: "user", permissions: { access_orcamentos: true } }, tool)
      ),
    stockTools.map((tool) => tool.id).join(",")
  );

  const tables: Record<string, Row[]> = {
    workshop_settings: [
      ["admin_password", hashPassword(PASS_ADMIN)],
      ["patio_pin", "pin-ficticio"],
      ["vehicle_delete_password", "excluir-ficticio"],
      ["stock_guard_password", STOCK_GUARD],
    ].map(([key, value]) => ({
      workshop_id: WORKSHOP,
      key,
      value,
      updated_at: "2026-01-01T00:00:00.000Z",
    })),
    workshop_system_users: [
      user(PATIO, "patio", { access_patio: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(ORC, "orcamento", { access_orcamentos: true }),
      user(STOCK, "estoque", { access_estoque_pecas: true }),
      user(REL, "relatorio", { access_relatorios: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_estoque_pecas: true }),
    ],
    workshop_parts: [
      {
        id: "peca-1",
        workshop_id: WORKSHOP,
        name: "Pastilha ficticia",
        stock_qty: 5,
        unit_price: 10,
        unit_of_measure: "UN",
        barcode: "ABC123",
        original_code: "ABC123",
        numeric_code: "100",
        sort_order: 0,
        min_stock_qty: 1,
      },
      {
        id: "peca-2",
        workshop_id: WORKSHOP,
        name: "Filtro ficticio",
        stock_qty: 2,
        unit_price: 8,
        unit_of_measure: "UN",
        barcode: "XYZ789",
        original_code: "XYZ789",
        sort_order: 1,
        min_stock_qty: 0,
      },
    ],
    service_orders: [
      {
        id: "os-1",
        workshop_id: WORKSHOP,
        order_type: "vehicle",
        status: "EM_ANDAMENTO",
        plate: "ABC1D23",
        vehicle_model: "Gol",
        os_number: 41,
      },
    ],
    budgets: [
      {
        id: "orc-1",
        workshop_id: WORKSHOP,
        service_order_id: "os-1",
        card_name: "Freio",
        parts: [{ description: "Pastilha ficticia", quantity: "2", fromStock: true, workshopPartId: "peca-1" }],
      },
    ],
    workshop_part_stock_movements: [],
    workshop_part_purchases: [],
    workshop_part_categories: [],
    workshop_suppliers: [],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    customers: [],
  };
  const mock = await startMock(tables);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec0320-local";
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
      hit(base, "/api/workshop-parts", "GET"),
      hit(base, "/api/workshop-parts/movements", "POST", undefined, { movement_type: "consumable", quantity: 1 }),
      hit(base, "/api/workshop-parts/peca-1", "DELETE"),
      hit(base, "/api/workshop-suppliers", "GET"),
      hit(base, "/api/estoque/ledger", "GET"),
    ]);
    record(
      "acesso direto sem sessão",
      direct.every((item) => item.status === 401 && item.code === "session_invalid"),
      direct.map((item) => item.status).join(",")
    );
    const invalid = await hit(base, "/api/workshop-parts", "GET", "sessao-invalida");
    record("sessão inválida", invalid.status === 401 && invalid.code === "session_invalid", `${invalid.status} ${invalid.code}`);

    const patio = await login(base, "patio", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const orc = await login(base, "orcamento", PASS_USER);
    const stock = await login(base, "estoque", PASS_USER);
    const rel = await login(base, "relatorio", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const manager = await login(base, "Gerência", PASS_ADMIN);

    const listed = await hit(base, "/api/workshop-parts", "GET", patio);
    allowed("pátio lista o catálogo", listed, 200);
    record("lista devolve a pastilha", listed.body.includes("Pastilha ficticia"), listed.status === 200 ? "corpo" : String(listed.status));
    const lookup = await hit(base, "/api/workshop-parts/lookup?code=ABC123", "GET", patio);
    allowed("pátio consulta pelo código", lookup, 200);
    record("consulta devolve a peça do código", lookup.body.includes("peca-1"), lookup.status === 200 ? "corpo" : String(lookup.status));
    allowed("orçamento lista o catálogo", await hit(base, "/api/workshop-parts", "GET", orc), 200);
    allowed("orçamento lê fotos", await hit(base, "/api/workshop-parts/peca-1/photos", "GET", orc), 200);
    allowed("orçamento lê compras", await hit(base, "/api/workshop-parts/peca-1/purchases", "GET", orc), 200);
    allowed("orçamento lê categorias", await hit(base, "/api/workshop-part-categories", "GET", orc), 200);
    allowed("laboratório lê o contexto da peça", await hit(base, "/api/workshop-parts/peca-1/lab-context", "GET", lab), 200);

    denied("orçamento não baixa peça", await hit(base, "/api/workshop-parts/movements", "POST", orc, { movement_type: "consumable", part_id: "peca-1", quantity: 1, service_order_id: "os-1" }));
    denied("orçamento não cadastra peça", await hit(base, "/api/workshop-parts", "POST", orc, { name: "Sem chave" }));
    denied("orçamento não lê fornecedores", await hit(base, "/api/workshop-suppliers", "GET", orc));
    denied("orçamento não lê reservas administrativas", await hit(base, "/api/workshop-parts/pending-reservations", "GET", orc));
    denied("pátio não lê o razão", await hit(base, "/api/estoque/ledger", "GET", patio));
    denied("pátio não cadastra peça", await hit(base, "/api/workshop-parts", "POST", patio, { name: "Sem chave" }));
    denied("pátio não recebe mercadoria", await hit(base, "/api/workshop-parts/peca-1/receive", "POST", patio, { quantity: 1 }));
    denied("pátio não ajusta quantidade", await hit(base, "/api/workshop-parts/peca-1", "PUT", patio, { stock_qty: 99 }));
    denied("pátio não exclui peça", await hit(base, "/api/workshop-parts/peca-2", "DELETE", patio));
    denied("laboratório não exclui peça", await hit(base, "/api/workshop-parts/peca-2", "DELETE", lab));
    denied("sem chave não lista", await hit(base, "/api/workshop-parts", "GET", none));
    denied("falha de leitura", await hit(base, "/api/workshop-parts", "GET", fail));
    denied("pátio não lê analytics", await hit(base, "/api/workshop-parts/analytics", "GET", patio));

    const withdrawal = await hit(base, "/api/workshop-parts/movements", "POST", patio, {
      movement_type: "consumable",
      part_id: "peca-1",
      quantity: 1,
      service_order_id: "os-1",
      recorded_by_name: "Patio",
    });
    allowed("pátio baixa uma unidade na OS", withdrawal, 201);
    record(
      "baixa reduz o saldo e grava a OS",
      withdrawal.body.includes('"stock_qty":4') &&
        partQty(tables, "peca-1") === 4 &&
        tables.workshop_part_stock_movements.some((row) => row.part_id === "peca-1" && row.service_order_id === "os-1" && Number(row.quantity) === 1),
      `saldo ${partQty(tables, "peca-1")}`
    );
    const reservedAfter = await hit(base, "/api/workshop-parts/pending-reservations", "GET", stock);
    allowed("estoque lê reservas do orçamento", reservedAfter, 200);
    record(
      "reserva desconta a unidade já baixada",
      reservedAfter.body.includes('"peca-1":1') || reservedAfter.body.includes('"peca-1": 1'),
      reservedAfter.body.slice(0, 180)
    );

    const movementId = String(tables.workshop_part_stock_movements.find((row) => row.part_id === "peca-1")?.id ?? "");
    const cancelled = await hit(base, `/api/workshop-parts/movements/${movementId}?password=${encodeURIComponent(STOCK_GUARD)}`, "DELETE", patio);
    allowed("pátio cancela a própria baixa", cancelled, 200);
    record(
      "cancelamento devolve a unidade e apaga o movimento",
      cancelled.body.includes('"stock_qty":5') &&
        partQty(tables, "peca-1") === 5 &&
        !tables.workshop_part_stock_movements.some((row) => row.id === movementId),
      `saldo ${partQty(tables, "peca-1")}`
    );
    const reservedBack = await hit(base, "/api/workshop-parts/pending-reservations", "GET", stock);
    record(
      "reserva volta para as duas unidades do orçamento",
      reservedBack.body.includes('"peca-1":2') || reservedBack.body.includes('"peca-1": 2'),
      reservedBack.body.slice(0, 180)
    );

    const sale = await hit(base, "/api/workshop-parts/movements", "POST", lab, {
      movement_type: "sale",
      part_id: "peca-1",
      quantity: 1,
      service_order_id: "os-1",
    });
    allowed("laboratório registra saída", sale, 201);
    record("saída do laboratório reduz o saldo", partQty(tables, "peca-1") === 4, String(partQty(tables, "peca-1")));
    const shortStock = await hit(base, "/api/workshop-parts/movements", "POST", patio, {
      movement_type: "consumable",
      part_id: "peca-1",
      quantity: 100,
      service_order_id: "os-1",
    });
    record(
      "quantidade acima do saldo não baixa e não é 403",
      shortStock.status === 400 && shortStock.code !== "permission_denied" && partQty(tables, "peca-1") === 4,
      `${shortStock.status} saldo ${partQty(tables, "peca-1")}`
    );

    const adjusted = await hit(base, "/api/workshop-parts/peca-1", "PUT", stock, { stock_qty: 9 });
    allowed("estoque ajusta a quantidade", adjusted, 200);
    record("ajuste grava o novo saldo", partQty(tables, "peca-1") === 9, String(partQty(tables, "peca-1")));
    const received = await hit(base, "/api/workshop-parts/peca-1/receive", "POST", stock, {
      quantity: 1,
      unit_cost: 4,
      supplier_name: "Fornecedor ficticio",
    });
    allowed("estoque registra entrada", received, 201);
    record(
      "entrada soma o saldo e grava a compra",
      partQty(tables, "peca-1") === 10 && tables.workshop_part_purchases.some((row) => row.part_id === "peca-1" && Number(row.quantity) === 1),
      `saldo ${partQty(tables, "peca-1")}; compras ${tables.workshop_part_purchases.length}`
    );

    const created = await hit(base, "/api/workshop-parts", "POST", stock, { name: "Sensor ficticio" });
    allowed("estoque cadastra peça", created, 201);
    record("cadastro grava a peça", tables.workshop_parts.some((row) => row.name === "Sensor ficticio"), created.status === 201 ? "tabela" : String(created.status));
    const removed = await hit(base, "/api/workshop-parts/peca-2", "DELETE", stock);
    allowed("estoque exclui peça", removed, 204);
    record(
      "exclusão remove só a peça pedida",
      !tables.workshop_parts.some((row) => row.id === "peca-2") && tables.workshop_parts.some((row) => row.id === "peca-1"),
      tables.workshop_parts.map((row) => row.id).join(",")
    );
    const category = await hit(base, "/api/workshop-part-categories", "POST", stock, { name: "Freio" });
    allowed("estoque cria categoria", category, 201);
    const categories = await hit(base, "/api/workshop-part-categories", "GET", orc);
    record("orçamento vê a categoria criada", categories.status === 200 && categories.body.includes("Freio"), `${categories.status}`);
    denied("orçamento não cria categoria", await hit(base, "/api/workshop-part-categories", "POST", orc, { name: "Outra" }));
    const supplier = await hit(base, "/api/workshop-suppliers", "POST", stock, { name: "Fornecedor ficticio" });
    allowed("estoque cria fornecedor", supplier, 201);
    record("cadastro grava o fornecedor", tables.workshop_suppliers.some((row) => row.name === "Fornecedor ficticio"), String(supplier.status));
    denied("pátio não lista fornecedores", await hit(base, "/api/workshop-suppliers", "GET", patio));
    allowed("relatórios lê analytics", await hit(base, "/api/workshop-parts/analytics", "GET", rel), 200);
    allowed("full_access lê o razão", await hit(base, "/api/estoque/ledger", "GET", full), 200);
    allowed("gerência lista peças", await hit(base, "/api/workshop-parts", "GET", manager), 200);

    open("rota do RDA não entra na família de estoque", await hit(base, "/api/rda/proactive/summary", "GET", patio));
    open("estoque ABS continua fora desta família", await hit(base, "/api/abs-modules", "GET", lab));
    allowed("painel público da TV", await hit(base, "/api/tv/display", "GET"), 200);
    denied("TV administrativa sem a chave", await hit(base, "/api/tv/slides", "POST", patio, SLIDE));
    allowed("pátio consulta serviços", await hit(base, "/api/workshop-services", "GET", patio), 200);
    denied("pátio não cria serviço", await hit(base, "/api/workshop-services", "POST", patio, SERVICE));
    allowed("pátio consulta técnicos", await hit(base, "/api/workshop-technicians", "GET", patio), 200);
    denied("pátio não exclui técnico", await hit(base, "/api/workshop-technicians/tecnico-1", "DELETE", patio));
    denied("pátio não lê relatório", await hit(base, "/api/reports/technician-services", "GET", patio));
    denied("pátio não lê boletim", await hit(base, "/api/error-bulletins", "GET", patio));

    process.env.SEC03_DISABLE_FAMILIES = "reports";
    const reportsOff = await hit(base, "/api/workshop-parts/peca-1", "DELETE", patio);
    delete process.env.SEC03_DISABLE_FAMILIES;
    denied("desligar relatórios não abre a exclusão da peça", reportsOff);

    process.env.SEC03_DISABLE_FAMILIES = "parts_stock";
    const rolled = await hit(base, "/api/workshop-parts", "POST", patio, { name: "Peça da reversão" });
    const tvStill = await hit(base, "/api/tv/slides", "POST", patio, SLIDE);
    const reportStill = await hit(base, "/api/reports/technician-services", "GET", patio);
    const bulletinStill = await hit(base, "/api/error-bulletins", "GET", patio);
    const techStill = await hit(base, "/api/workshop-technicians/tecnico-1", "DELETE", patio);
    const serviceStill = await hit(base, "/api/workshop-services", "POST", patio, SERVICE);
    delete process.env.SEC03_DISABLE_FAMILIES;
    const restored = await hit(base, "/api/workshop-parts", "POST", patio, { name: "Peça bloqueada de novo" });
    record(
      "SEC03_DISABLE_FAMILIES=parts_stock tira o bloqueio e preserva as outras famílias",
      rolled.status === 201 &&
        tables.workshop_parts.some((row) => row.name === "Peça da reversão") &&
        tvStill.status === 403 &&
        reportStill.status === 403 &&
        bulletinStill.status === 403 &&
        techStill.status === 403 &&
        serviceStill.status === 403 &&
        restored.status === 403 &&
        restored.code === "permission_denied" &&
        !tables.workshop_parts.some((row) => row.name === "Peça bloqueada de novo"),
      `estoque ${rolled.status}; tv ${tvStill.status}; relatório ${reportStill.status}; boletim ${bulletinStill.status}; técnico ${techStill.status}; serviço ${serviceStill.status}; restaurado ${restored.status}`
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
  console.error(err instanceof Error ? err.stack || err.message : "erro");
  process.exit(1);
});
