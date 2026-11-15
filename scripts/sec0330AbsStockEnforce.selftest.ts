/**
 * SEC-03.30: Estoque ABS exige a chave do hub Estoque.
 * Oficinas, funcionários, modelos e módulos são fictícios.
 * npm run test:sec0330-abs-stock-enforce
 */
import http from "node:http";
import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { productionAuthorizationPolicy } from "../utils/authorizationPolicy.js";
import { authorizationHasEnforce, findMatchingRules } from "../utils/authorizeRequest.js";
import { acceptedAbsModulePhotoContentType } from "../utils/absModulePhotoGuard.js";
import { RDA_PRODUCTION_TOOLS } from "../services/rdaIntelligence/tools/definitions.js";

const WORKSHOP = "11111111-1111-4111-8111-111111111111";
const OTHER = "99999999-9999-4999-8999-999999999999";
const STOCK = "22222222-2222-4222-8222-222222222301";
const LAB = "22222222-2222-4222-8222-222222222302";
const PATIO = "22222222-2222-4222-8222-222222222303";
const RECEP = "22222222-2222-4222-8222-222222222304";
const ORC = "22222222-2222-4222-8222-222222222305";
const NONE = "22222222-2222-4222-8222-222222222306";
const FULL = "22222222-2222-4222-8222-222222222307";
const FAIL = "22222222-2222-4222-8222-222222222308";
const MODEL = "44444444-4444-4444-8444-444444444441";
const MODEL_USED = "44444444-4444-4444-8444-444444444442";
const UNIT = "55555555-5555-4555-8555-555555555551";
const UNIT_USED = "55555555-5555-4555-8555-555555555552";
const UNIT_OTHER = "55555555-5555-4555-8555-555555555553";
const PASS_USER = "senha-ficticia-sec0330";
const PASS_ADMIN = "gerencia-ficticia-sec0330";
const STAMP = "2026-11-15T12:00:00.000Z";
const BUCKET = "vehicle-photos";
const ENFORCED =
  "customers,appointments,budgets,comments,photos,parts_stock,abs_stock,technicians,workshop_catalogs,tv_admin,bulletins,reports";

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

function likeMatches(value: unknown, pattern: string): boolean {
  const text = String(value ?? "").toLowerCase();
  const needle = pattern.replace(/\*/g, "%").replace(/%/g, "").toLowerCase();
  if (!needle) return true;
  return text.includes(needle);
}

function matchesClause(row: Row, clause: string): boolean {
  const eq = clause.match(/^([a-z0-9_]+)\.eq\.(.*)$/i);
  if (eq) return String(row[eq[1]] ?? "") === eq[2];
  const ilike = clause.match(/^([a-z0-9_]+)\.ilike\.(.*)$/i);
  if (ilike) return likeMatches(row[ilike[1]], ilike[2]);
  const inn = clause.match(/^([a-z0-9_]+)\.in\.\((.*)\)$/i);
  if (inn) return new Set(inn[2].split(",")).has(String(row[inn[1]] ?? ""));
  return false;
}

function matchesFilter(row: Row, key: string, raw: string): boolean {
  if (key === "or") return splitOr(raw).some((clause) => matchesClause(row, clause));
  if (raw.startsWith("ilike.")) return likeMatches(row[key], raw.slice(6));
  if (raw.startsWith("gte.") || raw.startsWith("lte.")) return true;
  const value = row[key];
  const text = value == null ? "" : String(value);
  if (raw.startsWith("eq.")) return text === raw.slice(3);
  if (raw.startsWith("neq.")) return text !== raw.slice(4);
  if (raw === "is.null") return value == null || text === "";
  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    const set = new Set(raw.slice(4, -1).split(",").map((item) => item.replace(/^"|"$/g, "")));
    return set.has(text);
  }
  return false;
}

function nextPublicId(tables: Record<string, Row[]>): string {
  const nums = (tables.workshop_abs_modules || [])
    .map((row) => String(row.public_id || "").match(/^ABS-(\d+)$/i)?.[1])
    .filter((item): item is string => !!item)
    .map((item) => Number(item));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `ABS-${String(next).padStart(6, "0")}`;
}

function nextSequence(tables: Record<string, Row[]>, modelId: string): number {
  const nums = (tables.workshop_abs_modules || [])
    .filter((row) => row.model_id === modelId)
    .map((row) => Number(row.sequence_number) || 0);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

async function startMock(tables: Record<string, Row[]>, files: StoredFile[]): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const raw = Buffer.concat(chunks);
      const json = (): Row => (raw.length ? (JSON.parse(raw.toString("utf8")) as Row) : {});

      if (url.pathname.startsWith("/storage/v1/object/")) {
        const upload = url.pathname.match(/^\/storage\/v1\/object\/([^/]+)\/(.+)$/);
        if (req.method === "POST" && upload && upload[1] !== "list") {
          const path = decodeURIComponent(upload[2]);
          files.push({
            bucket: upload[1],
            path,
            contentType: String(req.headers["content-type"] || "application/octet-stream"),
          });
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ Key: path }));
          return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ message: "storage" }));
        return;
      }

      const resource = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, "").replace(/\/$/, ""));
      if (resource.startsWith("rpc/")) {
        const name = resource.slice(4);
        const body = json();
        const fail = (message: string) => {
          res.writeHead(400, { "content-type": "application/json" });
          res.end(JSON.stringify({ message, code: "P0001" }));
        };
        if (name === "next_workshop_abs_module_public_id") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(nextPublicId(tables)));
          return;
        }
        if (name === "next_workshop_abs_module_sequence") {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(nextSequence(tables, String(body.p_model_id || ""))));
          return;
        }
        if (name === "resolve_or_create_abs_module_model") {
          if (!tables.workshop_abs_module_models) tables.workshop_abs_module_models = [];
          const found = tables.workshop_abs_module_models.find(
            (row) =>
              row.workshop_id === body.p_workshop_id &&
              row.manufacturer === body.p_manufacturer &&
              row.family === body.p_family &&
              row.module_kind === body.p_module_kind
          );
          if (found) {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify(found.id));
            return;
          }
          const created = {
            id: crypto.randomUUID(),
            workshop_id: body.p_workshop_id,
            manufacturer: body.p_manufacturer,
            family: body.p_family,
            module_kind: body.p_module_kind,
            notes: body.p_notes ?? null,
            fingerprint: `rpc:${body.p_manufacturer}:${body.p_family}:${body.p_module_kind}`,
            created_at: STAMP,
            updated_at: STAMP,
          };
          tables.workshop_abs_module_models.push(created);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify(created.id));
          return;
        }
        if (name === "apply_workshop_abs_module_movement") {
          const mod = (tables.workshop_abs_modules || []).find(
            (row) => row.id === body.p_module_id && row.workshop_id === body.p_workshop_id
          );
          if (!mod) return fail("Módulo ABS não encontrado.");
          if (mod.status === "desmembrado") return fail("Módulo desmembrado não pode ser movimentado.");
          if (body.p_movement_type === "exit") {
            mod.status = "fora_estoque";
          } else if (body.p_to_location) {
            mod.location = body.p_to_location;
          }
          const movement = {
            id: crypto.randomUUID(),
            workshop_id: body.p_workshop_id,
            module_id: mod.id,
            movement_type: body.p_movement_type,
            to_location: body.p_to_location ?? null,
            to_status: mod.status,
            notes: body.p_notes ?? null,
            recorded_by_name: body.p_recorded_by_name ?? null,
            service_order_id: body.p_service_order_id ?? null,
            created_at: STAMP,
          };
          if (!tables.workshop_abs_module_movements) tables.workshop_abs_module_movements = [];
          tables.workshop_abs_module_movements.push(movement);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ module: { ...mod }, movement }));
          return;
        }
        if (name === "disassemble_workshop_abs_module") {
          const mod = (tables.workshop_abs_modules || []).find(
            (row) => row.id === body.p_source_module_id && row.workshop_id === body.p_workshop_id
          );
          if (!mod) return fail("Módulo ABS não encontrado.");
          if (mod.module_kind !== "completo" || mod.status !== "disponivel") {
            return fail("Somente um módulo completo disponível pode ser desmembrado.");
          }
          if ((tables.workshop_abs_module_disassemblies || []).some((row) => row.source_module_id === mod.id)) {
            return fail("Este módulo já foi desmembrado.");
          }
          const withdrawnKind = String(body.p_withdrawn_kind || "");
          if (withdrawnKind !== "eletronico" && withdrawnKind !== "hidraulico") {
            return fail("Tipo retirado inválido.");
          }
          const remainingKind = withdrawnKind === "eletronico" ? "hidraulico" : "eletronico";
          const child = (kind: string, location: unknown, code: unknown) => {
            const row = {
              id: crypto.randomUUID(),
              workshop_id: body.p_workshop_id,
              public_id: nextPublicId(tables),
              manufacturer: mod.manufacturer,
              original_code: code ?? mod.original_code,
              model: mod.model,
              module_kind: kind,
              status: "disponivel",
              location,
              model_id: mod.model_id,
              sequence_number: nextSequence(tables, String(mod.model_id || "")),
              parent_complete_id: mod.id,
              item_state: mod.item_state,
              item_condition: mod.item_condition,
              created_at: STAMP,
              updated_at: STAMP,
            };
            tables.workshop_abs_modules.push(row);
            return row;
          };
          const remaining = child(remainingKind, body.p_remaining_location, body.p_remaining_primary_code);
          const withdrawn = child(withdrawnKind, body.p_withdrawn_location, body.p_withdrawn_primary_code);
          if (body.p_destination !== "estoque") withdrawn.status = "fora_estoque";
          mod.status = "desmembrado";
          mod.updated_at = STAMP;
          const disassembly = {
            id: crypto.randomUUID(),
            workshop_id: body.p_workshop_id,
            source_module_id: mod.id,
            remaining_module_id: remaining.id,
            withdrawn_module_id: withdrawn.id,
          };
          if (!tables.workshop_abs_module_disassemblies) tables.workshop_abs_module_disassemblies = [];
          tables.workshop_abs_module_disassemblies.push(disassembly);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ source: { ...mod }, remaining: { ...remaining }, withdrawn: { ...withdrawn }, disassembly }));
          return;
        }
        res.writeHead(404, { "content-type": "application/json" });
        res.end(JSON.stringify({ code: "PGRST202", message: "function does not exist" }));
        return;
      }

      const table = resource;
      if (!tables[table]) tables[table] = [];
      const body = raw.length ? json() : {};
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
        if (select.includes("workshop_abs_modules")) {
          const mod = (tables.workshop_abs_modules || []).find((item) => item.id === row.module_id);
          if (!mod) return {};
          return { ...row, module: mod };
        }
        if (!select || select === "*") return { ...row };
        const out: Row = {};
        for (const col of select.split(",").map((item) => item.trim())) {
          if (!col || col.includes("(")) continue;
          out[col] = row[col] ?? null;
        }
        return out;
      };
      const wantsObject = String(req.headers.accept || "").includes("application/vnd.pgrst.object+json");
      if (req.method === "HEAD") {
        const rows = tables[table].filter(matches);
        res.writeHead(200, {
          "content-type": "application/json",
          "content-range": `*/${rows.length}`,
        });
        res.end();
        return;
      }
      if (req.method === "GET") {
        let rows = tables[table].filter(matches).map(project);
        if (select.includes("workshop_abs_modules")) rows = rows.filter((row) => row.module);
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
        if (
          table === "workshop_abs_module_models" &&
          incoming.some((row) =>
            tables[table].some(
              (item) => item.workshop_id === row.workshop_id && item.fingerprint && item.fingerprint === row.fingerprint
            )
          )
        ) {
          res.writeHead(409, { "content-type": "application/json" });
          res.end(JSON.stringify({ message: "duplicate key value violates unique constraint", code: "23505" }));
          return;
        }
        const stored = incoming.map((row) => {
          const created = { id: row.id ?? crypto.randomUUID(), created_at: STAMP, updated_at: STAMP, ...row };
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
    } catch (error) {
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ message: error instanceof Error ? error.message : "mock" }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  return { server, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

type Hit = { status: number; body: string; code: string };

async function hit(
  base: string,
  path: string,
  method: string,
  token?: string,
  body?: unknown,
  headers?: Record<string, string>
): Promise<Hit> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
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

async function uploadPhoto(
  base: string,
  path: string,
  token: string,
  fileName: string,
  contentType: string,
  bytes: Uint8Array
): Promise<Hit> {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: contentType }), fileName);
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await response.text();
  return { status: response.status, body: text, code: "" };
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
  const winner = (method: string, path: string) => {
    const matches = findMatchingRules(production, method, path);
    const top = matches.reduce((best, rule) => Math.max(best, rule.priority), 0);
    return matches.filter((rule) => rule.priority === top);
  };
  const samples: Array<[string, string, string]> = [
    ["GET", "/api/abs-modules", "abs_modules_read"],
    ["GET", "/api/abs-modules/lookup", "abs_modules_lookup_read"],
    ["GET", "/api/abs-modules/search", "abs_modules_search_read"],
    ["GET", "/api/abs-modules/movements", "abs_modules_movements_read"],
    ["GET", "/api/abs-modules/sales", "abs_modules_sales_read"],
    ["GET", "/api/abs-modules/analytics", "abs_modules_analytics_read"],
    ["POST", "/api/abs-modules", "abs_modules_create"],
    ["GET", "/api/abs-modules/ABS-000001", "abs_module_read"],
    ["PUT", "/api/abs-modules/ABS-000001", "abs_module_update"],
    ["DELETE", "/api/abs-modules/ABS-000001", "abs_module_delete"],
    ["GET", "/api/abs-modules/ABS-000001/movements", "abs_module_movements_read"],
    ["POST", "/api/abs-modules/ABS-000001/movements", "abs_module_move"],
    ["GET", "/api/abs-modules/ABS-000001/disassembly", "abs_module_disassembly_read"],
    ["POST", "/api/abs-modules/ABS-000001/disassemble", "abs_module_disassemble"],
    ["POST", "/api/abs-modules/ABS-000001/photo", "abs_module_photo_create"],
    ["DELETE", "/api/abs-modules/ABS-000001/photos/foto-1", "abs_module_photo_delete"],
    ["GET", "/api/abs-module-models", "abs_models_read"],
    ["POST", "/api/abs-module-models", "abs_models_create"],
    ["GET", "/api/abs-module-models/modelo-1", "abs_model_read"],
    ["PUT", "/api/abs-module-models/modelo-1", "abs_model_update"],
    ["DELETE", "/api/abs-module-models/modelo-1", "abs_model_delete"],
  ];
  const absRules = production.rules.filter((rule) => rule.family === "abs_stock");
  const absSearch = RDA_PRODUCTION_TOOLS.find((tool) => tool.id === "rda_stock_abs_search");
  const absLocate = RDA_PRODUCTION_TOOLS.find((tool) => tool.id === "rda_stock_abs_locate");
  record(
    "abs_stock entra em enforce e as outras onze permanecem",
    enforced.join(",") === ENFORCED &&
      off.join(",") === "service_orders,notifications,quality_radar,rda" &&
      samples.every(([method, path, id]) => winner(method, path).length === 1 && winner(method, path)[0].id === id) &&
      absRules.every((rule) => rule.anyOf.length === 1 && rule.anyOf[0] === "access_estoque_pecas") &&
      !absRules.some((rule) => rule.anyOf.includes("access_laboratorio")) &&
      winner("POST", "/api/abs-modules/ABS-000001/disassemble")[0].action === "move" &&
      winner("POST", "/api/abs-modules/ABS-000001/photo").every((rule) => rule.family === "abs_stock") &&
      findMatchingRules(production, "GET", "/api/workshop-parts").every((rule) => rule.family === "parts_stock"),
    `enforce=${enforced.join(",")}`
  );
  record(
    "desligar abs_stock não abre as outras famílias",
    authorizationHasEnforce(production, { SEC03_DISABLE_FAMILIES: "abs_stock" }) === true,
    "reversão"
  );
  record(
    "RDA consulta o banco com a chave do estoque e não usa esta rota",
    absSearch?.requiredPermission === "access_estoque_pecas" &&
      absLocate?.requiredPermission === "access_estoque_pecas" &&
      findMatchingRules(production, "POST", "/api/rda/chat").every((rule) => rule.family !== "abs_stock"),
    absSearch?.requiredPermission || "ausente"
  );
  record(
    "svg e html não são foto de módulo",
    acceptedAbsModulePhotoContentType("peca.svg", "image/svg+xml") === null &&
      acceptedAbsModulePhotoContentType("pagina.html", "text/html") === null &&
      acceptedAbsModulePhotoContentType("modulo.jpg", "image/jpeg") === "image/jpeg",
    "guarda"
  );

  const files: StoredFile[] = [];
  const tables: Record<string, Row[]> = {
    workshop_settings: [
      { workshop_id: WORKSHOP, key: "admin_password", value: hashPassword(PASS_ADMIN), updated_at: STAMP },
    ],
    workshop_system_users: [
      user(STOCK, "estoque", { access_estoque_pecas: true }),
      user(LAB, "lab", { access_laboratorio: true }),
      user(PATIO, "patio", { access_patio: true }),
      user(RECEP, "recepcao", { access_reception: true }),
      user(ORC, "orcamento", { access_orcamentos: true }),
      user(NONE, "semchave", {}),
      user(FULL, "total", { full_access: true }),
      user(FAIL, "falha", { access_estoque_pecas: true }),
    ],
    workshop_abs_module_models: [
      {
        id: MODEL,
        workshop_id: WORKSHOP,
        manufacturer: "Bosch",
        family: "Corolla",
        module_kind: "completo",
        notes: null,
        fingerprint: "bosch-existente",
        created_at: STAMP,
        updated_at: STAMP,
      },
      {
        id: MODEL_USED,
        workshop_id: WORKSHOP,
        manufacturer: "Continental",
        family: "Civic",
        module_kind: "completo",
        notes: null,
        fingerprint: "continental-com-unidade",
        created_at: STAMP,
        updated_at: STAMP,
      },
    ],
    workshop_abs_module_codes: [
      {
        id: crypto.randomUUID(),
        workshop_id: WORKSHOP,
        model_id: MODEL,
        component_scope: "completo",
        code_role: "fabricante",
        code_value: "0265000001",
        sort_order: 0,
      },
    ],
    workshop_abs_module_applications: [
      {
        id: crypto.randomUUID(),
        workshop_id: WORKSHOP,
        model_id: MODEL,
        component_scope: "completo",
        vehicle_brand: "Toyota",
        vehicle_model: "Corolla",
        sort_order: 0,
      },
    ],
    workshop_abs_module_model_photos: [],
    workshop_abs_modules: [
      {
        id: UNIT,
        workshop_id: WORKSHOP,
        public_id: "ABS-000001",
        manufacturer: "Bosch",
        original_code: "0265000001",
        application: "Corolla",
        model: "Corolla",
        module_kind: "completo",
        status: "disponivel",
        location: "Prateleira A",
        model_id: MODEL,
        sequence_number: 1,
        item_state: "usado",
        item_condition: "nao_testado",
        parent_complete_id: null,
        created_at: STAMP,
        updated_at: STAMP,
      },
      {
        id: UNIT_USED,
        workshop_id: WORKSHOP,
        public_id: "ABS-000002",
        manufacturer: "Continental",
        original_code: "CIVIC-1",
        module_kind: "completo",
        status: "disponivel",
        location: "Prateleira B",
        model_id: MODEL_USED,
        sequence_number: 1,
        item_state: "usado",
        item_condition: "com_avarias",
        parent_complete_id: null,
        created_at: STAMP,
        updated_at: STAMP,
      },
      {
        id: UNIT_OTHER,
        workshop_id: OTHER,
        public_id: "ABS-000099",
        manufacturer: "Segredo",
        original_code: "OUTRA-OFICINA",
        module_kind: "completo",
        status: "disponivel",
        location: "Cofre",
        model_id: null,
        sequence_number: 1,
        created_at: STAMP,
        updated_at: STAMP,
      },
    ],
    workshop_abs_module_movements: [],
    workshop_abs_module_disassemblies: [],
    workshop_abs_module_unit_photos: [],
    workshop_device_sessions: [],
    workshop_blocked_devices: [],
    customers: [],
    workshop_parts: [{ id: "peca-1", workshop_id: WORKSHOP, name: "Sensor", stock_qty: 4 }],
  };

  const mock = await startMock(tables, files);
  process.env.SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "homolog-service-role-ficticio";
  process.env.WORKSHOP_ID = WORKSHOP;
  process.env.SESSION_SECRET = "homolog-session-sec0330-local";
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
  const count = (table: string) => tables[table].length;
  const unit = (publicId: string) => tables.workshop_abs_modules.find((row) => row.public_id === publicId);

  try {
    const stock = await login(base, "estoque", PASS_USER);
    const lab = await login(base, "lab", PASS_USER);
    const patio = await login(base, "patio", PASS_USER);
    const recep = await login(base, "recepcao", PASS_USER);
    const orc = await login(base, "orcamento", PASS_USER);
    const none = await login(base, "semchave", PASS_USER);
    const full = await login(base, "total", PASS_USER);
    const fail = await login(base, "falha", PASS_USER);
    const gerencia = await login(base, "Gerência", PASS_ADMIN);

    const anon = await hit(base, "/api/abs-modules", "GET");
    const invalid = await hit(base, "/api/abs-modules", "GET", "sessao-invalida");
    record("sessão ausente ou inválida", anon.status === 401 && invalid.status === 401, `${anon.status}/${invalid.status}`);

    const listed = await hit(base, "/api/abs-modules", "GET", stock);
    const lookup = await hit(base, "/api/abs-modules/lookup?code=ABS-000001", "GET", stock);
    const search = await hit(base, "/api/abs-modules/search?q=0265000001", "GET", stock);
    const models = await hit(base, "/api/abs-module-models", "GET", stock);
    const analytics = await hit(base, "/api/abs-modules/analytics?preset=30d", "GET", stock);
    record(
      "estoque consulta unidades, código, busca, modelos e análise",
      listed.status === 200 &&
        listed.body.includes("ABS-000001") &&
        !listed.body.includes("OUTRA-OFICINA") &&
        lookup.status === 200 &&
        lookup.body.includes("Prateleira A") &&
        search.status === 200 &&
        search.body.includes("ABS-000001") &&
        models.status === 200 &&
        models.body.includes("Bosch") &&
        analytics.status === 200,
      [listed, lookup, search, models, analytics].map((item) => item.status).join("/")
    );

    const beforeDenied = count("workshop_abs_modules");
    const readers = [lab, patio, recep, orc, none];
    const readDenied = await Promise.all(readers.map((token) => hit(base, "/api/abs-modules", "GET", token)));
    const writeDenied = await Promise.all(
      readers.map((token) =>
        hit(base, "/api/abs-modules", "POST", token, {
          manufacturer: "Intruso",
          original_code: "NAO-GRAVAR",
          module_kind: "completo",
          location: "Fora",
        })
      )
    );
    record(
      "laboratório, pátio, recepção, orçamento e sessão sem chave não consultam nem gravam",
      readDenied.every((item) => item.status === 403 && item.code === "permission_denied") &&
        writeDenied.every((item) => item.status === 403 && item.code === "permission_denied") &&
        count("workshop_abs_modules") === beforeDenied &&
        !tables.workshop_abs_modules.some((row) => row.original_code === "NAO-GRAVAR"),
      `leitura ${readDenied.map((item) => item.status).join("/")}; escrita ${writeDenied.map((item) => item.status).join("/")}`
    );

    const created = await hit(base, "/api/abs-modules", "POST", stock, {
      manufacturer: "Bosch",
      model: "Corolla",
      original_code: "0265000099",
      module_kind: "completo",
      item_state: "novo",
      item_condition: "perfeito",
      location: "Gaveta 3",
      recorded_by_name: "Estoque ficticio",
    });
    const createdRow = tables.workshop_abs_modules.find((row) => row.original_code === "0265000099");
    record(
      "estoque cadastra a unidade e o histórico de entrada",
      created.status === 201 &&
        !!createdRow &&
        createdRow.workshop_id === WORKSHOP &&
        createdRow.status === "disponivel" &&
        createdRow.location === "Gaveta 3" &&
        createdRow.item_state === "novo" &&
        String(createdRow.public_id).startsWith("ABS-") &&
        tables.workshop_abs_module_movements.some(
          (row) => row.module_id === createdRow.id && row.movement_type === "entry" && row.recorded_by_name === "Estoque ficticio"
        ),
      `${created.status} ${created.body.slice(0, 180)}`
    );

    const modelCreated = await hit(base, "/api/abs-module-models", "POST", stock, {
      manufacturer: "Aisin",
      family: "Hilux",
      module_kind: "eletronico",
      codes: [{ component_scope: "eletronico", code_role: "fabricante", code_value: "AISIN-1", sort_order: 0 }],
    });
    const modelAgain = await hit(base, "/api/abs-module-models", "POST", stock, {
      manufacturer: "Aisin",
      family: "Hilux",
      module_kind: "eletronico",
      codes: [{ component_scope: "eletronico", code_role: "fabricante", code_value: "AISIN-1", sort_order: 0 }],
    });
    const aisin = tables.workshop_abs_module_models.filter((row) => row.manufacturer === "Aisin");
    record(
      "modelo novo grava o código e o duplicado não entra",
      modelCreated.status === 201 &&
        aisin.length === 1 &&
        tables.workshop_abs_module_codes.some((row) => row.model_id === aisin[0].id && row.code_value === "AISIN-1") &&
        modelAgain.status === 400 &&
        aisin.length === 1,
      `${modelCreated.status}/${modelAgain.status}`
    );

    const updated = await hit(base, "/api/abs-modules/ABS-000001", "PUT", stock, {
      manufacturer: "Bosch",
      original_code: "0265000001",
      model: "Corolla",
      module_kind: "completo",
      item_state: "usado",
      item_condition: "com_avarias",
      damage_description: "carcaça marcada",
      location: "Bancada 2",
      status: "disponivel",
    });
    record(
      "estoque altera localização e avaria",
      updated.status === 200 &&
        unit("ABS-000001")?.location === "Bancada 2" &&
        unit("ABS-000001")?.item_condition === "com_avarias" &&
        unit("ABS-000001")?.damage_description === "carcaça marcada",
      `${updated.status} ${String(unit("ABS-000001")?.location)}`
    );
    const labEdit = await hit(base, "/api/abs-modules/ABS-000001", "PUT", lab, {
      location: "Laboratório indevido",
      status: "fora_estoque",
    });
    record(
      "laboratório não altera a unidade",
      labEdit.status === 403 && unit("ABS-000001")?.location === "Bancada 2" && unit("ABS-000001")?.status === "disponivel",
      String(labEdit.status)
    );

    const moved = await hit(base, "/api/abs-modules/ABS-000001/movements", "POST", stock, {
      movement_type: "transfer",
      to_location: "Gaveta 9",
      recorded_by_name: "Estoque ficticio",
    });
    record(
      "transferência grava o destino e o movimento",
      moved.status === 201 &&
        unit("ABS-000001")?.location === "Gaveta 9" &&
        tables.workshop_abs_module_movements.some(
          (row) => row.module_id === UNIT && row.movement_type === "transfer" && row.to_location === "Gaveta 9"
        ),
      `${moved.status} ${String(unit("ABS-000001")?.location)}`
    );
    const movements = count("workshop_abs_module_movements");
    const labMove = await hit(base, "/api/abs-modules/ABS-000001/movements", "POST", lab, {
      movement_type: "exit",
      recorded_by_name: "Laboratório",
    });
    record(
      "laboratório não movimenta",
      labMove.status === 403 &&
        unit("ABS-000001")?.status === "disponivel" &&
        count("workshop_abs_module_movements") === movements,
      String(labMove.status)
    );

    const publicCreated = String(createdRow?.public_id || "");
    const beforeSplit = count("workshop_abs_modules");
    const split = await hit(base, `/api/abs-modules/${publicCreated}/disassemble`, "POST", stock, {
      withdrawn_kind: "eletronico",
      destination: "estoque",
      remaining_location: "Hidráulica",
      withdrawn_location: "Eletrônica",
      remaining_primary_code: "HID-99",
      withdrawn_primary_code: "ELE-99",
      recorded_by_name: "Estoque ficticio",
    });
    const children = tables.workshop_abs_modules.filter((row) => row.parent_complete_id === createdRow?.id);
    const source = tables.workshop_abs_modules.find((row) => row.id === createdRow?.id);
    const link = tables.workshop_abs_module_disassemblies.find((row) => row.source_module_id === createdRow?.id);
    record(
      "desmembramento liga o completo às duas peças",
      split.status === 201 &&
        source?.status === "desmembrado" &&
        children.length === 2 &&
        children.some((row) => row.module_kind === "eletronico" && row.original_code === "ELE-99") &&
        children.some((row) => row.module_kind === "hidraulico" && row.original_code === "HID-99") &&
        link?.remaining_module_id &&
        link?.withdrawn_module_id &&
        count("workshop_abs_modules") === beforeSplit + 2,
      `${split.status} filhos ${children.length}`
    );
    const again = await hit(base, `/api/abs-modules/${publicCreated}/disassemble`, "POST", stock, {
      withdrawn_kind: "hidraulico",
      destination: "estoque",
    });
    const childId = String(children.find((row) => row.module_kind === "eletronico")?.public_id || "");
    const childSplit = await hit(base, `/api/abs-modules/${childId}/disassemble`, "POST", stock, {
      withdrawn_kind: "eletronico",
      destination: "estoque",
    });
    record(
      "completo já desmembrado e a peça filha não geram outro vínculo",
      again.status === 400 &&
        childSplit.status === 400 &&
        tables.workshop_abs_module_disassemblies.filter((row) => row.source_module_id === createdRow?.id).length === 1 &&
        count("workshop_abs_modules") === beforeSplit + 2,
      `${again.status}/${childSplit.status}`
    );
    const detail = await hit(base, `/api/abs-modules/${publicCreated}/disassembly`, "GET", stock);
    record(
      "estoque lê o vínculo do desmembramento",
      detail.status === 200 && detail.body.includes("ELE-99") && detail.body.includes("HID-99"),
      String(detail.status)
    );

    const other = await hit(base, "/api/abs-modules/ABS-000099", "GET", stock);
    const bogus = await hit(base, "/api/abs-modules/ABS-999999", "GET", stock);
    const malformed = await hit(base, "/api/abs-modules/nao-e-abs", "GET", stock);
    record(
      "outra oficina, id inexistente e id manipulado não abrem unidade",
      other.status === 404 &&
        !other.body.includes("Segredo") &&
        unit("ABS-000099")?.workshop_id === OTHER &&
        bogus.status === 404 &&
        malformed.status === 400,
      `${other.status}/${bogus.status}/${malformed.status}`
    );

    const beforePhoto = count("workshop_abs_module_unit_photos");
    const beforeFiles = files.length;
    const jpeg = await uploadPhoto(
      base,
      "/api/abs-modules/ABS-000001/photo",
      stock,
      "modulo.jpg",
      "image/jpeg",
      Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])
    );
    const photoRow = tables.workshop_abs_module_unit_photos.find((row) => row.module_id === UNIT);
    record(
      "foto jpeg fica na oficina e no módulo",
      jpeg.status === 201 &&
        !!photoRow &&
        String(photoRow.photo_url).includes("/object/public/") &&
        files.some(
          (file) =>
            file.bucket === BUCKET &&
            file.path.startsWith(`${WORKSHOP}/abs-modules/${UNIT}/`) &&
            file.path.endsWith(".jpg") &&
            !file.path.includes("..")
        ),
      `${jpeg.status} arquivos ${files.length}`
    );
    const svg = await uploadPhoto(
      base,
      "/api/abs-modules/ABS-000001/photo",
      stock,
      "peca.svg",
      "image/svg+xml",
      Uint8Array.from(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))
    );
    const html = await uploadPhoto(
      base,
      "/api/abs-modules/ABS-000001/photo",
      lab,
      "pagina.html",
      "text/html",
      Uint8Array.from(Buffer.from("<html></html>"))
    );
    record(
      "svg e html não geram arquivo",
      svg.status === 400 &&
        html.status === 403 &&
        count("workshop_abs_module_unit_photos") === beforePhoto + 1 &&
        files.length === beforeFiles + 1 &&
        !files.some((file) => file.path.endsWith(".svg") || file.path.endsWith(".html")),
      `${svg.status}/${html.status}`
    );
    const photoId = String(photoRow?.id || "");
    const removedPhoto = await hit(base, `/api/abs-modules/ABS-000001/photos/${photoId}`, "DELETE", stock);
    record(
      "estoque remove a foto da unidade",
      removedPhoto.status === 200 && !tables.workshop_abs_module_unit_photos.some((row) => row.id === photoId),
      String(removedPhoto.status)
    );

    const blockedDelete = await hit(base, "/api/abs-modules/ABS-000002", "DELETE", stock);
    const wrongDelete = await hit(base, "/api/abs-modules/ABS-000002", "DELETE", stock, { password: "senha-errada" });
    record(
      "excluir sem senha ou com senha errada preserva a unidade",
      blockedDelete.status === 400 && wrongDelete.status === 401 && !!unit("ABS-000002"),
      `${blockedDelete.status}/${wrongDelete.status}`
    );
    const modelBlocked = await hit(base, `/api/abs-module-models/${MODEL_USED}`, "DELETE", stock, {
      password: PASS_ADMIN,
    });
    record(
      "modelo com unidade vinculada não é excluído",
      modelBlocked.status === 409 &&
        tables.workshop_abs_module_models.some((row) => row.id === MODEL_USED) &&
        !!unit("ABS-000002"),
      String(modelBlocked.status)
    );
    const removed = await hit(base, "/api/abs-modules/ABS-000002", "DELETE", stock, { password: PASS_ADMIN });
    record(
      "senha da gerência exclui só a unidade pedida",
      removed.status === 200 && !unit("ABS-000002") && !!unit("ABS-000001") && unit("ABS-000099")?.workshop_id === OTHER,
      `${removed.status} restam ${tables.workshop_abs_modules.map((row) => row.public_id).join(",")}`
    );

    const byFull = await hit(base, "/api/abs-modules/ABS-000001", "GET", full);
    const byAdmin = await hit(base, "/api/abs-module-models", "GET", gerencia);
    record("gerência e full_access consultam", byFull.status === 200 && byAdmin.status === 200, `${byFull.status}/${byAdmin.status}`);

    const beforeFail = count("workshop_abs_modules");
    const failedLookup = await hit(base, "/api/abs-modules", "POST", fail, {
      manufacturer: "Falha",
      original_code: "FALHA-LOOKUP",
      module_kind: "completo",
    });
    record(
      "falha ao consultar a permissão não grava",
      failedLookup.status === 403 &&
        count("workshop_abs_modules") === beforeFail &&
        !tables.workshop_abs_modules.some((row) => row.original_code === "FALHA-LOOKUP"),
      String(failedLookup.status)
    );

    process.env.SEC03_DISABLE_FAMILIES = "abs_stock";
    const opened = await hit(base, "/api/abs-modules", "GET", lab);
    const partsStill = await hit(base, "/api/workshop-parts/peca-1", "DELETE", lab);
    const photoStill = await hit(base, "/api/service-orders/os-inexistente/photos", "GET", none);
    const customerStill = await hit(base, "/api/customers", "POST", none, { name: "Cliente da reversão" });
    delete process.env.SEC03_DISABLE_FAMILIES;
    const closed = await hit(base, "/api/abs-modules", "GET", lab);
    record(
      "SEC03_DISABLE_FAMILIES=abs_stock desliga só o estoque ABS",
      opened.status === 200 &&
        opened.body.includes("ABS-000001") &&
        partsStill.status === 403 &&
        photoStill.status === 403 &&
        customerStill.status === 403 &&
        !tables.customers.some((row) => row.name === "Cliente da reversão") &&
        closed.status === 403 &&
        closed.code === "permission_denied",
      `aberto ${opened.status}; peça ${partsStill.status}; foto ${photoStill.status}; cliente ${customerStill.status}; fechado ${closed.status}`
    );
  } finally {
    delete process.env.SEC03_DISABLE_FAMILIES;
    server.close();
    mock.server.close();
  }

  console.log(`\n${passed} ok, ${failed} falha`);
  if (failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
