/**
 * SEC-03.27.1: aprovação grava só flags da linha atual e a Home lê o agregado.
 * npm run test:sec03271-budgets-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce } from "../utils/authorizeRequest.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const APROVA = "22222222-2222-4222-8222-222222222271";
const EDITOR = "22222222-2222-4222-8222-222222222272";
const ORC = "22222222-2222-4222-8222-222222222273";
const PATIO = "22222222-2222-4222-8222-222222222274";
const LAB = "22222222-2222-4222-8222-222222222275";
const RECEP = "22222222-2222-4222-8222-222222222276";
const AGENDA = "22222222-2222-4222-8222-222222222277";
const NONE = "22222222-2222-4222-8222-222222222278";
const FULL = "22222222-2222-4222-8222-222222222279";
const FAIL = "22222222-2222-4222-8222-222222222270";
const OS = "33333333-3333-4333-8333-333333333331";
const OS_OTHER = "33333333-3333-4333-8333-333333333332";
const CUST = "44444444-4444-4444-8444-444444444441";
const PASS_USER = "senha-ficticia-sec03271";
const PASS_ADMIN = "gerencia-ficticia-sec03271";
const STAMP = "2026-11-15T12:00:00.000Z";
const DIAG = "Diagnóstico secreto do cliente";
const OBS = "Observação interna do orçamento";
const CUSTOMER = "Cliente Sigiloso";
const OTHER_SECRET = "Segredo de outra oficina";

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
    created_at: STAMP,
    updated_at: STAMP,
  };
}

function service(description = "Reparo do modulo", value = 100): Row {
  return { description, labor_hours: 1, suggested_value: value, line_observations: "" };
}

function part(description = "Sensor", quantity = 2): Row {
  return { description, quantity, fromStock: true, workshopPartId: "peca-1" };
}

function budgetRow(id: string, extra: Row = {}): Row {
  return {
    id,
    workshop_id: WORKSHOP,
    service_order_id: OS,
    card_name: "Cartão ABS",
    diagnosis: DIAG,
    observations: OBS,
    services: [service()],
    parts: [part()],
    created_at: STAMP,
    updated_at: STAMP,
    verified_at: null,
    verified_by_name: null,
    ...extra,
  };
}

function matchesFilter(row: Row, key: string, raw: string): boolean {
  const value = row[key];
  const text = value == null ? "" : String(value);
  if (raw.startsWith("eq.")) return text === raw.slice(3);
  if (raw.startsWith("neq.")) return text !== raw.slice(4);
  if (raw === "is.null") return value == null || text === "";
  if (raw === "is.not.null") return value != null && text !== "";
  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    const set = new Set(raw.slice(4, -1).split(",").map((item) => item.replace(/^"|"$/g, "")));
    return set.has(text);
  }
  return false;
}

async function startMock(tables: Record<string, Row[]>, race: { arm: boolean; budgetId: string }, rpc: { update: number }): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (table.startsWith("rpc/")) {
        if (table.endsWith("update_budget_with_stock")) rpc.update += 1;
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
        if (race.arm && table === "budgets" && filters.some(([key, raw]) => key === "id" && raw === `eq.${race.budgetId}`)) {
          const stored = tables.budgets.find((row) => row.id === race.budgetId);
          if (stored) stored.updated_at = "2099-01-01T00:00:00.000Z";
          race.arm = false;
        }
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
      const body = raw ? (JSON.parse(raw) as Row) : {};
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
        tables[table] = tables[table].filter((row) => !matches(row));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify([]));
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

function bodyOf(diagnosis = DIAG, services: Row[] = [service()], parts: Row[] = [part()], observations = OBS): Row {
  return {
    cardName: "Cartão ABS",
    diagnosis,
    observations,
    services,
    parts,
    actor: "user",
  };
}

function flags(base: Row, serviceFlag: boolean, partFlag: boolean): Row {
  const services = (base.services as Row[]).map((item) => ({ ...item, approved: serviceFlag }));
  const parts = (base.parts as Row[]).map((item) => ({ ...item, approved: partFlag }));
  return { ...base, services, parts };
}

async function main() {
  delete process.env.SEC03_DISABLE_FAMILIES;
  delete process.env.SEC03_AUTHORIZATION_DISABLED;
  const production = productionAuthorizationPolicy();
  const enforced = production.families.filter((family) => family.mode === "enforce").map((family) => family.id);
  const off = production.families.filter((family) => family.mode === "off").map((family) => family.id);
  record(
    "budgets entra em enforce e as outras oito permanecem",
    enforced.join(",") === "customers,appointments,service_orders,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports,notifications" &&
      off.join(",") === "quality_radar,rda" &&
      !production.rules.some((rule) => rule.id === "budget_aggregate_read") &&
      production.rules.some((rule) => rule.id === "budget_update" && rule.anyOf.includes("patio_approve_budget_items")),
    `enforce=${enforced.join(",")} off=${off.join(",")}`
  );
  record(
    "desligar budgets não abre as outras famílias",
    authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "budgets" }) === true &&
      production.families
        .filter((family) => family.id !== "budgets")
        .filter((family) => family.mode === "enforce")
        .every((family) => authorizationHasEnforce({ families: [family], rules: [] }, { SEC03_DISABLE_FAMILIES: "budgets" })),
    "reversão"
  );

  const tables: Record<string, Row[]> = {
    workshop_settings: [
      { workshop_id: WORKSHOP, key: "admin_password", value: hashPassword(PASS_ADMIN), updated_at: STAMP },
    ],
    workshop_system_users: [
      user(APROVA, "aprova", { access_patio: true, patio_approve_budget_items: true, patio_edit_budgets: false }),
      user(EDITOR, "editor", { patio_edit_budgets: true, patio_approve_budget_items: false }),
      user(ORC, "orcamentista", { access_orcamentos: true }),
      user(PATIO, "patio", { access_patio: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(RECEP, "recepcao", { access_reception: true }),
      user(AGENDA, "agenda", { access_agenda: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { patio_edit_budgets: true, patio_approve_budget_items: true }),
    ],
    service_orders: [
      {
        id: OS,
        workshop_id: WORKSHOP,
        status: "EM_SERVICO",
        plate: "ABC1D23",
        vehicle_model: "Gol",
        vehicle_brand: "VW",
        os_number: "1842",
        customer_id: CUST,
        order_type: "vehicle",
        module_identification: null,
      },
      {
        id: OS_OTHER,
        workshop_id: OTHER,
        status: "EM_SERVICO",
        plate: "XYZ9Z99",
        vehicle_model: "Uno",
        vehicle_brand: "Fiat",
        os_number: "9",
        customer_id: "44444444-4444-4444-8444-444444444449",
        order_type: "vehicle",
      },
    ],
    customers: [
      { id: CUST, workshop_id: WORKSHOP, name: CUSTOMER },
      { id: "44444444-4444-4444-8444-444444444449", workshop_id: OTHER, name: "Cliente de outra" },
    ],
    budgets: [
      budgetRow("b-main"),
      budgetRow("b-two", { services: [service("Alinhamento"), service("Balanceamento")] }),
      budgetRow("b-stale"),
      budgetRow("b-race"),
      budgetRow("b-fail", { diagnosis: "Diagnóstico intocado" }),
      budgetRow("b-verify"),
      budgetRow("b-verify-2"),
      budgetRow("b-admin"),
      budgetRow("b-full"),
      budgetRow("b-rollback"),
      budgetRow("b-other", { workshop_id: OTHER, service_order_id: OS_OTHER, diagnosis: OTHER_SECRET, card_name: "Outra" }),
    ],
    workshop_parts: [{ id: "peca-1", workshop_id: WORKSHOP, name: "Sensor ABS", quantity: 7, reserved_quantity: 1 }],
    notifications: [],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
  };
  const race = { arm: false, budgetId: "b-race" };
  const rpc = { update: 0 };
  const mock = await startMock(tables, race, rpc);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec03271-local";
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
  const put = (token: string, id: string, payload: unknown) =>
    hit(base, `/api/service-orders/${OS}/budgets/${id}`, "PUT", token, payload);
  const row = (id: string) => tables.budgets.find((item) => item.id === id)!;
  const frozen = (id: string) => JSON.stringify(row(id));

  try {
    const aprova = await login(base, "aprova", PASS_USER);
    const editor = await login(base, "editor", PASS_USER);
    const orc = await login(base, "orcamentista", PASS_USER);
    const patio = await login(base, "patio", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const recep = await login(base, "recepcao", PASS_USER);
    const agenda = await login(base, "agenda", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const gerencia = await login(base, "Gerência", PASS_ADMIN);

    const approved = flags(bodyOf(), true, false);
    const beforeApprove = frozen("b-main");
    const rpcBefore = rpc.update;
    const okApprove = await put(aprova, "b-main", approved);
    const main = row("b-main");
    const mainService = (main.services as Row[])[0];
    const mainPart = (main.parts as Row[])[0];
    record(
      "aprovador grava só as flags e não chama a reserva de estoque",
      okApprove.status === 200 &&
        mainService.approved === true &&
        mainPart.approved === false &&
        mainService.description === "Reparo do modulo" &&
        mainService.suggested_value === 100 &&
        mainPart.quantity === 2 &&
        main.diagnosis === DIAG &&
        rpc.update === rpcBefore &&
        tables.notifications.some((item) => item.type === "budget_items_approved"),
      `${okApprove.status} rpc=${rpc.update}`
    );
    record("a linha aprovada não herdou campo de fora", !("price" in mainService) && beforeApprove !== frozen("b-main"), "flags");

    const rejected = flags(bodyOf(), false, true);
    const okReject = await put(aprova, "b-main", rejected);
    record(
      "aprovador reprova o item existente",
      okReject.status === 200 && (row("b-main").services as Row[])[0].approved === false && (row("b-main").parts as Row[])[0].approved === true,
      String(okReject.status)
    );

    const cases: Array<[string, Row]> = [
      ["preço", flags(bodyOf(DIAG, [service("Reparo do modulo", 180)]), true, false)],
      ["quantidade", flags(bodyOf(DIAG, [service()], [part("Sensor", 9)]), true, false)],
      ["descrição", flags(bodyOf(DIAG, [service("Outro serviço")]), true, false)],
      ["serviço a mais", flags(bodyOf(DIAG, [service(), service("Extra")]), true, false)],
      ["peça a menos", { ...flags(bodyOf(), true, false), parts: [] }],
      ["diagnóstico", flags(bodyOf("Diagnóstico alterado"), true, false)],
      ["observação", flags(bodyOf(DIAG, [service()], [part()], "Observação nova"), true, false)],
    ];
    for (const [name, payload] of cases) {
      const snap = frozen("b-main");
      const denied = await put(aprova, "b-main", payload);
      record(`aprovador não altera ${name}`, denied.status === 409 && denied.code === "budget_conflict" && frozen("b-main") === snap, `${denied.status} ${denied.code}`);
    }

    const swapped = flags(bodyOf(DIAG, [service("Balanceamento"), service("Alinhamento")]), true, false);
    const orderSnap = frozen("b-two");
    const reorder = await put(aprova, "b-two", swapped);
    const order = (row("b-two").services as Row[]).map((item) => item.description).join(",");
    record("aprovador não reordena serviços", reorder.status === 409 && order === "Alinhamento,Balanceamento" && frozen("b-two") === orderSnap, order);

    const extraService = { ...service(), approved: true, price: 50 };
    const extra = await put(aprova, "b-main", { ...bodyOf(DIAG, [extraService]), parts: flags(bodyOf(), true, false).parts });
    const extraSnap = frozen("b-main");
    record(
      "campo extra no item não grava preço",
      extra.status === 409 && !JSON.stringify(row("b-main").services).includes("price") && frozen("b-main") === extraSnap,
      String(extra.status)
    );
    const extraTop = await put(aprova, "b-main", { ...flags(bodyOf(), true, false), workshop_id: OTHER });
    record("campo extra no corpo não troca a oficina", extraTop.status === 409 && row("b-main").workshop_id === WORKSHOP, String(extraTop.status));

    const editorFirst = await put(editor, "b-stale", bodyOf("Versão nova"));
    const stale = await put(aprova, "b-stale", flags(bodyOf(DIAG), true, false));
    record(
      "aprovação com dados antigos não cobre a edição",
      editorFirst.status === 200 &&
        stale.status === 409 &&
        row("b-stale").diagnosis === "Versão nova" &&
        !("approved" in ((row("b-stale").services as Row[])[0] ?? {})),
      `${editorFirst.status}/${stale.status}`
    );

    race.arm = true;
    const raced = await put(aprova, "b-race", flags(bodyOf(), true, false));
    record(
      "aprovação concorrente não grava por cima da versão nova",
      raced.status === 409 &&
        row("b-race").updated_at === "2099-01-01T00:00:00.000Z" &&
        !("approved" in ((row("b-race").services as Row[])[0] ?? {})),
      `${raced.status} ${row("b-race").updated_at}`
    );

    const beforeCreate = tables.budgets.length;
    const created = await hit(base, `/api/service-orders/${OS}/budgets`, "POST", editor, bodyOf("Criado pelo editor", [service("Serviço do editor")], [part("Peça do editor")]));
    record(
      "editor cria orçamento",
      created.status === 201 && tables.budgets.some((item) => item.diagnosis === "Criado pelo editor"),
      String(created.status)
    );
    const edited = await put(editor, "b-admin", bodyOf("Editado pelo editor", [service("Serviço editado", 220)], [part("Peça editada", 3)]));
    record(
      "editor altera conteúdo",
      edited.status === 200 &&
        row("b-admin").diagnosis === "Editado pelo editor" &&
        (row("b-admin").services as Row[])[0].suggested_value === 220 &&
        (row("b-admin").parts as Row[])[0].quantity === 3,
      String(edited.status)
    );
    const drafted = await hit(base, `/api/service-orders/${OS}/budgets`, "POST", orc, bodyOf("Rascunho", [service("Mão de obra")], [part("Bobina nova", 1)]));
    record(
      "orçamentista inclui serviço e peça",
      drafted.status === 201 && tables.budgets.some((item) => JSON.stringify(item.parts).includes("Bobina nova") && JSON.stringify(item.services).includes("Mão de obra")),
      String(drafted.status)
    );
    const createDenied = await hit(base, `/api/service-orders/${OS}/budgets`, "POST", aprova, bodyOf("Não pode criar"));
    const deleteDenied = await hit(base, `/api/service-orders/${OS}/budgets/b-main`, "DELETE", aprova);
    record(
      "aprovador não cria nem exclui",
      createDenied.status === 403 &&
        deleteDenied.status === 403 &&
        tables.budgets.some((item) => item.id === "b-main") &&
        !tables.budgets.some((item) => item.diagnosis === "Não pode criar") &&
        tables.budgets.length === beforeCreate + 2,
      `${createDenied.status}/${deleteDenied.status}`
    );

    const byAdmin = await put(gerencia, "b-full", bodyOf("Gerência alterou", [service("Serviço da gerência", 40)]));
    const byFull = await put(full, "b-full", bodyOf("Acesso total alterou"));
    record("Gerência e acesso total editam", byAdmin.status === 200 && byFull.status === 200 && row("b-full").diagnosis === "Acesso total alterou", `${byAdmin.status}/${byFull.status}`);

    const verifyEditor = await hit(base, `/api/service-orders/${OS}/budgets/b-verify/verify`, "POST", editor, { verifiedByName: "Editor" });
    const verifyAdmin = await hit(base, `/api/service-orders/${OS}/budgets/b-verify/verify`, "POST", gerencia, { verifiedByName: "Gerência" });
    const verifyApprover = await hit(base, `/api/service-orders/${OS}/budgets/b-verify-2/verify`, "POST", aprova, { verifiedByName: "Aprovador" });
    record(
      "verificação formal segue a permissão específica",
      verifyEditor.status === 403 &&
        verifyAdmin.status === 200 &&
        row("b-verify").verified_by_name === "Gerência" &&
        verifyApprover.status === 200 &&
        row("b-verify-2").verified_by_name === "Aprovador",
      `${verifyEditor.status}/${verifyAdmin.status}/${verifyApprover.status} verify=${String(row("b-verify").verified_by_name)} verify2=${String(row("b-verify-2").verified_by_name)}`
    );

    const listed = await hit(base, `/api/service-orders/${OS}/budgets`, "GET", patio);
    const listedDenied = await hit(base, `/api/service-orders/${OS}/budgets`, "GET", agenda);
    record("consulta continua nas chaves de leitura", listed.status === 200 && listed.body.includes(DIAG) && listedDenied.status === 403, `${listed.status}/${listedDenied.status}`);

    const bannerKeys = ["budgetId", "contentSignature", "approvalFingerprint", "plate", "vehicleModel", "ABC1D23", "Gol"];
    for (const [name, token] of [
      ["agenda", agenda],
      ["recepção", recep],
      ["pátio", patio],
      ["laboratório", lab],
      ["orçamentos", orc],
      ["sem chave", none],
    ] as const) {
      const aggregate = await hit(base, "/api/patio-vehicle-budgets-aggregate", "GET", token);
      const hasBanner = bannerKeys.every((key) => aggregate.body.includes(key));
      const hidesOther = !aggregate.body.includes(OTHER_SECRET) && !aggregate.body.includes("XYZ9Z99");
      const detailed = name === "pátio" || name === "laboratório" || name === "recepção" || name === "orçamentos";
      const privacyOk = detailed ? aggregate.body.includes(DIAG) && aggregate.body.includes(CUSTOMER) : !aggregate.body.includes(DIAG) && !aggregate.body.includes(CUSTOMER);
      record(`agregado da Home para ${name}`, aggregate.status === 200 && hasBanner && hidesOther && privacyOk, String(aggregate.status));
    }
    const anon = await hit(base, "/api/patio-vehicle-budgets-aggregate", "GET");
    const invalid = await hit(base, "/api/patio-vehicle-budgets-aggregate", "GET", "sessao-invalida");
    record("agregado sem sessão ou com sessão inválida", anon.status === 401 && invalid.status === 401, `${anon.status}/${invalid.status}`);

    const failSnap = frozen("b-fail");
    const failWrite = await put(fail, "b-fail", bodyOf("Não grava"));
    record("falha de permissão não grava", failWrite.status === 403 && frozen("b-fail") === failSnap, String(failWrite.status));

    const cross = await put(aprova, "b-other", flags(bodyOf(OTHER_SECRET), true, false));
    const crossOs = await hit(base, `/api/service-orders/${OS_OTHER}/budgets/b-other`, "PUT", aprova, flags(bodyOf(OTHER_SECRET), true, false));
    record(
      "não há acesso cruzado entre oficinas",
      row("b-other").diagnosis === OTHER_SECRET && row("b-other").workshop_id === OTHER && (cross.status === 404 || cross.status === 409) && (crossOs.status === 404 || crossOs.status === 403),
      `${cross.status}/${crossOs.status}`
    );

    const partRow = tables.workshop_parts[0];
    record("reserva e quantidade da peça permanecem", partRow.quantity === 7 && partRow.reserved_quantity === 1, JSON.stringify(partRow));
    const rda = await hit(base, "/api/rda/health", "GET", none);
    record("RDA não recebe bloqueio da família de orçamentos", rda.status !== 403, String(rda.status));

    const stock = await hit(base, "/api/workshop-parts", "GET", none);
    const customers = await hit(base, "/api/customers", "GET", none);
    const agendaCustomers = await hit(base, "/api/customers", "GET", agenda);
    const appointment = await hit(base, "/api/appointments", "POST", none, { title: "Não" });
    const bulletins = await hit(base, "/api/error-bulletins", "GET", none);
    const reports = await hit(base, "/api/reports/technician-services", "GET", none);
    const technicians = await hit(base, "/api/workshop-technicians", "GET", none);
    const catalogs = await hit(base, "/api/workshop-services", "POST", none, { name: "Não" });
    const tv = await hit(base, "/api/tv/manage", "GET", none);
    record(
      "as oito famílias já protegidas continuam negando a sessão sem chave",
      [stock, customers, appointment, bulletins, reports, technicians, catalogs, tv].every((item) => item.status === 403) && agendaCustomers.status === 200,
      [stock, customers, agendaCustomers, appointment, bulletins, reports, technicians, catalogs, tv].map((item) => item.status).join("/")
    );

    process.env.SEC03_DISABLE_FAMILIES = "budgets";
    const rolled = await put(aprova, "b-rollback", bodyOf("Nasceu na reversão"));
    const stockStill = await hit(base, "/api/workshop-parts", "GET", none);
    const customersStill = await hit(base, "/api/customers", "GET", none);
    delete process.env.SEC03_DISABLE_FAMILIES;
    const closedAgain = await put(aprova, "b-rollback", bodyOf("Depois da reversão"));
    record(
      "SEC03_DISABLE_FAMILIES=budgets abre só orçamentos",
      rolled.status === 200 &&
        row("b-rollback").diagnosis === "Nasceu na reversão" &&
        stockStill.status === 403 &&
        customersStill.status === 403 &&
        closedAgain.status === 409 &&
        row("b-rollback").diagnosis === "Nasceu na reversão",
      `${rolled.status}/${stockStill.status}/${customersStill.status}/${closedAgain.status}`
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
