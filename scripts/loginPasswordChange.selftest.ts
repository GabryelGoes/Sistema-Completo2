/**
 * SEC-02.1: troca de senha de login na API Express, com banco fictício.
 * npm run test:login-password-change
 * Não imprime senhas.
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { classifyNewLoginPassword } from "../utils/loginPasswordPolicy.js";
import { shouldClearSession } from "../utils/shouldClearSession.js";

const WORKSHOP_ID = "11111111-1111-4111-8111-111111111111";
const USER_A = "22222222-2222-4222-8222-222222222201";
const USER_B = "22222222-2222-4222-8222-222222222202";
const OS_ID = "33333333-3333-4333-8333-333333333301";
const SESSION_SECRET = "homolog-session-sec021-local";

const PASS_A = "senha-antiga-ana";
const PASS_A_NOVA = "senha-nova-ana";
const PASS_B = "senha-antiga-bia";
const PASS_B_NOVA = "senha-nova-bia";
const PASS_ADMIN = "gerencia-antiga";
const PASS_ADMIN_NOVA = "gerencia-nova";
const PASS_CURTA = "12345";
const PIN = "pin-ficticio-sec";
const DELETE_PW = "excluir-ficticio-sec";
const STOCK_PW = "estoque-ficticio-sec";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {
  workshop_settings: [
    ["admin_password", hashPassword(PASS_ADMIN)],
    ["patio_pin", PIN],
    ["vehicle_delete_password", DELETE_PW],
    ["stock_guard_password", STOCK_PW],
    ["patio_login_enabled", "true"],
  ].map(([key, value]) => ({
    workshop_id: WORKSHOP_ID,
    key,
    value,
    updated_at: "2026-01-01T00:00:00.000Z",
  })),
  workshop_system_users: [
    {
      id: USER_A,
      workshop_id: WORKSHOP_ID,
      username: "ana",
      display_name: "Ana",
      password_hash: hashPassword(PASS_A),
      permissions: {},
      is_technician: false,
      job_title: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: USER_B,
      workshop_id: WORKSHOP_ID,
      username: "bia",
      display_name: "Bia",
      password_hash: hashPassword(PASS_B),
      permissions: {},
      is_technician: false,
      job_title: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
  ],
  service_orders: [
    {
      id: OS_ID,
      workshop_id: WORKSHOP_ID,
      status: "EM_SERVICO",
      order_type: "vehicle",
      bench_slot: null,
    },
  ],
};

function setting(key: string): string {
  const row = tables.workshop_settings.find((item) => item.key === key);
  return String(row?.value ?? "");
}
function userRow(id: string): Row | undefined {
  return tables.workshop_system_users.find((item) => item.id === id);
}

let passed = 0;
let failed = 0;
function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function signExpired(): string {
  const body = b64url(JSON.stringify({ r: "user", u: USER_A, n: "ana", exp: Date.now() - 1000 }));
  const sig = b64url(crypto.createHmac("sha256", SESSION_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function parseFilters(url: URL): Array<[string, string]> {
  const skip = new Set(["select", "on_conflict", "columns", "limit", "order", "offset"]);
  const out: Array<[string, string]> = [];
  url.searchParams.forEach((value, key) => {
    if (!skip.has(key)) out.push([key, value]);
  });
  return out;
}
function matches(row: Row, filters: Array<[string, string]>): boolean {
  return filters.every(([key, raw]) => {
    if (raw.startsWith("eq.")) return String(row[key] ?? "") === raw.slice(3);
    if (raw.startsWith("in.(") && raw.endsWith(")")) {
      const parts = raw.slice(4, -1).split(",").map((part) => part.trim().replace(/^"|"$/g, ""));
      return parts.includes(String(row[key] ?? ""));
    }
    throw new Error(`Filtro não suportado ${key}`);
  });
}
function project(row: Row, select: string | null): Row {
  if (!select || select === "*") return { ...row };
  const out: Row = {};
  for (const col of select.split(",").map((item) => item.trim())) out[col] = row[col] ?? null;
  return out;
}
function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function startMock(): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (!tables[table]) tables[table] = [];
      const filters = parseFilters(url);
      const select = url.searchParams.get("select");
      const wantsObject = String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");
      if (req.method === "GET") {
        const rows = tables[table].filter((row) => matches(row, filters)).map((row) => project(row, select));
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(rows));
        return;
      }
      const raw = await readBody(req);
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === "POST") {
        const conflict = (url.searchParams.get("on_conflict") || "").split(",").filter(Boolean);
        const incoming = (Array.isArray(body) ? body : [body]) as Row[];
        const stored: Row[] = [];
        for (const row of incoming) {
          const idx = conflict.length
            ? tables[table].findIndex((current) => conflict.every((col) => String(current[col] ?? "") === String(row[col] ?? "")))
            : -1;
          if (idx >= 0) {
            tables[table][idx] = { ...tables[table][idx], ...row };
            stored.push(tables[table][idx]);
          } else {
            const created = { id: crypto.randomUUID(), ...row };
            tables[table].push(created);
            stored.push(created);
          }
        }
        const payload = stored.map((row) => project(row, select));
        res.writeHead(201, { "content-type": "application/json" });
        res.end(JSON.stringify(wantsObject ? payload[0] ?? {} : payload));
        return;
      }
      if (req.method === "PATCH") {
        const matched = tables[table].filter((row) => matches(row, filters));
        for (const row of matched) Object.assign(row, body);
        const projected = matched.map((row) => project(row, select));
        if (wantsObject) {
          if (projected.length !== 1) {
            res.writeHead(406, { "content-type": "application/json" });
            res.end(JSON.stringify({ code: "PGRST116", details: "The result contains 0 rows", message: "JSON object requested" }));
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
      res.writeHead(405).end();
    } catch (err) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: err instanceof Error ? err.message : "erro" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

async function call(
  base: string,
  token: string | null,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: any }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function login(base: string, username: string, password: string): Promise<{ status: number; token?: string }> {
  const deviceId = `aparelho-${crypto.randomUUID()}`;
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": crypto.randomUUID(),
      "x-device-id": deviceId,
    },
    body: JSON.stringify({ username, password, deviceId }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, token: json.token };
}

function leaks(payload: unknown, samples: string[]): boolean {
  if (!payload || typeof payload !== "object") return true;
  const keys = Object.keys(payload as object);
  if (["patioPin", "vehicleDeletePassword", "stockGuardPassword"].some((key) => keys.includes(key))) return true;
  const encoded = JSON.stringify(payload);
  return samples.some((sample) => sample && encoded.includes(sample));
}

async function main() {
  record(
    "política rejeita senha nova curta e ignora vazio",
    classifyNewLoginPassword("12345").status === "invalid" &&
      classifyNewLoginPassword("   ").status === "absent" &&
      classifyNewLoginPassword("senhaok").status === "ready",
    "classificação pura"
  );
  record(
    "401 de credencial não encerra sessão; sessão expirada encerra",
    shouldClearSession(401, { code: "invalid_credentials" }) === false &&
      shouldClearSession(401, { code: "session_invalid" }) === true &&
      shouldClearSession(401, { code: "session_revoked" }) === true &&
      shouldClearSession(403, { error: "Este dispositivo foi bloqueado e não pode acessar o sistema." }) === true &&
      shouldClearSession(403, { error: "Não é possível alterar a senha de outra conta." }) === false,
    "interceptor"
  );

  const mock = await startMock();
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP_ID;
  process.env.SESSION_SECRET = SESSION_SECRET;
  process.env.HOMOLOGATION_MODE = "true";
  process.env.RDA_INTELLIGENCE_ENABLED = "false";
  process.env.RDA_ALLOW_LLM_CALLS = "false";
  delete process.env.OPENAI_API_KEY;
  delete process.env.ADMIN_PASSWORD;
  process.env.NODE_ENV = "development";

  const { createApiApp } = await import("../apiApp.ts");
  const app = createApiApp();
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  try {
    const ana = await login(base, "ana", PASS_A);
    const admin = await login(base, "Gerência", PASS_ADMIN);
    record("logins iniciais", ana.status === 200 && !!ana.token && admin.status === 200 && !!admin.token, `ana ${ana.status}, gerência ${admin.status}`);
    if (!ana.token || !admin.token) throw new Error("sem sessão fictícia");

    const hashA = String(userRow(USER_A)?.password_hash ?? "");
    const wrong = await call(base, ana.token, "POST", "/api/auth/change-my-password", {
      username: "ana",
      currentPassword: "senha-errada-ana",
      newPassword: PASS_A_NOVA,
    });
    const stillIn = await call(base, ana.token, "GET", "/api/workshop-settings");
    record(
      "senha atual incorreta não derruba a sessão",
      wrong.status === 401 && wrong.json?.code === "invalid_credentials" && stillIn.status === 200 && String(userRow(USER_A)?.password_hash) === hashA,
      `status ${wrong.status} code ${wrong.json?.code}; sessão seguinte ${stillIn.status}`
    );

    const short = await call(base, ana.token, "POST", "/api/auth/change-my-password", {
      username: "ana",
      currentPassword: PASS_A,
      newPassword: PASS_CURTA,
    });
    record(
      "senha nova curta na própria conta responde 400",
      short.status === 400 && short.json?.code === "invalid_new_password" && String(userRow(USER_A)?.password_hash) === hashA,
      `status ${short.status}`
    );

    const other = await call(base, ana.token, "POST", "/api/auth/change-my-password", {
      username: "bia",
      currentPassword: PASS_B,
      newPassword: PASS_B_NOVA,
    });
    const hashB = String(userRow(USER_B)?.password_hash ?? "");
    record(
      "uma conta não altera a senha de outra",
      other.status === 403 && other.json?.code === "password_target_mismatch" && String(userRow(USER_B)?.password_hash) === hashB,
      `status ${other.status}`
    );

    const changed = await call(base, ana.token, "POST", "/api/auth/change-my-password", {
      username: "ana",
      currentPassword: PASS_A,
      newPassword: `  ${PASS_A_NOVA}  `,
    });
    const oldLogin = await login(base, "ana", PASS_A);
    const newLogin = await login(base, "ana", PASS_A_NOVA);
    record(
      "própria senha válida autentica e a antiga é recusada",
      changed.status === 200 && changed.json?.passwordUpdated === true && oldLogin.status === 401 && newLogin.status === 200,
      `troca ${changed.status}; antiga ${oldLogin.status}; nova ${newLogin.status}`
    );

    const nameBefore = String(userRow(USER_B)?.display_name ?? "");
    const shortReset = await call(base, admin.token, "PUT", `/api/system-users/${USER_B}`, {
      adminPassword: PASS_ADMIN,
      password: PASS_CURTA,
      displayName: "Não deve gravar",
    });
    record(
      "redefinição com 4 ou 5 caracteres não finge sucesso",
      shortReset.status === 400 && String(userRow(USER_B)?.password_hash) === hashB && String(userRow(USER_B)?.display_name) === nameBefore,
      `status ${shortReset.status}`
    );

    const keep = await call(base, admin.token, "PUT", `/api/system-users/${USER_B}`, {
      adminPassword: PASS_ADMIN,
      password: "   ",
      displayName: "Bia atualizada",
      permissions: { access_patio: true },
    });
    const oldB = await login(base, "bia", PASS_B);
    record(
      "salvar sem senha preserva a senha e as permissões",
      keep.status === 200 &&
        keep.json?.passwordUpdated === false &&
        keep.json?.permissions?.access_patio === true &&
        oldB.status === 200 &&
        String(userRow(USER_B)?.display_name) === "Bia atualizada",
      `status ${keep.status}; login antigo ${oldB.status}`
    );

    const reset = await call(base, admin.token, "PUT", `/api/system-users/${USER_B}`, {
      adminPassword: PASS_ADMIN,
      password: PASS_B_NOVA,
    });
    const biaOld = await login(base, "bia", PASS_B);
    const biaNew = await login(base, "bia", PASS_B_NOVA);
    record(
      "Gerência redefine a senha do funcionário",
      reset.status === 200 && reset.json?.passwordUpdated === true && biaOld.status === 401 && biaNew.status === 200,
      `status ${reset.status}; antiga ${biaOld.status}; nova ${biaNew.status}`
    );

    const stranger = await call(base, newLogin.token || null, "PUT", `/api/system-users/${USER_A}`, {
      password: "senha-invasora",
      displayName: "Invadida",
    });
    record("funcionário sem senha da Gerência não redefine colega", stranger.status === 403, `status ${stranger.status}`);

    const adminHash = setting("admin_password");
    const shortAdmin = await call(base, admin.token, "PUT", "/api/workshop-settings", {
      adminPassword: PASS_CURTA,
      labProductKinds: [{ id: "nao", label: "Não gravar" }],
    });
    record(
      "senha curta da Gerência responde 400 e não grava o restante",
      shortAdmin.status === 400 && setting("admin_password") === adminHash && !setting("lab_product_kinds").includes("Não gravar"),
      `status ${shortAdmin.status}`
    );

    const adminPut = await call(base, admin.token, "PUT", "/api/workshop-settings", { adminPassword: PASS_ADMIN_NOVA });
    const adminOld = await login(base, "Gerência", PASS_ADMIN);
    const adminNew = await login(base, "Gerência", PASS_ADMIN_NOVA);
    const samples = [PASS_ADMIN, PASS_ADMIN_NOVA, PIN, DELETE_PW, STOCK_PW, PASS_A_NOVA];
    record(
      "senha da Gerência válida autentica e a resposta não vaza segredo",
      adminPut.status === 200 &&
        adminPut.json?.adminPasswordUpdated === true &&
        !leaks(adminPut.json, samples) &&
        adminOld.status === 401 &&
        adminNew.status === 200,
      `status ${adminPut.status}; antiga ${adminOld.status}; nova ${adminNew.status}`
    );

    const preservedPin = setting("patio_pin");
    const preservedDelete = setting("vehicle_delete_password");
    const preservedStock = setting("stock_guard_password");
    const labels = await call(base, adminNew.token || null, "PUT", "/api/workshop-settings", {
      labelTemplates: { lab_os: { name: "etiqueta-ficticia" } },
      patioPin: "   ",
      vehicleDeletePassword: "",
      stockGuardPassword: " ",
    });
    const stockOk = await call(base, adminNew.token || null, "POST", "/api/workshop-parts/verify-stock-guard", { password: STOCK_PW });
    const deleteOk = await call(base, adminNew.token || null, "POST", `/api/service-orders/${OS_ID}/delete-with-password`, { password: DELETE_PW });
    const settings = await call(base, ana.token, "GET", "/api/workshop-settings");
    record(
      "SEC-02 permanece: segredos ocultos e exclusão/estoque seguem válidos",
      labels.status === 200 &&
        setting("patio_pin") === preservedPin &&
        setting("vehicle_delete_password") === preservedDelete &&
        setting("stock_guard_password") === preservedStock &&
        stockOk.status === 200 &&
        deleteOk.status === 200 &&
        settings.status === 200 &&
        !leaks(settings.json, samples),
      `etiquetas ${labels.status}; estoque ${stockOk.status}; exclusão ${deleteOk.status}`
    );

    const expired = await call(base, signExpired(), "GET", "/api/workshop-settings");
    record(
      "sessão expirada continua sendo recusada",
      expired.status === 401 && expired.json?.code === "session_invalid",
      `status ${expired.status} code ${expired.json?.code}`
    );
  } finally {
    server.close();
    mock.server.close();
  }

  console.log(`\n${passed} ok, ${failed} falhas`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("ERRO", err instanceof Error ? err.message : "falha");
  process.exit(1);
});
