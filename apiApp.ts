import "dotenv/config";
import crypto from "crypto";
import path from "path";
import express from "express";
import multer from "multer";
import {
  supabaseAdmin,
  VEHICLE_PHOTOS_BUCKET,
  TV_PATIO_BUCKET,
  ERROR_BULLETINS_BUCKET,
  QUALITY_INCIDENTS_BUCKET,
} from "./supabaseClient.js";
import {
  FIRST_STAGE,
  ALL_STATUSES,
  SERVICE_ORDER_STAGES,
  CANCELLED_STATUS,
  normalizeStatusForFlow,
  LAB_MODULE_INTAKE_STATUSES,
} from "./constants/serviceOrderStages.js";
import {
  statusUsesBench,
  firstFreeBenchSlot,
  normalizeBenchSlot,
  type ExternalRepair,
} from "./constants/labBench.js";
import { normalizeTvChimeConfig } from "./utils/tvChimeSchedule.js";
import { normalizeTvVideoLayoutMode, normalizeTvVideoSettings } from "./utils/tvVideoSettings.js";
import { parseModuleKind, parseModuleVehicleKind } from "./utils/moduleMetadata.js";
import { SYSTEM_NOTIFICATION_IDS } from "./constants/systemNotificationTypes.js";
import { buildWorkshopPartsAnalytics } from "./utils/workshopPartsAnalytics.js";
import { resolveTvUploadMime } from "./utils/tvMediaFile.js";
import {
  collectApprovedServicesFromBudgets,
  mergeServiceTechnicianDraftLines,
  validateServiceTechnicianLines,
} from "./utils/serviceOrderServiceTechnicians.js";

const PBKDF2_ITERATIONS = 100000;
const SALT_LEN = 16;
const KEY_LEN = 64;
const DIGEST = "sha256";

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SALT_LEN).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, DIGEST).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LEN, DIGEST).toString("hex");
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(computed, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Formato de senha "salted hash" (salt:hash em hex) gerado por hashPassword(). */
function looksHashed(value: string): boolean {
  return /^[0-9a-f]{32}:[0-9a-f]{128}$/i.test(String(value || ""));
}

/** Comparação de strings resistente a timing attacks. */
function safeStringEqual(a: string, b: string): boolean {
  const ba = Buffer.from(String(a), "utf8");
  const bb = Buffer.from(String(b), "utf8");
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

// ----------------- TOKENS DE SESSÃO (HMAC, sem estado) -----------------
const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "dev-only-insecure-secret";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12h

type SessionPayload = {
  r: "admin" | "user";
  u?: string; // userId
  n?: string; // username
  exp: number;
};

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function signSessionToken(payload: Omit<SessionPayload, "exp">, ttlMs = SESSION_TTL_MS): string {
  const full: SessionPayload = { ...payload, exp: Date.now() + ttlMs };
  const body = b64url(JSON.stringify(full));
  const sig = b64url(crypto.createHmac("sha256", SESSION_SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = b64url(crypto.createHmac("sha256", SESSION_SECRET).update(body).digest());
  if (!safeStringEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body).toString("utf8")) as SessionPayload;
    if (!payload || (payload.r !== "admin" && payload.r !== "user")) return null;
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

function getBearerToken(req: { headers: Record<string, unknown> }): string | null {
  const raw = req.headers["authorization"];
  const header = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : "";
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1].trim() : null;
}

/**
 * Origens dos painéis de TV (Patio-View, Laboratorio-View) — CORS.
 * PATIO_VIEW_ORIGINS / PATIO_VIEW_ORIGIN: lista extra (domínios adicionais).
 * patio-view.vercel.app e laboratorio-view.vercel.app são sempre incluídos.
 */
const PATIO_VIEW_TV_ORIGIN = "https://patio-view.vercel.app";
const LABORATORIO_VIEW_TV_ORIGIN = "https://laboratorio-view.vercel.app";

function parsePatioViewOrigins(): string[] {
  const raw = process.env.PATIO_VIEW_ORIGINS || process.env.PATIO_VIEW_ORIGIN || PATIO_VIEW_TV_ORIGIN;
  const list = raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const merged = [...list];
  if (!merged.includes(PATIO_VIEW_TV_ORIGIN)) merged.push(PATIO_VIEW_TV_ORIGIN);
  if (!merged.includes(LABORATORIO_VIEW_TV_ORIGIN)) merged.push(LABORATORIO_VIEW_TV_ORIGIN);
  return merged;
}

/** Origens extras (ex.: app em outro domínio, Capacitor, tablet com URL absoluta em VITE_API_BASE). */
function parseCorsAllowedOrigins(): string[] {
  const extra = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const patio = parsePatioViewOrigins();
  const devDefaults =
    process.env.NODE_ENV !== "production"
      ? ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173", "http://127.0.0.1:5173"]
      : [];
  return [...new Set([...patio, ...extra, ...devDefaults])];
}

export function createApiApp() {
  const app = express();
  const WORKSHOP_ID = process.env.WORKSHOP_ID;
  const corsAllowedOrigins = parseCorsAllowedOrigins();
  app.use(express.json());

  /** Cache: colunas de verificação de orçamento (migration 20260605140000). */
  let budgetVerifiedColumnsAvailable: boolean | null = null;

  const BUDGET_ROW_SELECT_BASE =
    "id, service_order_id, card_name, diagnosis, services, parts, observations, created_at, updated_at";
  const BUDGET_VERIFY_SELECT_SUFFIX = ", verified_at, verified_by_name";
  const BUDGET_AGGREGATE_SELECT_BASE =
    "id, service_order_id, created_at, updated_at, diagnosis, services, parts, observations, card_name";

  function isMissingBudgetVerifyColumnError(message: string | undefined): boolean {
    if (!message) return false;
    return /verified_(at|by_name)/i.test(message) && /does not exist|column/i.test(message);
  }

  async function hasBudgetVerifyColumns(): Promise<boolean> {
    if (budgetVerifiedColumnsAvailable !== null) return budgetVerifiedColumnsAvailable;
    if (!supabaseAdmin) {
      budgetVerifiedColumnsAvailable = false;
      return false;
    }
    const { error } = await supabaseAdmin.from("budgets").select("verified_at").limit(1);
    if (error && isMissingBudgetVerifyColumnError(error.message)) {
      budgetVerifiedColumnsAvailable = false;
      console.warn(
        "[API] Colunas budgets.verified_at ausentes — aplique supabase/migrations/20260605140000_budgets_verification.sql no Supabase."
      );
      return false;
    }
    budgetVerifiedColumnsAvailable = true;
    return true;
  }

  async function budgetRowSelect(): Promise<string> {
    return (await hasBudgetVerifyColumns())
      ? BUDGET_ROW_SELECT_BASE + BUDGET_VERIFY_SELECT_SUFFIX
      : BUDGET_ROW_SELECT_BASE;
  }

  async function budgetAggregateSelect(): Promise<string> {
    return (await hasBudgetVerifyColumns())
      ? BUDGET_AGGREGATE_SELECT_BASE + BUDGET_VERIFY_SELECT_SUFFIX
      : BUDGET_AGGREGATE_SELECT_BASE;
  }

  function withBudgetVerifyDefaults<T extends Record<string, unknown>>(row: T): T {
    if ("verified_at" in row && "verified_by_name" in row) return row;
    return { ...row, verified_at: null, verified_by_name: null };
  }

  /** Atualiza `updated_at` na OS para disparar Realtime/SSE (ex.: após mudança só no Storage). */
  async function touchServiceOrderUpdatedAt(serviceOrderId: string): Promise<void> {
    if (!supabaseAdmin) return;
    const { error } = await supabaseAdmin
      .from("service_orders")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", serviceOrderId);
    if (error) console.warn("[API] touchServiceOrderUpdatedAt:", error.message);
  }

  /** Compartimentos (1..24) ocupados por OS de módulo ativas, exceto a OS informada. */
  async function occupiedBenchSlots(excludeId?: string | null): Promise<Set<number>> {
    const occupied = new Set<number>();
    if (!supabaseAdmin || !WORKSHOP_ID) return occupied;
    const { data, error } = await supabaseAdmin
      .from("service_orders")
      .select("id, bench_slot, status")
      .eq("workshop_id", WORKSHOP_ID)
      .eq("order_type", "module")
      .not("bench_slot", "is", null)
      .neq("status", CANCELLED_STATUS);
    if (error) {
      console.warn("[API] occupiedBenchSlots:", error.message);
      return occupied;
    }
    for (const row of data ?? []) {
      const r = row as { id: string; bench_slot: number | null };
      if (excludeId && r.id === excludeId) continue;
      if (typeof r.bench_slot === "number") occupied.add(r.bench_slot);
    }
    return occupied;
  }

  /**
   * Compartimento da bancada (vaga fixa): mantém o slot atual se já atribuído;
   * senão primeiro livre entre 1..24. Null se fora da bancada ou lotada.
   */
  async function pickBenchSlotForStatus(
    status: string,
    currentSlot: number | null,
    excludeId?: string | null
  ): Promise<number | null> {
    if (!statusUsesBench(status)) return null;
    const normalized = normalizeBenchSlot(currentSlot);
    if (normalized != null) return normalized;
    const occupied = await occupiedBenchSlots(excludeId);
    return firstFreeBenchSlot(occupied);
  }

  /**
   * Atribui compartimentos a OS na fila (bench_queued_at), em ordem FIFO,
   * quando qualquer vaga 1..24 liberar.
   */
  async function processIntakeBenchQueue(): Promise<void> {
    if (!supabaseAdmin || !WORKSHOP_ID) return;
    const occupied = await occupiedBenchSlots();
    const maxPasses = 32;
    for (let pass = 0; pass < maxPasses; pass++) {
      const freeSlot = firstFreeBenchSlot(occupied);
      if (freeSlot == null) break;

      const { data: next, error: fetchErr } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("order_type", "module")
        .neq("status", CANCELLED_STATUS)
        .is("bench_slot", null)
        .not("bench_queued_at", "is", null)
        .order("bench_queued_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fetchErr) {
        console.warn("[API] processIntakeBenchQueue fetch:", fetchErr.message);
        break;
      }
      if (!next?.id) break;

      const now = new Date().toISOString();
      const { error: updErr } = await supabaseAdmin
        .from("service_orders")
        .update({
          bench_slot: freeSlot,
          bench_slot_at: now,
          bench_queued_at: null,
          updated_at: now,
        })
        .eq("id", next.id)
        .eq("workshop_id", WORKSHOP_ID);

      if (updErr) {
        console.warn("[API] processIntakeBenchQueue assign:", updErr.message);
        break;
      }
      occupied.add(freeSlot);
    }
  }

  /** Compartimento + fila ao criar OS de módulo. */
  async function benchFieldsForNewModule(status: string): Promise<{
    bench_slot: number | null;
    bench_slot_at: string | null;
    bench_queued_at: string | null;
  }> {
    const now = new Date().toISOString();
    if (!statusUsesBench(status)) {
      return { bench_slot: null, bench_slot_at: null, bench_queued_at: null };
    }
    const occupied = await occupiedBenchSlots();
    const slot = firstFreeBenchSlot(occupied);
    if (slot != null) {
      return { bench_slot: slot, bench_slot_at: now, bench_queued_at: null };
    }
    if (statusUsesBench(status)) {
      return { bench_slot: null, bench_slot_at: null, bench_queued_at: now };
    }
    return { bench_slot: null, bench_slot_at: null, bench_queued_at: null };
  }

  function reqOrderId(req: express.Request): string {
    const raw = req.params.id;
    if (typeof raw === "string") return raw;
    if (Array.isArray(raw)) return raw[0] ?? "";
    return "";
  }

  /**
   * Chave segura para Supabase Storage (object path). Acentos, parênteses e caracteres especiais
   * causam "Invalid key"; alinhar com PATCH .../photos/rename.
   */
  function sanitizeVehiclePhotoFileName(originalName: string): string {
    let s = String(originalName || "").trim() || "arquivo";
    s = s
      .normalize("NFD")
      .replace(/\p{M}/gu, "");
    s = s.replace(/[/\\]/g, "_").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
    s = s.replace(/[^\w\s.-]/g, "_");
    s = s.replace(/\s+/g, " ").trim();
    s = s.replace(/_+/g, "_");
    s = s.replace(/^[\s_]+|[\s_]+$/g, "");
    return s || "arquivo";
  }

  /** Assinatura do termo de diagnóstico fica no Storage da OS mas não deve aparecer como anexo da ficha. */
  function isDiagnosticAuthorizationSignatureFileName(name: string): boolean {
    return /AUTORIZACAO_DIAGNOSTICO/i.test(String(name || ""));
  }

  // CORS: TV (Patio-View), CORS_ALLOWED_ORIGINS e dev — necessário se o front chama API em outro host (VITE_API_BASE).
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && corsAllowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    } else if (corsAllowedOrigins.length === 1 && origin === undefined) {
      res.setHeader("Access-Control-Allow-Origin", corsAllowedOrigins[0]);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept, Accept-Language, X-Admin-Password"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  /**
   * Rotas públicas (sem token de sessão):
   * - healthcheck e login (emite o token);
   * - acompanhamento público do cliente (via share token na própria URL).
   * Todo o resto exige um token de sessão válido (staff logado).
   */
  function isPublicApiRoute(method: string, urlPath: string): boolean {
    if (urlPath === "/api/health") return true;
    if (urlPath === "/api/auth/login" && method === "POST") return true;
    if (/^\/api\/public\/vehicle-accompaniment\/[^/]+\/?$/.test(urlPath)) return true;
    return false;
  }

  /**
   * Rotas de leitura usadas pelos painéis de TV (Patio-View / Laboratorio-View),
   * que rodam sem login. Apenas GET e somente o necessário para o quadro + playlist.
   */
  const TV_API_TOKEN = (process.env.TV_API_TOKEN || "").trim();
  function isTvReadRoute(method: string, urlPath: string): boolean {
    if (method !== "GET") return false;
    return urlPath === "/api/tv/playlist" || urlPath === "/api/service-orders";
  }

  app.use((req, res, next) => {
    const urlPath = (req.path || req.url || "").split("?")[0];
    // Só protegemos a API; assets/SPA passam direto.
    if (!urlPath.startsWith("/api/")) return next();
    if (isPublicApiRoute(req.method, urlPath)) return next();

    const bearer = getBearerToken(req);

    // 1) Sessão de staff (token HMAC do login) — acesso pleno.
    const auth = verifySessionToken(bearer);
    if (auth) {
      (req as unknown as { auth: SessionPayload }).auth = auth;
      return next();
    }

    // 2) Painéis de TV: apenas rotas de leitura do quadro/playlist.
    if (isTvReadRoute(req.method, urlPath)) {
      // Se TV_API_TOKEN estiver configurado, exige-o; senão, libera (fallback p/ não derrubar a TV).
      if (!TV_API_TOKEN) return next();
      if (bearer && safeStringEqual(bearer, TV_API_TOKEN)) return next();
      return res.status(401).json({ error: "Token de TV inválido." });
    }

    return res.status(401).json({ error: "Sessão inválida ou expirada. Faça login novamente." });
  });

  /** True se a requisição vem de uma sessão de Gerência (token admin). */
  function isAdminRequest(req: express.Request): boolean {
    const auth = (req as unknown as { auth?: SessionPayload }).auth;
    return auth?.r === "admin";
  }

  /** Lê a senha da Gerência do header (preferido), body ou query (legado), sem expor na URL. */
  function adminPasswordFromReq(req: express.Request): string {
    const header = req.headers["x-admin-password"];
    if (typeof header === "string" && header) return header;
    const body = (req.body as { adminPassword?: unknown } | undefined)?.adminPassword;
    if (typeof body === "string" && body) return body;
    if (typeof req.query.adminPassword === "string") return req.query.adminPassword;
    return "";
  }

  /** Retorna os IDs (workshop_system_users.id) de todos os técnicos da oficina para notificá-los quando o admin age. */
  async function getTechnicianUserIds(): Promise<string[]> {
    if (!supabaseAdmin || !WORKSHOP_ID) return [];
    const { data, error } = await supabaseAdmin
      .from("workshop_system_users")
      .select("id")
      .eq("workshop_id", WORKSHOP_ID)
      .eq("is_technician", true);
    if (error) return [];
    return (data || []).map((r: { id: string }) => r.id);
  }

  function normalizePartName(value: string): string {
    return String(value || "")
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function parsePartQuantity(value: unknown): number {
    const raw = String(value ?? "").replace(",", ".").trim();
    const qty = Number(raw);
    if (!Number.isFinite(qty) || qty <= 0) return 1;
    return qty;
  }

  function aggregateBudgetParts(parts: unknown): Map<string, number> {
    const agg = new Map<string, number>();
    if (!Array.isArray(parts)) return agg;
    for (const item of parts as Array<{ description?: unknown; quantity?: unknown }>) {
      const description = typeof item?.description === "string" ? item.description.trim() : "";
      if (!description) continue;
      const key = normalizePartName(description);
      const prev = agg.get(key) ?? 0;
      agg.set(key, prev + parsePartQuantity(item?.quantity));
    }
    return agg;
  }

  function invertDeltaMap(input: Map<string, number>): Map<string, number> {
    const result = new Map<string, number>();
    input.forEach((value, key) => result.set(key, value * -1));
    return result;
  }

  async function applyStockDeltaByPartName(deltaByPart: Map<string, number>): Promise<void> {
    if (!supabaseAdmin || !WORKSHOP_ID) return;
    const nonZero = Array.from(deltaByPart.entries()).filter(([, value]) => Math.abs(value) > 0);
    if (nonZero.length === 0) return;

    const { data: partsRows, error: partsError } = await supabaseAdmin
      .from("workshop_parts")
      .select("id, name, stock_qty")
      .eq("workshop_id", WORKSHOP_ID);

    if (partsError) {
      throw new Error(`Falha ao carregar estoque de peças: ${partsError.message}`);
    }

    const byNormalized = new Map<string, { id: string; name: string; stock_qty: number }>();
    for (const row of (partsRows || []) as Array<{ id: string; name: string; stock_qty: number | null }>) {
      byNormalized.set(normalizePartName(row.name), {
        id: row.id,
        name: row.name,
        stock_qty: Number(row.stock_qty ?? 0),
      });
    }

    for (const [normalizedName, delta] of nonZero) {
      const part = byNormalized.get(normalizedName);
      if (!part) continue;
      const nextStock = part.stock_qty - delta;
      if (nextStock < 0) {
        throw new Error(`Estoque insuficiente para "${part.name}". Disponível: ${part.stock_qty}.`);
      }
      const { error: updateErr } = await supabaseAdmin
        .from("workshop_parts")
        .update({ stock_qty: Number(nextStock.toFixed(3)) })
        .eq("id", part.id)
        .eq("workshop_id", WORKSHOP_ID);
      if (updateErr) {
        throw new Error(`Falha ao atualizar estoque da peça "${part.name}": ${updateErr.message}`);
      }
    }
  }

  function isMissingRpcFunctionError(message: string): boolean {
    const m = (message || "").toLowerCase();
    return m.includes("does not exist") || m.includes("function") || m.includes("pgrst202");
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 20 * 1024 * 1024, // 20MB (evitar 413 Payload Too Large em fotos de celular)
    },
  });

  const tvMediaUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB — vídeos curtos para a TV
  });

  if (!WORKSHOP_ID) {
    console.warn(
      "[Config] WORKSHOP_ID não definido. Defina no .env para filtrar dados por oficina."
    );
  }

  // ----------------- HEALTHCHECK -----------------
  app.get("/api/health", async (_req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({
          ok: false,
          error: "Supabase não configurado (verifique variáveis de ambiente).",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("workshops")
        .select("id, name")
        .limit(1);

      if (error) {
        console.error("[Supabase] Erro no healthcheck:", error);
        return res.status(500).json({ ok: false, error: error.message });
      }

      return res.json({
        ok: true,
        workshopSample: data?.[0] ?? null,
      });
    } catch (err: any) {
      console.error("[API] Erro no healthcheck:", err);
      return res.status(500).json({
        ok: false,
        error: err?.message ?? "Erro desconhecido",
      });
    }
  });

  // ----------------- AUTENTICAÇÃO -----------------
  const IS_PRODUCTION = process.env.NODE_ENV === "production";
  // Fallback inseguro APENAS em desenvolvimento. Em produção exige ADMIN_PASSWORD ou senha no banco.
  const DEFAULT_ADMIN_PASSWORD = IS_PRODUCTION ? "" : "admin";
  const ADMIN_USERNAME = "Gerência";

  /** Retorna a credencial admin armazenada (pode ser hash salgado, ou texto puro vindo de env/legado). */
  async function getStoredAdminCredential(): Promise<string> {
    if (supabaseAdmin && WORKSHOP_ID) {
      const { data: row } = await supabaseAdmin
        .from("workshop_settings")
        .select("value")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("key", "admin_password")
        .maybeSingle();
      const db = row?.value != null && String(row.value).trim() !== "" ? String(row.value).trim() : "";
      if (db) return db;
    }
    return (process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD).trim();
  }

  async function verifyAdmin(username: string, password: string): Promise<boolean> {
    const normalized = String(username).trim();
    if (normalized.toLowerCase() !== ADMIN_USERNAME.toLowerCase()) return false;
    return verifyAdminPasswordOnly(password);
  }

  async function verifyAdminPasswordOnly(password: string): Promise<boolean> {
    const stored = await getStoredAdminCredential();
    if (!stored) return false; // produção sem senha configurada: nega tudo
    const provided = String(password ?? "").trim();
    if (!provided) return false;
    if (looksHashed(stored)) return verifyPassword(provided, stored);
    return safeStringEqual(provided, stored); // env/legado em texto puro
  }

  const DEFAULT_SYSTEM_NOTIFICATION_TYPES: string[] = [...SYSTEM_NOTIFICATION_IDS];

  type SystemNotificationSubscriberRow = {
    systemUserId: string;
    notificationTypes: string[];
  };

  function isValidSystemNotificationType(key: string): boolean {
    return (SYSTEM_NOTIFICATION_IDS as readonly string[]).includes(key);
  }

  function parseSystemNotificationSubscribers(raw: unknown): SystemNotificationSubscriberRow[] {
    if (!Array.isArray(raw)) return [];
    const normalized: SystemNotificationSubscriberRow[] = [];
    for (const item of raw) {
      if (!item || typeof item !== "object") continue;
      const sid =
        "systemUserId" in (item as object) && typeof (item as { systemUserId?: unknown }).systemUserId === "string"
          ? (item as { systemUserId: string }).systemUserId.trim()
          : "";
      if (!sid) continue;
      const ntypes = Array.isArray((item as { notificationTypes?: unknown }).notificationTypes)
        ? (item as { notificationTypes: unknown[] }).notificationTypes
            .filter((x): x is string => typeof x === "string")
            .filter((x) => isValidSystemNotificationType(x))
        : [];
      if (ntypes.length === 0) continue;
      normalized.push({ systemUserId: sid, notificationTypes: ntypes });
    }
    return normalized;
  }

  async function getSystemNotificationConfig(): Promise<{
    adminNotificationTypes: string[];
    subscribers: SystemNotificationSubscriberRow[];
    hasExplicitConfig: boolean;
  }> {
    if (!supabaseAdmin || !WORKSHOP_ID) {
      return {
        adminNotificationTypes: [...DEFAULT_SYSTEM_NOTIFICATION_TYPES],
        subscribers: [],
        hasExplicitConfig: false,
      };
    }
    const { data } = await supabaseAdmin
      .from("workshop_settings")
      .select("key, value")
      .eq("workshop_id", WORKSHOP_ID)
      .in("key", ["system_notifications_admin_types", "system_notifications_user_subscribers"]);

    const map = (data || []).reduce((acc: Record<string, string>, row: { key: string; value: string | null }) => {
      acc[row.key] = row.value ?? "";
      return acc;
    }, {});
    const hasExplicitConfig = !!map.system_notifications_admin_types || !!map.system_notifications_user_subscribers;

    let adminNotificationTypes = [...DEFAULT_SYSTEM_NOTIFICATION_TYPES];
    if (map.system_notifications_admin_types) {
      try {
        const parsed = JSON.parse(map.system_notifications_admin_types);
        if (Array.isArray(parsed)) {
          adminNotificationTypes = parsed
            .filter((x: unknown): x is string => typeof x === "string")
            .filter((x) => isValidSystemNotificationType(x));
        }
    } catch {
        adminNotificationTypes = [...DEFAULT_SYSTEM_NOTIFICATION_TYPES];
      }
    }

    let subscribers: SystemNotificationSubscriberRow[] = [];
    if (map.system_notifications_user_subscribers) {
      try {
        subscribers = parseSystemNotificationSubscribers(JSON.parse(map.system_notifications_user_subscribers));
      } catch {
        subscribers = [];
      }
    }

    return { adminNotificationTypes, subscribers, hasExplicitConfig };
  }

  async function shouldNotifyAdminForSystemType(type: string): Promise<boolean> {
    const cfg = await getSystemNotificationConfig();
    return cfg.adminNotificationTypes.includes(type);
  }

  async function getTechnicianRecipientIdsForSystemType(type: string): Promise<string[]> {
    const cfg = await getSystemNotificationConfig();
    if (!cfg.hasExplicitConfig) return getTechnicianUserIds();
    return cfg.subscribers
      .filter((s) => s.notificationTypes.includes(type))
      .map((s) => s.systemUserId);
  }

  // Rate limit simples por IP para o login (mitiga brute force). Em memória (por instância).
  const loginAttempts = new Map<string, { count: number; resetAt: number }>();
  const LOGIN_MAX_ATTEMPTS = 10;
  const LOGIN_WINDOW_MS = 5 * 60 * 1000; // 5 min

  function loginRateLimited(ip: string): boolean {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || entry.resetAt < now) {
      loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
      return false;
    }
    entry.count += 1;
    return entry.count > LOGIN_MAX_ATTEMPTS;
  }

  function resetLoginAttempts(ip: string): void {
    loginAttempts.delete(ip);
  }

  app.post("/api/auth/login", async (req, res) => {
    try {
      const ip =
        (typeof req.headers["x-forwarded-for"] === "string"
          ? req.headers["x-forwarded-for"].split(",")[0].trim()
          : "") || req.ip || "unknown";
      if (loginRateLimited(ip)) {
        return res
          .status(429)
          .json({ error: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente." });
      }
      const { username, password } = req.body || {};
      const u = typeof username === "string" ? username.trim() : "";
      const p = typeof password === "string" ? password : "";
      if (!u) {
        return res.status(400).json({ error: "Informe o usuário." });
      }
      if (await verifyAdmin(u, p)) {
        resetLoginAttempts(ip);
        return res.json({ role: "admin", token: signSessionToken({ r: "admin", n: ADMIN_USERNAME }) });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }
      const { data: users, error } = await supabaseAdmin
        .from("workshop_system_users")
        .select("id, username, display_name, permissions, password_hash, photo_url, is_technician, accent_color")
        .eq("workshop_id", WORKSHOP_ID);
      if (error) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }
      const uLower = u.toLowerCase();
      const user = (users || []).find((r) => String(r.username).trim().toLowerCase() === uLower);
      if (!user) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }
      if (!verifyPassword(p, user.password_hash)) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }
      resetLoginAttempts(ip);
      const profileToken = crypto.randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await supabaseAdmin
        .from("workshop_system_users")
        .update({ profile_token: profileToken, profile_token_expires_at: expiresAt, updated_at: new Date().toISOString() })
        .eq("id", user.id)
        .eq("workshop_id", WORKSHOP_ID);
      const permissions = (user.permissions as Record<string, boolean>) || {};
      return res.json({
        role: "user",
        userId: user.id,
        username: user.username,
        displayName: user.display_name || user.username,
        photoUrl: user.photo_url || null,
        profileToken,
        token: signSessionToken({ r: "user", u: user.id, n: user.username }),
        isTechnician: !!(user as { is_technician?: boolean }).is_technician,
        accentColor: (user as { accent_color?: string | null }).accent_color || null,
        permissions,
      });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/auth/login:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Retorna o usuário do sistema se username+password forem válidos (para endpoints "meu perfil").
  async function verifySystemUser(username: string, password: string): Promise<{ id: string; username: string; display_name: string | null; photo_url: string | null } | null> {
    if (!supabaseAdmin || !WORKSHOP_ID) return null;
    const u = typeof username === "string" ? username.trim() : "";
    const p = typeof password === "string" ? password : "";
    if (!u || !p) return null;
    const { data: users, error } = await supabaseAdmin
      .from("workshop_system_users")
      .select("id, username, display_name, photo_url, password_hash")
      .eq("workshop_id", WORKSHOP_ID);
    if (error) return null;
    const uLower = u.toLowerCase();
    const user = (users || []).find((r: { username: string; password_hash: string }) => String(r.username).trim().toLowerCase() === uLower);
    if (!user || !verifyPassword(p, user.password_hash)) return null;
    return {
      id: user.id,
      username: user.username,
      display_name: user.display_name ?? null,
      photo_url: user.photo_url ?? null,
    };
  }

  // Verifica usuário por profileToken (para alterar foto sem senha).
  async function verifySystemUserByToken(username: string, token: string): Promise<{ id: string; username: string } | null> {
    if (!supabaseAdmin || !WORKSHOP_ID) return null;
    const u = typeof username === "string" ? username.trim() : "";
    const t = typeof token === "string" ? token.trim() : "";
    if (!u || !t) return null;
    const now = new Date().toISOString();
    const { data: users, error } = await supabaseAdmin
      .from("workshop_system_users")
      .select("id, username, profile_token, profile_token_expires_at")
      .eq("workshop_id", WORKSHOP_ID);
    if (error) return null;
    const uLower = u.toLowerCase();
    const user = (users || []).find(
      (r: { username: string; profile_token: string | null; profile_token_expires_at: string | null }) =>
        String(r.username).trim().toLowerCase() === uLower &&
        typeof r.profile_token === "string" &&
        r.profile_token.length > 0 &&
        safeStringEqual(r.profile_token, t) &&
        r.profile_token_expires_at &&
        r.profile_token_expires_at > now
    );
    if (!user) return null;
    return { id: user.id, username: user.username };
  }

  app.post("/api/auth/change-my-password", async (req, res) => {
    try {
      const { username, currentPassword, newPassword } = req.body || {};
      const user = await verifySystemUser(username, currentPassword);
      if (!user) {
        return res.status(401).json({ error: "Usuário ou senha atual incorretos." });
      }
      const np = typeof newPassword === "string" ? newPassword : "";
      if (!np || np.length < 6) {
        return res.status(400).json({ error: "A nova senha deve ter no mínimo 6 caracteres." });
      }
      const { error } = await supabaseAdmin
        .from("workshop_system_users")
        .update({ password_hash: hashPassword(np), updated_at: new Date().toISOString() })
        .eq("id", user.id)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/auth/change-my-password:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.get("/api/auth/my-profile", async (req, res) => {
    try {
      const username = (typeof req.query.username === "string" ? req.query.username : "").trim();
      const password = typeof req.query.password === "string" ? req.query.password : "";
      const user = await verifySystemUser(username, password);
      if (!user) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }
      const { data: row } = await supabaseAdmin
        .from("workshop_system_users")
        .select("display_name, photo_url, accent_color")
        .eq("id", user.id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      return res.json({
        username: user.username,
        displayName: (row?.display_name ?? user.display_name ?? user.username) || user.username,
        photoUrl: row?.photo_url ?? user.photo_url,
        accentColor: row?.accent_color ?? null,
      });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/auth/my-profile:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.patch("/api/auth/my-profile", async (req, res) => {
    try {
      const { username, password, profileToken, displayName, accentColor } = req.body || {};
      const usernameTrim = (typeof username === "string" ? username : "").trim();
      let user: { id: string; username: string; display_name?: string | null; photo_url?: string | null } | null = null;
      if (typeof profileToken === "string" && profileToken.trim()) {
        const byToken = await verifySystemUserByToken(usernameTrim, profileToken.trim());
        if (byToken) {
          const { data: full } = await supabaseAdmin
            .from("workshop_system_users")
            .select("id, username, display_name, photo_url")
            .eq("id", byToken.id)
            .eq("workshop_id", WORKSHOP_ID)
            .single();
          user = full ?? byToken;
        }
      }
      if (!user && typeof password === "string") {
        user = await verifySystemUser(usernameTrim, password);
      }
      if (!user) {
        return res.status(401).json({ error: "Usuário ou senha incorretos." });
      }
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof displayName === "string") updates.display_name = displayName.trim() || null;
      if (accentColor !== undefined) updates.accent_color = typeof accentColor === "string" && accentColor.trim() ? accentColor.trim() : null;
      const { error } = await supabaseAdmin
        .from("workshop_system_users")
        .update(updates)
        .eq("id", user.id)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) return res.status(500).json({ error: error.message });
      const { data: row } = await supabaseAdmin
        .from("workshop_system_users")
        .select("display_name, photo_url, accent_color")
        .eq("id", user.id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      return res.json({
        username: user.username,
        displayName: row?.display_name ?? user.display_name ?? user.username,
        photoUrl: row?.photo_url ?? user.photo_url,
        accentColor: row?.accent_color ?? null,
      });
    } catch (err: any) {
      console.error("[API] Erro em PATCH /api/auth/my-profile:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post(
    "/api/auth/my-profile/photo",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!supabaseAdmin || !WORKSHOP_ID) {
          return res.status(500).json({ error: "Servidor não configurado." });
        }
        const username = (req.body?.username && String(req.body.username).trim()) || "";
        const password = typeof req.body?.password === "string" ? req.body.password : "";
        const profileToken = typeof req.body?.profileToken === "string" ? req.body.profileToken.trim() : "";
        let user: { id: string; username: string } | null = null;
        if (profileToken) {
          user = await verifySystemUserByToken(username, profileToken);
        }
        if (!user && password) {
          user = await verifySystemUser(username, password);
        }
        if (!user) {
          return res.status(401).json({ error: "Use a senha atual ou faça login novamente para alterar a foto." });
        }
        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: "Arquivo de imagem não enviado." });
        }
        const bucket = VEHICLE_PHOTOS_BUCKET;
        const ext = (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") ? "jpg" : file.mimetype === "image/png" ? "png" : "webp";
        const pathInBucket = `${WORKSHOP_ID}/system-users/${user.id}/photo.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(pathInBucket, file.buffer, { contentType: file.mimetype, upsert: true });
        if (uploadError) {
          console.error("[API] Erro ao enviar foto do usuário:", uploadError);
          return res.status(500).json({ error: uploadError.message });
        }
        const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(pathInBucket);
        const photoUrlWithCacheBust = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
        const { error: updateErr } = await supabaseAdmin
          .from("workshop_system_users")
          .update({ photo_url: photoUrlWithCacheBust, updated_at: new Date().toISOString() })
          .eq("id", user.id)
          .eq("workshop_id", WORKSHOP_ID);
        if (updateErr) {
          console.error("[API] Erro ao atualizar photo_url do usuário:", updateErr);
          return res.status(500).json({ error: updateErr.message });
        }
        return res.json({ photoUrl: photoUrlWithCacheBust });
      } catch (err: any) {
        console.error("[API] Erro em POST /api/auth/my-profile/photo:", err);
        return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
      }
    }
  );

  app.get("/api/system-users", async (req, res) => {
    try {
      const adminPassword = adminPasswordFromReq(req);
      if (!WORKSHOP_ID || !(isAdminRequest(req) || (await verifyAdmin(ADMIN_USERNAME, adminPassword)))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_system_users")
        .select("id, username, display_name, permissions, is_technician, job_title, created_at, updated_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("username");
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json(data || []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/system-users:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/system-users", async (req, res) => {
    try {
      const { adminPassword, username, password, displayName, permissions, isTechnician, jobTitle } = req.body || {};
      if (!WORKSHOP_ID || !(await verifyAdmin(ADMIN_USERNAME, adminPassword))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      const u = typeof username === "string" ? username.trim() : "";
      const p = typeof password === "string" ? password : "";
      if (!u) return res.status(400).json({ error: "Nome de usuário é obrigatório." });
      if (!p || p.length < 6) return res.status(400).json({ error: "Senha deve ter no mínimo 6 caracteres." });
      const perms = typeof permissions === "object" && permissions !== null ? permissions : {};
      const isTech = isTechnician === true || isTechnician === "true";
      const job = typeof jobTitle === "string" ? jobTitle.trim() || null : null;
      const { data, error } = await supabaseAdmin
        .from("workshop_system_users")
        .insert({
          workshop_id: WORKSHOP_ID,
          username: u,
          password_hash: hashPassword(p),
          display_name: typeof displayName === "string" ? displayName.trim() || null : null,
          permissions: perms,
          is_technician: isTech,
          job_title: job,
          updated_at: new Date().toISOString(),
        })
        .select("id, username, display_name, permissions, is_technician, job_title, created_at, updated_at")
        .single();
      if (error) {
        if (error.code === "23505") return res.status(400).json({ error: "Este nome de usuário já existe." });
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/system-users:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/system-users/:id", async (req, res) => {
    try {
      const { adminPassword, password, displayName, permissions, isTechnician, jobTitle } = req.body || {};
      if (!WORKSHOP_ID || !(await verifyAdmin(ADMIN_USERNAME, adminPassword))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      const id = req.params.id;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof permissions === "object" && permissions !== null) updates.permissions = permissions;
      if (typeof displayName === "string") updates.display_name = displayName.trim() || null;
      if (typeof password === "string" && password.length >= 6) updates.password_hash = hashPassword(password);
      if (isTechnician !== undefined) updates.is_technician = isTechnician === true || isTechnician === "true";
      if (jobTitle !== undefined) updates.job_title = typeof jobTitle === "string" ? jobTitle.trim() || null : null;
      const { data, error } = await supabaseAdmin
        .from("workshop_system_users")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, username, display_name, permissions, is_technician, job_title, created_at, updated_at")
        .single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Usuário não encontrado." });
      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/system-users/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/system-users/:id", async (req, res) => {
    try {
      const adminPassword = adminPasswordFromReq(req);
      if (!WORKSHOP_ID || !(isAdminRequest(req) || (await verifyAdmin(ADMIN_USERNAME, adminPassword)))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      const { error } = await supabaseAdmin
        .from("workshop_system_users")
        .delete()
        .eq("id", req.params.id)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) return res.status(500).json({ error: error.message });
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/system-users/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  /** Lista resumida de todos os usuários (sem senha) — Radar de Qualidade, selects, etc. */
  app.get("/api/system-users/directory", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_system_users")
        .select("id, username, display_name, job_title")
        .eq("workshop_id", WORKSHOP_ID)
        .order("username", { ascending: true });
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/system-users/directory:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Lista de técnicos para atribuição nos cards: usuários do sistema com is_technician = true
  app.get("/api/system-users/technicians", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_system_users")
        .select("id, username, display_name, job_title, accent_color, photo_url")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("is_technician", true)
        .order("display_name")
        .order("username");
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/system-users/technicians:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- CONFIGURAÇÕES DA OFICINA (login pátio) -----------------
  const DEFAULT_LAB_PRODUCT_KINDS = [
    { id: "completo", label: "Módulo completo" },
    { id: "eletronico", label: "Módulo eletrônico" },
    { id: "hidraulico", label: "Módulo hidráulico" },
    { id: "pinca_freio", label: "Pinça de freio" },
    { id: "outro", label: "Outro produto" },
  ];

  function slugifyKindId(raw: unknown): string {
    return String(raw ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 48);
  }

  function normalizeLabProductKinds(list: any): { id: string; label: string }[] {
    if (!Array.isArray(list) || list.length === 0) return [...DEFAULT_LAB_PRODUCT_KINDS];
    const seen = new Set<string>();
    const cleaned: { id: string; label: string }[] = [];
    for (const item of list) {
      const label = String(item?.label ?? "").trim();
      let id = slugifyKindId(String(item?.id ?? "") || label);
      if (!id || !label) continue;
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(`${id}_${n}`)) n += 1;
        id = `${id}_${n}`;
      }
      seen.add(id);
      cleaned.push({ id, label });
    }
    if (!cleaned.some((k) => k.id === "outro")) {
      cleaned.push({ id: "outro", label: "Outro produto" });
    }
    return cleaned.length ? cleaned : [...DEFAULT_LAB_PRODUCT_KINDS];
  }

  function parseLabProductKindsValue(raw: string | null | undefined): { id: string; label: string }[] {
    const s = (raw ?? "").trim();
    if (!s) return [...DEFAULT_LAB_PRODUCT_KINDS];
    try {
      return normalizeLabProductKinds(JSON.parse(s));
    } catch {
      return [...DEFAULT_LAB_PRODUCT_KINDS];
    }
  }

  const DEFAULT_LAB_QUICK_SERVICES = [
    { id: "limpeza_valvulas", label: "Limpeza de Válvulas", color: "violet", sortOrder: 0, absOnly: true, allowPreApproval: true },
    { id: "reparo_modulo_eletronico", label: "Reparo Módulo Eletrônico", color: "sky", sortOrder: 1, absOnly: true },
    { id: "substituicao_modulo_hidraulico", label: "Substituição Módulo Hidráulico", color: "amber", sortOrder: 2, absOnly: true },
    { id: "substituicao_modulo_eletronico", label: "Substituição Módulo Eletrônico", color: "indigo", sortOrder: 3, absOnly: true },
    { id: "reparo_valvulas_hidraulicas", label: "Reparo das Válvulas Hidráulicas", color: "teal", sortOrder: 4, absOnly: true },
    { id: "revisao_completa", label: "Revisão Completa", color: "rose", sortOrder: 5, absOnly: true },
    { id: "teste_bancada", label: "Teste em Bancada", color: "emerald", sortOrder: 6, absOnly: true },
  ];

  const LAB_QUICK_SERVICE_COLORS = new Set(["violet", "sky", "amber", "indigo", "teal", "rose", "emerald"]);

  function normalizeLabQuickServices(list: any): {
    id: string;
    label: string;
    color: string;
    sortOrder: number;
    absOnly: boolean;
    allowPreApproval: boolean;
  }[] {
    if (!Array.isArray(list) || list.length === 0) return [...DEFAULT_LAB_QUICK_SERVICES];
    const seen = new Set<string>();
    const cleaned: {
      id: string;
      label: string;
      color: string;
      sortOrder: number;
      absOnly: boolean;
      allowPreApproval: boolean;
    }[] = [];
    for (const item of list) {
      const label = String(item?.label ?? "").trim();
      let id = slugifyKindId(String(item?.id ?? "") || label);
      if (!id || !label) continue;
      if (seen.has(id)) {
        let n = 2;
        while (seen.has(`${id}_${n}`)) n += 1;
        id = `${id}_${n}`;
      }
      seen.add(id);
      const colorRaw = String(item?.color ?? "violet").trim();
      const color = LAB_QUICK_SERVICE_COLORS.has(colorRaw) ? colorRaw : "violet";
      cleaned.push({
        id,
        label,
        color,
        sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : cleaned.length,
        absOnly: item?.absOnly !== false,
        allowPreApproval: item?.allowPreApproval === true,
      });
    }
    cleaned.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "pt-BR"));
    return cleaned.length ? cleaned : [...DEFAULT_LAB_QUICK_SERVICES];
  }

  function parseLabQuickServicesValue(raw: string | null | undefined) {
    const s = (raw ?? "").trim();
    if (!s) return [...DEFAULT_LAB_QUICK_SERVICES];
    try {
      return normalizeLabQuickServices(JSON.parse(s));
    } catch {
      return [...DEFAULT_LAB_QUICK_SERVICES];
    }
  }

  app.get("/api/workshop-settings", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data } = await supabaseAdmin
        .from("workshop_settings")
        .select("key, value")
        .eq("workshop_id", WORKSHOP_ID);

      const map = (data || []).reduce((acc: Record<string, string>, r: { key: string; value: string | null }) => {
        acc[r.key] = r.value ?? "";
        return acc;
      }, {});
      let appAppearance: unknown = null;
      const rawAppearance = map.app_appearance?.trim();
      if (rawAppearance) {
        try {
          appAppearance = JSON.parse(rawAppearance);
        } catch {
          appAppearance = null;
        }
      }
      return res.json({
        patioLoginEnabled: map.patio_login_enabled !== "false",
        patioPin: map.patio_pin ?? "",
        technicianAccessReception: map.technician_access_reception === "true",
        technicianAccessAgenda: map.technician_access_agenda === "true",
        technicianAccessPatio: map.technician_access_patio !== "false",
        adminDisplayName: map.admin_display_name || "Rei do ABS",
        adminPhotoUrl: map.admin_photo_url || null,
        vehicleDeletePassword: map.vehicle_delete_password || "",
        appAppearance,
        labProductKinds: parseLabProductKindsValue(map.lab_product_kinds),
        labQuickServices: parseLabQuickServicesValue(map.lab_quick_services),
      });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-settings:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  /** Notificações do sistema (central): tipos para gerência e usuários selecionados */
  app.get("/api/workshop/system-notifications", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const cfg = await getSystemNotificationConfig();
      const { data: users } = await supabaseAdmin
        .from("workshop_system_users")
        .select("id, username, display_name")
        .eq("workshop_id", WORKSHOP_ID)
        .order("display_name", { ascending: true })
        .order("username");

      const availableUsers = (users || []).map((u: { id: string; username: string; display_name: string | null }) => ({
          id: u.id,
          username: u.username,
          displayName: u.display_name || u.username,
      }));

      const userMap = new Map(availableUsers.map((u) => [u.id, u]));
      const subscribers = cfg.hasExplicitConfig
        ? cfg.subscribers
            .map((s) => {
              const u = userMap.get(s.systemUserId);
              if (!u) return null;
              return {
                systemUserId: s.systemUserId,
                notificationTypes: s.notificationTypes,
                displayName: u.displayName,
              };
            })
            .filter(Boolean)
        : availableUsers.map((u) => ({
            systemUserId: u.id,
            notificationTypes: [...DEFAULT_SYSTEM_NOTIFICATION_TYPES],
            displayName: u.displayName,
          }));

      return res.json({
        adminNotificationTypes: cfg.hasExplicitConfig
          ? cfg.adminNotificationTypes
          : [...DEFAULT_SYSTEM_NOTIFICATION_TYPES],
        subscribers,
        availableUsers,
      });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop/system-notifications:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop/system-notifications", async (req, res) => {
    try {
      const { adminPassword, adminNotificationTypes, subscribers } = req.body || {};
      if (!WORKSHOP_ID || !(await verifyAdmin(ADMIN_USERNAME, adminPassword))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin) return res.status(500).json({ error: "Servidor não configurado." });

      const normalizedAdmin = Array.isArray(adminNotificationTypes)
        ? adminNotificationTypes
            .filter((x: unknown): x is string => typeof x === "string")
            .filter((x) => isValidSystemNotificationType(x))
        : [];
      const normalizedSubscribers = parseSystemNotificationSubscribers(subscribers);
      const nowIso = new Date().toISOString();
      const rows = [
        {
          workshop_id: WORKSHOP_ID,
          key: "system_notifications_admin_types",
          value: JSON.stringify(normalizedAdmin),
          updated_at: nowIso,
        },
        {
          workshop_id: WORKSHOP_ID,
          key: "system_notifications_user_subscribers",
          value: JSON.stringify(normalizedSubscribers),
          updated_at: nowIso,
        },
      ];
      const { error } = await supabaseAdmin.from("workshop_settings").upsert(rows, { onConflict: "workshop_id,key" });
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop/system-notifications:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-settings", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const {
        patioLoginEnabled,
        patioPin,
        adminPassword,
        adminDisplayName,
        adminPhotoUrl,
        technicianAccessReception,
        technicianAccessAgenda,
        technicianAccessPatio,
        vehicleDeletePassword,
        appAppearance,
        labProductKinds,
        labQuickServices,
      } = req.body || {};

      // Chaves sensíveis (senha de gerência, PIN do pátio, senha de exclusão, acessos e perfil
      // do admin) só podem ser alteradas pela Gerência. labProductKinds/appAppearance ficam
      // liberados para usuários autenticados (ex.: laboratório configurando tipos de produto).
      const touchesSensitive =
        (typeof adminPassword === "string" && adminPassword.trim()) ||
        typeof patioPin === "string" ||
        typeof vehicleDeletePassword === "string" ||
        typeof adminDisplayName === "string" ||
        typeof adminPhotoUrl === "string" ||
        typeof patioLoginEnabled === "boolean" ||
        typeof technicianAccessReception === "boolean" ||
        typeof technicianAccessAgenda === "boolean" ||
        typeof technicianAccessPatio === "boolean";
      if (touchesSensitive && !isAdminRequest(req)) {
        return res.status(403).json({ error: "Apenas a Gerência pode alterar estas configurações." });
      }

      const updates: { key: string; value: string; updated_at: string }[] = [];
      if (typeof patioLoginEnabled === "boolean") {
        updates.push({ key: "patio_login_enabled", value: String(patioLoginEnabled), updated_at: new Date().toISOString() });
      }
      if (typeof patioPin === "string") {
        updates.push({ key: "patio_pin", value: patioPin.trim(), updated_at: new Date().toISOString() });
      }
      if (typeof adminPassword === "string" && adminPassword.trim()) {
        // Armazena com hash salgado (PBKDF2), nunca em texto puro.
        updates.push({ key: "admin_password", value: hashPassword(adminPassword.trim()), updated_at: new Date().toISOString() });
      }
      if (typeof adminDisplayName === "string") {
        updates.push({ key: "admin_display_name", value: adminDisplayName.trim() || "Rei do ABS", updated_at: new Date().toISOString() });
      }
      if (typeof adminPhotoUrl === "string") {
        updates.push({ key: "admin_photo_url", value: adminPhotoUrl.trim(), updated_at: new Date().toISOString() });
      }
      if (typeof technicianAccessReception === "boolean") {
        updates.push({ key: "technician_access_reception", value: String(technicianAccessReception), updated_at: new Date().toISOString() });
      }
      if (typeof technicianAccessAgenda === "boolean") {
        updates.push({ key: "technician_access_agenda", value: String(technicianAccessAgenda), updated_at: new Date().toISOString() });
      }
      if (typeof technicianAccessPatio === "boolean") {
        updates.push({ key: "technician_access_patio", value: String(technicianAccessPatio), updated_at: new Date().toISOString() });
      }
      if (typeof vehicleDeletePassword === "string") {
        updates.push({ key: "vehicle_delete_password", value: vehicleDeletePassword.trim(), updated_at: new Date().toISOString() });
      }
      if (appAppearance !== undefined && appAppearance !== null && typeof appAppearance === "object") {
        updates.push({
          key: "app_appearance",
          value: JSON.stringify(appAppearance),
          updated_at: new Date().toISOString(),
        });
      }
      if (Array.isArray(labProductKinds)) {
        updates.push({
          key: "lab_product_kinds",
          value: JSON.stringify(normalizeLabProductKinds(labProductKinds)),
          updated_at: new Date().toISOString(),
        });
      }
      if (Array.isArray(labQuickServices)) {
        updates.push({
          key: "lab_quick_services",
          value: JSON.stringify(normalizeLabQuickServices(labQuickServices)),
          updated_at: new Date().toISOString(),
        });
      }
      if (updates.length === 0) {
        return res.status(400).json({ error: "Nada para atualizar." });
      }
      for (const u of updates) {
        const { error: upsertErr } = await supabaseAdmin.from("workshop_settings").upsert(
          { workshop_id: WORKSHOP_ID, key: u.key, value: u.value, updated_at: u.updated_at },
          { onConflict: "workshop_id,key" }
        );
        if (upsertErr) {
          console.error("[API] Erro ao salvar workshop_settings:", u.key, upsertErr);
          return res.status(500).json({ error: "Falha ao salvar configuração. Tente novamente." });
        }
      }
      const { data } = await supabaseAdmin
        .from("workshop_settings")
        .select("key, value")
        .eq("workshop_id", WORKSHOP_ID)
        .in("key", [
          "patio_login_enabled",
          "patio_pin",
          "technician_access_reception",
          "technician_access_agenda",
          "technician_access_patio",
          "admin_display_name",
          "admin_photo_url",
          "vehicle_delete_password",
          "app_appearance",
          "lab_product_kinds",
          "lab_quick_services",
        ]);
      const map = (data || []).reduce((acc: Record<string, string>, r: { key: string; value: string | null }) => {
        acc[r.key] = r.value ?? "";
        return acc;
      }, {});
      let appAppearanceOut: unknown = null;
      const rawApp = map.app_appearance?.trim();
      if (rawApp) {
        try {
          appAppearanceOut = JSON.parse(rawApp);
        } catch {
          appAppearanceOut = null;
        }
      }
      return res.json({
        patioLoginEnabled: map.patio_login_enabled !== "false",
        patioPin: map.patio_pin || "",
        technicianAccessReception: map.technician_access_reception === "true",
        technicianAccessAgenda: map.technician_access_agenda === "true",
        technicianAccessPatio: map.technician_access_patio !== "false",
        adminDisplayName: map.admin_display_name || "Rei do ABS",
        adminPhotoUrl: map.admin_photo_url || null,
        vehicleDeletePassword: map.vehicle_delete_password || "",
        appAppearance: appAppearanceOut,
        labProductKinds: parseLabProductKindsValue(map.lab_product_kinds),
        labQuickServices: parseLabQuickServicesValue(map.lab_quick_services),
      });
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-settings:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- CLIENTES -----------------
  app.get("/api/customers", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("customers")
        .select(
          "id, name, cpf, phone, email, cep, address, address_number, created_at"
        )
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[API] Erro ao listar clientes:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em GET /api/customers:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/customers", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { name, cpf, phone, email, cep, address, city, addressNumber } = req.body;

      if (!name || !phone) {
        return res
          .status(400)
          .json({ error: "Campos obrigatórios: name, phone." });
      }

      const { data, error } = await supabaseAdmin
        .from("customers")
        .insert({
          workshop_id: WORKSHOP_ID,
          name,
          cpf: cpf ?? null,
          phone,
          email: email ?? null,
          cep: cep ?? null,
          address: address ?? null,
          city: city ?? null,
          address_number: addressNumber ?? null,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao criar cliente:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em POST /api/customers:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.patch("/api/customers/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id } = req.params;
      const { name, cpf, phone, email, cep, address, city, addressNumber } = req.body;
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = String(name).trim();
      if (cpf !== undefined) updates.cpf = cpf == null || String(cpf).trim() === "" ? null : String(cpf).trim();
      if (phone !== undefined) updates.phone = String(phone).trim();
      if (email !== undefined) updates.email = email == null || String(email).trim() === "" ? null : String(email).trim();
      if (cep !== undefined) updates.cep = cep == null || String(cep).trim() === "" ? null : String(cep).trim();
      if (address !== undefined) updates.address = address == null || String(address).trim() === "" ? null : String(address).trim();
      if (city !== undefined) updates.city = city == null || String(city).trim() === "" ? null : String(city).trim();
      if (addressNumber !== undefined) updates.address_number = addressNumber == null || String(addressNumber).trim() === "" ? null : String(addressNumber).trim();
      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: "Nada para atualizar." });
      }
      const { data, error } = await supabaseAdmin
        .from("customers")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();
      if (error) {
        console.error("[API] Erro ao atualizar cliente:", error);
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.status(404).json({ error: "Cliente não encontrado." });
      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em PATCH /api/customers/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- AGENDA (workshop_appointments) -----------------
  app.get("/api/appointments", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_appointments")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("scheduled_date", { ascending: true })
        .order("scheduled_time", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar agendamentos:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro inesperado em GET /api/appointments:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/appointments", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const {
        title,
        customerName,
        phone,
        email,
        vehicleModel,
        plate,
        notes,
        date,
        time,
        status,
        trelloCardId,
      } = req.body;

      const scheduledDate = typeof date === "string" ? date.slice(0, 10) : null;
      if (!scheduledDate) {
        return res.status(400).json({ error: "Campo obrigatório: date (YYYY-MM-DD)." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_appointments")
        .insert({
          workshop_id: WORKSHOP_ID,
          title: title ?? "",
          customer_name: customerName ?? "",
          phone: phone ?? null,
          email: email ?? null,
          vehicle_model: vehicleModel ?? "",
          plate: (plate ?? "").toString().toUpperCase(),
          notes: notes ?? null,
          scheduled_date: scheduledDate,
          scheduled_time: (time ?? "09:00").toString(),
          status: status ?? "scheduled",
          trello_card_id: trelloCardId ?? null,
          updated_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao criar agendamento:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em POST /api/appointments:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.patch("/api/appointments/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id } = req.params;
      const {
        title,
        customerName,
        phone,
        email,
        vehicleModel,
        plate,
        notes,
        date,
        time,
        status,
        trelloCardId,
      } = req.body;

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title;
      if (customerName !== undefined) updates.customer_name = customerName;
      if (phone !== undefined) updates.phone = phone;
      if (email !== undefined) updates.email = email;
      if (vehicleModel !== undefined) updates.vehicle_model = vehicleModel;
      if (plate !== undefined) updates.plate = String(plate).toUpperCase();
      if (notes !== undefined) updates.notes = notes;
      if (date !== undefined) updates.scheduled_date = String(date).slice(0, 10);
      if (time !== undefined) updates.scheduled_time = String(time);
      if (status !== undefined) updates.status = status;
      if (trelloCardId !== undefined) updates.trello_card_id = trelloCardId;

      const { data, error } = await supabaseAdmin
        .from("workshop_appointments")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao atualizar agendamento:", error);
        return res.status(500).json({ error: error.message });
      }
      if (!data) {
        return res.status(404).json({ error: "Agendamento não encontrado." });
      }
      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em PATCH /api/appointments/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/appointments/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id } = req.params;
      const { error } = await supabaseAdmin
        .from("workshop_appointments")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] Erro ao excluir agendamento:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro inesperado em DELETE /api/appointments/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- TVs (pátio + laboratório): playlist pública + gestão admin -----------------
  type TvScope = "patio" | "laboratorio";

  function parseTvScope(raw: unknown): TvScope {
    const s = String(raw ?? "patio").toLowerCase().trim();
    if (s === "laboratorio" || s === "laboratory" || s === "lab") return "laboratorio";
    return "patio";
  }

  function tvScopeFromRequest(req: express.Request): TvScope {
    const q = req.query?.scope;
    const body = req.body as { tvScope?: unknown; scope?: unknown } | undefined;
    const fromBody = body?.tvScope ?? body?.scope;
    return parseTvScope(q ?? fromBody);
  }

  const TV_BODY_FULLSCREEN_MARKER = "[[tv_fullscreen_image]]";
  function parseTvBodyAndFullscreen(raw: unknown): { body: string; mediaFullscreen: boolean } {
    const text = String(raw ?? "");
    const hasMarker = text.includes(TV_BODY_FULLSCREEN_MARKER);
    const clean = hasMarker ? text.replaceAll(TV_BODY_FULLSCREEN_MARKER, "").trim() : text;
    return { body: clean, mediaFullscreen: hasMarker };
  }
  function buildTvBodyWithFullscreen(rawBody: unknown, mediaFullscreen: boolean): string {
    const base = String(rawBody ?? "").replaceAll(TV_BODY_FULLSCREEN_MARKER, "").trim();
    return mediaFullscreen ? `${TV_BODY_FULLSCREEN_MARKER}\n${base}`.trim() : base;
  }

  function normalizeTvMediaObjectFit(v: unknown): "cover" | "contain" | "fill" {
    const s = String(v ?? "").toLowerCase();
    if (s === "contain" || s === "fill" || s === "cover") return s;
    return "cover";
  }

  function parseMediaPlaylist(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    return raw.map((u) => String(u).trim()).filter(Boolean);
  }

  function resolveSlideMediaFields(s: Record<string, unknown>): {
    mediaUrl: string | null;
    mediaPlaylist: string[];
  } {
    const playlist =
      s.mediaPlaylist !== undefined ? parseMediaPlaylist(s.mediaPlaylist) : null;
    const mediaUrlRaw =
      s.mediaUrl != null && String(s.mediaUrl).trim() ? String(s.mediaUrl).trim() : null;
    if (playlist && playlist.length > 0) {
      return { mediaUrl: playlist[0], mediaPlaylist: playlist };
    }
    return {
      mediaUrl: mediaUrlRaw,
      mediaPlaylist: mediaUrlRaw ? [mediaUrlRaw] : [],
    };
  }

  function mapTvSlideFromRow(row: Record<string, unknown>) {
    const parsed = parseTvBodyAndFullscreen(row.body);
    const rowPlaylist = parseMediaPlaylist(row.media_playlist);
    const mediaUrl =
      row.media_url != null && String(row.media_url).trim() ? String(row.media_url).trim() : null;
    const mediaPlaylist = rowPlaylist.length > 0 ? rowPlaylist : mediaUrl ? [mediaUrl] : [];
    return {
      id: row.id,
      slideType: row.slide_type,
      title: row.title ?? "",
      body: parsed.body,
      mediaUrl: mediaPlaylist[0] ?? mediaUrl,
      mediaPlaylist,
      durationSeconds: row.duration_seconds ?? 10,
      sortOrder: row.sort_order ?? 0,
      goalCurrent: row.goal_current != null ? Number(row.goal_current) : null,
      goalTarget: row.goal_target != null ? Number(row.goal_target) : null,
      goalLabel: row.goal_label ?? null,
      playSound: (row as { play_sound?: boolean }).play_sound === true,
      goalShowValues: (row as { goal_show_values?: boolean }).goal_show_values === true,
      pinImmediate: (row as { pin_immediate?: boolean }).pin_immediate === true,
      mediaFullscreen: parsed.mediaFullscreen,
      mediaObjectFit: normalizeTvMediaObjectFit((row as { media_object_fit?: unknown }).media_object_fit),
    };
  }

  async function fetchTvVideoSettingsNormalized(scope: TvScope) {
    if (!supabaseAdmin || !WORKSHOP_ID) {
      return normalizeTvVideoSettings(null);
    }
    const { data, error } = await supabaseAdmin
      .from("workshop_tv_video_settings")
      .select("layout_mode")
      .eq("workshop_id", WORKSHOP_ID)
      .eq("tv_scope", scope)
      .maybeSingle();
    if (error && (error as { code?: string }).code !== "PGRST116") {
      console.error("[API] TV video settings:", error.message);
    }
    return normalizeTvVideoSettings(
      data ? { layoutMode: (data as { layout_mode?: string }).layout_mode } : null
    );
  }

  async function countVideoSlides(scope: TvScope): Promise<number> {
    if (!supabaseAdmin || !WORKSHOP_ID) return 0;
    const { count, error } = await supabaseAdmin
      .from("workshop_tv_slides")
      .select("id", { count: "exact", head: true })
      .eq("workshop_id", WORKSHOP_ID)
      .eq("tv_scope", scope)
      .eq("slide_type", "video");
    if (error) {
      console.error("[API] TV count video slides:", error.message);
      return 0;
    }
    return count ?? 0;
  }

  const TV_SLIDE_COLUMNS_BASE =
    "id, slide_type, title, body, media_url, duration_seconds, sort_order, is_active, goal_current, goal_target, goal_label, play_sound, goal_show_values, pin_immediate, media_object_fit";

  function isSchemaColumnMissing(error: unknown, column: string): boolean {
    const m = String((error as { message?: string })?.message ?? "").toLowerCase();
    const c = column.toLowerCase();
    return m.includes(c) && (m.includes("does not exist") || m.includes("schema cache"));
  }

  async function selectTvSlideRows(
    scope: TvScope,
    opts: { activeOnly?: boolean } = {}
  ): Promise<{ data: Record<string, unknown>[] | null; error: { message: string } | null }> {
    if (!supabaseAdmin || !WORKSHOP_ID) {
      return { data: [], error: null };
    }
    const run = (columns: string) => {
      let q = supabaseAdmin
        .from("workshop_tv_slides")
        .select(columns)
        .eq("workshop_id", WORKSHOP_ID)
        .eq("tv_scope", scope)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (opts.activeOnly) q = q.eq("is_active", true);
      return q;
    };
    let { data, error } = await run(`${TV_SLIDE_COLUMNS_BASE}, media_playlist`);
    if (error && isSchemaColumnMissing(error, "media_playlist")) {
      console.warn("[API] TV slides: coluna media_playlist ausente — usando media_url.");
      ({ data, error } = await run(TV_SLIDE_COLUMNS_BASE));
    }
    return {
      data: (data ?? null) as Record<string, unknown>[] | null,
      error: error ? { message: error.message } : null,
    };
  }

  async function fetchTvChimeScheduleNormalized(scope: TvScope) {
    if (!supabaseAdmin || !WORKSHOP_ID) {
      return normalizeTvChimeConfig(null);
    }
    const { data, error } = await supabaseAdmin
      .from("workshop_tv_chime_schedule")
      .select("config")
      .eq("workshop_id", WORKSHOP_ID)
      .eq("tv_scope", scope)
      .maybeSingle();
    if (error && (error as { code?: string }).code !== "PGRST116") {
      console.error("[API] TV chime schedule:", error.message);
    }
    return normalizeTvChimeConfig((data as { config?: unknown } | null)?.config ?? null);
  }

  async function fetchTvPlaylistForWorkshop(scope: TvScope): Promise<{
    slides: Array<Record<string, unknown>>;
    weeklyGoal: {
      label: string;
      currentAmount: number;
      targetAmount: number;
      showWeeklyBar: boolean;
    } | null;
    chimeSchedule: ReturnType<typeof normalizeTvChimeConfig>;
  }> {
    if (!supabaseAdmin || !WORKSHOP_ID) {
      return { slides: [], weeklyGoal: null, chimeSchedule: normalizeTvChimeConfig(null) };
    }
    const { data: slideRows, error: slideErr } = await selectTvSlideRows(scope, { activeOnly: true });

    if (slideErr) {
      console.error("[API] TV slides:", slideErr);
    }

    const slides = (slideRows ?? []).map((row: Record<string, unknown>) => mapTvSlideFromRow(row));

    const { data: goalRow } = await supabaseAdmin
      .from("workshop_tv_weekly_goal")
      .select("label, current_amount, target_amount, show_weekly_bar")
      .eq("workshop_id", WORKSHOP_ID)
      .eq("tv_scope", scope)
      .maybeSingle();

    const weeklyGoal = goalRow
      ? {
          label: String((goalRow as { label?: string }).label ?? "Meta semanal"),
          currentAmount: Number((goalRow as { current_amount?: number }).current_amount ?? 0),
          targetAmount: Number((goalRow as { target_amount?: number }).target_amount ?? 0),
          showWeeklyBar: (goalRow as { show_weekly_bar?: boolean }).show_weekly_bar !== false,
        }
      : null;

    const chimeSchedule = await fetchTvChimeScheduleNormalized(scope);
    return { slides, weeklyGoal, chimeSchedule };
  }

  /** Playlist para painel da TV (?scope=patio | laboratorio). */
  app.get("/api/tv/playlist", async (req, res) => {
    try {
      const scope = tvScopeFromRequest(req);
      const { slides, weeklyGoal, chimeSchedule } = await fetchTvPlaylistForWorkshop(scope);
      return res.json({ slides, weeklyGoal, chimeSchedule, tvScope: scope });
    } catch (err: any) {
      console.error("[API] GET /api/tv/playlist:", err);
      return res.status(500).json({ error: err?.message ?? "Erro ao carregar playlist da TV." });
    }
  });

  /** Lista completa (inclui inativos) para gestão no app (?scope=patio | laboratorio). */
  app.get("/api/tv/manage", async (req, res) => {
    try {
      const scope = tvScopeFromRequest(req);
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const { data: slideRows, error } = await selectTvSlideRows(scope);
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      const slides = (slideRows ?? []).map((row: Record<string, unknown>) => ({
        ...mapTvSlideFromRow(row),
        isActive: row.is_active === true,
      }));

      const { data: goalRow } = await supabaseAdmin
        .from("workshop_tv_weekly_goal")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("tv_scope", scope)
        .maybeSingle();

      const weeklyGoal = goalRow
        ? {
            label: String((goalRow as { label?: string }).label ?? "Meta semanal"),
            currentAmount: Number((goalRow as { current_amount?: number }).current_amount ?? 0),
            targetAmount: Number((goalRow as { target_amount?: number }).target_amount ?? 0),
            showWeeklyBar: (goalRow as { show_weekly_bar?: boolean }).show_weekly_bar !== false,
          }
        : null;

      const chimeSchedule = await fetchTvChimeScheduleNormalized(scope);
      const videoSettings = await fetchTvVideoSettingsNormalized(scope);
      res.setHeader("Cache-Control", "no-store");
      return res.json({ slides, weeklyGoal, chimeSchedule, videoSettings, tvScope: scope });
    } catch (err: any) {
      console.error("[API] GET /api/tv/manage:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.put("/api/tv/weekly-goal", async (req, res) => {
    try {
      const scope = tvScopeFromRequest(req);
      const { label, currentAmount, targetAmount, showWeeklyBar } = req.body || {};
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const row = {
        workshop_id: WORKSHOP_ID,
        tv_scope: scope,
        label: typeof label === "string" && label.trim() ? label.trim() : "Meta semanal",
        current_amount: Number(currentAmount) || 0,
        target_amount: Number(targetAmount) || 0,
        show_weekly_bar: showWeeklyBar !== false,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseAdmin.from("workshop_tv_weekly_goal").upsert(row, {
        onConflict: "workshop_id,tv_scope",
      });
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] PUT /api/tv/weekly-goal:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.delete("/api/tv/weekly-goal", async (req, res) => {
    try {
      const scope = tvScopeFromRequest(req);
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const { error } = await supabaseAdmin
        .from("workshop_tv_weekly_goal")
        .delete()
        .eq("workshop_id", WORKSHOP_ID)
        .eq("tv_scope", scope);
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] DELETE /api/tv/weekly-goal:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.put("/api/tv/video-settings", async (req, res) => {
    try {
      const scope = tvScopeFromRequest(req);
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      const layoutMode = normalizeTvVideoLayoutMode(body.layoutMode ?? body.layout_mode);
      const { error } = await supabaseAdmin.from("workshop_tv_video_settings").upsert(
        {
          workshop_id: WORKSHOP_ID,
          tv_scope: scope,
          layout_mode: layoutMode,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workshop_id,tv_scope" }
      );
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ ok: true, videoSettings: normalizeTvVideoSettings({ layoutMode }) });
    } catch (err: any) {
      console.error("[API] PUT /api/tv/video-settings:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.put("/api/tv/chime-schedule", async (req, res) => {
    try {
      const scope = tvScopeFromRequest(req);
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const body =
        req.body && typeof req.body === "object" && !Array.isArray(req.body)
          ? (req.body as Record<string, unknown>)
          : {};
      let raw: unknown = body.config;
      if (raw === undefined || raw === null) {
        const looksLikeConfig =
          typeof body.masterEnabled === "boolean" ||
          typeof body.master_enabled === "boolean" ||
          Array.isArray(body.alerts);
        if (looksLikeConfig) raw = body;
      }
      if (raw === undefined || raw === null) {
        return res.status(400).json({
          error: "Corpo inválido: envie { config: { ... } } com a rotina da TV.",
        });
      }
      const config = normalizeTvChimeConfig(raw);
      const { error } = await supabaseAdmin.from("workshop_tv_chime_schedule").upsert(
        {
          workshop_id: WORKSHOP_ID,
          tv_scope: scope,
          config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workshop_id,tv_scope" }
      );
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      res.setHeader("Cache-Control", "no-store");
      return res.json({ ok: true, chimeSchedule: config });
    } catch (err: any) {
      console.error("[API] PUT /api/tv/chime-schedule:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.post("/api/tv/slides", async (req, res) => {
    try {
      const { slide } = req.body || {};
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin || !slide || typeof slide !== "object") {
        return res.status(400).json({ error: "Dados inválidos." });
      }
      const s = slide as Record<string, unknown>;
      const scope = parseTvScope(s.tvScope ?? (req.body as { tvScope?: unknown })?.tvScope ?? req.query?.scope);
      const slideType = String(s.slideType ?? "notice");
      if (!["notice", "image", "video", "goal", "alert"].includes(slideType)) {
        return res.status(400).json({ error: "slideType inválido." });
      }
      if (slideType === "video") {
        const videoSettings = await fetchTvVideoSettingsNormalized(scope);
        if (videoSettings.layoutMode === "single_rotate") {
          const videoCount = await countVideoSlides(scope);
          if (videoCount >= 1) {
            return res.status(400).json({
              error:
                "Modo «um slide de vídeo»: já existe um slide de vídeo. Adicione mais arquivos na playlist desse slide ou mude a configuração para «vários slides».",
            });
          }
        }
      }
      const mediaFullscreen = s.mediaFullscreen === true;
      const mediaObjectFit = normalizeTvMediaObjectFit(s.mediaObjectFit);
      const { mediaUrl, mediaPlaylist } = resolveSlideMediaFields(s);
      const insert = {
        workshop_id: WORKSHOP_ID,
        tv_scope: scope,
        slide_type: slideType,
        title: s.title != null ? String(s.title) : null,
        body: buildTvBodyWithFullscreen(s.body, mediaFullscreen),
        media_url: mediaUrl,
        media_playlist: mediaPlaylist,
        duration_seconds: Math.min(300, Math.max(3, Number(s.durationSeconds) || 10)),
        sort_order: Number.isFinite(Number(s.sortOrder)) ? Number(s.sortOrder) : 0,
        is_active: s.isActive !== false,
        goal_current: s.goalCurrent != null ? Number(s.goalCurrent) : null,
        goal_target: s.goalTarget != null ? Number(s.goalTarget) : null,
        goal_label: s.goalLabel != null ? String(s.goalLabel) : null,
        play_sound: s.playSound === true,
        goal_show_values: s.goalShowValues === true,
        pin_immediate: false,
        media_object_fit: slideType === "image" || slideType === "video" ? mediaObjectFit : "cover",
      };
      let insertResult = await supabaseAdmin.from("workshop_tv_slides").insert(insert).select("id").single();
      if (insertResult.error && isSchemaColumnMissing(insertResult.error, "media_playlist")) {
        const { media_playlist: _drop, ...legacyInsert } = insert;
        insertResult = await supabaseAdmin.from("workshop_tv_slides").insert(legacyInsert).select("id").single();
      }
      if (insertResult.error) {
        return res.status(500).json({ error: insertResult.error.message });
      }
      return res.status(201).json({ id: insertResult.data?.id });
    } catch (err: any) {
      console.error("[API] POST /api/tv/slides:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.patch("/api/tv/slides/:id", async (req, res) => {
    try {
      const { slide } = req.body || {};
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin || !slide || typeof slide !== "object") {
        return res.status(400).json({ error: "Dados inválidos." });
      }
      const { id } = req.params;
      const s = slide as Record<string, unknown>;
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (s.slideType != null) updates.slide_type = String(s.slideType);
      if (s.title !== undefined) updates.title = s.title != null ? String(s.title) : null;
      if (s.body !== undefined || Object.prototype.hasOwnProperty.call(s, "mediaFullscreen")) {
        const rawBody = s.body !== undefined ? s.body : null;
        const mediaFullscreen = s.mediaFullscreen === true;
        updates.body = buildTvBodyWithFullscreen(rawBody, mediaFullscreen);
      }
      if (s.mediaUrl !== undefined || s.mediaPlaylist !== undefined) {
        let mediaInput: Record<string, unknown> = { ...s };
        if (s.mediaUrl === undefined || s.mediaPlaylist === undefined) {
          let currentRow: { media_url?: string | null; media_playlist?: unknown } | null = null;
          let curResult = await supabaseAdmin
            .from("workshop_tv_slides")
            .select("media_url, media_playlist")
            .eq("id", id)
            .eq("workshop_id", WORKSHOP_ID)
            .maybeSingle();
          if (curResult.error && isSchemaColumnMissing(curResult.error, "media_playlist")) {
            curResult = await supabaseAdmin
              .from("workshop_tv_slides")
              .select("media_url")
              .eq("id", id)
              .eq("workshop_id", WORKSHOP_ID)
              .maybeSingle();
          }
          currentRow = (curResult.data as typeof currentRow) ?? null;
          if (currentRow) {
            const curPlaylist = parseMediaPlaylist(currentRow.media_playlist);
            const curUrl =
              currentRow.media_url != null && String(currentRow.media_url).trim()
                ? String(currentRow.media_url).trim()
                : null;
            mediaInput = {
              mediaUrl: s.mediaUrl !== undefined ? s.mediaUrl : curUrl,
              mediaPlaylist:
                s.mediaPlaylist !== undefined
                  ? s.mediaPlaylist
                  : curPlaylist.length > 0
                    ? curPlaylist
                    : curUrl
                      ? [curUrl]
                      : [],
            };
          }
        }
        const { mediaUrl, mediaPlaylist } = resolveSlideMediaFields(mediaInput);
        updates.media_url = mediaUrl;
        updates.media_playlist = mediaPlaylist;
      }
      if (s.durationSeconds != null) updates.duration_seconds = Math.min(300, Math.max(3, Number(s.durationSeconds) || 10));
      if (s.sortOrder != null) updates.sort_order = Number(s.sortOrder);
      if (s.goalCurrent !== undefined) updates.goal_current = s.goalCurrent != null ? Number(s.goalCurrent) : null;
      if (s.goalTarget !== undefined) updates.goal_target = s.goalTarget != null ? Number(s.goalTarget) : null;
      if (s.goalLabel !== undefined) updates.goal_label = s.goalLabel != null ? String(s.goalLabel) : null;
      if (s.playSound !== undefined) updates.play_sound = Boolean(s.playSound);
      if (s.goalShowValues !== undefined) updates.goal_show_values = Boolean(s.goalShowValues);
      if (Object.prototype.hasOwnProperty.call(s, "mediaObjectFit")) {
        updates.media_object_fit = normalizeTvMediaObjectFit(s.mediaObjectFit);
      }
      if (s.isActive !== undefined) {
        updates.is_active = Boolean(s.isActive);
        if (updates.is_active === false) updates.pin_immediate = false;
      }
      /** Exibir imediatamente: aceita boolean ou string (evita falha se o cliente serializar diferente). */
      if (Object.prototype.hasOwnProperty.call(s, "pinImmediate")) {
        const raw = s.pinImmediate;
        const pinOn = raw === true || raw === "true" || raw === 1 || raw === "1";
        if (pinOn) {
          const { data: scopeRow } = await supabaseAdmin
            .from("workshop_tv_slides")
            .select("tv_scope")
            .eq("id", id)
            .eq("workshop_id", WORKSHOP_ID)
            .maybeSingle();
          const pinScope = parseTvScope(
            (scopeRow as { tv_scope?: string } | null)?.tv_scope ?? req.query?.scope
          );
          const { error: clearErr } = await supabaseAdmin
            .from("workshop_tv_slides")
            .update({ pin_immediate: false, updated_at: new Date().toISOString() })
            .eq("workshop_id", WORKSHOP_ID)
            .eq("tv_scope", pinScope);
          if (clearErr) {
            console.error("[API] PATCH tv/slides clear pin_immediate:", clearErr);
            return res.status(500).json({ error: clearErr.message });
          }
          updates.pin_immediate = true;
          updates.is_active = true;
        } else {
          updates.pin_immediate = false;
        }
      }

      let updateResult = await supabaseAdmin
        .from("workshop_tv_slides")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (
        updateResult.error &&
        isSchemaColumnMissing(updateResult.error, "media_playlist") &&
        "media_playlist" in updates
      ) {
        const { media_playlist: _drop, ...legacyUpdates } = updates;
        updateResult = await supabaseAdmin
          .from("workshop_tv_slides")
          .update(legacyUpdates)
          .eq("id", id)
          .eq("workshop_id", WORKSHOP_ID);
      }
      if (updateResult.error) {
        return res.status(500).json({ error: updateResult.error.message });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] PATCH /api/tv/slides/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.delete("/api/tv/slides/:id", async (req, res) => {
    try {
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const { id } = req.params;
      const { error } = await supabaseAdmin
        .from("workshop_tv_slides")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] DELETE /api/tv/slides/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  /** Upload de imagem ou vídeo para a TV (Storage público). */
  const TV_SHORT_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
  const TV_IMAGE_MAX_BYTES = 100 * 1024 * 1024;

  function tvMediaExtensionFromMime(mime: string, originalName: string): string {
    let ext = path.extname(originalName).replace(/^\./, "").toLowerCase();
    if (ext && /^[a-z0-9]{2,8}$/.test(ext)) return ext;
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "video/mp4": "mp4",
      "video/webm": "webm",
      "video/quicktime": "mov",
      "video/3gpp": "3gp",
      "video/x-msvideo": "avi",
    };
    return map[mime] || "bin";
  }

  async function insertTvMediaLibraryRow(params: {
    scope: ReturnType<typeof parseTvScope>;
    mediaType: "video" | "image";
    fileName: string;
    storagePath: string;
    publicUrl: string;
    sizeBytes: number;
  }): Promise<string | undefined> {
    if (!WORKSHOP_ID || !supabaseAdmin) return undefined;
    const titleBase = params.fileName.replace(/\.[^.]+$/, "").trim();
    const { data: mediaRow, error: mediaInsertErr } = await supabaseAdmin
      .from("workshop_tv_media")
      .insert({
        workshop_id: WORKSHOP_ID,
        tv_scope: params.scope,
        media_type: params.mediaType,
        title: titleBase || null,
        file_name: params.fileName,
        media_url: params.publicUrl,
        storage_path: params.storagePath,
        size_bytes: params.sizeBytes,
      })
      .select("id")
      .single();
    if (mediaInsertErr) {
      if (!isMissingRelationError(mediaInsertErr.message)) {
        console.error("[API] TV media library insert:", mediaInsertErr);
      }
      return undefined;
    }
    return mediaRow?.id ? String(mediaRow.id) : undefined;
  }

  function mapTvMediaRow(row: Record<string, unknown>) {
    return {
      id: String(row.id),
      tvScope: parseTvScope(row.tv_scope),
      mediaType: row.media_type === "image" ? ("image" as const) : ("video" as const),
      title: row.title != null ? String(row.title) : null,
      fileName: String(row.file_name ?? ""),
      mediaUrl: String(row.media_url ?? ""),
      sizeBytes: Number(row.size_bytes ?? 0),
      createdAt: String(row.created_at ?? ""),
    };
  }

  app.get("/api/tv/media", async (req, res) => {
    try {
      const scope = tvScopeFromRequest(req);
      if (!WORKSHOP_ID || !supabaseAdmin) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_tv_media")
        .select("id, tv_scope, media_type, title, file_name, media_url, size_bytes, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("tv_scope", scope)
        .order("created_at", { ascending: false });
      if (error) {
        if (isMissingRelationError(error.message)) {
          return res.json({ items: [] });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json({ items: (data ?? []).map((row) => mapTvMediaRow(row as Record<string, unknown>)) });
    } catch (err: any) {
      console.error("[API] GET /api/tv/media:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.delete("/api/tv/media/:id", async (req, res) => {
    try {
      if (!WORKSHOP_ID || !supabaseAdmin) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id ?? "").trim();
      if (!id) return res.status(400).json({ error: "ID inválido." });
      const { data: row, error: fetchErr } = await supabaseAdmin
        .from("workshop_tv_media")
        .select("id, storage_path")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (fetchErr) {
        if (isMissingRelationError(fetchErr.message)) {
          return res.status(404).json({ error: "Mídia não encontrada." });
        }
        return res.status(500).json({ error: fetchErr.message });
      }
      if (!row) return res.status(404).json({ error: "Mídia não encontrada." });
      const storagePath = String((row as { storage_path?: string }).storage_path ?? "").trim();
      if (storagePath) {
        const { error: storageErr } = await supabaseAdmin.storage.from(TV_PATIO_BUCKET).remove([storagePath]);
        if (storageErr) {
          console.warn("[API] DELETE tv/media storage:", storageErr.message);
        }
      }
      const { error: delErr } = await supabaseAdmin
        .from("workshop_tv_media")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (delErr) return res.status(500).json({ error: delErr.message });
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] DELETE /api/tv/media/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  /** Passo 1: URL assinada para upload direto ao Storage (contorna limite de body na Vercel). */
  app.post("/api/tv/media/upload-init", async (req, res) => {
    try {
      if (!WORKSHOP_ID || !supabaseAdmin) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const body = (req.body ?? {}) as {
        fileName?: unknown;
        fileSize?: unknown;
        contentType?: unknown;
      };
      const fileName = String(body.fileName ?? "").trim() || "arquivo.mp4";
      const fileSize = Number(body.fileSize ?? 0);
      if (!Number.isFinite(fileSize) || fileSize <= 0) {
        return res.status(400).json({ error: "Tamanho do arquivo inválido." });
      }
      const resolved = resolveTvUploadMime(String(body.contentType ?? ""), fileName);
      if (!resolved.kind) {
        return res.status(400).json({
          error: "Apenas arquivos de imagem ou vídeo são permitidos (MP4, MOV, WebM, JPG, PNG, etc.).",
        });
      }
      if (resolved.kind === "video" && fileSize > TV_SHORT_VIDEO_MAX_BYTES) {
        return res.status(400).json({
          error: `Vídeo muito grande. Envie vídeos curtos de até ${Math.round(TV_SHORT_VIDEO_MAX_BYTES / (1024 * 1024))} MB.`,
        });
      }
      if (resolved.kind === "image" && fileSize > TV_IMAGE_MAX_BYTES) {
        return res.status(400).json({ error: "Imagem muito grande. Máximo 100 MB." });
      }
      const ext = tvMediaExtensionFromMime(resolved.mime, fileName);
      const objectPath = `${WORKSHOP_ID}/tv/${crypto.randomUUID()}.${ext}`;
      const { data, error } = await supabaseAdmin.storage
        .from(TV_PATIO_BUCKET)
        .createSignedUploadUrl(objectPath);
      if (error || !data) {
        console.error("[API] TV signed upload URL:", error);
        return res.status(500).json({
          error:
            error?.message ??
            "Não foi possível preparar o upload. Verifique se o bucket tv-patio existe no Supabase.",
        });
      }
      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from(TV_PATIO_BUCKET).getPublicUrl(objectPath);
      return res.json({
        path: data.path,
        token: data.token,
        signedUrl: data.signedUrl,
        publicUrl,
        mime: resolved.mime,
        mediaType: resolved.kind,
      });
    } catch (err: any) {
      console.error("[API] POST /api/tv/media/upload-init:", err);
      return res.status(500).json({ error: err?.message ?? "Erro ao preparar upload." });
    }
  });

  /** Passo 3: registra mídia na biblioteca após upload direto ao Storage. */
  app.post("/api/tv/media/upload-complete", async (req, res) => {
    try {
      if (!WORKSHOP_ID || !supabaseAdmin) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const scope = tvScopeFromRequest(req);
      const body = (req.body ?? {}) as {
        storagePath?: unknown;
        fileName?: unknown;
        fileSize?: unknown;
        mime?: unknown;
        mediaType?: unknown;
      };
      const storagePath = String(body.storagePath ?? "").trim();
      const expectedPrefix = `${WORKSHOP_ID}/tv/`;
      if (!storagePath.startsWith(expectedPrefix)) {
        return res.status(400).json({ error: "Caminho de armazenamento inválido." });
      }
      const fileName = String(body.fileName ?? "").trim() || path.basename(storagePath);
      const fileSize = Number(body.fileSize ?? 0);
      const mime = String(body.mime ?? "");
      const resolved = resolveTvUploadMime(mime, fileName);
      const mediaType =
        body.mediaType === "image" || body.mediaType === "video"
          ? body.mediaType
          : resolved.kind;
      if (mediaType !== "image" && mediaType !== "video") {
        return res.status(400).json({ error: "Tipo de mídia inválido." });
      }
      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from(TV_PATIO_BUCKET).getPublicUrl(storagePath);
      const mediaId = await insertTvMediaLibraryRow({
        scope,
        mediaType,
        fileName,
        storagePath,
        publicUrl,
        sizeBytes: Number.isFinite(fileSize) && fileSize > 0 ? fileSize : 0,
      });
      return res.json({ url: publicUrl, mediaId });
    } catch (err: any) {
      console.error("[API] POST /api/tv/media/upload-complete:", err);
      return res.status(500).json({ error: err?.message ?? "Erro ao finalizar upload." });
    }
  });

  /** Legado: multipart pelo servidor (imagens pequenas / dev local). Vídeos grandes devem usar upload-init. */
  app.post(
    "/api/tv/media/upload",
    (req, res, next) => {
      tvMediaUpload.single("file")(req, res, (err: unknown) => {
        if (err) {
          const code = (err as { code?: string }).code;
          if (code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({
              error: "Arquivo muito grande. Vídeos curtos até 50 MB; imagens até 100 MB.",
            });
          }
          const msg = err instanceof Error ? err.message : "Falha ao receber o arquivo.";
          return res.status(400).json({ error: msg });
        }
        next();
      });
    },
    async (req, res) => {
    try {
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const file = req.file;
      if (!file?.buffer) {
        return res.status(400).json({ error: "Envie um arquivo (imagem ou vídeo)." });
      }
      const originalName = String(file.originalname || "").trim();
      const resolved = resolveTvUploadMime(String(file.mimetype || ""), originalName);
      if (!resolved.kind) {
        return res.status(400).json({
          error: "Apenas arquivos de imagem ou vídeo são permitidos (MP4, MOV, WebM, JPG, PNG, etc.).",
        });
      }
      const mime = resolved.mime;
      if (resolved.kind === "video" && file.buffer.length > TV_SHORT_VIDEO_MAX_BYTES) {
        return res.status(400).json({
          error: `Vídeo muito grande. Envie vídeos curtos de até ${Math.round(TV_SHORT_VIDEO_MAX_BYTES / (1024 * 1024))} MB.`,
        });
      }
      const scope = tvScopeFromRequest(req);
      let ext = path.extname(originalName).replace(/^\./, "").toLowerCase();
      if (!ext || !/^[a-z0-9]{2,8}$/.test(ext)) {
        const map: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif",
          "video/mp4": "mp4",
          "video/webm": "webm",
          "video/quicktime": "mov",
          "video/3gpp": "3gp",
          "video/x-msvideo": "avi",
        };
        ext = map[mime] || "bin";
      }
      const objectPath = `${WORKSHOP_ID}/tv/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabaseAdmin.storage
        .from(TV_PATIO_BUCKET)
        .upload(objectPath, file.buffer, { contentType: mime, upsert: false });
      if (uploadError) {
        console.error("[API] TV media upload:", uploadError);
        return res.status(500).json({ error: uploadError.message });
      }
      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from(TV_PATIO_BUCKET).getPublicUrl(objectPath);

      const mediaType = resolved.kind;
      const fileName = originalName || `arquivo.${ext}`;
      const titleBase = fileName.replace(/\.[^.]+$/, "").trim();

      let mediaId: string | undefined;
      const { data: mediaRow, error: mediaInsertErr } = await supabaseAdmin
        .from("workshop_tv_media")
        .insert({
          workshop_id: WORKSHOP_ID,
          tv_scope: scope,
          media_type: mediaType,
          title: titleBase || null,
          file_name: fileName,
          media_url: publicUrl,
          storage_path: objectPath,
          size_bytes: file.buffer.length,
        })
        .select("id")
        .single();
      if (mediaInsertErr) {
        if (!isMissingRelationError(mediaInsertErr.message)) {
          console.error("[API] TV media library insert:", mediaInsertErr);
        }
      } else if (mediaRow?.id) {
        mediaId = String(mediaRow.id);
      }

      return res.json({ url: publicUrl, mediaId });
    } catch (err: any) {
      console.error("[API] POST /api/tv/media/upload:", err);
      return res.status(500).json({ error: err?.message ?? "Erro no upload." });
    }
  }
  );

  function normalizePlacaInput(raw: unknown): string {
    return String(raw ?? "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase()
      .slice(0, 8);
  }

  /** Consulta dados do veículo pela placa (token só no servidor: PLACAFIPE_TOKEN). */
  app.post("/api/consulta-placa", async (req, res) => {
    try {
      const token = process.env.PLACAFIPE_TOKEN;
      if (!token || !String(token).trim()) {
        return res.status(503).json({
          error:
            "Consulta por placa não configurada. Defina PLACAFIPE_TOKEN no ambiente do servidor (ex.: Vercel).",
        });
      }
      const placa = normalizePlacaInput(req.body?.placa ?? req.body?.plate);
      if (placa.length < 7) {
        return res.status(400).json({ error: "Informe uma placa válida (mínimo 7 caracteres)." });
      }

      const upstream = await fetch("https://api.placafipe.com.br/getplaca", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placa, token: String(token).trim() }),
      });

      const data = (await upstream.json().catch(() => null)) as Record<string, unknown> | null;
      if (!data || typeof data !== "object") {
        return res.status(502).json({ error: "Resposta inválida da consulta de placa." });
      }

      const codigo = data.codigo;
      const ok =
        codigo === 1 || codigo === "1" || Number(codigo) === 1;

      if (!ok) {
        const msg =
          typeof data.msg === "string" && data.msg.trim()
            ? data.msg.trim()
            : "Veículo não encontrado ou consulta indisponível.";
        return res.status(404).json({ error: msg, codigo });
      }

      const infoRaw = data.informacoes_veiculo;
      const info =
        infoRaw && typeof infoRaw === "object"
          ? (infoRaw as Record<string, unknown>)
          : {};

      const str = (v: unknown) =>
        v == null ? "" : String(v).replace(/\s+/g, " ").trim();

      const marca = str(info.marca);
      const modelo = str(info.modelo);
      const vehicleBrand = marca || null;
      const vehicleModel = modelo || null;

      const anoModelo = str(info.ano_modelo);
      const ano = str(info.ano);
      const vehicleYear =
        anoModelo && ano && anoModelo !== ano
          ? `${anoModelo} / ${ano}`
          : anoModelo || ano || null;

      const cor = str(info.cor);
      const cil = str(info.cilindradas);
      const comb = str(info.combustivel);
      const engineParts: string[] = [];
      if (cil) engineParts.push(`${cil} cc`);
      if (comb) engineParts.push(comb);
      const vehicleEngineInfo = engineParts.length > 0 ? engineParts.join(" · ") : null;

      const municipio = str(info.municipio);
      const uf = str(info.uf);
      const citySuggestion =
        municipio && uf ? `${municipio} — ${uf}` : municipio || uf || null;

      const plateApi = (str(info.placa) || str(data.placa) || placa).toUpperCase();

      return res.json({
        plate: plateApi,
        vehicleBrand,
        vehicleModel,
        vehicleColor: cor || null,
        vehicleYear,
        vehicleEngineInfo,
        citySuggestion,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[API] POST /api/consulta-placa:", err);
      return res.status(500).json({ error: msg });
    }
  });

  // ----------------- ORDENS DE SERVIÇO -----------------
  const SERVICE_ORDERS_LIST_SELECT =
    "id, os_number, customer_id, vehicle_model, vehicle_brand, module_identification, module_kind, module_vehicle_kind, module_product_other, plate, mileage_km, delivery_date, vehicle_observations, issue_description, ai_analysis, status, assigned_technician, garantia_tag, order_type, vehicle_category, vehicle_color, vehicle_year, vehicle_engine_info, reference_links, lab_service_links, lab_evaluated_service, lab_evaluated_at, lab_evaluated_by_name, bench_slot, bench_slot_at, bench_queued_at, external_repair, diagnostic_authorization_signed_at, diagnostic_authorization_signature_path, created_at, updated_at";
  /** Fallback quando migrações recentes ainda não foram aplicadas no projeto Supabase. */
  const SERVICE_ORDERS_LIST_SELECT_MINIMAL =
    "id, os_number, customer_id, vehicle_model, vehicle_brand, module_identification, plate, mileage_km, delivery_date, issue_description, ai_analysis, status, assigned_technician, garantia_tag, order_type, vehicle_category, vehicle_color, vehicle_year, vehicle_engine_info, reference_links, diagnostic_authorization_signed_at, diagnostic_authorization_signature_path, created_at, updated_at";
  /** Histórico arquivado — sem textos/JSON pesados (ai_analysis, anexos, etc.). */
  const SERVICE_ORDERS_ARCHIVE_LIST_SELECT =
    "id, os_number, customer_id, vehicle_model, vehicle_brand, module_identification, module_kind, module_vehicle_kind, module_product_other, plate, status, assigned_technician, garantia_tag, order_type, vehicle_category, created_at, updated_at";
  const SERVICE_ORDERS_ARCHIVE_LIST_SELECT_MINIMAL =
    "id, os_number, customer_id, vehicle_model, vehicle_brand, module_identification, plate, status, assigned_technician, garantia_tag, order_type, vehicle_category, created_at, updated_at";
  const SERVICE_ORDERS_PAGE_SIZE = 1000;
  /** Evita URL gigante no PostgREST ao enriquecer nomes (histórico com centenas de OS). */
  const IN_FILTER_CHUNK_SIZE = 75;

  async function mapCustomerNamesByIds(ids: string[]): Promise<Record<string, string>> {
    const customerNameMap: Record<string, string> = {};
    if (!supabaseAdmin || ids.length === 0) return customerNameMap;
    const unique = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < unique.length; i += IN_FILTER_CHUNK_SIZE) {
      const chunk = unique.slice(i, i + IN_FILTER_CHUNK_SIZE);
      const { data, error } = await supabaseAdmin
        .from("customers")
        .select("id, name")
        .in("id", chunk);
      if (error) {
        console.warn("[API] Falha ao enriquecer clientes (chunk):", error.message);
        continue;
      }
      (data ?? []).forEach((c: { id: string; name?: string | null }) => {
        const n = (c.name ?? "").trim();
        if (c.id && n) customerNameMap[c.id] = n;
      });
    }
    return customerNameMap;
  }

  async function mapTechnicianUsersByIds(ids: string[]): Promise<Record<string, string>> {
    const technicianNameMap: Record<string, string> = {};
    if (!supabaseAdmin || !WORKSHOP_ID || ids.length === 0) return technicianNameMap;
    const unique = [...new Set(ids.filter(Boolean))];
    for (let i = 0; i < unique.length; i += IN_FILTER_CHUNK_SIZE) {
      const chunk = unique.slice(i, i + IN_FILTER_CHUNK_SIZE);
      const { data, error } = await supabaseAdmin
        .from("workshop_system_users")
        .select("id, display_name, username")
        .eq("workshop_id", WORKSHOP_ID)
        .in("id", chunk);
      if (error) {
        console.warn("[API] Falha ao enriquecer técnicos (chunk):", error.message);
        continue;
      }
      (data ?? []).forEach((u: { id: string; display_name?: string | null; username?: string | null }) => {
        technicianNameMap[u.id] = (u.display_name || u.username || "").trim() || "Técnico";
      });
    }
    return technicianNameMap;
  }

  /** PostgREST limita ~1000 linhas por request — pagina até trazer todas as OS da oficina. */
  async function fetchAllServiceOrderRowsWithSelect(
    select: string,
    filters: {
      status?: string;
      orderType?: string;
    }
  ): Promise<Record<string, unknown>[]> {
    if (!supabaseAdmin || !WORKSHOP_ID) return [];
    const all: Record<string, unknown>[] = [];
    let offset = 0;
    for (;;) {
      let query = supabaseAdmin
        .from("service_orders")
        .select(select)
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false })
        .range(offset, offset + SERVICE_ORDERS_PAGE_SIZE - 1);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.orderType === "vehicle" || filters.orderType === "module") {
        query = query.eq("order_type", filters.orderType);
      }
      const { data, error } = await query;
      if (error) throw error;
      const batch = (data ?? []) as Record<string, unknown>[];
      all.push(...batch);
      if (batch.length < SERVICE_ORDERS_PAGE_SIZE) break;
      offset += SERVICE_ORDERS_PAGE_SIZE;
    }
    return all;
  }

  function resolveServiceOrdersListSelect(status?: string): { primary: string; fallback: string } {
    if (status === CANCELLED_STATUS) {
      return {
        primary: SERVICE_ORDERS_ARCHIVE_LIST_SELECT,
        fallback: SERVICE_ORDERS_ARCHIVE_LIST_SELECT_MINIMAL,
      };
    }
    return {
      primary: SERVICE_ORDERS_LIST_SELECT,
      fallback: SERVICE_ORDERS_LIST_SELECT_MINIMAL,
    };
  }

  async function fetchAllServiceOrderRows(filters: {
    status?: string;
    orderType?: string;
  }): Promise<Record<string, unknown>[]> {
    const { primary, fallback } = resolveServiceOrdersListSelect(filters.status);
    try {
      return await fetchAllServiceOrderRowsWithSelect(primary, filters);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err ?? "");
      if (/column|does not exist|42703/i.test(msg)) {
        console.warn("[API] Select de service_orders falhou; usando select reduzido:", msg);
        return await fetchAllServiceOrderRowsWithSelect(fallback, filters);
      }
      throw err;
    }
  }

  app.get("/api/service-orders", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const status = req.query.status as string | undefined;
      const orderType = req.query.orderType as string | undefined;

      const rows = await fetchAllServiceOrderRows({ status, orderType });
      const customerIds = [...new Set((rows as { customer_id?: string }[]).map((r) => r.customer_id).filter(Boolean))] as string[];
      const customerNameMap = await mapCustomerNamesByIds(customerIds);

      const techValues = [...new Set(rows.map((r: { assigned_technician?: string | null }) => r.assigned_technician).filter(Boolean))] as string[];
      const technicianNameMap: Record<string, string> = {};

      if (techValues.length > 0) {
        const looksLikeUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
        const uuids = techValues.filter(looksLikeUuid);
        const slugs = techValues.filter((v) => !looksLikeUuid(v));

        if (uuids.length > 0) {
          Object.assign(technicianNameMap, await mapTechnicianUsersByIds(uuids));
        }
        if (slugs.length > 0) {
          const { data: workshopTechs } = await supabaseAdmin
            .from("workshop_technicians")
            .select("slug, name")
            .eq("workshop_id", WORKSHOP_ID);
          (workshopTechs ?? []).forEach((t: { slug: string; name?: string | null }) => {
            const name = (t.name || "").trim();
            if (!name) return;
            const raw = (t.slug || "").trim();
            const lower = raw.toLowerCase();
            if (raw) technicianNameMap[raw] = name;
            if (lower && lower !== raw) technicianNameMap[lower] = name;
          });
        }
      }

      const enriched = rows.map((r: Record<string, unknown> & { assigned_technician?: string | null; customer_id?: string }) => {
        const tech = r.assigned_technician;
        const name =
          tech == null
            ? null
            : technicianNameMap[tech as string] ?? technicianNameMap[(tech as string).trim().toLowerCase()] ?? null;
        const customerName = (r.customer_id && customerNameMap[r.customer_id]) ? customerNameMap[r.customer_id] : null;
        return { ...r, assigned_technician_name: name, customer_name: customerName };
      });

      return res.json(enriched);
    } catch (err: any) {
      console.error("[API] Erro inesperado em GET /api/service-orders:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  /** Orçamentos de OS ativas no Pátio e Laboratório (exclui arquivadas) — hub + badge. */
  app.get("/api/patio-vehicle-budgets-aggregate", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { data: orders, error: e1 } = await supabaseAdmin
        .from("service_orders")
        .select("id, status, plate, vehicle_model, vehicle_brand, os_number, customer_id, order_type, module_identification")
        .eq("workshop_id", WORKSHOP_ID)
        .in("order_type", ["vehicle", "module"])
        .neq("status", CANCELLED_STATUS);

      if (e1) {
        console.error("[API] patio-vehicle-budgets-aggregate (orders):", e1);
        return res.status(500).json({ error: e1.message });
      }

      const rows = orders ?? [];
      if (rows.length === 0) {
        return res.json({ items: [] });
      }

      const customerIds = [...new Set(rows.map((r: { customer_id?: string }) => r.customer_id).filter(Boolean))] as string[];
      const customerNameMap: Record<string, string> = {};
      if (customerIds.length > 0) {
        const { data: customersData } = await supabaseAdmin
          .from("customers")
          .select("id, name")
          .in("id", customerIds);
        (customersData ?? []).forEach((c: { id: string; name?: string | null }) => {
          const n = (c.name ?? "").trim();
          if (c.id && n) customerNameMap[c.id] = n;
        });
      }

      const orderIds = rows.map((r: { id: string }) => r.id);
      const orderMap = new Map(rows.map((r: Record<string, unknown>) => [r.id as string, r]));

      const { data: budgets, error: e2 } = await supabaseAdmin
        .from("budgets")
        .select(await budgetAggregateSelect())
        .eq("workshop_id", WORKSHOP_ID)
        .in("service_order_id", orderIds);

      if (e2) {
        console.error("[API] patio-vehicle-budgets-aggregate (budgets):", e2);
        return res.status(500).json({ error: e2.message });
      }

      const items = (budgets ?? []).map((b: Record<string, unknown>) => {
        const sid = String(b.service_order_id ?? "");
        const o = orderMap.get(sid) as
          | {
              plate?: string | null;
              vehicle_model?: string | null;
              vehicle_brand?: string | null;
              os_number?: number | null;
              status?: string;
              customer_id?: string | null;
              order_type?: string | null;
              module_identification?: string | null;
            }
          | undefined;
        const orderType = o?.order_type === "module" ? "module" : "vehicle";
        const contentSignature = crypto
          .createHash("sha256")
          .update(
            JSON.stringify({
              cardName: b.card_name ?? "",
              updatedAt: String(b.updated_at ?? ""),
              d: b.diagnosis ?? "",
              s: b.services ?? [],
              p: b.parts ?? [],
              o: b.observations ?? "",
            })
          )
          .digest("hex");
        const cid = o?.customer_id ?? null;
        const servicesArr = Array.isArray(b.services) ? b.services : [];
        const partsArr = Array.isArray(b.parts) ? b.parts : [];
        let approvedItemsCount = 0;
        let rejectedItemsCount = 0;
        let pendingItemsCount = 0;
        let hasExplicitApprovalDecisions = false;
        for (const row of [...servicesArr, ...partsArr]) {
          const r = row as { approved?: boolean };
          if (r.approved === true) {
            approvedItemsCount += 1;
            hasExplicitApprovalDecisions = true;
          } else if (r.approved === false) {
            rejectedItemsCount += 1;
            hasExplicitApprovalDecisions = true;
          } else if (row != null && typeof row === "object") {
            pendingItemsCount += 1;
          }
        }
        const hasApprovedItems = approvedItemsCount > 0;
        const diag = typeof b.diagnosis === "string" ? b.diagnosis : "";
        const createdAt = String(b.created_at ?? "");
        const updatedAtRaw = b.updated_at != null && String(b.updated_at).trim() !== "" ? String(b.updated_at) : "";
        const updatedAt = updatedAtRaw || createdAt;
        return {
          budgetId: String(b.id ?? ""),
          serviceOrderId: sid,
          createdAt,
          updatedAt,
          contentSignature,
          cardName: b.card_name != null ? String(b.card_name) : null,
          diagnosisPreview: diag.slice(0, 140),
          servicesCount: servicesArr.length,
          partsCount: partsArr.length,
          plate: o?.plate != null ? String(o.plate) : null,
          vehicleModel: o?.vehicle_model != null ? String(o.vehicle_model) : null,
          vehicleBrand: o?.vehicle_brand != null ? String(o.vehicle_brand) : null,
          osNumber: o?.os_number != null && Number.isFinite(Number(o.os_number)) ? Number(o.os_number) : null,
          orderStatus: o?.status != null ? String(o.status) : "",
          orderType,
          moduleIdentification:
            orderType === "module" && o?.module_identification != null
              ? String(o.module_identification)
              : null,
          customerName: cid && customerNameMap[cid] ? customerNameMap[cid] : null,
          hasApprovedItems,
          hasExplicitApprovalDecisions,
          approvedItemsCount,
          rejectedItemsCount,
          pendingItemsCount,
          isVerified: b.verified_at != null && String(b.verified_at).trim() !== "",
          verifiedAt: b.verified_at != null ? String(b.verified_at) : null,
          verifiedByName: b.verified_by_name != null ? String(b.verified_by_name) : null,
        };
      });

      items.sort(
        (a, b) =>
          Math.max(new Date(b.createdAt).getTime(), new Date(b.updatedAt).getTime()) -
          Math.max(new Date(a.createdAt).getTime(), new Date(a.updatedAt).getTime())
      );
      return res.json({ items });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/patio-vehicle-budgets-aggregate:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  /** SSE: alterações em orçamentos/OS da oficina → clients atualizam o hub Orçamentos em tempo real. */
  app.get("/api/patio-budgets-hub/live", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const wid = WORKSHOP_ID;

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      const flush = (res as { flushHeaders?: () => void }).flushHeaders;
      if (typeof flush === "function") flush();

      const send = (reason: string) => {
        try {
          res.write(`data: ${JSON.stringify({ source: reason, t: Date.now() })}\n\n`);
        } catch {
          /* resposta já fechada */
        }
      };

      const channelName = `patio-budgets-hub-${wid}-${Date.now()}`;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const channel = supabaseAdmin
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "budgets", filter: `workshop_id=eq.${wid}` },
          () => send("budgets")
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "service_orders", filter: `workshop_id=eq.${wid}` },
          () => send("service_orders")
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("[SSE] Realtime falhou para patio-budgets-hub:", err);
            if (heartbeat) {
              clearInterval(heartbeat);
              heartbeat = null;
            }
            try {
              void supabaseAdmin.removeChannel(channel);
            } catch {
              /* ignore */
            }
            if (!res.writableEnded) res.end();
          }
        });

      heartbeat = setInterval(() => {
        try {
          res.write(`: ping\n\n`);
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
        }
      }, 25000);

      req.on("close", () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        try {
          void supabaseAdmin.removeChannel(channel);
        } catch {
          /* ignore */
        }
      });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/patio-budgets-hub/live:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
      }
    }
  });

  app.post("/api/service-orders", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const {
        customerId,
        vehicleModel,
        moduleIdentification,
        plate,
        mileageKm,
        issueDescription,
        aiAnalysis,
        orderType: bodyOrderType,
        vehicleCategory: bodyVehicleCategory,
        vehicleColor: bodyVehicleColor,
        vehicleYear: bodyVehicleYear,
        vehicleEngineInfo: bodyVehicleEngineInfo,
        vehicleBrand: bodyVehicleBrand,
        moduleKind: bodyModuleKind,
        moduleVehicleKind: bodyModuleVehicleKind,
        moduleProductOther: bodyModuleProductOther,
        status: bodyStatus,
      } = req.body;

      const orderType = bodyOrderType === "module" ? "module" : "vehicle";
      const trimOrNull = (v: unknown) => {
        if (v == null) return null;
        const t = String(v).trim();
        return t === "" ? null : t;
      };

      if (!customerId) {
        return res.status(400).json({ error: "customerId é obrigatório." });
      }
      if (orderType === "vehicle" && (!vehicleModel || !plate)) {
        return res.status(400).json({
          error: "Para veículos: vehicleModel e plate são obrigatórios.",
        });
      }
      if (orderType === "module" && !vehicleModel && !moduleIdentification) {
        return res.status(400).json({
          error: "Para o laboratório: preencha ao menos Veículo ou Identificação do produto.",
        });
      }
      const moduleKindParsed =
        orderType === "module" ? parseModuleKind(bodyModuleKind) : null;
      const moduleVehicleKindParsed =
        orderType === "module" ? parseModuleVehicleKind(bodyModuleVehicleKind) : null;
      const moduleProductOtherTrimmed =
        orderType === "module" ? trimOrNull(bodyModuleProductOther) : null;
      if (orderType === "module" && !moduleKindParsed) {
        return res.status(400).json({
          error: "Selecione o produto.",
        });
      }
      if (orderType === "module" && moduleKindParsed === "outro" && !moduleProductOtherTrimmed) {
        return res.status(400).json({
          error: 'Ao escolher "Outro produto", descreva qual peça entrou.',
        });
      }
      if (orderType === "module" && !moduleVehicleKindParsed) {
        return res.status(400).json({
          error: "Informe se o produto é de automóvel ou de motocicleta.",
        });
      }

      const { data: nextOsNumber, error: rpcError } = await supabaseAdmin.rpc(
        "get_next_os_number",
        { p_workshop_id: WORKSHOP_ID }
      );

      if (rpcError || nextOsNumber == null) {
        console.error("[API] Erro ao obter próximo os_number:", rpcError);
        return res.status(500).json({
          error:
            rpcError?.message ??
            "Não foi possível gerar o número da OS. Rode a migration workshop_os_counter_atomic.",
        });
      }

      const vehicleCategoryTrimmed =
        orderType === "vehicle" && typeof bodyVehicleCategory === "string"
          ? bodyVehicleCategory.trim() || null
          : null;

      const vehicleColorIns =
        orderType === "vehicle" ? trimOrNull(bodyVehicleColor) : null;
      const vehicleYearIns =
        orderType === "vehicle" ? trimOrNull(bodyVehicleYear) : null;
      const vehicleEngineInfoIns =
        orderType === "vehicle" ? trimOrNull(bodyVehicleEngineInfo) : null;
      const vehicleBrandIns =
        orderType === "vehicle" ? trimOrNull(bodyVehicleBrand) : null;

      let initialStatus: string = FIRST_STAGE;
      if (orderType === "module" && bodyStatus != null && String(bodyStatus).trim() !== "") {
        const normalized = normalizeStatusForFlow(String(bodyStatus), "module");
        if (
          normalized !== CANCELLED_STATUS &&
          LAB_MODULE_INTAKE_STATUSES.includes(normalized)
        ) {
          initialStatus = normalized;
        }
      }

      const benchFields =
        orderType === "module"
          ? await benchFieldsForNewModule(initialStatus)
          : { bench_slot: null, bench_slot_at: null, bench_queued_at: null };

      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .insert({
          workshop_id: WORKSHOP_ID,
          os_number: nextOsNumber,
          customer_id: customerId,
          vehicle_model: vehicleModel ?? null,
          vehicle_brand: vehicleBrandIns,
          module_identification: orderType === "module" ? (moduleIdentification ?? null) : null,
          module_kind: moduleKindParsed,
          module_vehicle_kind: moduleVehicleKindParsed,
          module_product_other:
            orderType === "module" && moduleKindParsed === "outro"
              ? moduleProductOtherTrimmed
              : null,
          plate: orderType === "vehicle" ? String(plate || '').toUpperCase() : null,
          mileage_km: orderType === "vehicle" && mileageKm != null && String(mileageKm).trim() !== '' ? String(mileageKm).trim() : null,
          issue_description: issueDescription ?? null,
          ai_analysis: aiAnalysis ?? null,
          status: initialStatus,
          order_type: orderType,
          vehicle_category: vehicleCategoryTrimmed,
          vehicle_color: vehicleColorIns,
          vehicle_year: vehicleYearIns,
          vehicle_engine_info: vehicleEngineInfoIns,
          bench_slot: benchFields.bench_slot,
          bench_slot_at: benchFields.bench_slot_at,
          bench_queued_at: benchFields.bench_queued_at,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao criar service_order:", error);
        return res.status(500).json({ error: error.message });
      }

      if (orderType === "module") {
        await processIntakeBenchQueue();
        if (data?.id && benchFields.bench_queued_at) {
          const { data: refreshed } = await supabaseAdmin
            .from("service_orders")
            .select("*")
            .eq("id", data.id)
            .eq("workshop_id", WORKSHOP_ID)
            .maybeSingle();
          if (refreshed) return res.status(201).json(refreshed);
        }
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em POST /api/service-orders:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Upload de fotos vinculadas a uma OS (armazenadas no Storage do Supabase)
  app.post(
    "/api/service-orders/:id/photos",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!supabaseAdmin || !WORKSHOP_ID) {
          return res.status(500).json({
            error:
              "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
          });
        }

        const serviceOrderId = reqOrderId(req);
        const file = req.file;

        if (!file) {
          return res.status(400).json({ error: "Arquivo não enviado." });
        }

        if (!serviceOrderId) {
          return res.status(400).json({ error: "ID da OS inválido." });
        }

        // Garante que a OS pertence à oficina
        const { data: serviceOrder, error: soError } = await supabaseAdmin
          .from("service_orders")
          .select("id, workshop_id")
          .eq("id", serviceOrderId)
          .single();

        if (soError || !serviceOrder || serviceOrder.workshop_id !== WORKSHOP_ID) {
          return res.status(404).json({ error: "Ordem de serviço não encontrada." });
        }

        const bucket = VEHICLE_PHOTOS_BUCKET;
        const safeName = sanitizeVehiclePhotoFileName(file.originalname);
        const pathInBucket = `${WORKSHOP_ID}/${serviceOrderId}/${Date.now()}_${safeName}`;
        const contentType = /\.pdf$/i.test(safeName)
          ? "application/pdf"
          : file.mimetype?.startsWith("image/")
            ? file.mimetype
            : file.mimetype || "application/octet-stream";

        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(pathInBucket, file.buffer, {
            contentType,
            upsert: false,
          });

        if (uploadError) {
          console.error("[API] Erro ao enviar foto para Storage:", uploadError);
          return res.status(500).json({ error: uploadError.message });
        }

        const {
          data: { publicUrl },
        } = supabaseAdmin.storage.from(bucket).getPublicUrl(pathInBucket);

        await touchServiceOrderUpdatedAt(serviceOrderId);

        return res.status(201).json({
          url: publicUrl,
          path: pathInBucket,
          name: safeName,
        });
      } catch (err: any) {
        console.error(
          "[API] Erro inesperado em POST /api/service-orders/:id/photos:",
          err
        );
        return res
          .status(500)
          .json({ error: err?.message ?? "Erro desconhecido" });
      }
    }
  );

  // SSE + Supabase Realtime: notifica o front para recarregar o modal da OS quando algo mudar no banco
  app.get("/api/service-orders/:id/live", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const serviceOrderId = reqOrderId(req);
      if (!serviceOrderId) {
        return res.status(400).json({ error: "ID da OS inválido." });
      }

      const { data: so, error: soErr } = await supabaseAdmin
        .from("service_orders")
        .select("id, customer_id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (soErr || !so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const customerId = so.customer_id;

      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      const flush = (res as { flushHeaders?: () => void }).flushHeaders;
      if (typeof flush === "function") flush();

      const send = (reason: string) => {
        try {
          res.write(`data: ${JSON.stringify({ source: reason, t: Date.now() })}\n\n`);
        } catch {
          /* resposta já fechada */
        }
      };

      const channelName = `live-os-${serviceOrderId}-${Date.now()}`;
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const channel = supabaseAdmin
        .channel(channelName)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "service_orders", filter: `id=eq.${serviceOrderId}` },
          () => send("service_orders")
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "customers", filter: `id=eq.${customerId}` },
          () => send("customers")
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "service_order_comments", filter: `service_order_id=eq.${serviceOrderId}` },
          () => send("service_order_comments")
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "budgets", filter: `service_order_id=eq.${serviceOrderId}` },
          () => send("budgets")
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "service_order_checklist_checks", filter: `service_order_id=eq.${serviceOrderId}` },
          () => send("service_order_checklist_checks")
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "workshop_reminders", filter: `workshop_id=eq.${WORKSHOP_ID}` },
          () => send("workshop_reminders")
        )
        .subscribe((status, err) => {
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.error("[SSE] Realtime falhou para OS", serviceOrderId, err);
            if (heartbeat) {
              clearInterval(heartbeat);
              heartbeat = null;
            }
            try {
              void supabaseAdmin.removeChannel(channel);
            } catch {
              /* ignore */
            }
            if (!res.writableEnded) res.end();
          }
        });

      heartbeat = setInterval(() => {
        try {
          res.write(`: ping\n\n`);
        } catch {
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
        }
      }, 25000);

      req.on("close", () => {
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
        try {
          void supabaseAdmin.removeChannel(channel);
        } catch {
          /* ignore */
        }
      });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id/live:", err);
      if (!res.headersSent) {
        res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
      }
    }
  });

  // Detalhe de uma OS (com cliente completo para "Usar na Recepção")
  app.get("/api/service-orders/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;

      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .select("*, customers(*)")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Listar fotos de uma OS (Storage)
  app.get("/api/service-orders/:id/photos", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const folderPath = `${WORKSHOP_ID}/${serviceOrderId}`;
      const bucket = VEHICLE_PHOTOS_BUCKET;
      const { data: files, error } = await supabaseAdmin.storage
        .from(bucket)
        .list(folderPath, { limit: 100 });

      if (error) {
        console.error("[API] Erro ao listar fotos:", error);
        return res.json([]);
      }

      const photos = (files || [])
        .filter((f) => f.name && !f.name.endsWith("/"))
        .filter((f) => !isDiagnosticAuthorizationSignatureFileName(f.name))
        .map((f) => {
          const pathInBucket = `${folderPath}/${f.name}`;
          const { data: { publicUrl } } = supabaseAdmin.storage
            .from(bucket)
            .getPublicUrl(pathInBucket);
          return { url: publicUrl, name: f.name, path: pathInBucket };
        });

      return res.json(photos);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id/photos:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Renomear um anexo (foto/documento) da OS no Storage (move no mesmo bucket)
  app.patch("/api/service-orders/:id/photos/rename", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const serviceOrderId = reqOrderId(req);
      const { path: currentPath, newName } = req.body as { path?: string; newName?: string };

      if (!serviceOrderId) {
        return res.status(400).json({ error: "ID da OS inválido." });
      }

      if (!currentPath || typeof currentPath !== "string" || !newName || typeof newName !== "string") {
        return res.status(400).json({ error: "Corpo inválido: envie path e newName." });
      }

      let trimmedNewName = newName.trim().replace(/\s+/g, " ");
      if (!trimmedNewName) {
        return res.status(400).json({ error: "Novo nome não pode ser vazio." });
      }

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const folderPath = `${WORKSHOP_ID}/${serviceOrderId}`;
      if (!currentPath.startsWith(folderPath + "/")) {
        return res.status(403).json({ error: "Arquivo não pertence a esta ordem de serviço." });
      }

      // Preservar extensão do arquivo original (Storage exige key válida)
      const currentFileName = currentPath.slice(folderPath.length + 1);
      const lastDot = currentFileName.lastIndexOf(".");
      const ext = lastDot > 0 ? currentFileName.slice(lastDot) : "";
      if (ext && !trimmedNewName.toLowerCase().endsWith(ext.toLowerCase())) {
        trimmedNewName = trimmedNewName + ext;
      }

      const safeName = sanitizeVehiclePhotoFileName(trimmedNewName);

      const newPath = `${folderPath}/${safeName}`;
      const bucket = VEHICLE_PHOTOS_BUCKET;

      const { error: moveError } = await supabaseAdmin.storage
        .from(bucket)
        .move(currentPath, newPath);

      if (moveError) {
        console.error("[API] Erro ao renomear anexo no Storage:", moveError);
        return res.status(500).json({ error: moveError.message });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage
        .from(bucket)
        .getPublicUrl(newPath);

      await touchServiceOrderUpdatedAt(serviceOrderId);

      return res.json({
        url: publicUrl,
        name: safeName,
        path: newPath,
      });
    } catch (err: any) {
      console.error("[API] Erro em PATCH /api/service-orders/:id/photos/rename:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Girar foto no Storage (substitui o mesmo path; imagem já rotacionada no cliente)
  const rotateServiceOrderPhotoHandler = async (
    req: express.Request,
    res: express.Response
  ) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const serviceOrderId = reqOrderId(req);
      const objectPath =
        typeof req.body?.path === "string" ? req.body.path.trim() : "";
      const file = req.file;

      if (!serviceOrderId) {
        return res.status(400).json({ error: "ID da OS inválido." });
      }
      if (!objectPath) {
        return res.status(400).json({ error: "Corpo inválido: envie path." });
      }
      if (!file) {
        return res.status(400).json({ error: "Arquivo não enviado." });
      }

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const folderPath = `${WORKSHOP_ID}/${serviceOrderId}`;
      if (!objectPath.startsWith(`${folderPath}/`)) {
        return res.status(403).json({ error: "Arquivo não pertence a esta ordem de serviço." });
      }

      const bucket = VEHICLE_PHOTOS_BUCKET;
      const fileName = objectPath.split("/").pop() || "photo.jpg";
      const contentType = file.mimetype?.startsWith("image/")
        ? file.mimetype
        : "image/jpeg";

      const { error: uploadError } = await supabaseAdmin.storage
        .from(bucket)
        .upload(objectPath, file.buffer, {
          contentType,
          upsert: true,
        });

      if (uploadError) {
        console.error("[API] Erro ao girar foto no Storage:", uploadError);
        return res.status(500).json({ error: uploadError.message });
      }

      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from(bucket).getPublicUrl(objectPath);

      await touchServiceOrderUpdatedAt(serviceOrderId);

      return res.json({
        url: publicUrl,
        name: fileName,
        path: objectPath,
      });
    } catch (err: any) {
      console.error("[API] Erro em POST/PATCH /api/service-orders/:id/photos/rotate:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  };

  app.post(
    "/api/service-orders/:id/photos/rotate",
    upload.single("file"),
    rotateServiceOrderPhotoHandler
  );
  app.patch(
    "/api/service-orders/:id/photos/rotate",
    upload.single("file"),
    rotateServiceOrderPhotoHandler
  );

  // Excluir um anexo (foto/documento) da OS no Storage
  app.delete("/api/service-orders/:id/photos", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const serviceOrderId = reqOrderId(req);
      const { path: objectPath } = req.body as { path?: string };

      if (!serviceOrderId) {
        return res.status(400).json({ error: "ID da OS inválido." });
      }

      if (!objectPath || typeof objectPath !== "string") {
        return res.status(400).json({ error: "Corpo inválido: envie path." });
      }

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const folderPath = `${WORKSHOP_ID}/${serviceOrderId}`;
      if (!objectPath.startsWith(folderPath + "/")) {
        return res.status(403).json({ error: "Arquivo não pertence a esta ordem de serviço." });
      }

      const bucket = VEHICLE_PHOTOS_BUCKET;
      const { error: removeError } = await supabaseAdmin.storage
        .from(bucket)
        .remove([objectPath]);

      if (removeError) {
        console.error("[API] Erro ao excluir anexo no Storage:", removeError);
        return res.status(500).json({ error: removeError.message });
      }

      await touchServiceOrderUpdatedAt(serviceOrderId);

      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/service-orders/:id/photos:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  async function loadApprovedServicesForOrder(serviceOrderId: string) {
    const { data: budgets, error } = await supabaseAdmin!
      .from("budgets")
      .select("id, services")
      .eq("service_order_id", serviceOrderId)
      .eq("workshop_id", WORKSHOP_ID);
    if (error) throw error;
    return collectApprovedServicesFromBudgets((budgets ?? []) as { id: string; services?: { description?: string; approved?: boolean }[] }[]);
  }

  async function loadServiceTechnicianRows(serviceOrderId: string) {
    const { data, error } = await supabaseAdmin!
      .from("service_order_service_technicians")
      .select("id, description, technician_id, budget_id, sort_order")
      .eq("service_order_id", serviceOrderId)
      .eq("workshop_id", WORKSHOP_ID)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async function assertServiceTechniciansCompleteForFinalize(serviceOrderId: string) {
    const approved = await loadApprovedServicesForOrder(serviceOrderId);
    const rows = await loadServiceTechnicianRows(serviceOrderId);
    return validateServiceTechnicianLines(
      rows.map((r) => ({
        description: String(r.description ?? ""),
        technicianId: String(r.technician_id ?? ""),
      })),
      approved
    );
  }

  async function validateTechnicianIds(technicianIds: string[]) {
    const unique = [...new Set(technicianIds.filter(Boolean))];
    if (unique.length === 0) return { ok: false as const, error: "Nenhum técnico informado." };
    const { data, error } = await supabaseAdmin!
      .from("workshop_system_users")
      .select("id")
      .eq("workshop_id", WORKSHOP_ID)
      .eq("is_technician", true)
      .in("id", unique);
    if (error) throw error;
    if ((data ?? []).length !== unique.length) {
      return { ok: false as const, error: "Um ou mais técnicos são inválidos." };
    }
    return { ok: true as const };
  }

  // Técnicos por serviço (fechamento ao finalizar veículo)
  app.get("/api/service-orders/:id/service-technicians", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id: serviceOrderId } = req.params;
      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id, order_type")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!so) return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      if (so.order_type === "module") {
        return res.status(400).json({ error: "Apenas OS de veículo." });
      }

      const approvedServices = await loadApprovedServicesForOrder(serviceOrderId);
      const rows = await loadServiceTechnicianRows(serviceOrderId);

      const savedLines = rows.map((r) => ({
        description: String(r.description ?? ""),
        technicianId: String(r.technician_id ?? ""),
        budgetId: r.budget_id ?? null,
      }));
      const draftLines = mergeServiceTechnicianDraftLines(savedLines, approvedServices);

      const techIds = [
        ...new Set(
          draftLines
            .map((l) => l.technicianId.trim())
            .filter(Boolean)
        ),
      ];
      const techNames = await mapTechnicianUsersByIds(techIds);

      return res.json({
        lines: draftLines.map((l) => ({
          description: l.description,
          technicianId: l.technicianId,
          technicianName: l.technicianId ? techNames[l.technicianId] || "Técnico" : "",
          budgetId: l.budgetId,
        })),
        approvedServices: approvedServices.map((s) => ({
          description: s.description,
          budgetId: s.budgetId,
        })),
      });
    } catch (err: unknown) {
      console.error("[API] GET service-technicians:", err);
      const msg = err instanceof Error ? err.message : "Erro";
      if (/service_order_service_technicians/i.test(msg) && /does not exist|relation/i.test(msg)) {
        return res.status(500).json({
          error: "Tabela de técnicos por serviço não configurada. Aplique a migration no Supabase.",
        });
      }
      return res.status(500).json({ error: msg });
    }
  });

  app.put("/api/service-orders/:id/service-technicians", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id: serviceOrderId } = req.params;
      const rawLines = Array.isArray(req.body?.lines) ? req.body.lines : [];
      const recordedByName =
        typeof req.body?.recordedByName === "string" ? req.body.recordedByName.trim().slice(0, 200) : "";

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id, order_type")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!so) return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      if (so.order_type === "module") {
        return res.status(400).json({ error: "Apenas OS de veículo." });
      }

      const lines = rawLines
        .map((row: unknown) => {
          if (!row || typeof row !== "object") return null;
          const r = row as Record<string, unknown>;
          return {
            description: typeof r.description === "string" ? r.description.trim() : "",
            technicianId:
              typeof r.technicianId === "string"
                ? r.technicianId.trim()
                : typeof r.technician_id === "string"
                  ? r.technician_id.trim()
                  : "",
            budgetId:
              typeof r.budgetId === "string"
                ? r.budgetId
                : typeof r.budget_id === "string"
                  ? r.budget_id
                  : null,
          };
        })
        .filter(Boolean) as { description: string; technicianId: string; budgetId: string | null }[];

      const approved = await loadApprovedServicesForOrder(serviceOrderId);
      const validation = validateServiceTechnicianLines(lines, approved);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error });
      }

      const techCheck = await validateTechnicianIds(lines.map((l) => l.technicianId));
      if (!techCheck.ok) {
        return res.status(400).json({ error: techCheck.error });
      }

      const { error: delError } = await supabaseAdmin
        .from("service_order_service_technicians")
        .delete()
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID);
      if (delError) throw delError;

      const now = new Date().toISOString();
      const payload = lines.map((line, index) => ({
        workshop_id: WORKSHOP_ID,
        service_order_id: serviceOrderId,
        description: line.description,
        technician_id: line.technicianId,
        budget_id: line.budgetId,
        sort_order: index,
        recorded_at: now,
        recorded_by_name: recordedByName,
      }));

      if (payload.length > 0) {
        const { error: insError } = await supabaseAdmin
          .from("service_order_service_technicians")
          .insert(payload);
        if (insError) throw insError;
      }

      return res.json({ ok: true });
    } catch (err: unknown) {
      console.error("[API] PUT service-technicians:", err);
      const msg = err instanceof Error ? err.message : "Erro";
      if (/service_order_service_technicians/i.test(msg) && /does not exist|relation/i.test(msg)) {
        return res.status(500).json({
          error: "Tabela de técnicos por serviço não configurada. Aplique a migration no Supabase.",
        });
      }
      return res.status(500).json({ error: msg });
    }
  });

  // Avaliação técnica do laboratório — cria orçamento e move etapa da OS.
  app.post("/api/service-orders/:id/lab-evaluation", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }

      const { id: serviceOrderId } = req.params;
      const evaluatedByName =
        typeof req.body?.evaluatedByName === "string"
          ? req.body.evaluatedByName.trim().slice(0, 200)
          : "";
      const observations =
        typeof req.body?.observations === "string" ? req.body.observations.trim().slice(0, 4000) : "";
      const rawServices = Array.isArray(req.body?.services) ? req.body.services : [];
      const rawParts = Array.isArray(req.body?.parts) ? req.body.parts : [];

      if (rawServices.length === 0) {
        return res.status(400).json({ error: "Adicione pelo menos um serviço à avaliação." });
      }

      const { data: so, error: fetchErr } = await supabaseAdmin
        .from("service_orders")
        .select("id, order_type, status, lab_evaluated_service, lab_evaluated_at, plate, vehicle_model, customers(name)")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (fetchErr || !so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      if (String(so.order_type ?? "vehicle") !== "module") {
        return res.status(400).json({ error: "Avaliação técnica disponível apenas para OS de laboratório." });
      }

      if (String(so.lab_evaluated_at ?? "").trim() || String(so.lab_evaluated_service ?? "").trim()) {
        return res.status(400).json({ error: "Esta OS já possui avaliação técnica registrada." });
      }

      const openStatuses = ["AGUARDANDO_AVALIACAO", "AVALIACAO_TECNICA"];
      const currentStatus = String(so.status ?? "");
      if (!openStatuses.includes(currentStatus)) {
        return res.status(400).json({
          error:
            "Avaliação só pode ser registrada com a OS em Aguardando avaliação ou Avaliação técnica.",
        });
      }

      type NormLine = {
        description: string;
        lab_preset_id: string | null;
        outsourced: boolean;
        pre_approved: boolean;
        suggested_value: number | null;
        line_observations: string;
      };

      const normLines: NormLine[] = [];
      for (const row of rawServices) {
        const description =
          typeof row?.description === "string" ? row.description.trim().slice(0, 500) : "";
        if (!description) continue;
        const labPresetId =
          typeof row?.labPresetId === "string" && row.labPresetId.trim()
            ? row.labPresetId.trim().slice(0, 48)
            : typeof row?.lab_preset_id === "string" && row.lab_preset_id.trim()
              ? row.lab_preset_id.trim().slice(0, 48)
              : null;
        const preApproved = row?.preApproved === true || row?.pre_approved === true;
        let suggested: number | null = null;
        const sv = row?.suggestedValue ?? row?.suggested_value;
        if (sv != null && sv !== "" && Number.isFinite(Number(sv))) {
          suggested = Math.max(0, Number(sv));
        }
        normLines.push({
          description,
          lab_preset_id: labPresetId,
          outsourced: row?.outsourced === true,
          pre_approved: preApproved,
          suggested_value: suggested,
          line_observations:
            typeof row?.lineObservations === "string"
              ? row.lineObservations.trim().slice(0, 1000)
              : typeof row?.line_observations === "string"
                ? row.line_observations.trim().slice(0, 1000)
                : "",
        });
      }

      if (normLines.length === 0) {
        return res.status(400).json({ error: "Informe ao menos um serviço válido." });
      }

      const budgetServices = normLines.map((line) => ({
        description: line.description,
        labor_hours: null,
        approved: line.pre_approved ? true : undefined,
        outsourced: line.outsourced,
        suggested_value: line.suggested_value,
        lab_preset_id: line.lab_preset_id,
        pre_approved: line.pre_approved,
        source: "lab_evaluation",
        line_observations: line.line_observations || undefined,
      }));

      const budgetParts = rawParts
        .map((p: Record<string, unknown>) => {
          const description = typeof p?.description === "string" ? p.description.trim() : "";
          if (!description) return null;
          const row: Record<string, unknown> = {
            description: description.slice(0, 500),
            quantity: typeof p?.quantity === "string" ? p.quantity.trim().slice(0, 32) || "1" : "1",
          };
          if (p?.fromStock === true) {
            row.fromStock = true;
            if (typeof p?.workshopPartId === "string" && p.workshopPartId.trim()) {
              row.workshopPartId = p.workshopPartId.trim();
            }
          }
          return row;
        })
        .filter(Boolean);

      const isPreApprovedCleaningOnly =
        normLines.length === 1 &&
        normLines[0].pre_approved === true &&
        normLines[0].lab_preset_id === "limpeza_valvulas";

      const statusUpdate = isPreApprovedCleaningOnly ? "EM_SERVICO" : "AGUARDANDO_APROVACAO";

      const evalSummary =
        normLines.length === 1
          ? normLines[0].description
          : `Avaliação técnica (${normLines.length} serviços)`;

      const cardName =
        normLines.length === 1 ? normLines[0].description : `Avaliação técnica — ${normLines.length} serviços`;

      const customerNameBudget =
        so.customers && typeof so.customers === "object" && "name" in so.customers
          ? String((so.customers as { name: string }).name ?? "")
          : "";

      const budgetPayload = {
        workshop_id: WORKSHOP_ID,
        service_order_id: serviceOrderId,
        card_name: cardName,
        diagnosis: "",
        services: budgetServices,
        parts: budgetParts,
        observations,
      };

      let { data: budgetData, error: budgetError } = await supabaseAdmin.rpc("create_budget_with_stock", {
        p_workshop_id: WORKSHOP_ID,
        p_service_order_id: serviceOrderId,
        p_card_name: budgetPayload.card_name,
        p_diagnosis: budgetPayload.diagnosis,
        p_services: budgetPayload.services,
        p_parts: budgetPayload.parts,
        p_observations: budgetPayload.observations,
      });

      if (budgetError && isMissingRpcFunctionError(budgetError.message || "")) {
        const stockDelta = aggregateBudgetParts(budgetPayload.parts);
        await applyStockDeltaByPartName(stockDelta);
        const legacy = await supabaseAdmin
          .from("budgets")
          .insert(budgetPayload)
          .select(await budgetRowSelect())
          .single();
        budgetData = legacy.data;
        budgetError = legacy.error;
        if (budgetError) {
          try {
            await applyStockDeltaByPartName(invertDeltaMap(stockDelta));
          } catch (rollbackErr) {
            console.error("[API] Falha no rollback de estoque (lab-evaluation):", rollbackErr);
          }
        }
      }

      if (budgetError) {
        const message = budgetError.message || "Erro ao criar orçamento da avaliação.";
        if (message.toLowerCase().includes("estoque insuficiente")) {
          return res.status(400).json({ error: message });
        }
        console.error("[API] lab-evaluation budget:", budgetError);
        return res.status(500).json({ error: message });
      }

      const createdBudget = Array.isArray(budgetData) ? budgetData[0] : budgetData;
      const budgetId = createdBudget?.id ? String(createdBudget.id) : null;

      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        lab_evaluated_service: evalSummary,
        lab_evaluated_at: now,
        lab_evaluated_by_name: evaluatedByName || "Técnico",
        status: statusUpdate,
        updated_at: now,
      };
      if (budgetId) {
        updatePayload.lab_evaluation_budget_id = budgetId;
      }

      let { data, error } = await supabaseAdmin
        .from("service_orders")
        .update(updatePayload)
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*, customers(*)")
        .single();

      if (error) {
        const msg = error.message ?? "";
        if (/lab_evaluated_|lab_evaluation_budget/i.test(msg) && /does not exist|column/i.test(msg)) {
          delete updatePayload.lab_evaluation_budget_id;
          const retry = await supabaseAdmin
            .from("service_orders")
            .update(updatePayload)
            .eq("id", serviceOrderId)
            .eq("workshop_id", WORKSHOP_ID)
            .select("*, customers(*)")
            .single();
          data = retry.data;
          error = retry.error;
        }
        if (error) {
          if (/lab_evaluated_/i.test(msg) && /does not exist|column/i.test(msg)) {
            return res.status(500).json({
              error: "Colunas de avaliação do laboratório não configuradas. Aplique a migration no Supabase.",
            });
          }
          throw error;
        }
      }

      const budgetNotifyPayload = {
        service_order_id: serviceOrderId,
        vehicle_plate: so?.plate ?? null,
        vehicle_model: so?.vehicle_model ?? null,
        customer_name: customerNameBudget || null,
        budget_id: budgetId,
        source: "lab_evaluation",
      };
      const technicianIds = await getTechnicianRecipientIdsForSystemType("budget_created");
      for (const techId of technicianIds) {
        await supabaseAdmin
          .from("notifications")
          .insert({
            workshop_id: WORKSHOP_ID,
            type: "budget_created",
            payload: budgetNotifyPayload,
            target_type: "technician",
            target_slug: techId,
          })
          .then(({ error: e }) => {
            if (e) console.error("[API] Notificação budget_created (lab-evaluation):", e);
          });
      }

      return res.json({ ...(data ?? {}), lab_evaluation_budget_id: budgetId });
    } catch (err: unknown) {
      console.error("[API] POST lab-evaluation:", err);
      const msg = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: msg });
    }
  });

  // Relatório: serviços executados por técnico (fechamento no Pátio)
  app.get("/api/reports/technician-services", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }

      const { data: rows, error } = await supabaseAdmin
        .from("service_order_service_technicians")
        .select(
          `
          id,
          description,
          technician_id,
          budget_id,
          recorded_at,
          service_order_id,
          service_orders (
            id,
            os_number,
            plate,
            vehicle_brand,
            vehicle_model,
            status,
            updated_at,
            order_type
          )
        `
        )
        .eq("workshop_id", WORKSHOP_ID)
        .order("recorded_at", { ascending: false });

      if (error) {
        const msg = error.message ?? "";
        if (/service_order_service_technicians/i.test(msg) && /does not exist|relation/i.test(msg)) {
          return res.json({ items: [] });
        }
        throw error;
      }

      const techIds = [
        ...new Set(
          (rows ?? [])
            .map((r: { technician_id?: string | null }) => r.technician_id)
            .filter((id): id is string => typeof id === "string" && !!id)
        ),
      ];
      const techNames = await mapTechnicianUsersByIds(techIds);

      const items = (rows ?? [])
        .map((row: Record<string, unknown>) => {
          const rawSo = row.service_orders as
            | {
                id: string;
                os_number?: number | null;
                plate?: string | null;
                vehicle_brand?: string | null;
                vehicle_model?: string | null;
                status?: string | null;
                updated_at?: string | null;
                order_type?: string | null;
              }
            | {
                id: string;
                os_number?: number | null;
                plate?: string | null;
                vehicle_brand?: string | null;
                vehicle_model?: string | null;
                status?: string | null;
                updated_at?: string | null;
                order_type?: string | null;
              }[]
            | null
            | undefined;
          const so = Array.isArray(rawSo) ? rawSo[0] : rawSo;
          if (!so?.id) return null;
          if (String(so.order_type ?? "vehicle").trim().toLowerCase() === "module") return null;

          const techId = String(row.technician_id ?? "");
          const isArchived = so.status === CANCELLED_STATUS;

          return {
            lineId: String(row.id ?? ""),
            description: String(row.description ?? "").trim(),
            technicianId: techId,
            technicianName: techNames[techId] || "Técnico",
            budgetId:
              typeof row.budget_id === "string" && row.budget_id.trim()
                ? row.budget_id.trim()
                : null,
            recordedAt: String(row.recorded_at ?? ""),
            serviceOrderId: so.id,
            osNumber: so.os_number ?? null,
            plate: so.plate ?? null,
            vehicleBrand: so.vehicle_brand ?? null,
            vehicleModel: so.vehicle_model ?? null,
            orderStatus: String(so.status ?? ""),
            archivedAt: isArchived && so.updated_at ? String(so.updated_at) : null,
          };
        })
        .filter(Boolean);

      return res.json({ items });
    } catch (err: unknown) {
      console.error("[API] GET /api/reports/technician-services:", err);
      const msg = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: msg });
    }
  });

  // Listar orçamentos de uma OS
  app.get("/api/service-orders/:id/budgets", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const { data, error } = await supabaseAdmin
        .from("budgets")
        .select(await budgetRowSelect())
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] Erro ao listar orçamentos:", error);
        return res.status(500).json({ error: error.message });
      }

      const rows = (data ?? []).slice();
      rows.sort((a: { created_at?: string; updated_at?: string }, b: { created_at?: string; updated_at?: string }) => {
        const ta = Math.max(
          new Date(a.created_at ?? 0).getTime(),
          new Date((a.updated_at ?? a.created_at) ?? 0).getTime()
        );
        const tb = Math.max(
          new Date(b.created_at ?? 0).getTime(),
          new Date((b.updated_at ?? b.created_at) ?? 0).getTime()
        );
        return tb - ta;
      });
      return res.json(
        rows.map((row) => withBudgetVerifyDefaults(row as Record<string, unknown>))
      );
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id/budgets:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Criar orçamento para uma OS
  app.post("/api/service-orders/:id/budgets", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;
      const { cardName, diagnosis, services, parts, observations, actor, actorTechnicianSlug, actorTechnicianName } = req.body;

      const { data: so, error: soError } = await supabaseAdmin
        .from("service_orders")
        .select("id, plate, vehicle_model, assigned_technician, customers(name)")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (soError || !so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const customerNameBudget = so.customers && typeof so.customers === "object" && "name" in so.customers
        ? String((so.customers as { name: string }).name ?? "")
        : "";

      const payload = {
        workshop_id: WORKSHOP_ID,
        service_order_id: serviceOrderId,
        card_name: cardName ?? null,
        diagnosis: typeof diagnosis === "string" ? diagnosis : "",
        services: Array.isArray(services) ? services : [],
        parts: Array.isArray(parts) ? parts : [],
        observations: typeof observations === "string" ? observations : "",
      };

      let { data, error } = await supabaseAdmin.rpc("create_budget_with_stock", {
        p_workshop_id: WORKSHOP_ID,
        p_service_order_id: serviceOrderId,
        p_card_name: payload.card_name,
        p_diagnosis: payload.diagnosis,
        p_services: payload.services,
        p_parts: payload.parts,
        p_observations: payload.observations,
      });

      if (error && isMissingRpcFunctionError(error.message || "")) {
        // Fallback de compatibilidade (caso a migration RPC ainda não tenha sido aplicada no banco)
        const stockDelta = aggregateBudgetParts(payload.parts);
        await applyStockDeltaByPartName(stockDelta);
        const legacy = await supabaseAdmin
          .from("budgets")
          .insert(payload)
          .select(await budgetRowSelect())
          .single();
        data = legacy.data;
        error = legacy.error;
        if (error) {
          try {
            await applyStockDeltaByPartName(invertDeltaMap(stockDelta));
          } catch (rollbackErr) {
            console.error("[API] Falha no rollback de estoque (fallback criar orçamento):", rollbackErr);
          }
        }
      }

      if (error) {
        const message = error.message || "Erro ao criar orçamento.";
        if (message.toLowerCase().includes("estoque insuficiente")) {
          return res.status(400).json({ error: message });
        }
        console.error("[API] Erro ao criar orçamento:", error);
        return res.status(500).json({ error: message });
      }

      const budgetPayload = {
        service_order_id: serviceOrderId,
        vehicle_plate: so?.plate ?? null,
        vehicle_model: so?.vehicle_model ?? null,
        customer_name: customerNameBudget || null,
      };
      const isTechnicianActor = actor === "technician" && (typeof actorTechnicianSlug === "string" || typeof actorTechnicianName === "string");
      if (isTechnicianActor) {
        const shouldAdmin = await shouldNotifyAdminForSystemType("budget_created");
        if (shouldAdmin) {
        const technicianLabel = typeof actorTechnicianName === "string" && actorTechnicianName.trim() ? actorTechnicianName.trim() : (actorTechnicianSlug || "Técnico");
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "budget_created",
          payload: { ...budgetPayload, technician_name: technicianLabel },
          target_type: "admin",
          target_slug: null,
        }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_created:", e); });
        }
      } else {
        const technicianIds = await getTechnicianRecipientIdsForSystemType("budget_created");
        for (const techId of technicianIds) {
          await supabaseAdmin.from("notifications").insert({
            workshop_id: WORKSHOP_ID,
            type: "budget_created",
            payload: budgetPayload,
            target_type: "technician",
            target_slug: techId,
          }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_created (técnico):", e); });
        }
      }

      const created = Array.isArray(data) ? data[0] : data;
      return res.status(201).json(withBudgetVerifyDefaults((created ?? {}) as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] Erro em POST /api/service-orders/:id/budgets:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Atualizar orçamento
  app.put("/api/service-orders/:id/budgets/:budgetId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId, budgetId } = req.params;
      const { cardName, diagnosis, services, parts, observations, actor, actorTechnicianSlug, actorTechnicianName } = req.body;

      const { data: so, error: soError } = await supabaseAdmin
        .from("service_orders")
        .select("id, plate, vehicle_model, assigned_technician, customers(name)")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (soError || !so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const customerNameBudgetEdit = so.customers && typeof so.customers === "object" && "name" in so.customers
        ? String((so.customers as { name: string }).name ?? "")
        : "";

      const { data: prevBudgetRow } = await supabaseAdmin
        .from("budgets")
        .select("services, parts")
        .eq("id", budgetId)
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();

      const updatePayload: Record<string, unknown> = {
        card_name: cardName ?? null,
        diagnosis: typeof diagnosis === "string" ? diagnosis : "",
        services: Array.isArray(services) ? services : [],
        parts: Array.isArray(parts) ? parts : [],
        observations: typeof observations === "string" ? observations : "",
      };

      let { data, error } = await supabaseAdmin.rpc("update_budget_with_stock", {
        p_workshop_id: WORKSHOP_ID,
        p_service_order_id: serviceOrderId,
        p_budget_id: budgetId,
        p_card_name: updatePayload.card_name,
        p_diagnosis: updatePayload.diagnosis,
        p_services: updatePayload.services,
        p_parts: updatePayload.parts,
        p_observations: updatePayload.observations,
      });

      if (error && isMissingRpcFunctionError(error.message || "")) {
        // Fallback de compatibilidade (caso a migration RPC ainda não tenha sido aplicada no banco)
        const currentBudgetRes = await supabaseAdmin
          .from("budgets")
          .select("id, parts")
          .eq("id", budgetId)
          .eq("service_order_id", serviceOrderId)
          .eq("workshop_id", WORKSHOP_ID)
          .single();
        const currentBudget = currentBudgetRes.data;
        if (currentBudgetRes.error || !currentBudget) {
          return res.status(404).json({ error: "Orçamento não encontrado." });
        }

        const oldParts = aggregateBudgetParts((currentBudget as { parts?: unknown }).parts);
        const newParts = aggregateBudgetParts(updatePayload.parts);
        const stockDelta = new Map<string, number>();
        const allNames = new Set<string>([...oldParts.keys(), ...newParts.keys()]);
        allNames.forEach((name) => {
          const oldQty = oldParts.get(name) ?? 0;
          const newQty = newParts.get(name) ?? 0;
          const delta = newQty - oldQty;
          if (Math.abs(delta) > 0) stockDelta.set(name, delta);
        });

        await applyStockDeltaByPartName(stockDelta);
        const legacy = await supabaseAdmin
          .from("budgets")
          .update(updatePayload)
          .eq("id", budgetId)
          .eq("service_order_id", serviceOrderId)
          .eq("workshop_id", WORKSHOP_ID)
          .select(await budgetRowSelect())
          .single();
        data = legacy.data;
        error = legacy.error;
        if (error) {
          try {
            await applyStockDeltaByPartName(invertDeltaMap(stockDelta));
          } catch (rollbackErr) {
            console.error("[API] Falha no rollback de estoque (fallback editar orçamento):", rollbackErr);
          }
        }
      }

      if (error) {
        const message = error.message || "Erro ao atualizar orçamento.";
        if (message.toLowerCase().includes("orçamento não encontrado") || message.toLowerCase().includes("orcamento nao encontrado")) {
          return res.status(404).json({ error: "Orçamento não encontrado." });
        }
        if (message.toLowerCase().includes("estoque insuficiente")) {
          return res.status(400).json({ error: message });
        }
        console.error("[API] Erro ao atualizar orçamento:", error);
        return res.status(500).json({ error: message });
      }

      let updated = Array.isArray(data) ? data[0] : data;
      if (!updated) {
        return res.status(404).json({ error: "Orçamento não encontrado." });
      }

      // Edição invalida o selo de verificação (quando a migration já foi aplicada).
      if (await hasBudgetVerifyColumns()) {
        const cleared = await supabaseAdmin
          .from("budgets")
          .update({ verified_at: null, verified_by_name: null })
          .eq("id", budgetId)
          .eq("service_order_id", serviceOrderId)
          .eq("workshop_id", WORKSHOP_ID)
          .select(await budgetRowSelect())
          .single();
        if (!cleared.error && cleared.data) {
          updated = cleared.data;
        }
      }

      const budgetEditPayload = {
        service_order_id: serviceOrderId,
        vehicle_plate: so?.plate ?? null,
        vehicle_model: so?.vehicle_model ?? null,
        customer_name: customerNameBudgetEdit || null,
      };
      const isTechnicianActor = actor === "technician" && (typeof actorTechnicianSlug === "string" || typeof actorTechnicianName === "string");
      if (isTechnicianActor) {
        const shouldAdmin = await shouldNotifyAdminForSystemType("budget_edited");
        if (shouldAdmin) {
        const technicianLabel = typeof actorTechnicianName === "string" && actorTechnicianName.trim() ? actorTechnicianName.trim() : (actorTechnicianSlug || "Técnico");
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "budget_edited",
          payload: { ...budgetEditPayload, technician_name: technicianLabel },
          target_type: "admin",
          target_slug: null,
        }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_edited:", e); });
        }
      } else {
        const technicianIds = await getTechnicianRecipientIdsForSystemType("budget_edited");
        for (const techId of technicianIds) {
          await supabaseAdmin.from("notifications").insert({
            workshop_id: WORKSHOP_ID,
            type: "budget_edited",
            payload: budgetEditPayload,
            target_type: "technician",
            target_slug: techId,
          }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_edited (técnico):", e); });
        }
      }

      return res.json(withBudgetVerifyDefaults((updated ?? {}) as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/service-orders/:id/budgets/:budgetId:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Marcar orçamento como verificado (acesso total / admin)
  app.post("/api/service-orders/:id/budgets/:budgetId/verify", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId, budgetId } = req.params;
      const { verifiedByName } = req.body ?? {};
      const label =
        typeof verifiedByName === "string" && verifiedByName.trim()
          ? verifiedByName.trim()
          : "Administrador";

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      if (!(await hasBudgetVerifyColumns())) {
        return res.status(503).json({
          error:
            "Verificação de orçamento indisponível: aplique a migration budgets_verification no Supabase (colunas verified_at e verified_by_name).",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("budgets")
        .update({
          verified_at: new Date().toISOString(),
          verified_by_name: label,
        })
        .eq("id", budgetId)
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .select(await budgetRowSelect())
        .single();

      if (error || !data) {
        console.error("[API] Erro ao verificar orçamento:", error);
        return res.status(error?.code === "PGRST116" ? 404 : 500).json({
          error: error?.message ?? "Orçamento não encontrado.",
        });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/service-orders/:id/budgets/:budgetId/verify:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Excluir orçamento
  app.delete("/api/service-orders/:id/budgets/:budgetId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId, budgetId } = req.params;

      const { error } = await supabaseAdmin
        .from("budgets")
        .delete()
        .eq("id", budgetId)
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] Erro ao excluir orçamento:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/service-orders/:id/budgets/:budgetId:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Comentários do modal do veículo (autor = "Rei do ABS" ou nome do técnico)
  app.get("/api/service-orders/:id/comments", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const { data, error } = await supabaseAdmin
        .from("service_order_comments")
        .select("id, author_display_name, text, created_at, author_photo_url, updated_at")
        .eq("service_order_id", serviceOrderId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar comentários:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id/comments:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/service-orders/:id/comments", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id: serviceOrderId } = req.params;
      const { text, authorDisplayName, actor } = req.body;

      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Campo text é obrigatório." });
      }

      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id, plate, vehicle_model, assigned_technician, customers(name)")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }

      const author = typeof authorDisplayName === "string" && authorDisplayName.trim()
        ? authorDisplayName.trim()
        : "Usuário";

      // actor explícito evita bug: admin com nome diferente de "Rei do ABS" não receber notificação do próprio comentário
      const isAdminComment =
        actor === "admin" ? true : actor === "technician" ? false : /rei\s*do\s*abs/i.test(author);
      let authorPhotoUrl: string | null = null;
      if (isAdminComment) {
        const { data: setting } = await supabaseAdmin
          .from("workshop_settings")
          .select("value")
          .eq("workshop_id", WORKSHOP_ID)
          .eq("key", "admin_photo_url")
          .maybeSingle();
        authorPhotoUrl = setting?.value?.trim() || null;
      } else {
        const authorTrim = author.trim().toLowerCase();
        const { data: systemUsers } = await supabaseAdmin
          .from("workshop_system_users")
          .select("photo_url, display_name, username")
          .eq("workshop_id", WORKSHOP_ID);
        const u = (systemUsers ?? []).find(
          (t) =>
            (t.display_name && String(t.display_name).trim().toLowerCase() === authorTrim) ||
            (String(t.username).trim().toLowerCase() === authorTrim)
        );
        authorPhotoUrl = u?.photo_url?.trim() || null;
      }

      const { data, error } = await supabaseAdmin
        .from("service_order_comments")
        .insert({
          service_order_id: serviceOrderId,
          author_display_name: author,
          text: text.trim(),
          author_photo_url: authorPhotoUrl,
        })
        .select("id, author_display_name, text, created_at, author_photo_url")
        .single();

      if (error) {
        console.error("[API] Erro ao criar comentário:", error);
        return res.status(500).json({ error: error.message });
      }

      const customerName = so.customers && typeof so.customers === "object" && "name" in so.customers
        ? String((so.customers as { name: string }).name ?? "")
        : "";
      const authorPhotoUrlForPayload = data?.author_photo_url ?? authorPhotoUrl;
      const commentPayload = {
        service_order_id: serviceOrderId,
        comment_id: data.id,
        author_display_name: author,
        author_photo_url: authorPhotoUrlForPayload,
        text: text.trim(),
        vehicle_plate: so.plate ?? null,
        vehicle_model: so.vehicle_model ?? null,
        customer_name: customerName || null,
      };

      // Comentário de técnico → notificar só o admin (admin não recebe notificação do próprio comentário)
      if (!isAdminComment) {
        const shouldAdmin = await shouldNotifyAdminForSystemType("comment");
        if (shouldAdmin) {
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "comment",
          payload: commentPayload,
          target_type: "admin",
          target_slug: null,
        }).then(({ error: notifErr }) => { if (notifErr) console.error("[API] Erro ao criar notificação de comentário (admin):", notifErr); });
        }
      }
      // Comentário do admin → notificar o mecânico responsável do veículo; se não houver, notificar todos os técnicos
      if (isAdminComment) {
        const enabledTechnicianIds = await getTechnicianRecipientIdsForSystemType("comment");
        let technicianIds: string[] = [];
        const assignedId = (so as { assigned_technician?: string | null }).assigned_technician;
        if (assignedId && typeof assignedId === "string" && assignedId.trim()) {
          const { data: techUser } = await supabaseAdmin
            .from("workshop_system_users")
            .select("id")
            .eq("workshop_id", WORKSHOP_ID)
            .eq("id", assignedId.trim())
            .eq("is_technician", true)
            .maybeSingle();
          if (techUser && enabledTechnicianIds.includes(techUser.id)) technicianIds = [techUser.id];
        }
        if (technicianIds.length === 0) technicianIds = enabledTechnicianIds;
        for (const techId of technicianIds) {
          await supabaseAdmin.from("notifications").insert({
            workshop_id: WORKSHOP_ID,
            type: "comment",
            payload: commentPayload,
            target_type: "technician",
            target_slug: techId,
          }).then(({ error: notifErr }) => { if (notifErr) console.error("[API] Erro ao criar notificação de comentário (técnico):", notifErr); });
        }
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/service-orders/:id/comments:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/service-orders/:id/comments/:commentId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id: serviceOrderId, commentId } = req.params;
      if (!serviceOrderId || !commentId) {
        return res.status(400).json({ error: "ID da ordem de serviço e do comentário são obrigatórios." });
      }
      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      const { error } = await supabaseAdmin
        .from("service_order_comments")
        .delete()
        .eq("id", commentId)
        .eq("service_order_id", serviceOrderId);
      if (error) {
        console.error("[API] Erro ao excluir comentário:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/service-orders/:id/comments/:commentId:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.patch("/api/service-orders/:id/comments/:commentId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id: serviceOrderId, commentId } = req.params;
      const { text } = req.body ?? {};
      if (!serviceOrderId || !commentId) {
        return res.status(400).json({ error: "ID da ordem de serviço e do comentário são obrigatórios." });
      }
      if (typeof text !== "string" || !text.trim()) {
        return res.status(400).json({ error: "Campo text é obrigatório." });
      }
      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      const { data, error } = await supabaseAdmin
        .from("service_order_comments")
        .update({ text: text.trim(), updated_at: new Date().toISOString() })
        .eq("id", commentId)
        .eq("service_order_id", serviceOrderId)
        .select("id, author_display_name, text, created_at, author_photo_url, updated_at")
        .single();
      if (error) {
        console.error("[API] Erro ao atualizar comentário:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PATCH /api/service-orders/:id/comments/:commentId:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- CENTRAL DE NOTIFICAÇÕES (admin) -----------------
  app.post("/api/notifications", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { type, payload, targetType, targetSlug } = req.body || {};
      if (typeof type !== "string" || !type.trim()) {
        return res.status(400).json({ error: "Campo type é obrigatório." });
      }
      const target_type = targetType === "technician" && typeof targetSlug === "string" && targetSlug.trim() ? "technician" : "admin";
      const target_slug = target_type === "technician" ? targetSlug.trim() : null;
      const { data, error } = await supabaseAdmin
        .from("notifications")
        .insert({
          workshop_id: WORKSHOP_ID,
          type: type.trim(),
          payload: payload && typeof payload === "object" ? payload : {},
          target_type,
          target_slug,
        })
        .select("id, type, payload, read_at, created_at")
        .single();
      if (error) {
        console.error("[API] Erro ao criar notificação:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/notifications:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.get("/api/notifications", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const forWho = (req.query.for as string) || "admin";
      const technicianSlug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const since = req.query.since as string | undefined;

      let query = supabaseAdmin
        .from("notifications")
        .select("id, type, payload, read_at, created_at, target_type, target_slug")
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (forWho === "all") {
        /* todas as notificações da oficina (admin + técnicos) */
      } else if (forWho === "technician" && technicianSlug) {
        query = query.eq("target_type", "technician").eq("target_slug", technicianSlug);
      } else {
        query = query.or("target_type.eq.admin,target_type.is.null");
      }
      if (since) {
        query = query.gt("created_at", since);
      }
      const { data, error } = await query;
      if (error) {
        console.error("[API] Erro em GET /api/notifications:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/notifications:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.get("/api/notifications/unread-count", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const forWho = (req.query.for as string) || "admin";
      const technicianSlug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
      let query = supabaseAdmin
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("workshop_id", WORKSHOP_ID)
        .is("read_at", null);
      if (forWho === "all") {
        /* contagem global da oficina */
      } else if (forWho === "technician" && technicianSlug) {
        query = query.eq("target_type", "technician").eq("target_slug", technicianSlug);
      } else {
        query = query.or("target_type.eq.admin,target_type.is.null");
      }
      const { count, error } = await query;
      if (error) {
        console.error("[API] Erro em GET /api/notifications/unread-count:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json({ count: count ?? 0 });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/notifications/unread-count:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.patch("/api/notifications/:id/read", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const forWho = (req.query.for as string) || "admin";
      const technicianSlug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";
      let updateQuery = supabaseAdmin
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (forWho === "all") {
        /* qualquer notificação da oficina por id */
      } else if (forWho === "technician" && technicianSlug) {
        updateQuery = updateQuery.eq("target_type", "technician").eq("target_slug", technicianSlug);
      } else {
        updateQuery = updateQuery.or("target_type.eq.admin,target_type.is.null");
      }
      const { error } = await updateQuery;
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em PATCH /api/notifications/:id/read:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/notifications/read-all", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const rawFor = req.body?.for ?? req.query.for;
      const forWho =
        rawFor === "all" ? "all" : rawFor === "technician" ? "technician" : "admin";
      const technicianSlug = typeof (req.body?.slug ?? req.query.slug) === "string" ? String(req.body?.slug ?? req.query.slug).trim() : "";
      let updateQuery = supabaseAdmin
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("workshop_id", WORKSHOP_ID)
        .is("read_at", null);
      if (forWho === "all") {
        /* marcar todas como lidas na oficina */
      } else if (forWho === "technician" && technicianSlug) {
        updateQuery = updateQuery.eq("target_type", "technician").eq("target_slug", technicianSlug);
      } else {
        updateQuery = updateQuery.or("target_type.eq.admin,target_type.is.null");
      }
      const { error } = await updateQuery;
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em POST /api/notifications/read-all:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/notifications", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const forWho = (req.query.for as string) || "admin";
      const technicianSlug = typeof req.query.slug === "string" ? req.query.slug.trim() : "";

      if (forWho === "all") {
        const { error } = await supabaseAdmin
          .from("notifications")
          .delete()
          .eq("workshop_id", WORKSHOP_ID);
        if (error) {
          console.error("[API] Erro em DELETE /api/notifications (all):", error);
          return res.status(500).json({ error: error.message });
        }
        return res.status(204).send();
      }

      if (forWho === "technician" && technicianSlug) {
        const { error } = await supabaseAdmin
          .from("notifications")
          .delete()
          .eq("workshop_id", WORKSHOP_ID)
          .eq("target_type", "technician")
          .eq("target_slug", technicianSlug);
        if (error) {
          console.error("[API] Erro em DELETE /api/notifications (technician):", error);
          return res.status(500).json({ error: error.message });
        }
        return res.status(204).send();
      }

      const { error: errAdmin } = await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("workshop_id", WORKSHOP_ID)
        .eq("target_type", "admin");
      if (errAdmin) {
        console.error("[API] Erro em DELETE /api/notifications (admin):", errAdmin);
        return res.status(500).json({ error: errAdmin.message });
      }
      const { error: errNull } = await supabaseAdmin
        .from("notifications")
        .delete()
        .eq("workshop_id", WORKSHOP_ID)
        .is("target_type", null);
      if (errNull) {
        console.error("[API] Erro em DELETE /api/notifications (null):", errNull);
        return res.status(500).json({ error: errNull.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/notifications:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- LEMBRETES (PÁTIO / LABORATÓRIO — compartilhados na oficina) -----------------
  function mapWorkshopReminderRow(row: {
    id: string;
    text: string;
    done: boolean;
    created_by: string | null;
    created_at: string;
  }) {
    return {
      id: row.id,
      text: row.text,
      done: row.done,
      createdAt: row.created_at,
      createdBy: row.created_by ?? "",
    };
  }

  app.get("/api/workshop-reminders", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const scope = String(req.query.scope ?? "").trim();
      if (scope !== "vehicle" && scope !== "module") {
        return res.status(400).json({ error: "Parâmetro scope deve ser vehicle ou module." });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_reminders")
        .select("id, text, done, created_by, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("scope", scope)
        .order("created_at", { ascending: false });
      if (error) {
        console.error("[API] GET /api/workshop-reminders:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json((data ?? []).map(mapWorkshopReminderRow));
    } catch (err: any) {
      console.error("[API] GET /api/workshop-reminders:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-reminders", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const scope = String(req.body?.scope ?? "").trim();
      const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
      const createdBy =
        typeof req.body?.createdBy === "string" ? req.body.createdBy.trim() : "";
      if (scope !== "vehicle" && scope !== "module") {
        return res.status(400).json({ error: "scope deve ser vehicle ou module." });
      }
      if (!text) {
        return res.status(400).json({ error: "Texto do lembrete é obrigatório." });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_reminders")
        .insert({
          workshop_id: WORKSHOP_ID,
          scope,
          text,
          done: false,
          created_by: createdBy || "Oficina",
        })
        .select("id, text, done, created_by, created_at")
        .single();
      if (error) {
        console.error("[API] POST /api/workshop-reminders:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(mapWorkshopReminderRow(data as any));
    } catch (err: any) {
      console.error("[API] POST /api/workshop-reminders:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.patch("/api/workshop-reminders/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const scope = String(req.body?.scope ?? "").trim();
      if (scope !== "vehicle" && scope !== "module") {
        return res.status(400).json({ error: "scope deve ser vehicle ou module." });
      }
      const hasText = typeof req.body?.text === "string";
      const hasDone = typeof req.body?.done === "boolean";
      if (!hasText && !hasDone) {
        return res.status(400).json({ error: "Informe text e/ou done." });
      }
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (hasText) {
        const t = String(req.body.text).trim();
        if (!t) {
          return res.status(400).json({ error: "Texto não pode ser vazio." });
        }
        updates.text = t;
      }
      if (hasDone) {
        updates.done = req.body.done;
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_reminders")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .eq("scope", scope)
        .select("id, text, done, created_by, created_at")
        .maybeSingle();
      if (error) {
        console.error("[API] PATCH /api/workshop-reminders/:id:", error);
        return res.status(500).json({ error: error.message });
      }
      if (!data) {
        return res.status(404).json({ error: "Lembrete não encontrado." });
      }
      return res.json(mapWorkshopReminderRow(data as any));
    } catch (err: any) {
      console.error("[API] PATCH /api/workshop-reminders/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/workshop-reminders/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const scope = String(req.query.scope ?? "").trim();
      if (scope !== "vehicle" && scope !== "module") {
        return res.status(400).json({ error: "Parâmetro scope deve ser vehicle ou module." });
      }
      const { error } = await supabaseAdmin
        .from("workshop_reminders")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .eq("scope", scope);
      if (error) {
        console.error("[API] DELETE /api/workshop-reminders/:id:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] DELETE /api/workshop-reminders/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- SERVIÇOS DA OFICINA (para orçamentos) -----------------
  app.get("/api/workshop-services", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_services")
        .select("id, name, category, labor_hours, sort_order, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
        .order("category", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar serviços da oficina:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-services:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-services", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { name, category, labor_hours } = req.body;
      const trimmed = typeof name === "string" ? name.trim() : "";
      const categoryTrimmed = typeof category === "string" ? category.trim() : "";
      const hasLaborHours = labor_hours !== undefined && labor_hours !== null && labor_hours !== "";
      const laborHoursNumber = hasLaborHours ? Number(labor_hours) : null;

      if (!trimmed) {
        return res.status(400).json({ error: "Nome do serviço é obrigatório." });
      }
      if (!categoryTrimmed) {
        return res.status(400).json({ error: "Categoria do serviço é obrigatória." });
      }
      if (hasLaborHours && (!Number.isFinite(laborHoursNumber) || laborHoursNumber! <= 0)) {
        return res.status(400).json({ error: "Horas de serviço inválidas." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_services")
        .insert({
          workshop_id: WORKSHOP_ID,
          name: trimmed,
          category: categoryTrimmed,
          labor_hours: laborHoursNumber,
          sort_order: 0,
        })
        .select("id, name, category, labor_hours, sort_order, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe um serviço com este nome." });
        }
        console.error("[API] Erro ao criar serviço:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-services:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-services/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;
      const { name, category, labor_hours } = req.body;
      const trimmed = typeof name === "string" ? name.trim() : "";
      const categoryTrimmed = typeof category === "string" ? category.trim() : "";
      const hasLaborHours = labor_hours !== undefined && labor_hours !== null && labor_hours !== "";
      const laborHoursNumber = hasLaborHours ? Number(labor_hours) : null;

      if (!trimmed) {
        return res.status(400).json({ error: "Nome do serviço é obrigatório." });
      }
      if (!categoryTrimmed) {
        return res.status(400).json({ error: "Categoria do serviço é obrigatória." });
      }
      if (hasLaborHours && (!Number.isFinite(laborHoursNumber) || laborHoursNumber! <= 0)) {
        return res.status(400).json({ error: "Horas de serviço inválidas." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_services")
        .update({ name: trimmed, category: categoryTrimmed, labor_hours: laborHoursNumber })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, name, category, labor_hours, sort_order, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe um serviço com este nome." });
        }
        console.error("[API] Erro ao atualizar serviço:", error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: "Serviço não encontrado." });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-services/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/workshop-services/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;

      const { error } = await supabaseAdmin
        .from("workshop_services")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] Erro ao excluir serviço:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/workshop-services/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  /** Mapa part_id -> lista de category_id (estoque). */
  async function loadWorkshopPartCategoryMap(partIds: string[]): Promise<Map<string, string[]>> {
    const map = new Map<string, string[]>();
    if (!supabaseAdmin || partIds.length === 0) return map;
    const { data, error } = await supabaseAdmin
      .from("workshop_part_category_members")
      .select("part_id, category_id")
      .in("part_id", partIds);
    if (error) {
      console.error("[API] Erro ao carregar categorias das peças:", error);
      return map;
    }
    for (const row of data ?? []) {
      const pid = row.part_id as string;
      const cid = row.category_id as string;
      const arr = map.get(pid) ?? [];
      arr.push(cid);
      map.set(pid, arr);
    }
    return map;
  }

  function workshopPartsWithCategories(
    rows: Record<string, unknown>[],
    catMap: Map<string, string[]>
  ) {
    return rows.map((p) => ({
      ...p,
      category_ids: catMap.get(p.id as string) ?? [],
    }));
  }

  const WORKSHOP_PART_SELECT =
    "id, name, brand, unit_price, stock_qty, photo_url, sort_order, created_at, " +
    "original_code, numeric_code, location, application_similar, notes, " +
    "ncm_code, unit_of_measure, min_stock_qty, max_stock_qty, fiscal_origin, " +
    "premium_amount, commission_pct, default_profit_pct, km_limit, validity_months, " +
    "unit_cost, fiscal_extra, primary_category_id";

  function parseOptionalText(v: unknown): string | null {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    return s || null;
  }

  function parseWorkshopPartBody(body: Record<string, unknown>, forCreate: boolean) {
    const errors: string[] = [];
    const patch: Record<string, unknown> = {};

    if (forCreate || body.name !== undefined) {
      const trimmed = typeof body.name === "string" ? body.name.trim() : "";
      if (!trimmed) errors.push("Nome da peça é obrigatório.");
      else patch.name = trimmed;
    }

    const numFields: { key: string; min?: number }[] = [
      { key: "unit_price", min: 0 },
      { key: "stock_qty", min: 0 },
      { key: "min_stock_qty", min: 0 },
      { key: "premium_amount", min: 0 },
      { key: "commission_pct", min: 0 },
      { key: "default_profit_pct", min: 0 },
      { key: "unit_cost", min: 0 },
    ];
    for (const { key, min = 0 } of numFields) {
      if (body[key] === undefined) continue;
      const n = Number(body[key]);
      if (!Number.isFinite(n) || n < min) errors.push(`${key} inválido.`);
      else patch[key] = n;
    }

    if (body.max_stock_qty !== undefined) {
      if (body.max_stock_qty === null || body.max_stock_qty === "") {
        patch.max_stock_qty = null;
      } else {
        const n = Number(body.max_stock_qty);
        if (!Number.isFinite(n) || n < 0) errors.push("max_stock_qty inválido.");
        else patch.max_stock_qty = n;
      }
    }

    if (body.km_limit !== undefined) {
      if (body.km_limit === null || body.km_limit === "") patch.km_limit = null;
      else {
        const n = Number(body.km_limit);
        if (!Number.isFinite(n) || n < 0) errors.push("km_limit inválido.");
        else patch.km_limit = n;
      }
    }

    if (body.validity_months !== undefined) {
      if (body.validity_months === null || body.validity_months === "") patch.validity_months = null;
      else {
        const n = Math.round(Number(body.validity_months));
        if (!Number.isFinite(n) || n < 0) errors.push("validity_months inválido.");
        else patch.validity_months = n;
      }
    }

    const textFields = [
      "brand",
      "original_code",
      "numeric_code",
      "location",
      "application_similar",
      "notes",
      "ncm_code",
      "unit_of_measure",
      "fiscal_origin",
    ] as const;
    for (const key of textFields) {
      if (body[key] !== undefined) patch[key] = parseOptionalText(body[key]) ?? (key === "unit_of_measure" ? "UN" : key === "fiscal_origin" ? "0" : null);
    }

    if (body.primary_category_id !== undefined) {
      patch.primary_category_id =
        body.primary_category_id === null || body.primary_category_id === ""
          ? null
          : String(body.primary_category_id);
    }

    if (body.photo_url !== undefined) {
      patch.photo_url = parseOptionalText(body.photo_url);
    }

    if (body.fiscal_extra !== undefined) {
      const fe = body.fiscal_extra;
      patch.fiscal_extra =
        fe && typeof fe === "object" && !Array.isArray(fe) ? fe : {};
    }

    if (forCreate) {
      if (patch.unit_price === undefined) patch.unit_price = 0;
      if (patch.stock_qty === undefined) patch.stock_qty = 0;
      if (patch.min_stock_qty === undefined) patch.min_stock_qty = 0;
      if (patch.unit_cost === undefined) patch.unit_cost = 0;
      if (patch.unit_of_measure === undefined) patch.unit_of_measure = "UN";
      if (patch.fiscal_origin === undefined) patch.fiscal_origin = "0";
      if (patch.fiscal_extra === undefined) patch.fiscal_extra = {};
    }

    return { patch, errors };
  }

  const WORKSHOP_PART_PHOTOS_MAX = 3;

  async function loadWorkshopPartPhotosMap(partIds: string[]) {
    const map = new Map<
      string,
      Array<{ id: string; part_id: string; photo_url: string; sort_order: number }>
    >();
    if (!partIds.length || !supabaseAdmin || !WORKSHOP_ID) return map;
    const { data, error } = await supabaseAdmin
      .from("workshop_part_photos")
      .select("id, part_id, photo_url, sort_order")
      .eq("workshop_id", WORKSHOP_ID)
      .in("part_id", partIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[API] Erro ao carregar fotos das peças:", error);
      return map;
    }
    for (const row of data ?? []) {
      const pid = row.part_id as string;
      const arr = map.get(pid) ?? [];
      arr.push({
        id: row.id as string,
        part_id: pid,
        photo_url: row.photo_url as string,
        sort_order: Number(row.sort_order ?? 0),
      });
      map.set(pid, arr);
    }
    return map;
  }

  /** `workshop_parts.photo_url` = primeira foto (menor sort_order). */
  async function syncWorkshopPartCoverPhoto(partId: string): Promise<string | null> {
    if (!supabaseAdmin || !WORKSHOP_ID) return null;
    const { data: photos, error } = await supabaseAdmin
      .from("workshop_part_photos")
      .select("photo_url")
      .eq("part_id", partId)
      .eq("workshop_id", WORKSHOP_ID)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) {
      console.error("[API] Erro ao sincronizar capa da peça:", error);
      return null;
    }
    const cover =
      photos?.[0]?.photo_url && String(photos[0].photo_url).trim()
        ? String(photos[0].photo_url).trim()
        : null;
    await supabaseAdmin
      .from("workshop_parts")
      .update({ photo_url: cover })
      .eq("id", partId)
      .eq("workshop_id", WORKSHOP_ID);
    return cover;
  }

  async function renumberWorkshopPartPhotoSortOrders(partId: string): Promise<void> {
    if (!supabaseAdmin || !WORKSHOP_ID) return;
    const { data: photos, error } = await supabaseAdmin
      .from("workshop_part_photos")
      .select("id, sort_order")
      .eq("part_id", partId)
      .eq("workshop_id", WORKSHOP_ID)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) {
      console.error("[API] Erro ao reordenar fotos da peça:", error);
      return;
    }
    for (let i = 0; i < (photos ?? []).length; i++) {
      const row = photos![i];
      if (Number(row.sort_order) !== i) {
        await supabaseAdmin
          .from("workshop_part_photos")
          .update({ sort_order: i })
          .eq("id", row.id as string)
          .eq("workshop_id", WORKSHOP_ID);
      }
    }
  }

  async function respondWorkshopPart(res: any, partRow: Record<string, unknown>) {
    const id = partRow.id as string;
    const [catMap, photosMap] = await Promise.all([
      loadWorkshopPartCategoryMap([id]),
      loadWorkshopPartPhotosMap([id]),
    ]);
    const photos = photosMap.get(id) ?? [];
    const coverFromGallery =
      photos[0]?.photo_url && String(photos[0].photo_url).trim()
        ? String(photos[0].photo_url).trim()
        : null;
    const legacyCover = parseOptionalText(partRow.photo_url);
    return res.json({
      ...partRow,
      photo_url: coverFromGallery ?? legacyCover,
      category_ids: catMap.get(id) ?? [],
      photos,
    });
  }

  // ----------------- ESTOQUE DE PEÇAS (para orçamentos) -----------------
  app.get("/api/workshop-parts/analytics", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error: "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const presetRaw = String(req.query.preset || "30d");
      const validPresets = new Set(["7d", "30d", "90d", "month", "year"]);
      const preset = validPresets.has(presetRaw) ? presetRaw : "30d";

      const now = new Date();
      const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      let from: Date;
      let periodLabel: string;

      if (req.query.from && req.query.to) {
        from = new Date(String(req.query.from));
        const toParam = new Date(String(req.query.to));
        if (!Number.isFinite(from.getTime()) || !Number.isFinite(toParam.getTime())) {
          return res.status(400).json({ error: "Período inválido." });
        }
        to.setTime(toParam.getTime());
        to.setHours(23, 59, 59, 999);
        from.setHours(0, 0, 0, 0);
        periodLabel = "Período personalizado";
      } else if (preset === "7d") {
        from = new Date(to);
        from.setDate(from.getDate() - 6);
        periodLabel = "Últimos 7 dias";
      } else if (preset === "90d") {
        from = new Date(to);
        from.setDate(from.getDate() - 89);
        periodLabel = "Últimos 90 dias";
      } else if (preset === "year") {
        from = new Date(now.getFullYear(), 0, 1);
        periodLabel = `Ano ${now.getFullYear()}`;
      } else if (preset === "month") {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        periodLabel = "Este mês";
      } else {
        from = new Date(to);
        from.setDate(from.getDate() - 29);
        periodLabel = "Últimos 30 dias";
      }
      from.setHours(0, 0, 0, 0);

      const fromIso = from.toISOString();
      const toIso = to.toISOString();

      const [partsRes, categoriesRes, budgetsCreatedRes, budgetsUpdatedRes] = await Promise.all([
        supabaseAdmin
          .from("workshop_parts")
          .select(
            "id, name, original_code, created_at, stock_qty, unit_price, unit_cost, min_stock_qty, unit_of_measure"
          )
          .eq("workshop_id", WORKSHOP_ID),
        supabaseAdmin
          .from("workshop_part_categories")
          .select("id, name")
          .eq("workshop_id", WORKSHOP_ID),
        supabaseAdmin
          .from("budgets")
          .select("id, created_at, updated_at, parts")
          .eq("workshop_id", WORKSHOP_ID)
          .gte("created_at", fromIso)
          .lte("created_at", toIso),
        supabaseAdmin
          .from("budgets")
          .select("id, created_at, updated_at, parts")
          .eq("workshop_id", WORKSHOP_ID)
          .gte("updated_at", fromIso)
          .lte("updated_at", toIso),
      ]);

      if (partsRes.error) {
        return res.status(500).json({ error: partsRes.error.message });
      }

      const partsList = partsRes.data ?? [];
      const partIds = partsList.map((p: { id: string }) => p.id);
      const catMap = await loadWorkshopPartCategoryMap(partIds);

      const purchasesRes =
        partIds.length > 0
          ? await supabaseAdmin
              .from("workshop_part_purchases")
              .select("id, part_id, quantity, unit_cost, status, created_at")
              .in("part_id", partIds)
              .gte("created_at", fromIso)
              .lte("created_at", toIso)
          : { data: [], error: null };

      const budgetById = new Map<string, Record<string, unknown>>();
      for (const row of budgetsCreatedRes.data ?? []) {
        budgetById.set(row.id as string, row as Record<string, unknown>);
      }
      for (const row of budgetsUpdatedRes.data ?? []) {
        budgetById.set(row.id as string, row as Record<string, unknown>);
      }

      if (purchasesRes.error) {
        return res.status(500).json({ error: purchasesRes.error.message });
      }

      const purchasesFiltered = purchasesRes.data ?? [];

      const analytics = buildWorkshopPartsAnalytics({
        parts: partsList.map((p: Record<string, unknown>) => ({
          id: p.id as string,
          name: String(p.name ?? ""),
          original_code: p.original_code as string | null,
          created_at: String(p.created_at ?? ""),
          stock_qty: Number(p.stock_qty ?? 0),
          unit_price: Number(p.unit_price ?? 0),
          unit_cost: Number(p.unit_cost ?? 0),
          min_stock_qty: Number(p.min_stock_qty ?? 0),
          unit_of_measure: String(p.unit_of_measure ?? "UN"),
          category_ids: catMap.get(p.id as string) ?? [],
        })),
        categories: (categoriesRes.data ?? []).map((c: { id: string; name: string }) => ({
          id: c.id,
          name: c.name,
        })),
        categoryMembers: catMap,
        budgets: [...budgetById.values()].map((b) => ({
          id: b.id as string,
          created_at: String(b.created_at ?? ""),
          updated_at: b.updated_at ? String(b.updated_at) : null,
          parts: b.parts,
        })),
        purchases: purchasesFiltered.map((p: Record<string, unknown>) => ({
          id: p.id as string,
          part_id: p.part_id as string,
          quantity: Number(p.quantity ?? 0),
          unit_cost: Number(p.unit_cost ?? 0),
          status: String(p.status ?? "pending"),
          created_at: String(p.created_at ?? ""),
        })),
        from,
        to,
        periodLabel,
      });

      return res.json(analytics);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-parts/analytics:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.get("/api/workshop-parts", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_parts")
        .select(WORKSHOP_PART_SELECT)
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar peças:", error);
        return res.status(500).json({ error: error.message });
      }

      const list = data ?? [];
      const partIds = list.map((p: { id: string }) => p.id);
      const [catMap, photosMap] = await Promise.all([
        loadWorkshopPartCategoryMap(partIds),
        loadWorkshopPartPhotosMap(partIds),
      ]);
      const enrichedList = (list as Record<string, unknown>[]).map((row) => {
        const id = row.id as string;
        const gallery = photosMap.get(id) ?? [];
        const coverFromGallery =
          gallery[0]?.photo_url && String(gallery[0].photo_url).trim()
            ? String(gallery[0].photo_url).trim()
            : null;
        const legacyCover = parseOptionalText(row.photo_url);
        return {
          ...row,
          photo_url: coverFromGallery ?? legacyCover,
        };
      });
      return res.json(workshopPartsWithCategories(enrichedList, catMap));
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-parts:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-parts", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { patch, errors } = parseWorkshopPartBody((req.body || {}) as Record<string, unknown>, true);
      if (errors.length) return res.status(400).json({ error: errors[0] });

      const { data, error } = await supabaseAdmin
        .from("workshop_parts")
        .insert({ workshop_id: WORKSHOP_ID, sort_order: 0, ...patch })
        .select(WORKSHOP_PART_SELECT)
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe uma peça com este nome." });
        }
        console.error("[API] Erro ao criar peça:", error);
        return res.status(500).json({ error: error.message });
      }

      return respondWorkshopPart(res.status(201), data as Record<string, unknown>);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-parts:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-parts/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;
      const { patch, errors } = parseWorkshopPartBody((req.body || {}) as Record<string, unknown>, false);
      if (errors.length) return res.status(400).json({ error: errors[0] });
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Nenhum campo para atualizar." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_parts")
        .update(patch)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select(WORKSHOP_PART_SELECT)
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe uma peça com este nome." });
        }
        console.error("[API] Erro ao atualizar peça:", error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) return res.status(404).json({ error: "Peça não encontrada." });
      return respondWorkshopPart(res, data as Record<string, unknown>);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-parts/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/workshop-parts/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id } = req.params;
      const { error } = await supabaseAdmin
        .from("workshop_parts")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) {
        console.error("[API] Erro ao excluir peça:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/workshop-parts/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.get("/api/workshop-parts/:id/photos", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const id = String(req.params.id || "");
      const photosMap = await loadWorkshopPartPhotosMap([id]);
      return res.json(photosMap.get(id) ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-parts/:id/photos:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  /** Adiciona ou substitui foto. `photo_url` da peça = capa (primeira foto, sort_order 0). */
  app.post("/api/workshop-parts/:id/photo", upload.single("file"), async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const id = String(req.params.id || "");
      const file = req.file;
      const replacePhotoId =
        parseOptionalText((req.body as Record<string, unknown> | undefined)?.replace_photo_id) ||
        parseOptionalText(req.query?.replace_photo_id);
      if (!id) return res.status(400).json({ error: "ID da peça é obrigatório." });
      if (!file) return res.status(400).json({ error: "Arquivo não enviado." });
      const mime = file.mimetype || "application/octet-stream";
      if (!mime.startsWith("image/")) {
        return res.status(400).json({ error: "Envie apenas imagem." });
      }

      let sortOrder = 0;
      if (replacePhotoId) {
        const { data: oldRow, error: oldErr } = await supabaseAdmin
          .from("workshop_part_photos")
          .select("sort_order")
          .eq("id", replacePhotoId)
          .eq("part_id", id)
          .eq("workshop_id", WORKSHOP_ID)
          .maybeSingle();
        if (oldErr) {
          console.error("[API] Erro ao buscar foto para substituir:", oldErr);
          return res.status(500).json({ error: oldErr.message });
        }
        if (!oldRow) return res.status(404).json({ error: "Foto não encontrada." });
        sortOrder = Number(oldRow.sort_order ?? 0);
        const { error: delErr } = await supabaseAdmin
          .from("workshop_part_photos")
          .delete()
          .eq("id", replacePhotoId)
          .eq("part_id", id)
          .eq("workshop_id", WORKSHOP_ID);
        if (delErr) {
          console.error("[API] Erro ao remover foto antiga:", delErr);
          return res.status(500).json({ error: delErr.message });
        }
      } else {
        const { count, error: countErr } = await supabaseAdmin
          .from("workshop_part_photos")
          .select("id", { count: "exact", head: true })
          .eq("part_id", id)
          .eq("workshop_id", WORKSHOP_ID);
        if (countErr) {
          console.error("[API] Erro ao contar fotos da peça:", countErr);
          return res.status(500).json({ error: countErr.message });
        }
        if ((count ?? 0) >= WORKSHOP_PART_PHOTOS_MAX) {
          return res.status(400).json({ error: `Máximo de ${WORKSHOP_PART_PHOTOS_MAX} fotos por produto.` });
        }
        sortOrder = count ?? 0;
      }

      const bucket = VEHICLE_PHOTOS_BUCKET;
      const ext = (file.originalname?.split(".").pop() || "jpg").toLowerCase();
      const safeExt = /^[a-z0-9]+$/.test/ext ? ext : "jpg";
      const pathInBucket = `${WORKSHOP_ID}/parts/${id}/${Date.now()}.${safeExt}`;

      const { error: uploadErr } = await supabaseAdmin.storage
        .from(bucket)
        .upload(pathInBucket, file.buffer, { contentType: mime, upsert: true });
      if (uploadErr) {
        console.error("[API] Erro upload foto da peça:", uploadErr);
        return res.status(500).json({ error: uploadErr.message });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(pathInBucket);
      const photoUrlWithCacheBust = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;

      const { error: insertErr } = await supabaseAdmin.from("workshop_part_photos").insert({
        workshop_id: WORKSHOP_ID,
        part_id: id,
        photo_url: photoUrlWithCacheBust,
        sort_order: sortOrder,
      });
      if (insertErr) {
        console.error("[API] Erro ao registrar foto da peça:", insertErr);
        return res.status(500).json({ error: insertErr.message });
      }

      await syncWorkshopPartCoverPhoto(id);

      const { data, error } = await supabaseAdmin
        .from("workshop_parts")
        .select(WORKSHOP_PART_SELECT)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (error || !data) {
        console.error("[API] Erro ao recarregar peça após foto:", error);
        return res.status(500).json({ error: error?.message ?? "Peça não encontrada." });
      }
      return respondWorkshopPart(res, data as Record<string, unknown>);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-parts/:id/photo:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/workshop-parts/:id/photos/:photoId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const id = String(req.params.id || "");
      const photoId = String(req.params.photoId || "");
      const { error } = await supabaseAdmin
        .from("workshop_part_photos")
        .delete()
        .eq("id", photoId)
        .eq("part_id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) {
        console.error("[API] Erro ao excluir foto da peça:", error);
        return res.status(500).json({ error: error.message });
      }
      await renumberWorkshopPartPhotoSortOrders(id);
      await syncWorkshopPartCoverPhoto(id);
      const { data, error: loadErr } = await supabaseAdmin
        .from("workshop_parts")
        .select(WORKSHOP_PART_SELECT)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (loadErr || !data) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      return respondWorkshopPart(res, data as Record<string, unknown>);
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/workshop-parts/:id/photos/:photoId:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  /** Quantidade que entra no estoque conforme status da compra. */
  function purchaseReceivedStockQty(status: string, quantity: number): number {
    return status === "received" && Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
  }

  async function adjustWorkshopPartStockQty(partId: string, delta: number): Promise<void> {
    if (!supabaseAdmin || !WORKSHOP_ID || !Number.isFinite(delta) || delta === 0) return;
    const { data: part, error: fetchErr } = await supabaseAdmin
      .from("workshop_parts")
      .select("stock_qty")
      .eq("id", partId)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!part) throw new Error("Peça não encontrada.");
    const next = Math.max(0, Number(part.stock_qty ?? 0) + delta);
    const { error } = await supabaseAdmin
      .from("workshop_parts")
      .update({ stock_qty: Number(next.toFixed(3)) })
      .eq("id", partId)
      .eq("workshop_id", WORKSHOP_ID);
    if (error) throw new Error(error.message);
  }

  // ----------------- LISTA DE COMPRAS (por peça) -----------------
  app.get("/api/workshop-parts/:partId/purchases", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const { partId } = req.params;
      const { data, error } = await supabaseAdmin
        .from("workshop_part_purchases")
        .select("id, part_id, supplier_name, quantity, unit_cost, expected_date, notes, status, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("part_id", partId)
        .order("created_at", { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data ?? []);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-parts/:partId/purchases", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const { partId } = req.params;
      const body = req.body || {};
      const quantity = Number(body.quantity ?? 1);
      const unitCost = Number(body.unit_cost ?? 0);
      const status = String(body.status ?? "pending");
      const allowed = ["pending", "ordered", "received", "cancelled"];
      if (!Number.isFinite(quantity) || quantity < 0) {
        return res.status(400).json({ error: "Quantidade inválida." });
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        return res.status(400).json({ error: "Custo unitário inválido." });
      }
      if (!allowed.includes(status)) {
        return res.status(400).json({ error: "Status inválido." });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_part_purchases")
        .insert({
          workshop_id: WORKSHOP_ID,
          part_id: partId,
          supplier_name: parseOptionalText(body.supplier_name),
          quantity,
          unit_cost: unitCost,
          expected_date: parseOptionalText(body.expected_date),
          notes: parseOptionalText(body.notes),
          status,
        })
        .select("id, part_id, supplier_name, quantity, unit_cost, expected_date, notes, status, created_at")
        .single();
      if (error) return res.status(500).json({ error: error.message });
      const receivedQty = purchaseReceivedStockQty(status, quantity);
      if (receivedQty > 0) {
        await adjustWorkshopPartStockQty(partId, receivedQty);
      }
      return res.status(201).json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-parts/:partId/purchases/:purchaseId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const { partId, purchaseId } = req.params;
      const body = req.body || {};

      const { data: existing, error: fetchExistingErr } = await supabaseAdmin
        .from("workshop_part_purchases")
        .select("quantity, status")
        .eq("id", purchaseId)
        .eq("part_id", partId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (fetchExistingErr) return res.status(500).json({ error: fetchExistingErr.message });
      if (!existing) return res.status(404).json({ error: "Compra não encontrada." });

      const patch: Record<string, unknown> = {};
      if (body.supplier_name !== undefined) patch.supplier_name = parseOptionalText(body.supplier_name);
      if (body.notes !== undefined) patch.notes = parseOptionalText(body.notes);
      if (body.expected_date !== undefined) patch.expected_date = parseOptionalText(body.expected_date);
      if (body.quantity !== undefined) {
        const q = Number(body.quantity);
        if (!Number.isFinite(q) || q < 0) return res.status(400).json({ error: "Quantidade inválida." });
        patch.quantity = q;
      }
      if (body.unit_cost !== undefined) {
        const c = Number(body.unit_cost);
        if (!Number.isFinite(c) || c < 0) return res.status(400).json({ error: "Custo inválido." });
        patch.unit_cost = c;
      }
      if (body.status !== undefined) {
        const status = String(body.status);
        const allowed = ["pending", "ordered", "received", "cancelled"];
        if (!allowed.includes(status)) return res.status(400).json({ error: "Status inválido." });
        patch.status = status;
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_part_purchases")
        .update(patch)
        .eq("id", purchaseId)
        .eq("part_id", partId)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, part_id, supplier_name, quantity, unit_cost, expected_date, notes, status, created_at")
        .single();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Compra não encontrada." });

      const oldStatus = String(existing.status ?? "pending");
      const oldQty = Number(existing.quantity ?? 0);
      const newStatus = String(data.status ?? oldStatus);
      const newQty = Number(data.quantity ?? oldQty);
      const stockDelta =
        purchaseReceivedStockQty(newStatus, newQty) - purchaseReceivedStockQty(oldStatus, oldQty);
      if (stockDelta !== 0) {
        await adjustWorkshopPartStockQty(partId, stockDelta);
      }

      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/workshop-parts/:partId/purchases/:purchaseId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const { partId, purchaseId } = req.params;

      const { data: existing, error: fetchExistingErr } = await supabaseAdmin
        .from("workshop_part_purchases")
        .select("quantity, status")
        .eq("id", purchaseId)
        .eq("part_id", partId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (fetchExistingErr) return res.status(500).json({ error: fetchExistingErr.message });
      if (!existing) return res.status(404).json({ error: "Compra não encontrada." });

      const { error } = await supabaseAdmin
        .from("workshop_part_purchases")
        .delete()
        .eq("id", purchaseId)
        .eq("part_id", partId)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) return res.status(500).json({ error: error.message });

      const receivedQty = purchaseReceivedStockQty(
        String(existing.status ?? "pending"),
        Number(existing.quantity ?? 0)
      );
      if (receivedQty > 0) {
        await adjustWorkshopPartStockQty(partId, -receivedQty);
      }

      return res.status(204).send();
    } catch (err: any) {
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- CATEGORIAS DO ESTOQUE DE PEÇAS -----------------
  app.get("/api/workshop-part-categories", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_part_categories")
        .select("id, name, sort_order, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) {
        console.error("[API] Erro ao listar categorias do estoque:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-part-categories:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-part-categories", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { name, sort_order } = req.body || {};
      const trimmed = typeof name === "string" ? name.trim() : "";
      if (!trimmed) {
        return res.status(400).json({ error: "Nome da categoria é obrigatório." });
      }
      const sortOrder = Number(sort_order ?? 0);
      const { data, error } = await supabaseAdmin
        .from("workshop_part_categories")
        .insert({
          workshop_id: WORKSHOP_ID,
          name: trimmed,
          sort_order: Number.isFinite(sortOrder) ? sortOrder : 0,
        })
        .select("id, name, sort_order, created_at")
        .single();
      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe uma categoria com este nome." });
        }
        console.error("[API] Erro ao criar categoria do estoque:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-part-categories:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-part-categories/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id } = req.params;
      const { name, sort_order } = req.body || {};
      const patch: Record<string, unknown> = {};
      if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed) return res.status(400).json({ error: "Nome da categoria é obrigatório." });
        patch.name = trimmed;
      }
      if (sort_order !== undefined) {
        const n = Number(sort_order);
        if (!Number.isFinite(n)) {
          return res.status(400).json({ error: "Ordem inválida." });
        }
        patch.sort_order = n;
      }
      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: "Nada para atualizar." });
      }
      const { data, error } = await supabaseAdmin
        .from("workshop_part_categories")
        .update(patch)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, name, sort_order, created_at")
        .single();
      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe uma categoria com este nome." });
        }
        console.error("[API] Erro ao atualizar categoria do estoque:", error);
        return res.status(500).json({ error: error.message });
      }
      if (!data) return res.status(404).json({ error: "Categoria não encontrada." });
      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-part-categories/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/workshop-part-categories/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { id } = req.params;
      const { error } = await supabaseAdmin
        .from("workshop_part_categories")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) {
        console.error("[API] Erro ao excluir categoria do estoque:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/workshop-part-categories/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-parts/:partId/categories", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const { partId } = req.params;
      const { categoryIds } = req.body || {};
      if (!Array.isArray(categoryIds)) {
        return res.status(400).json({ error: "categoryIds deve ser um array de IDs." });
      }
      const ids = categoryIds.map((x: unknown) => String(x)).filter(Boolean);
      const { data: partRow, error: partErr } = await supabaseAdmin
        .from("workshop_parts")
        .select("id")
        .eq("id", partId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (partErr || !partRow) {
        return res.status(404).json({ error: "Peça não encontrada." });
      }
      if (ids.length > 0) {
        const { data: cats, error: catErr } = await supabaseAdmin
          .from("workshop_part_categories")
          .select("id")
          .eq("workshop_id", WORKSHOP_ID)
          .in("id", ids);
        if (catErr) {
          console.error("[API] Erro ao validar categorias da peça:", catErr);
          return res.status(500).json({ error: catErr.message });
        }
        const valid = new Set((cats ?? []).map((c: { id: string }) => c.id));
        for (const cid of ids) {
          if (!valid.has(cid)) {
            return res.status(400).json({ error: "Categoria inválida ou de outra oficina." });
          }
        }
      }
      const { error: delErr } = await supabaseAdmin
        .from("workshop_part_category_members")
        .delete()
        .eq("part_id", partId);
      if (delErr) {
        console.error("[API] Erro ao limpar categorias da peça:", delErr);
        return res.status(500).json({ error: delErr.message });
      }
      if (ids.length > 0) {
        const rows = ids.map((category_id: string) => ({ part_id: partId, category_id }));
        const { error: insErr } = await supabaseAdmin.from("workshop_part_category_members").insert(rows);
        if (insErr) {
          console.error("[API] Erro ao vincular categorias da peça:", insErr);
          return res.status(500).json({ error: insErr.message });
        }
      }
      const { data: fullPart, error: fullErr } = await supabaseAdmin
        .from("workshop_parts")
        .select(WORKSHOP_PART_SELECT)
        .eq("id", partId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (fullErr || !fullPart) {
        return res.status(500).json({ error: fullErr?.message ?? "Peça não encontrada após atualizar." });
      }
      return respondWorkshopPart(res, fullPart as Record<string, unknown>);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-parts/:partId/categories:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  /** OS do laboratório vinculada ao produto (identificação do módulo ou peça em orçamento). */
  app.get("/api/workshop-parts/:id/lab-context", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }
      const partId = String(req.params.id || "").trim();
      if (!partId) {
        return res.status(400).json({ error: "ID do produto é obrigatório." });
      }

      const { data: part, error: partErr } = await supabaseAdmin
        .from("workshop_parts")
        .select("id, name, numeric_code, original_code")
        .eq("id", partId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();

      if (partErr) {
        console.error("[API] lab-context (part):", partErr);
        return res.status(500).json({ error: partErr.message });
      }
      if (!part) {
        return res.status(404).json({ error: "Produto não encontrado." });
      }

      const matchKeys = new Set<string>();
      for (const raw of [part.name, part.numeric_code, part.original_code]) {
        const k = String(raw ?? "").trim().toLowerCase();
        if (k) matchKeys.add(k);
      }

      const { data: moduleOrders, error: ordersErr } = await supabaseAdmin
        .from("service_orders")
        .select(
          "id, os_number, issue_description, vehicle_model, vehicle_brand, module_identification, module_kind, module_vehicle_kind, module_product_other, plate, mileage_km, vehicle_year, vehicle_engine_info, status, updated_at, created_at, customers(name)"
        )
        .eq("workshop_id", WORKSHOP_ID)
        .eq("order_type", "module")
        .order("updated_at", { ascending: false })
        .limit(400);

      if (ordersErr) {
        console.error("[API] lab-context (orders):", ordersErr);
        return res.status(500).json({ error: ordersErr.message });
      }

      const orders = (moduleOrders ?? []) as Record<string, unknown>[];
      let best: Record<string, unknown> | null = null;
      let bestTs = 0;

      const consider = (row: Record<string, unknown>) => {
        const ts = Math.max(
          new Date(String(row.updated_at ?? 0)).getTime(),
          new Date(String(row.created_at ?? 0)).getTime()
        );
        if (!best || ts > bestTs) {
          best = row;
          bestTs = ts;
        }
      };

      for (const o of orders) {
        const modId = String(o.module_identification ?? "").trim().toLowerCase();
        const modOther = String(o.module_product_other ?? "").trim().toLowerCase();
        if ((modId && matchKeys.has(modId)) || (modOther && matchKeys.has(modOther))) {
          consider(o);
        }
      }

      const moduleIds = orders.map((o) => String(o.id ?? "")).filter(Boolean);
      if (moduleIds.length > 0) {
        const chunkSize = 150;
        for (let i = 0; i < moduleIds.length; i += chunkSize) {
          const chunk = moduleIds.slice(i, i + chunkSize);
          const { data: budgets, error: budgetsErr } = await supabaseAdmin
            .from("budgets")
            .select("service_order_id, parts, updated_at, created_at")
            .eq("workshop_id", WORKSHOP_ID)
            .in("service_order_id", chunk);

          if (budgetsErr) {
            console.error("[API] lab-context (budgets):", budgetsErr);
            continue;
          }

          const linkedOrderIds = new Set<string>();
          for (const b of budgets ?? []) {
            const parts = b.parts;
            if (!Array.isArray(parts)) continue;
            const hit = parts.some(
              (p: unknown) =>
                p &&
                typeof p === "object" &&
                String((p as { workshopPartId?: string }).workshopPartId ?? "") === partId
            );
            if (hit && b.service_order_id) {
              linkedOrderIds.add(String(b.service_order_id));
            }
          }

          for (const o of orders) {
            if (linkedOrderIds.has(String(o.id ?? ""))) {
              consider(o);
            }
          }
        }
      }

      if (!best) {
        return res.json({ context: null });
      }

      const customer =
        best.customers && typeof best.customers === "object" && "name" in best.customers
          ? String((best.customers as { name?: string }).name ?? "")
          : null;

      return res.json({
        context: {
          service_order_id: best.id,
          os_number: best.os_number ?? null,
          issue_description: best.issue_description ?? null,
          customer_name: customer,
          vehicle_model: best.vehicle_model ?? null,
          vehicle_brand: best.vehicle_brand ?? null,
          module_identification: best.module_identification ?? null,
          module_kind: best.module_kind ?? null,
          module_vehicle_kind: best.module_vehicle_kind ?? null,
          module_product_other: best.module_product_other ?? null,
          plate: best.plate ?? null,
          mileage_km: best.mileage_km ?? null,
          vehicle_year: best.vehicle_year ?? null,
          vehicle_engine_info: best.vehicle_engine_info ?? null,
          status: best.status ?? null,
        },
      });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-parts/:id/lab-context:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- TÉCNICOS DA OFICINA (atribuição nos cards) -----------------
  const capitalizeTechnicianName = (s: string) =>
    (s || "").trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");

  app.get("/api/workshop-technicians", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_technicians")
        .select("id, slug, name, color_style, sort_order, photo_url, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar técnicos:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data ?? []);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-technicians:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.post("/api/workshop-technicians", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { slug, name, color_style } = req.body;
      const slugTrimmed = typeof slug === "string" ? String(slug).trim().toLowerCase().replace(/\s+/g, "_") : "";
      const nameTrimmed = typeof name === "string" ? name.trim() : "";
      const color = typeof color_style === "string" && color_style.trim() ? color_style.trim().toLowerCase() : null;

      if (!slugTrimmed) {
        return res.status(400).json({ error: "Identificador (slug) do técnico é obrigatório." });
      }
      if (!nameTrimmed) {
        return res.status(400).json({ error: "Nome do técnico é obrigatório." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_technicians")
        .insert({
          workshop_id: WORKSHOP_ID,
          slug: slugTrimmed,
          name: capitalizeTechnicianName(nameTrimmed),
          color_style: color,
          sort_order: 0,
        })
        .select("id, slug, name, color_style, sort_order, photo_url, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe um técnico com este identificador." });
        }
        console.error("[API] Erro ao criar técnico:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(201).json(data);
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-technicians:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-technicians/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;
      const { slug, name, color_style } = req.body;
      const slugTrimmed = typeof slug === "string" ? String(slug).trim().toLowerCase().replace(/\s+/g, "_") : undefined;
      const nameTrimmed = typeof name === "string" ? name.trim() : undefined;
      const color = color_style !== undefined
        ? (typeof color_style === "string" && color_style.trim() ? color_style.trim().toLowerCase() : null)
        : undefined;

      const updatePayload: any = {};
      if (slugTrimmed !== undefined) updatePayload.slug = slugTrimmed;
      if (nameTrimmed !== undefined) updatePayload.name = capitalizeTechnicianName(nameTrimmed);
      if (color !== undefined) updatePayload.color_style = color;

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "Nada para atualizar." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_technicians")
        .update(updatePayload)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, slug, name, color_style, sort_order, photo_url, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe um técnico com este identificador." });
        }
        console.error("[API] Erro ao atualizar técnico:", error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) {
        return res.status(404).json({ error: "Técnico não encontrado." });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-technicians/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.delete("/api/workshop-technicians/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;

      const { error } = await supabaseAdmin
        .from("workshop_technicians")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] Erro ao excluir técnico:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/workshop-technicians/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Upload da foto do técnico (arquivo ou câmera)
  app.post(
    "/api/workshop-technicians/:id/photo",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!supabaseAdmin || !WORKSHOP_ID) {
          return res.status(500).json({
            error:
              "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
          });
        }

        const { id: technicianId } = req.params;
        const file = req.file;

        if (!file) {
          return res.status(400).json({ error: "Arquivo de imagem não enviado." });
        }

        const { data: tech, error: techError } = await supabaseAdmin
          .from("workshop_technicians")
          .select("id")
          .eq("id", technicianId)
          .eq("workshop_id", WORKSHOP_ID)
          .single();

        if (techError || !tech) {
          return res.status(404).json({ error: "Técnico não encontrado." });
        }

        const bucket = VEHICLE_PHOTOS_BUCKET;
        const ext = (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") ? "jpg" : file.mimetype === "image/png" ? "png" : "webp";
        const pathInBucket = `${WORKSHOP_ID}/technicians/${technicianId}/photo.${ext}`;

        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(pathInBucket, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });

        if (uploadError) {
          console.error("[API] Erro ao enviar foto do técnico:", uploadError);
          return res.status(500).json({ error: uploadError.message });
        }

        const {
          data: { publicUrl },
        } = supabaseAdmin.storage.from(bucket).getPublicUrl(pathInBucket);
        const photoUrlWithCacheBust = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;

        const { data: updated, error: updateError } = await supabaseAdmin
          .from("workshop_technicians")
          .update({ photo_url: photoUrlWithCacheBust })
          .eq("id", technicianId)
          .eq("workshop_id", WORKSHOP_ID)
          .select("id, slug, name, color_style, sort_order, photo_url, created_at")
          .single();

        if (updateError) {
          console.error("[API] Erro ao atualizar photo_url do técnico:", updateError);
          return res.status(500).json({ error: updateError.message });
        }

        return res.json(updated);
      } catch (err: any) {
        console.error("[API] Erro em POST /api/workshop-technicians/:id/photo:", err);
        return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
      }
    }
  );

  // Upload da foto do perfil do administrador
  app.post(
    "/api/workshop-admin/photo",
    upload.single("file"),
    async (req, res) => {
      try {
        if (!supabaseAdmin || !WORKSHOP_ID) {
          return res.status(500).json({
            error:
              "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
          });
        }
        const file = req.file;
        if (!file) {
          return res.status(400).json({ error: "Arquivo de imagem não enviado." });
        }
        const bucket = VEHICLE_PHOTOS_BUCKET;
        const ext = (file.mimetype === "image/jpeg" || file.mimetype === "image/jpg") ? "jpg" : file.mimetype === "image/png" ? "png" : "webp";
        const pathInBucket = `${WORKSHOP_ID}/admin/photo.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(pathInBucket, file.buffer, {
            contentType: file.mimetype,
            upsert: true,
          });
        if (uploadError) {
          console.error("[API] Erro ao enviar foto do admin:", uploadError);
          return res.status(500).json({ error: uploadError.message });
        }
        const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(pathInBucket);
        const photoUrlWithCacheBust = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
        const { error: updateErr } = await supabaseAdmin.from("workshop_settings").upsert(
          { workshop_id: WORKSHOP_ID, key: "admin_photo_url", value: photoUrlWithCacheBust, updated_at: new Date().toISOString() },
          { onConflict: "workshop_id,key" }
        );
        if (updateErr) {
          console.error("[API] Erro ao atualizar admin_photo_url:", updateErr);
          return res.status(500).json({ error: updateErr.message });
        }
        return res.json({ adminPhotoUrl: photoUrlWithCacheBust });
      } catch (err: any) {
        console.error("[API] Erro em POST /api/workshop-admin/photo:", err);
        return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
      }
    }
  );

  app.put("/api/service-orders/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({
          error:
            "Supabase ou WORKSHOP_ID não configurados. Verifique variáveis de ambiente.",
        });
      }

      const { id } = req.params;
      const {
        status,
        issueDescription,
        aiAnalysis,
        assignedTechnician,
        garantiaTag,
        mileageKm,
        deliveryDate,
        vehicleObservations,
        vehicleModel,
        moduleIdentification,
        plate,
        orderType: bodyOrderType,
        vehicleCategory: bodyVehicleCategoryPut,
        referenceLinks: bodyReferenceLinks,
        labServiceLinks: bodyLabServiceLinks,
        vehicleColor: bodyVehicleColorPut,
        vehicleYear: bodyVehicleYearPut,
        vehicleEngineInfo: bodyVehicleEngineInfoPut,
        vehicleBrand: bodyVehicleBrandPut,
        moduleKind: bodyModuleKindPut,
        moduleVehicleKind: bodyModuleVehicleKindPut,
        moduleProductOther: bodyModuleProductOtherPut,
        actor,
        actorTechnicianSlug,
        actorTechnicianName,
        diagnosticAuthorizationSignaturePath,
      } = req.body;
      const isAdminActor = actor !== "technician";

      const updatePayload: any = {};
      if (vehicleModel !== undefined) {
        updatePayload.vehicle_model = typeof vehicleModel === "string" ? vehicleModel.trim() : "";
      }
      if (bodyVehicleBrandPut !== undefined) {
        updatePayload.vehicle_brand =
          bodyVehicleBrandPut == null || String(bodyVehicleBrandPut).trim() === ""
            ? null
            : String(bodyVehicleBrandPut).trim();
      }
      if (moduleIdentification !== undefined) {
        updatePayload.module_identification = typeof moduleIdentification === "string" ? moduleIdentification.trim() : null;
      }
      if (bodyModuleKindPut !== undefined) {
        const mk = parseModuleKind(bodyModuleKindPut);
        updatePayload.module_kind = mk;
      }
      if (bodyModuleVehicleKindPut !== undefined) {
        const mv = parseModuleVehicleKind(bodyModuleVehicleKindPut);
        updatePayload.module_vehicle_kind = mv;
      }
      if (bodyModuleProductOtherPut !== undefined) {
        const otherT =
          bodyModuleProductOtherPut == null
            ? null
            : String(bodyModuleProductOtherPut).trim() || null;
        updatePayload.module_product_other = otherT;
      }
      if (bodyModuleKindPut !== undefined) {
        const mkPut = parseModuleKind(bodyModuleKindPut);
        if (mkPut !== "outro") {
          updatePayload.module_product_other = null;
        }
      }
      if (plate !== undefined) {
        updatePayload.plate = typeof plate === "string" ? String(plate).trim().toUpperCase() : "";
      }
      if (mileageKm !== undefined) {
        updatePayload.mileage_km = mileageKm == null || String(mileageKm).trim() === '' ? null : String(mileageKm).trim();
      }
      if (deliveryDate !== undefined) {
        updatePayload.delivery_date = deliveryDate == null || String(deliveryDate).trim() === '' ? null : String(deliveryDate).trim();
      }
      if (vehicleObservations !== undefined) {
        updatePayload.vehicle_observations =
          vehicleObservations == null || String(vehicleObservations).trim() === ''
            ? null
            : String(vehicleObservations).trim();
      }
      if (status !== undefined) {
        if (!ALL_STATUSES.includes(status)) {
          return res.status(400).json({ error: "Status inválido." });
        }
        updatePayload.status = status;
        if (status === "GARANTIA") {
          updatePayload.garantia_tag = true;
        }
      }
      if (issueDescription !== undefined)
        updatePayload.issue_description = issueDescription;
      if (aiAnalysis !== undefined) updatePayload.ai_analysis = aiAnalysis;
      if (assignedTechnician !== undefined) {
        if (assignedTechnician === null || assignedTechnician === "") {
          updatePayload.assigned_technician = null;
        } else {
          const techId = typeof assignedTechnician === "string" ? assignedTechnician.trim() : "";
          const { data: techUser } = await supabaseAdmin
            .from("workshop_system_users")
            .select("id")
            .eq("workshop_id", WORKSHOP_ID)
            .eq("id", techId)
            .eq("is_technician", true)
            .maybeSingle();
          if (techUser) {
            updatePayload.assigned_technician = techId;
          } else {
            return res.status(400).json({ error: "Técnico inválido. Marque o usuário como técnico da oficina em Usuários do sistema." });
          }
        }
      }
      if (garantiaTag === false) {
        updatePayload.garantia_tag = false;
      }
      if (bodyOrderType === "vehicle" || bodyOrderType === "module") {
        updatePayload.order_type = bodyOrderType;
        if (bodyOrderType === "module") {
          updatePayload.plate = null;
          updatePayload.mileage_km = null;
          updatePayload.vehicle_color = null;
          updatePayload.vehicle_year = null;
          updatePayload.vehicle_engine_info = null;
          updatePayload.vehicle_brand = null;
        } else if (bodyOrderType === "vehicle") {
          updatePayload.module_kind = null;
          updatePayload.module_vehicle_kind = null;
        }
      }
      if (bodyVehicleCategoryPut !== undefined) {
        if (bodyVehicleCategoryPut === null || bodyVehicleCategoryPut === "") {
          updatePayload.vehicle_category = null;
        } else if (typeof bodyVehicleCategoryPut === "string") {
          updatePayload.vehicle_category = bodyVehicleCategoryPut.trim() || null;
        }
      }
      if (bodyVehicleColorPut !== undefined) {
        updatePayload.vehicle_color =
          bodyVehicleColorPut == null || String(bodyVehicleColorPut).trim() === ""
            ? null
            : String(bodyVehicleColorPut).trim();
      }
      if (bodyVehicleYearPut !== undefined) {
        updatePayload.vehicle_year =
          bodyVehicleYearPut == null || String(bodyVehicleYearPut).trim() === ""
            ? null
            : String(bodyVehicleYearPut).trim();
      }
      if (bodyVehicleEngineInfoPut !== undefined) {
        updatePayload.vehicle_engine_info =
          bodyVehicleEngineInfoPut == null || String(bodyVehicleEngineInfoPut).trim() === ""
            ? null
            : String(bodyVehicleEngineInfoPut).trim();
      }
      if (bodyReferenceLinks !== undefined) {
        if (!Array.isArray(bodyReferenceLinks)) {
          return res.status(400).json({ error: "referenceLinks deve ser um array." });
        }
        const normalized: { id: string; label: string; url: string }[] = [];
        for (const item of bodyReferenceLinks.slice(0, 30)) {
          if (!item || typeof item !== "object") continue;
          const o = item as Record<string, unknown>;
          const labelRaw = typeof o.label === "string" ? o.label.trim().slice(0, 120) : "";
          let urlStr = typeof o.url === "string" ? o.url.trim() : "";
          if (!urlStr) continue;
          if (!/^https?:\/\//i.test(urlStr)) {
            urlStr = urlStr.startsWith("//") ? `https:${urlStr}` : `https://${urlStr.replace(/^\/+/, "")}`;
          }
          let href: string;
          try {
            const u = new URL(urlStr);
            if (u.protocol !== "http:" && u.protocol !== "https:") continue;
            href = u.href;
          } catch {
            continue;
          }
          const id =
            typeof o.id === "string" && o.id.trim()
              ? o.id.trim().slice(0, 80)
              : crypto.randomUUID();
          const label = labelRaw || href;
          normalized.push({ id, label, url: href });
        }
        updatePayload.reference_links = normalized;
      }
      if (bodyLabServiceLinks !== undefined) {
        if (!Array.isArray(bodyLabServiceLinks)) {
          return res.status(400).json({ error: "labServiceLinks deve ser um array." });
        }
        const normalized: {
          id: string;
          serviceLabel: string;
          serviceDetails: string | null;
          source: "budget" | "manual";
          sourceBudgetId: string | null;
          sourceBudgetItemIndex: number | null;
          laboratoryOrderId: string;
          createdAt: string;
        }[] = [];
        for (const item of bodyLabServiceLinks.slice(0, 80)) {
          if (!item || typeof item !== "object") continue;
          const o = item as Record<string, unknown>;
          const serviceLabel = typeof o.serviceLabel === "string" ? o.serviceLabel.trim().slice(0, 180) : "";
          const serviceDetailsRaw =
            typeof o.serviceDetails === "string" ? o.serviceDetails.trim().slice(0, 2000) : "";
          const serviceDetails = serviceDetailsRaw || null;
          const sourceRaw = typeof o.source === "string" ? o.source.trim().toLowerCase() : "";
          const source = sourceRaw === "budget" ? "budget" : "manual";
          const laboratoryOrderId =
            typeof o.laboratoryOrderId === "string" ? o.laboratoryOrderId.trim().slice(0, 80) : "";
          if (!serviceLabel || !laboratoryOrderId) continue;
          const sourceBudgetId =
            typeof o.sourceBudgetId === "string" && o.sourceBudgetId.trim()
              ? o.sourceBudgetId.trim().slice(0, 80)
              : null;
          const sourceBudgetItemIndex = Number.isFinite(Number(o.sourceBudgetItemIndex))
            ? Number(o.sourceBudgetItemIndex)
            : null;
          const id =
            typeof o.id === "string" && o.id.trim()
              ? o.id.trim().slice(0, 80)
              : crypto.randomUUID();
          const createdAt =
            typeof o.createdAt === "string" && o.createdAt.trim()
              ? o.createdAt.trim()
              : new Date().toISOString();
          normalized.push({
            id,
            serviceLabel,
            serviceDetails,
            source,
            sourceBudgetId,
            sourceBudgetItemIndex,
            laboratoryOrderId,
            createdAt,
          });
        }
        updatePayload.lab_service_links = normalized;
      }

      if (diagnosticAuthorizationSignaturePath !== undefined) {
        const raw = diagnosticAuthorizationSignaturePath;
        if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
          updatePayload.diagnostic_authorization_signature_path = null;
          updatePayload.diagnostic_authorization_signed_at = null;
        } else if (typeof raw === "string") {
          const p = raw.trim();
          const prefix = `${WORKSHOP_ID}/${id}/`;
          if (!p.startsWith(prefix)) {
            return res.status(400).json({
              error: "Caminho da assinatura inválido para esta ordem de serviço.",
            });
          }
          updatePayload.diagnostic_authorization_signature_path = p;
          updatePayload.diagnostic_authorization_signed_at = new Date().toISOString();
        } else {
          return res.status(400).json({ error: "diagnosticAuthorizationSignaturePath inválido." });
        }
      }

      if (Object.keys(updatePayload).length === 0) {
        return res.status(400).json({ error: "Nada para atualizar." });
      }

      const { data: previous } = await supabaseAdmin
        .from("service_orders")
        .select("status, issue_description, delivery_date, assigned_technician, plate, vehicle_model, order_type, bench_slot, external_repair, customers(name)")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      // Bancada do laboratório: quando o status muda em uma OS de módulo, realoca o
      // compartimento automaticamente (1..24) para o grupo do novo status, ou libera
      // o compartimento quando o produto sai da bancada (ex.: EM_SERVICO / finalizado).
      const effectiveOrderType =
        (updatePayload.order_type as string | undefined) ??
        (previous as { order_type?: string } | null)?.order_type ??
        null;
      if (
        updatePayload.status !== undefined &&
        effectiveOrderType === "module" &&
        previous &&
        (previous as { status?: string }).status !== updatePayload.status
      ) {
        const currentSlot =
          typeof (previous as { bench_slot?: number | null }).bench_slot === "number"
            ? ((previous as { bench_slot?: number | null }).bench_slot as number)
            : null;
        const nextStatus = String(updatePayload.status);
        if (statusUsesBench(nextStatus)) {
          const newSlot = await pickBenchSlotForStatus(nextStatus, currentSlot, id);
          if (newSlot != null) {
            updatePayload.bench_slot = newSlot;
            updatePayload.bench_slot_at = new Date().toISOString();
            updatePayload.bench_queued_at = null;
          } else {
            updatePayload.bench_slot = null;
            updatePayload.bench_slot_at = null;
            updatePayload.bench_queued_at = new Date().toISOString();
          }
        } else {
          updatePayload.bench_slot = null;
          updatePayload.bench_slot_at = null;
          updatePayload.bench_queued_at = null;
        }

        // Conserto externo: carimba datas automaticamente ao enviar/registrar retorno.
        const prevStatus = String((previous as { status?: string }).status ?? "");
        const today = new Date().toISOString().slice(0, 10);
        const prevExternal =
          (previous as { external_repair?: ExternalRepair | null }).external_repair ?? null;
        if (nextStatus === "EM_CONSERTO_EXTERNO") {
          const merged: ExternalRepair = { ...(prevExternal ?? {}) };
          if (!merged.sentAt) merged.sentAt = today;
          updatePayload.external_repair = merged;
        } else if (nextStatus === "CHEGADA_CONSERTO" && prevStatus === "EM_CONSERTO_EXTERNO") {
          const merged: ExternalRepair = { ...(prevExternal ?? {}) };
          if (!merged.returnedAt) merged.returnedAt = today;
          updatePayload.external_repair = merged;
        }
      }

      if (
        updatePayload.status === "FINALIZADO" &&
        effectiveOrderType === "vehicle" &&
        previous &&
        String((previous as { status?: string }).status ?? "") !== "FINALIZADO"
      ) {
        try {
          const techCheck = await assertServiceTechniciansCompleteForFinalize(id);
          if (!techCheck.ok) {
            return res.status(400).json({ error: techCheck.error });
          }
        } catch (finalizeCheckErr: unknown) {
          const msg = finalizeCheckErr instanceof Error ? finalizeCheckErr.message : "Erro";
          if (/service_order_service_technicians/i.test(msg) && /does not exist|relation/i.test(msg)) {
            return res.status(500).json({
              error: "Tabela de técnicos por serviço não configurada. Aplique a migration no Supabase.",
            });
          }
          console.error("[API] Validação técnicos por serviço:", finalizeCheckErr);
          return res.status(500).json({ error: msg });
        }
      }

      updatePayload.updated_at = new Date().toISOString();

      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .update(updatePayload)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao atualizar service_order:", error);
        return res.status(500).json({ error: error.message });
      }

      if (effectiveOrderType === "module") {
        await processIntakeBenchQueue();
      }

      const techSlug = data?.assigned_technician ?? null;
      const customerNameSo = previous?.customers && typeof previous.customers === "object" && "name" in previous.customers
        ? String((previous.customers as { name: string }).name ?? "")
        : "";
      const payloadBase = {
        service_order_id: id,
        vehicle_plate: data?.plate ?? previous?.plate ?? null,
        vehicle_model: data?.vehicle_model ?? previous?.vehicle_model ?? null,
        customer_name: customerNameSo || null,
      };
      if (previous) {
        if (isAdminActor) {
          // Ações do admin: notificar todos os técnicos
          const stageTechIds = await getTechnicianRecipientIdsForSystemType("stage_change");
          const complaintTechIds = await getTechnicianRecipientIdsForSystemType("complaint_edited");
          const deliveryTechIds = await getTechnicianRecipientIdsForSystemType("delivery_date_changed");
          if (updatePayload.status !== undefined && previous.status !== data?.status) {
            for (const techId of stageTechIds) {
              await supabaseAdmin.from("notifications").insert({
                workshop_id: WORKSHOP_ID,
                type: "stage_change",
                payload: { ...payloadBase, new_status: data?.status },
                target_type: "technician",
                target_slug: techId,
              }).then(({ error: e }) => { if (e) console.error("[API] Notificação stage_change:", e); });
            }
          }
          if (updatePayload.issue_description !== undefined && previous.issue_description !== data?.issue_description) {
            for (const techId of complaintTechIds) {
              await supabaseAdmin.from("notifications").insert({
                workshop_id: WORKSHOP_ID,
                type: "complaint_edited",
                payload: payloadBase,
                target_type: "technician",
                target_slug: techId,
              }).then(({ error: e }) => { if (e) console.error("[API] Notificação complaint_edited:", e); });
            }
          }
          if (updatePayload.delivery_date !== undefined && String(previous?.delivery_date ?? "") !== String(data?.delivery_date ?? "")) {
            for (const techId of deliveryTechIds) {
              await supabaseAdmin.from("notifications").insert({
                workshop_id: WORKSHOP_ID,
                type: "delivery_date_changed",
                payload: { ...payloadBase, delivery_date: data?.delivery_date ?? null },
                target_type: "technician",
                target_slug: techId,
              }).then(({ error: e }) => { if (e) console.error("[API] Notificação delivery_date_changed:", e); });
            }
          }
        } else if (!isAdminActor && (typeof actorTechnicianSlug === "string" || typeof actorTechnicianName === "string")) {
          // Ações do técnico: notificar apenas o admin (Rei do ABS)
          const technicianLabel = typeof actorTechnicianName === "string" && actorTechnicianName.trim() ? actorTechnicianName.trim() : (actorTechnicianSlug || "Técnico");
          const shouldAdminStage = await shouldNotifyAdminForSystemType("stage_change");
          const shouldAdminComplaint = await shouldNotifyAdminForSystemType("complaint_edited");
          const shouldAdminDelivery = await shouldNotifyAdminForSystemType("delivery_date_changed");
          if (updatePayload.status !== undefined && previous.status !== data?.status) {
            if (shouldAdminStage) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "stage_change",
              payload: { ...payloadBase, new_status: data?.status, technician_name: technicianLabel },
              target_type: "admin",
              target_slug: null,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação stage_change (admin):", e); });
            }
          }
          if (updatePayload.issue_description !== undefined && previous.issue_description !== data?.issue_description) {
            if (shouldAdminComplaint) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "complaint_edited",
              payload: { ...payloadBase, technician_name: technicianLabel },
              target_type: "admin",
              target_slug: null,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação complaint_edited (admin):", e); });
            }
          }
          if (updatePayload.delivery_date !== undefined && String(previous?.delivery_date ?? "") !== String(data?.delivery_date ?? "")) {
            if (shouldAdminDelivery) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "delivery_date_changed",
              payload: { ...payloadBase, delivery_date: data?.delivery_date ?? null, technician_name: technicianLabel },
              target_type: "admin",
              target_slug: null,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação delivery_date_changed (admin):", e); });
            }
          }
        }
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em PUT /api/service-orders/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Bancada do laboratório: definir/limpar manualmente o compartimento (1..24) de uma OS de módulo.
  app.put("/api/service-orders/:id/bench-slot", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = reqOrderId(req);
      if (!id) return res.status(400).json({ error: "ID da OS inválido." });

      const rawSlot = req.body?.slot ?? req.body?.benchSlot;
      const clearing = rawSlot === null || rawSlot === "" || rawSlot === undefined;
      const slot = clearing ? null : normalizeBenchSlot(rawSlot);
      if (!clearing && slot == null) {
        return res.status(400).json({ error: "Compartimento inválido (use 1 a 24)." });
      }

      const { data: order } = await supabaseAdmin
        .from("service_orders")
        .select("id, order_type, status, bench_slot")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!order) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      if ((order as { order_type?: string }).order_type !== "module") {
        return res.status(400).json({ error: "A bancada é exclusiva do laboratório." });
      }

      if (slot != null) {
        // Compartimento já ocupado por outra OS ativa?
        const { data: clash } = await supabaseAdmin
          .from("service_orders")
          .select("id")
          .eq("workshop_id", WORKSHOP_ID)
          .eq("order_type", "module")
          .eq("bench_slot", slot)
          .neq("status", CANCELLED_STATUS)
          .neq("id", id)
          .maybeSingle();
        if (clash) {
          return res.status(409).json({ error: `Compartimento ${slot} já está ocupado.` });
        }
      }

      const nowBench = new Date().toISOString();
      const benchUpdate: Record<string, unknown> = {
        bench_slot: slot,
        bench_slot_at: slot != null ? nowBench : null,
        updated_at: nowBench,
      };
      if (slot != null) benchUpdate.bench_queued_at = null;
      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .update(benchUpdate)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();
      if (error) {
        console.error("[API] PUT bench-slot:", error);
        return res.status(500).json({ error: error.message });
      }
      await processIntakeBenchQueue();
      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/service-orders/:id/bench-slot:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Conserto externo (terceiros): grava os dados do conserto em outro lugar na OS de módulo.
  app.put("/api/service-orders/:id/external-repair", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = reqOrderId(req);
      if (!id) return res.status(400).json({ error: "ID da OS inválido." });

      const { data: order } = await supabaseAdmin
        .from("service_orders")
        .select("id, order_type")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!order) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      if ((order as { order_type?: string }).order_type !== "module") {
        return res.status(400).json({ error: "Conserto externo é exclusivo do laboratório." });
      }

      const body = req.body ?? {};
      const clearing = body.externalRepair === null || body.clear === true;
      const trimField = (v: unknown) => {
        if (v == null) return null;
        const t = String(v).trim();
        return t === "" ? null : t.slice(0, 500);
      };
      const externalRepair: ExternalRepair | null = clearing
        ? null
        : {
            vehicleRef: trimField(body.vehicleRef),
            productIdentification: trimField(body.productIdentification),
            productType: trimField(body.productType),
            productTypeOther: trimField(body.productTypeOther),
            service: trimField(body.service),
            vendor: trimField(body.vendor),
            sentAt: trimField(body.sentAt),
            expectedAt: trimField(body.expectedAt),
            returnedAt: trimField(body.returnedAt),
            cost: trimField(body.cost),
            notes: body.notes == null ? null : String(body.notes).trim().slice(0, 4000) || null,
          };

      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .update({
          external_repair: externalRepair,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();
      if (error) {
        console.error("[API] PUT external-repair:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/service-orders/:id/external-repair:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Excluir veículo do sistema (arquivar como CANCELLED) — exige senha configurada em "Alterar senhas"
  app.post("/api/service-orders/:id/delete-with-password", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const { password } = req.body || {};
      const pwd = String(password ?? "").trim();
      if (!pwd) {
        return res.status(400).json({ error: "Informe a senha." });
      }
      const adminOk = await verifyAdminPasswordOnly(pwd);
      if (!adminOk) {
      const expected = await supabaseAdmin
        .from("workshop_settings")
        .select("value")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("key", "vehicle_delete_password")
        .maybeSingle();
      const expectedPassword = expected?.data?.value?.trim() ?? "";
      if (!expectedPassword) {
          return res.status(401).json({
            error:
              "Senha incorreta. Use a senha do administrador (login Gerência) ou configure a senha de exclusão em Alterar senhas.",
          });
        }
        if (pwd !== expectedPassword) {
          return res.status(401).json({
            error:
              "Senha incorreta. Use a senha do administrador (login Gerência) ou a senha de exclusão em Alterar senhas.",
          });
        }
      }
      const archivedAt = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .update({
          status: CANCELLED_STATUS,
          bench_slot: null,
          bench_slot_at: null,
          bench_queued_at: null,
          updated_at: archivedAt,
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, order_type")
        .single();
      if (error) {
        console.error("[API] Falha ao arquivar OS:", id, error);
        return res.status(500).json({ error: error.message || "Falha ao arquivar a ordem de serviço." });
      }
      if (!data) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      if ((data as { order_type?: string }).order_type === "module") {
        await processIntakeBenchQueue();
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/service-orders/:id/delete-with-password:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // ----------------- CHECKLIST TEMPLATES (PÁTIO) -----------------
  // Listar templates com itens (admin na página inicial e modal do veículo no Pátio)
  app.get("/api/workshop/checklist-templates", async (_req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data: templates, error: tErr } = await supabaseAdmin
        .from("workshop_checklist_templates")
        .select("id, name, sort_order, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (tErr) {
        console.error("[API] Erro ao listar checklist templates:", tErr);
        return res.status(500).json({ error: tErr.message });
      }
      const list = (templates ?? []) as { id: string; name: string; sort_order: number; created_at: string }[];
      if (list.length === 0) {
        return res.json([]);
      }
      const templateIds = list.map((t) => t.id);
      const { data: items, error: iErr } = await supabaseAdmin
        .from("workshop_checklist_template_items")
        .select("id, template_id, text, sort_order")
        .in("template_id", templateIds)
        .order("sort_order", { ascending: true });
      if (iErr) {
        console.error("[API] Erro ao listar checklist template items:", iErr);
        return res.status(500).json({ error: iErr.message });
      }
      const itemsList = (items ?? []) as { id: string; template_id: string; text: string; sort_order: number }[];
      const byTemplate: Record<string, typeof itemsList> = {};
      itemsList.forEach((i) => {
        if (!byTemplate[i.template_id]) byTemplate[i.template_id] = [];
        byTemplate[i.template_id].push(i);
      });
      const result = list.map((t) => ({
        id: t.id,
        name: t.name,
        sort_order: t.sort_order,
        created_at: t.created_at,
        items: (byTemplate[t.id] ?? []).map((it) => ({ id: it.id, text: it.text, sort_order: it.sort_order })),
      }));
      return res.json(result);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop/checklist-templates:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Criar template com itens (admin)
  app.post("/api/workshop/checklist-templates", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { name, items } = req.body ?? {};
      const trimmedName = typeof name === "string" ? name.trim() : "";
      if (!trimmedName) {
        return res.status(400).json({ error: "Nome do checklist é obrigatório." });
      }
      const itemTexts = Array.isArray(items)
        ? items.map((x: unknown) => (typeof x === "string" ? x.trim() : String(x).trim())).filter(Boolean)
        : [];
      const { data: template, error: tErr } = await supabaseAdmin
        .from("workshop_checklist_templates")
        .insert({
          workshop_id: WORKSHOP_ID,
          name: trimmedName,
          sort_order: 0,
        })
        .select("id")
        .single();
      if (tErr || !template) {
        console.error("[API] Erro ao criar checklist template:", tErr);
        return res.status(500).json({ error: tErr?.message ?? "Erro ao criar checklist." });
      }
      const templateId = (template as { id: string }).id;
      if (itemTexts.length > 0) {
        const rows = itemTexts.map((text, i) => ({
          template_id: templateId,
          text,
          sort_order: i,
        }));
        const { error: iErr } = await supabaseAdmin.from("workshop_checklist_template_items").insert(rows);
        if (iErr) {
          console.error("[API] Erro ao criar itens do checklist:", iErr);
          // template já criado; podemos continuar
        }
      }
      const { data: created } = await supabaseAdmin
        .from("workshop_checklist_templates")
        .select("id, name, sort_order, created_at")
        .eq("id", templateId)
        .single();
      const { data: createdItems } = await supabaseAdmin
        .from("workshop_checklist_template_items")
        .select("id, text, sort_order")
        .eq("template_id", templateId)
        .order("sort_order", { ascending: true });
      return res.status(201).json({
        ...(created ?? { id: templateId, name: trimmedName, sort_order: 0, created_at: new Date().toISOString() }),
        items: (createdItems ?? []).map((it: { id: string; text: string; sort_order: number }) => ({
          id: it.id,
          text: it.text,
          sort_order: it.sort_order,
        })),
      });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop/checklist-templates:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Atualizar template (nome e itens)
  app.put("/api/workshop/checklist-templates/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const { name, items } = req.body ?? {};
      const trimmedName = typeof name === "string" ? name.trim() : "";
      if (!trimmedName) {
        return res.status(400).json({ error: "Nome do checklist é obrigatório." });
      }
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("workshop_checklist_templates")
        .select("id")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (exErr || !existing) {
        return res.status(404).json({ error: "Checklist não encontrado." });
      }
      await supabaseAdmin
        .from("workshop_checklist_templates")
        .update({ name: trimmedName })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      const itemTexts = Array.isArray(items)
        ? items.map((x: unknown) => (typeof x === "string" ? x.trim() : String(x).trim())).filter(Boolean)
        : [];
      // Substituir itens: remover antigos e inserir novos
      await supabaseAdmin.from("workshop_checklist_template_items").delete().eq("template_id", id);
      if (itemTexts.length > 0) {
        const rows = itemTexts.map((text, i) => ({ template_id: id, text, sort_order: i }));
        await supabaseAdmin.from("workshop_checklist_template_items").insert(rows);
      }
      const { data: updated } = await supabaseAdmin
        .from("workshop_checklist_templates")
        .select("id, name, sort_order, created_at")
        .eq("id", id)
        .single();
      const { data: updatedItems } = await supabaseAdmin
        .from("workshop_checklist_template_items")
        .select("id, text, sort_order")
        .eq("template_id", id)
        .order("sort_order", { ascending: true });
      return res.json({
        ...updated,
        items: (updatedItems ?? []).map((it: { id: string; text: string; sort_order: number }) => ({
          id: it.id,
          text: it.text,
          sort_order: it.sort_order,
        })),
      });
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop/checklist-templates/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Excluir template
  app.delete("/api/workshop/checklist-templates/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const { error } = await supabaseAdmin
        .from("workshop_checklist_templates")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) {
        if (error.code === "23503") return res.status(404).json({ error: "Checklist não encontrado." });
        console.error("[API] Erro ao excluir checklist template:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] Erro em DELETE /api/workshop/checklist-templates/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Estado dos itens de checklist por OS (para exibir no modal do veículo)
  app.get("/api/service-orders/:id/checklist-state", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const { data: order } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!order) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      const { data: checks } = await supabaseAdmin
        .from("service_order_checklist_checks")
        .select("template_item_id, state")
        .eq("service_order_id", id);
      const state: Record<string, "complete" | "incomplete"> = {};
      (checks ?? []).forEach((c: { template_item_id: string; state: string }) => {
        state[c.template_item_id] = c.state === "complete" ? "complete" : "incomplete";
      });
      return res.json(state);
    } catch (err: any) {
      console.error("[API] Erro em GET /api/service-orders/:id/checklist-state:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  // Marcar/desmarcar item de checklist para uma OS
  app.patch("/api/service-orders/:id/checklist-state", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { id } = req.params;
      const { templateItemId, state } = req.body ?? {};
      const templateItemIdStr = typeof templateItemId === "string" ? templateItemId.trim() : "";
      const stateStr = state === "complete" ? "complete" : "incomplete";
      if (!templateItemIdStr) {
        return res.status(400).json({ error: "templateItemId é obrigatório." });
      }
      const { data: order } = await supabaseAdmin
        .from("service_orders")
        .select("id")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!order) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      const { error } = await supabaseAdmin
        .from("service_order_checklist_checks")
        .upsert(
          {
            service_order_id: id,
            template_item_id: templateItemIdStr,
            state: stateStr,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "service_order_id,template_item_id" }
        );
      if (error) {
        console.error("[API] Erro ao atualizar checklist state:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] Erro em PATCH /api/service-orders/:id/checklist-state:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  function publicVehiclePhotoUrl(objectPath: string): string {
    const base = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
    const bucket = VEHICLE_PHOTOS_BUCKET;
    const enc = String(objectPath)
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
    return `${base}/storage/v1/object/public/${bucket}/${enc}`;
  }

  /** Garante token de partilha (registos antigos ou migração incompleta). */
  async function ensureAccompanimentShareToken<T extends { id?: string; share_token?: string | null }>(
    row: T | null
  ): Promise<T | null> {
    if (!row || !supabaseAdmin) return row;
    const existing = typeof row.share_token === "string" ? row.share_token.trim() : "";
    if (existing) return row;
    const id = typeof row.id === "string" ? row.id : "";
    if (!id) return row;
    const shareToken = crypto.randomUUID();
    const { data, error } = await supabaseAdmin
      .from("workshop_vehicle_accompaniment")
      .update({ share_token: shareToken, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) {
      console.error("[API] ensure share_token vehicle-accompaniment:", error);
      return row;
    }
    return data as T;
  }

  function accompanimentBudgetHasApproved(b: { services?: unknown; parts?: unknown }): boolean {
    const sv = Array.isArray(b.services) ? b.services : [];
    const pt = Array.isArray(b.parts) ? b.parts : [];
    const svcHit = sv.some((s: { approved?: unknown }) => s && s.approved === true);
    const partHit = pt.some((p: { approved?: unknown }) => p && p.approved === true);
    return svcHit || partHit;
  }

  function parseBudgetPublicSettings(raw: unknown): Record<string, { visible: boolean; allow_client_approval: boolean }> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, { visible: boolean; allow_client_approval: boolean }> = {};
    Object.entries(raw as Record<string, unknown>).forEach(([budgetId, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const v = value as Record<string, unknown>;
      out[budgetId] = {
        visible: v.visible !== false,
        allow_client_approval: v.allow_client_approval === true,
      };
    });
    return out;
  }

  function parseClientBudgetChoices(raw: unknown): Record<
    string,
    {
      submitted_at: string;
      diagnosis_note: string;
      services: { index: number; approved: boolean }[];
      parts: { index: number; approved: boolean }[];
    }
  > {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<
      string,
      {
        submitted_at: string;
        diagnosis_note: string;
        services: { index: number; approved: boolean }[];
        parts: { index: number; approved: boolean }[];
      }
    > = {};
    Object.entries(raw as Record<string, unknown>).forEach(([budgetId, value]) => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return;
      const v = value as Record<string, unknown>;
      const servicesRaw = Array.isArray(v.services) ? v.services : [];
      const partsRaw = Array.isArray(v.parts) ? v.parts : [];
      const services = servicesRaw
        .map((it: unknown) => {
          if (!it || typeof it !== "object") return null;
          const row = it as Record<string, unknown>;
          const index = Number(row.index);
          if (!Number.isInteger(index) || index < 0) return null;
          return { index, approved: row.approved === true };
        })
        .filter(Boolean) as { index: number; approved: boolean }[];
      const parts = partsRaw
        .map((it: unknown) => {
          if (!it || typeof it !== "object") return null;
          const row = it as Record<string, unknown>;
          const index = Number(row.index);
          if (!Number.isInteger(index) || index < 0) return null;
          return { index, approved: row.approved === true };
        })
        .filter(Boolean) as { index: number; approved: boolean }[];
      out[budgetId] = {
        submitted_at:
          typeof v.submitted_at === "string" && v.submitted_at.trim()
            ? v.submitted_at
            : new Date().toISOString(),
        diagnosis_note:
          typeof v.diagnosis_note === "string" ? v.diagnosis_note.trim().slice(0, 4000) : "",
        services,
        parts,
      };
    });
    return out;
  }

  function accompanimentOrderFinalized(status: string): boolean {
    return (
      status === "FINALIZADO" ||
      status === "GARANTIA" ||
      status === CANCELLED_STATUS ||
      status === "ORCAMENTO_NAO_APROVADO"
    );
  }

  /** Central do atendimento — carregar registo por OS (pode não existir). */
  app.get("/api/vehicle-accompaniment/by-order/:serviceOrderId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { serviceOrderId } = req.params;
      if (!serviceOrderId) {
        return res.status(400).json({ error: "ID da OS inválido." });
      }
      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id, order_type")
        .eq("id", serviceOrderId)
      .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      if (so.order_type === "module") {
        return res.status(400).json({ error: "Central do atendimento é apenas para OS de veículo." });
      }
      const { data: row, error } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .select("*")
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (error) {
        console.error("[API] GET vehicle-accompaniment:", error);
        return res.status(500).json({ error: error.message });
      }
      const withToken = row ? await ensureAccompanimentShareToken(row) : null;
      return res.json(withToken ?? null);
    } catch (err: any) {
      console.error("[API] GET /api/vehicle-accompaniment/by-order/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  /** Cria registo com token de partilha se ainda não existir. */
  app.post("/api/vehicle-accompaniment/bootstrap", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const serviceOrderId = typeof req.body?.serviceOrderId === "string" ? req.body.serviceOrderId.trim() : "";
      if (!serviceOrderId) {
        return res.status(400).json({ error: "serviceOrderId é obrigatório." });
      }
      const { data: so } = await supabaseAdmin
        .from("service_orders")
        .select("id, order_type")
        .eq("id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (!so) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      if (so.order_type === "module") {
        return res.status(400).json({ error: "Apenas OS de veículo." });
      }
      const { data: existing } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .select("*")
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (existing) {
        const withToken = await ensureAccompanimentShareToken(existing);
        return res.json(withToken ?? existing);
      }
      const shareToken = crypto.randomUUID();
      const { data: inserted, error } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .insert({
          workshop_id: WORKSHOP_ID,
          service_order_id: serviceOrderId,
          share_token: shareToken,
          intake_observations: "",
          intake_photos: [],
        })
        .select("*")
        .single();
      if (error || !inserted) {
        console.error("[API] bootstrap vehicle-accompaniment:", error);
        return res.status(500).json({ error: error?.message ?? "Falha ao criar registo." });
      }
      return res.json(inserted);
    } catch (err: any) {
      console.error("[API] POST /api/vehicle-accompaniment/bootstrap:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  /** Atualiza observações e fotos (JSON validado levemente). */
  app.put("/api/vehicle-accompaniment/by-order/:serviceOrderId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { serviceOrderId } = req.params;
      const obs = typeof req.body?.intake_observations === "string" ? req.body.intake_observations : "";
      const photosRaw = req.body?.intake_photos;
      const budgetSettings = parseBudgetPublicSettings(req.body?.budget_public_settings);
      if (!Array.isArray(photosRaw)) {
        return res.status(400).json({ error: "intake_photos deve ser um array." });
      }
      const photos = photosRaw.map((p: unknown, i: number) => {
        if (!p || typeof p !== "object") return null;
        const o = p as Record<string, unknown>;
        const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `ph_${i}`;
        const path = typeof o.path === "string" && o.path.trim() ? o.path.trim() : "";
        if (!path) return null;
        const serviceId = typeof o.service_id === "string" && o.service_id.trim() ? o.service_id.trim().slice(0, 120) : "";
        const serviceName =
          typeof o.service_name === "string" && o.service_name.trim() ? o.service_name.trim().slice(0, 240) : "";
        const phaseRaw = typeof o.phase === "string" ? o.phase.trim().toLowerCase() : "";
        const phase = phaseRaw === "before" || phaseRaw === "after" ? phaseRaw : null;
        const markersRaw = Array.isArray(o.markers) ? o.markers : [];
        const markers = markersRaw
          .map((m: unknown, j: number) => {
            if (!m || typeof m !== "object") return null;
            const mm = m as Record<string, unknown>;
            const mid = typeof mm.id === "string" && mm.id.trim() ? mm.id.trim() : `mk_${j}`;
            const xPct = Number(mm.xPct);
            const yPct = Number(mm.yPct);
            const note = typeof mm.note === "string" ? mm.note.slice(0, 500) : "";
            if (!Number.isFinite(xPct) || !Number.isFinite(yPct)) return null;
            return { id: mid, xPct, yPct, note };
          })
          .filter(Boolean);
        return {
          id,
          path,
          markers,
          ...(serviceId ? { service_id: serviceId } : {}),
          ...(serviceName ? { service_name: serviceName } : {}),
          ...(phase ? { phase } : {}),
        };
      }).filter(Boolean);

      const { data: row } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .select("id")
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();
      if (!row) {
        return res.status(404).json({ error: "Crie primeiro a central (bootstrap) para esta OS." });
      }
      let updateErr: any = null;
      const firstUpdate = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .update({
          intake_observations: obs,
          intake_photos: photos,
          budget_public_settings: budgetSettings,
          updated_at: new Date().toISOString(),
        })
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID);
      updateErr = firstUpdate.error;
      if (updateErr && /budget_public_settings/i.test(String(updateErr.message || ""))) {
        const fallback = await supabaseAdmin
          .from("workshop_vehicle_accompaniment")
          .update({
            intake_observations: obs,
            intake_photos: photos,
            updated_at: new Date().toISOString(),
          })
          .eq("service_order_id", serviceOrderId)
          .eq("workshop_id", WORKSHOP_ID);
        updateErr = fallback.error;
      }
      if (updateErr) {
        console.error("[API] PUT vehicle-accompaniment:", updateErr);
        return res.status(500).json({ error: updateErr.message });
      }
      const { data: out } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .select("*")
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      const withToken = out ? await ensureAccompanimentShareToken(out) : null;
      return res.json(withToken ?? out);
    } catch (err: any) {
      console.error("[API] PUT /api/vehicle-accompaniment/by-order/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  /** Página pública (cliente): dados da OS, fotos com URLs, orçamentos aprovados, estado de avaliação. */
  app.get("/api/public/vehicle-accompaniment/:token", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const token = String(req.params.token || "").trim();
      if (!token || token.length > 80) {
        return res.status(400).json({ error: "Link inválido." });
      }
      const { data: acc, error: accErr } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .select("*")
        .eq("share_token", token)
        .maybeSingle();
      if (accErr || !acc) {
        return res.status(404).json({ error: "Página não encontrada ou link expirado." });
      }
      const { data: so, error: soErr } = await supabaseAdmin
        .from("service_orders")
        .select(
          "id, os_number, plate, vehicle_brand, vehicle_model, vehicle_color, vehicle_year, mileage_km, status, order_type, issue_description, customers(name, phone, email)"
        )
        .eq("id", acc.service_order_id)
        .eq("workshop_id", acc.workshop_id)
        .single();
      if (soErr || !so) {
        return res.status(404).json({ error: "Ordem não encontrada." });
      }
      let workshopName: string | null = null;
      const { data: ws } = await supabaseAdmin.from("workshops").select("name").eq("id", acc.workshop_id).maybeSingle();
      if (ws && typeof (ws as { name?: string }).name === "string") {
        workshopName = (ws as { name: string }).name;
      }
      const { data: budgetsRaw } = await supabaseAdmin
        .from("budgets")
        .select("id, diagnosis, services, parts, observations, created_at, updated_at")
        .eq("service_order_id", acc.service_order_id)
        .eq("workshop_id", acc.workshop_id);
      const budgetSettings = parseBudgetPublicSettings((acc as { budget_public_settings?: unknown }).budget_public_settings);
      const clientChoices = parseClientBudgetChoices((acc as { client_budget_choices?: unknown }).client_budget_choices);
      const budgets = (budgetsRaw ?? [])
        .filter((b) => {
          const cfg = budgetSettings[String(b.id)] ?? {
            visible: accompanimentBudgetHasApproved(b as { services?: unknown; parts?: unknown }),
            allow_client_approval: false,
          };
          return cfg.visible === true;
        })
        .map((b) => ({
          id: b.id,
          diagnosis: b.diagnosis,
          services: b.services,
          parts: b.parts,
          observations: b.observations,
          created_at: b.created_at,
          updated_at: b.updated_at,
          allow_client_approval: (budgetSettings[String(b.id)]?.allow_client_approval ?? false) === true,
          client_choice: clientChoices[String(b.id)] ?? null,
        }));
      const photos = Array.isArray(acc.intake_photos)
        ? acc.intake_photos.map((p: { path?: string; markers?: unknown; id?: string }) => ({
            id: p.id,
            path: p.path,
            url: p.path ? publicVehiclePhotoUrl(String(p.path)) : "",
            markers: Array.isArray(p.markers) ? p.markers : [],
          }))
        : [];
      const finalized = accompanimentOrderFinalized(String(so.status || ""));
      return res.json({
        workshopName,
        serviceOrder: {
          os_number: so.os_number,
          plate: so.plate,
          vehicle_brand: so.vehicle_brand,
          vehicle_model: so.vehicle_model,
          vehicle_color: so.vehicle_color,
          vehicle_year: so.vehicle_year,
          mileage_km: so.mileage_km,
          status: so.status,
          progressLabel: finalized ? "Finalizado" : "Em andamento",
          finalized,
          issue_description: so.issue_description,
          customer: so.customers,
        },
        intake_observations: acc.intake_observations ?? "",
        intake_photos: photos,
        budgets,
        ratings: {
          attendance: acc.client_rating_attendance,
          service: acc.client_rating_service,
          recommend: acc.client_rating_recommend,
          comment: acc.client_rating_comment,
          submittedAt: acc.client_rating_at,
        },
      });
    } catch (err: any) {
      console.error("[API] GET public vehicle-accompaniment:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  /** Cliente submete avaliação e/ou escolhas de orçamento (aprova/reprova). */
  app.patch("/api/public/vehicle-accompaniment/:token", async (req, res) => {
    try {
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const token = String(req.params.token || "").trim();
      if (!token || token.length > 80) {
        return res.status(400).json({ error: "Link inválido." });
      }
      const { data: acc } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .select("id, client_rating_at, client_budget_choices")
        .eq("share_token", token)
        .maybeSingle();
      if (!acc) {
        return res.status(404).json({ error: "Link inválido." });
      }
      const wantsRating =
        req.body?.client_rating_attendance != null ||
        req.body?.client_rating_service != null ||
        req.body?.client_rating_recommend != null;
      const wantsBudgetChoices = req.body?.budget_choices && typeof req.body.budget_choices === "object";
      if (!wantsRating && !wantsBudgetChoices) {
        return res.status(400).json({ error: "Envie avaliação e/ou escolhas do orçamento." });
      }
      const now = new Date().toISOString();
      const updatePayload: Record<string, unknown> = {
        updated_at: now,
      };

      if (wantsRating) {
        if (acc.client_rating_at) {
          return res.status(409).json({ error: "Avaliação já foi enviada." });
        }
        const a = Number(req.body?.client_rating_attendance);
        const s = Number(req.body?.client_rating_service);
        const r = Number(req.body?.client_rating_recommend);
        const comment =
          typeof req.body?.client_rating_comment === "string"
            ? req.body.client_rating_comment.trim().slice(0, 2000)
            : "";
        if (![1, 2, 3, 4, 5].includes(a) || ![1, 2, 3, 4, 5].includes(s) || ![1, 2, 3, 4, 5].includes(r)) {
          return res.status(400).json({ error: "Informe as três avaliações de 1 a 5 estrelas." });
        }
        updatePayload.client_rating_attendance = a;
        updatePayload.client_rating_service = s;
        updatePayload.client_rating_recommend = r;
        updatePayload.client_rating_comment = comment || null;
        updatePayload.client_rating_at = now;
      }

      if (wantsBudgetChoices) {
        const currentChoices = parseClientBudgetChoices(acc.client_budget_choices);
        const incoming = parseClientBudgetChoices(req.body?.budget_choices);
        updatePayload.client_budget_choices = {
          ...currentChoices,
          ...incoming,
        };
      }

      let updateErr: any = null;
      const firstUpdate = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .update(updatePayload)
        .eq("id", acc.id);
      updateErr = firstUpdate.error;
      if (updateErr && /client_budget_choices/i.test(String(updateErr.message || ""))) {
        const fallbackPayload = { ...updatePayload };
        delete fallbackPayload.client_budget_choices;
        const fallback = await supabaseAdmin
          .from("workshop_vehicle_accompaniment")
          .update(fallbackPayload)
          .eq("id", acc.id);
        updateErr = fallback.error;
      }
      if (updateErr) {
        console.error("[API] PATCH public vehicle-accompaniment:", updateErr);
        return res.status(500).json({ error: updateErr.message });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] PATCH public vehicle-accompaniment:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  // ----------------- BOLETIM DE ERROS -----------------
  const mapBulletinRow = (row: Record<string, unknown>) => ({
    id: row.id,
    workshopId: row.workshop_id,
    title: row.title ?? "",
    vehicleBrand: row.vehicle_brand ?? "",
    vehicleModel: row.vehicle_model ?? "",
    vehicleYear: row.vehicle_year ?? "",
    plate: row.plate ?? "",
    engineInfo: row.engine_info ?? "",
    dtcCodes: row.dtc_codes ?? "",
    symptoms: row.symptoms ?? "",
    possibleCauses: row.possible_causes ?? "",
    probableCauses: row.probable_causes ?? "",
    solution: row.solution ?? "",
    notes: row.notes ?? "",
    status: row.status ?? "published",
    tags: Array.isArray(row.tags) ? row.tags : [],
    referenceLinks: Array.isArray(row.reference_links) ? row.reference_links : [],
    serviceOrderId: row.service_order_id ?? null,
    createdByUserId: row.created_by_user_id ?? null,
    createdByName: row.created_by_name ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const mapAttachmentRow = (row: Record<string, unknown>) => ({
    id: row.id,
    bulletinId: row.bulletin_id,
    kind: row.kind ?? "file",
    name: row.name ?? "",
    url: row.url ?? "",
    storagePath: row.storage_path ?? null,
    mimeType: row.mime_type ?? null,
    fileSizeBytes: row.file_size_bytes ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  });

  async function assertBulletinInWorkshop(bulletinId: string) {
    const { data, error } = await supabaseAdmin!
      .from("workshop_error_bulletins")
      .select("id, workshop_id")
      .eq("id", bulletinId)
      .single();
    if (error || !data || data.workshop_id !== WORKSHOP_ID) return null;
    return data;
  }

  app.get("/api/error-bulletins", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

      let query = supabaseAdmin
        .from("workshop_error_bulletins")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("updated_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      const { data, error } = await query;
      if (error) {
        console.error("[API] GET error-bulletins:", error);
        return res.status(500).json({ error: error.message });
      }

      let rows = (data ?? []) as Record<string, unknown>[];
      if (q) {
        rows = rows.filter((row) => {
          const hay = [
            row.title,
            row.vehicle_brand,
            row.vehicle_model,
            row.plate,
            row.dtc_codes,
            row.symptoms,
            row.possible_causes,
            row.probable_causes,
            row.solution,
            ...(Array.isArray(row.tags) ? row.tags : []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });
      }

      return res.json(rows.map(mapBulletinRow));
    } catch (err: any) {
      console.error("[API] GET error-bulletins:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.get("/api/error-bulletins/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const id = String(req.params.id || "").trim();
      const { data: bulletin, error } = await supabaseAdmin
        .from("workshop_error_bulletins")
        .select("*")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (error || !bulletin) {
        return res.status(404).json({ error: "Boletim não encontrado." });
      }

      const { data: attachments } = await supabaseAdmin
        .from("workshop_error_bulletin_attachments")
        .select("*")
        .eq("bulletin_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      return res.json({
        ...mapBulletinRow(bulletin as Record<string, unknown>),
        attachments: (attachments ?? []).map((a) =>
          mapAttachmentRow(a as Record<string, unknown>)
        ),
      });
    } catch (err: any) {
      console.error("[API] GET error-bulletins/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.post("/api/error-bulletins", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const b = req.body ?? {};
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("workshop_error_bulletins")
        .insert({
          workshop_id: WORKSHOP_ID,
          title: (b.title ?? "").toString().trim(),
          vehicle_brand: b.vehicleBrand ?? null,
          vehicle_model: b.vehicleModel ?? null,
          vehicle_year: b.vehicleYear ?? null,
          plate: b.plate ? String(b.plate).toUpperCase() : null,
          engine_info: b.engineInfo ?? null,
          dtc_codes: (b.dtcCodes ?? "").toString(),
          symptoms: (b.symptoms ?? "").toString(),
          possible_causes: (b.possibleCauses ?? "").toString(),
          probable_causes: (b.probableCauses ?? "").toString(),
          solution: (b.solution ?? "").toString(),
          notes: (b.notes ?? "").toString(),
          status: ["draft", "published", "archived"].includes(b.status) ? b.status : "published",
          tags: Array.isArray(b.tags) ? b.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : [],
          reference_links: Array.isArray(b.referenceLinks) ? b.referenceLinks : [],
          service_order_id: b.serviceOrderId ?? null,
          created_by_user_id: b.createdByUserId ?? null,
          created_by_name: (b.createdByName ?? "").toString(),
          updated_at: now,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[API] POST error-bulletins:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(mapBulletinRow(data as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] POST error-bulletins:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.patch("/api/error-bulletins/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const id = String(req.params.id || "").trim();
      const existing = await assertBulletinInWorkshop(id);
      if (!existing) return res.status(404).json({ error: "Boletim não encontrado." });

      const b = req.body ?? {};
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (b.title !== undefined) updates.title = String(b.title).trim();
      if (b.vehicleBrand !== undefined) updates.vehicle_brand = b.vehicleBrand;
      if (b.vehicleModel !== undefined) updates.vehicle_model = b.vehicleModel;
      if (b.vehicleYear !== undefined) updates.vehicle_year = b.vehicleYear;
      if (b.plate !== undefined) updates.plate = b.plate ? String(b.plate).toUpperCase() : null;
      if (b.engineInfo !== undefined) updates.engine_info = b.engineInfo;
      if (b.dtcCodes !== undefined) updates.dtc_codes = String(b.dtcCodes);
      if (b.symptoms !== undefined) updates.symptoms = String(b.symptoms);
      if (b.possibleCauses !== undefined) updates.possible_causes = String(b.possibleCauses);
      if (b.probableCauses !== undefined) updates.probable_causes = String(b.probableCauses);
      if (b.solution !== undefined) updates.solution = String(b.solution);
      if (b.notes !== undefined) updates.notes = String(b.notes);
      if (b.status !== undefined && ["draft", "published", "archived"].includes(b.status)) {
        updates.status = b.status;
      }
      if (b.tags !== undefined && Array.isArray(b.tags)) {
        updates.tags = b.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
      }
      if (b.referenceLinks !== undefined && Array.isArray(b.referenceLinks)) {
        updates.reference_links = b.referenceLinks;
      }
      if (b.serviceOrderId !== undefined) updates.service_order_id = b.serviceOrderId;

      const { data, error } = await supabaseAdmin
        .from("workshop_error_bulletins")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();

      if (error) {
        console.error("[API] PATCH error-bulletins:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json(mapBulletinRow(data as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] PATCH error-bulletins:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.delete("/api/error-bulletins/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const id = String(req.params.id || "").trim();
      const existing = await assertBulletinInWorkshop(id);
      if (!existing) return res.status(404).json({ error: "Boletim não encontrado." });

      const { error } = await supabaseAdmin
        .from("workshop_error_bulletins")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] DELETE error-bulletins:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] DELETE error-bulletins:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.post("/api/error-bulletins/:id/attachments", upload.single("file"), async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const bulletinId = String(req.params.id || "").trim();
      const existing = await assertBulletinInWorkshop(bulletinId);
      if (!existing) return res.status(404).json({ error: "Boletim não encontrado." });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "Arquivo não enviado." });

      const safeName = sanitizeVehiclePhotoFileName(file.originalname);
      const pathInBucket = `${WORKSHOP_ID}/bulletins/${bulletinId}/${Date.now()}_${safeName}`;
      const isPhoto = (file.mimetype || "").startsWith("image/");

      const { error: uploadError } = await supabaseAdmin.storage
        .from(ERROR_BULLETINS_BUCKET)
        .upload(pathInBucket, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        console.error("[API] upload error-bulletin attachment:", uploadError);
        return res.status(500).json({ error: uploadError.message });
      }

      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from(ERROR_BULLETINS_BUCKET).getPublicUrl(pathInBucket);

      const { data: row, error } = await supabaseAdmin
        .from("workshop_error_bulletin_attachments")
        .insert({
          workshop_id: WORKSHOP_ID,
          bulletin_id: bulletinId,
          kind: isPhoto ? "photo" : "document",
          name: safeName,
          url: publicUrl,
          storage_path: pathInBucket,
          mime_type: file.mimetype,
          file_size_bytes: file.size,
        })
        .select("*")
        .single();

      if (error) {
        return res.status(500).json({ error: error.message });
      }

      await supabaseAdmin
        .from("workshop_error_bulletins")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", bulletinId);

      return res.status(201).json(mapAttachmentRow(row as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] POST error-bulletin attachment:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.post("/api/error-bulletins/:id/links", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const bulletinId = String(req.params.id || "").trim();
      const existing = await assertBulletinInWorkshop(bulletinId);
      if (!existing) return res.status(404).json({ error: "Boletim não encontrado." });

      const name = (req.body?.name ?? req.body?.title ?? "Link").toString().trim();
      const url = (req.body?.url ?? "").toString().trim();
      if (!url) return res.status(400).json({ error: "URL obrigatória." });

      const { data: row, error } = await supabaseAdmin
        .from("workshop_error_bulletin_attachments")
        .insert({
          workshop_id: WORKSHOP_ID,
          bulletin_id: bulletinId,
          kind: "link",
          name: name || "Link",
          url,
          storage_path: null,
        })
        .select("*")
        .single();

      if (error) return res.status(500).json({ error: error.message });

      await supabaseAdmin
        .from("workshop_error_bulletins")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", bulletinId);

      return res.status(201).json(mapAttachmentRow(row as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] POST error-bulletin link:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.delete("/api/error-bulletins/:id/attachments/:attachmentId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const bulletinId = String(req.params.id || "").trim();
      const attachmentId = String(req.params.attachmentId || "").trim();
      const existing = await assertBulletinInWorkshop(bulletinId);
      if (!existing) return res.status(404).json({ error: "Boletim não encontrado." });

      const { data: att } = await supabaseAdmin
        .from("workshop_error_bulletin_attachments")
        .select("*")
        .eq("id", attachmentId)
        .eq("bulletin_id", bulletinId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!att) return res.status(404).json({ error: "Anexo não encontrado." });

      if (att.storage_path) {
        await supabaseAdmin.storage.from(ERROR_BULLETINS_BUCKET).remove([att.storage_path]);
      }

      const { error } = await supabaseAdmin
        .from("workshop_error_bulletin_attachments")
        .delete()
        .eq("id", attachmentId);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] DELETE error-bulletin attachment:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  // ----------------- RADAR DE QUALIDADE (ocorrências por mecânico) -----------------
  const QUALITY_CATEGORIES = [
    "montagem",
    "diagnostico",
    "retrabalho",
    "prazo",
    "comunicacao",
    "seguranca",
    "peca_material",
    "cliente",
    "outro",
  ] as const;
  const QUALITY_SEVERITIES = ["baixa", "media", "alta", "critica"] as const;
  const QUALITY_STATUSES = ["aberta", "em_analise", "plano_acao", "resolvida", "arquivada"] as const;

  const mapQualityIncidentRow = (row: Record<string, unknown>) => ({
    id: row.id,
    workshopId: row.workshop_id,
    technicianId: row.technician_id ?? null,
    technicianName: row.technician_name ?? "",
    title: row.title ?? "",
    category: row.category ?? "outro",
    severity: row.severity ?? "media",
    status: row.status ?? "aberta",
    occurredAt: row.occurred_at,
    description: row.description ?? "",
    impact: row.impact ?? "",
    rootCause: row.root_cause ?? "",
    correctiveAction: row.corrective_action ?? "",
    preventiveAction: row.preventive_action ?? "",
    lessonLearned: row.lesson_learned ?? "",
    plate: row.plate ?? "",
    vehicleSummary: row.vehicle_summary ?? "",
    serviceOrderId: row.service_order_id ?? null,
    serviceOrderLabel: row.service_order_label ?? "",
    registeredByUserId: row.registered_by_user_id ?? null,
    registeredByName: row.registered_by_name ?? "",
    resolvedAt: row.resolved_at ?? null,
    resolvedByName: row.resolved_by_name ?? "",
    tags: Array.isArray(row.tags) ? row.tags : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });

  const mapQualityAttachmentRow = (row: Record<string, unknown>) => ({
    id: row.id,
    incidentId: row.incident_id,
    kind: row.kind ?? "file",
    name: row.name ?? "",
    url: row.url ?? "",
    storagePath: row.storage_path ?? null,
    mimeType: row.mime_type ?? null,
    fileSizeBytes: row.file_size_bytes ?? null,
    sortOrder: row.sort_order ?? 0,
    createdAt: row.created_at,
  });

  async function resolveTechnicianName(technicianId: string | null | undefined): Promise<string> {
    if (!technicianId || !supabaseAdmin || !WORKSHOP_ID) return "";
    const { data: wt } = await supabaseAdmin
      .from("workshop_technicians")
      .select("name")
      .eq("id", technicianId)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    const wtName = (wt?.name ?? "").toString().trim();
    if (wtName) return wtName;
    const { data: su } = await supabaseAdmin
      .from("workshop_system_users")
      .select("display_name, username")
      .eq("id", technicianId)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    if (!su) return "";
    return ((su as { display_name?: string | null; username?: string | null }).display_name ||
      (su as { username?: string | null }).username ||
      ""
    )
      .toString()
      .trim();
  }

  async function resolveSystemUserDisplayName(userId: string): Promise<string> {
    if (!userId || !supabaseAdmin || !WORKSHOP_ID) return "";
    const { data } = await supabaseAdmin
      .from("workshop_system_users")
      .select("display_name, username")
      .eq("id", userId)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    if (!data) return "";
    return ((data as { display_name?: string | null; username?: string | null }).display_name ||
      (data as { username?: string | null }).username ||
      ""
    )
      .toString()
      .trim();
  }

  async function assertQualityIncidentInWorkshop(incidentId: string) {
    const { data, error } = await supabaseAdmin!
      .from("workshop_technician_incidents")
      .select("id, workshop_id")
      .eq("id", incidentId)
      .single();
    if (error || !data || data.workshop_id !== WORKSHOP_ID) return null;
    return data;
  }

  app.get("/api/quality-incidents", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const status = typeof req.query.status === "string" ? req.query.status.trim() : "";
      const technicianId =
        typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";
      const technicianSystemUserId =
        typeof req.query.technicianSystemUserId === "string"
          ? req.query.technicianSystemUserId.trim()
          : "";
      const category = typeof req.query.category === "string" ? req.query.category.trim() : "";
      const severity = typeof req.query.severity === "string" ? req.query.severity.trim() : "";
      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

      let query = supabaseAdmin
        .from("workshop_technician_incidents")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("occurred_at", { ascending: false });

      if (status && status !== "all") query = query.eq("status", status);
      if (technicianId) query = query.eq("technician_id", technicianId);
      if (technicianSystemUserId) {
        const sysName = await resolveSystemUserDisplayName(technicianSystemUserId);
        if (sysName) query = query.eq("technician_name", sysName);
        else query = query.eq("technician_id", "00000000-0000-0000-0000-000000000000");
      }
      if (category) query = query.eq("category", category);
      if (severity) query = query.eq("severity", severity);
      if (from) query = query.gte("occurred_at", from);
      if (to) query = query.lte("occurred_at", to);

      const { data, error } = await query;
      if (error) {
        console.error("[API] GET quality-incidents:", error);
        return res.status(500).json({ error: error.message });
      }

      let rows = (data ?? []) as Record<string, unknown>[];
      if (q) {
        rows = rows.filter((row) => {
          const hay = [
            row.title,
            row.technician_name,
            row.description,
            row.plate,
            row.vehicle_summary,
            row.service_order_label,
            ...(Array.isArray(row.tags) ? row.tags : []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        });
      }

      return res.json(rows.map(mapQualityIncidentRow));
    } catch (err: any) {
      console.error("[API] GET quality-incidents:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.get("/api/quality-incidents/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const id = String(req.params.id || "").trim();
      const { data: incident, error } = await supabaseAdmin
        .from("workshop_technician_incidents")
        .select("*")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (error || !incident) {
        return res.status(404).json({ error: "Ocorrência não encontrada." });
      }

      const { data: attachments } = await supabaseAdmin
        .from("workshop_technician_incident_attachments")
        .select("*")
        .eq("incident_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });

      return res.json({
        ...mapQualityIncidentRow(incident as Record<string, unknown>),
        attachments: (attachments ?? []).map((a) =>
          mapQualityAttachmentRow(a as Record<string, unknown>)
        ),
      });
    } catch (err: any) {
      console.error("[API] GET quality-incidents/:id:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.post("/api/quality-incidents", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const b = req.body ?? {};
      const now = new Date().toISOString();
      const technicianId = b.technicianId ?? null;
      let technicianName = (b.technicianName ?? "").toString().trim();
      if (technicianId && !technicianName) {
        technicianName = await resolveTechnicianName(technicianId);
      }
      const status = QUALITY_STATUSES.includes(b.status) ? b.status : "aberta";
      const resolvedAt =
        status === "resolvida"
          ? b.resolvedAt ?? now
          : b.resolvedAt ?? null;

      const { data, error } = await supabaseAdmin
        .from("workshop_technician_incidents")
        .insert({
          workshop_id: WORKSHOP_ID,
          technician_id: technicianId,
          technician_name: technicianName,
          title: (b.title ?? "").toString().trim(),
          category: QUALITY_CATEGORIES.includes(b.category) ? b.category : "outro",
          severity: QUALITY_SEVERITIES.includes(b.severity) ? b.severity : "media",
          status,
          occurred_at: b.occurredAt ?? now,
          description: (b.description ?? "").toString(),
          impact: (b.impact ?? "").toString(),
          root_cause: (b.rootCause ?? "").toString(),
          corrective_action: (b.correctiveAction ?? "").toString(),
          preventive_action: (b.preventiveAction ?? "").toString(),
          lesson_learned: (b.lessonLearned ?? "").toString(),
          plate: b.plate ? String(b.plate).toUpperCase() : null,
          vehicle_summary: b.vehicleSummary ?? null,
          service_order_id: b.serviceOrderId ?? null,
          service_order_label: b.serviceOrderLabel ?? null,
          registered_by_user_id: b.registeredByUserId ?? null,
          registered_by_name: (b.registeredByName ?? "").toString(),
          resolved_at: resolvedAt,
          resolved_by_name: b.resolvedByName ?? null,
          tags: Array.isArray(b.tags) ? b.tags.map((t: unknown) => String(t).trim()).filter(Boolean) : [],
          updated_at: now,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[API] POST quality-incidents:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(mapQualityIncidentRow(data as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] POST quality-incidents:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.patch("/api/quality-incidents/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const id = String(req.params.id || "").trim();
      const existing = await assertQualityIncidentInWorkshop(id);
      if (!existing) return res.status(404).json({ error: "Ocorrência não encontrada." });

      const b = req.body ?? {};
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (b.technicianId !== undefined) {
        updates.technician_id = b.technicianId;
        if (b.technicianId) {
          const name = await resolveTechnicianName(b.technicianId);
          if (name) updates.technician_name = name;
        }
      }
      if (b.technicianName !== undefined) updates.technician_name = String(b.technicianName).trim();
      if (b.title !== undefined) updates.title = String(b.title).trim();
      if (b.category !== undefined && QUALITY_CATEGORIES.includes(b.category)) {
        updates.category = b.category;
      }
      if (b.severity !== undefined && QUALITY_SEVERITIES.includes(b.severity)) {
        updates.severity = b.severity;
      }
      if (b.status !== undefined && QUALITY_STATUSES.includes(b.status)) {
        updates.status = b.status;
        if (b.status === "resolvida" && b.resolvedAt === undefined) {
          updates.resolved_at = new Date().toISOString();
        }
      }
      if (b.occurredAt !== undefined) updates.occurred_at = b.occurredAt;
      if (b.description !== undefined) updates.description = String(b.description);
      if (b.impact !== undefined) updates.impact = String(b.impact);
      if (b.rootCause !== undefined) updates.root_cause = String(b.rootCause);
      if (b.correctiveAction !== undefined) updates.corrective_action = String(b.correctiveAction);
      if (b.preventiveAction !== undefined) updates.preventive_action = String(b.preventiveAction);
      if (b.lessonLearned !== undefined) updates.lesson_learned = String(b.lessonLearned);
      if (b.plate !== undefined) updates.plate = b.plate ? String(b.plate).toUpperCase() : null;
      if (b.vehicleSummary !== undefined) updates.vehicle_summary = b.vehicleSummary;
      if (b.serviceOrderId !== undefined) updates.service_order_id = b.serviceOrderId;
      if (b.serviceOrderLabel !== undefined) updates.service_order_label = b.serviceOrderLabel;
      if (b.resolvedAt !== undefined) updates.resolved_at = b.resolvedAt;
      if (b.resolvedByName !== undefined) updates.resolved_by_name = b.resolvedByName;
      if (b.tags !== undefined && Array.isArray(b.tags)) {
        updates.tags = b.tags.map((t: unknown) => String(t).trim()).filter(Boolean);
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_technician_incidents")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("*")
        .single();

      if (error) {
        console.error("[API] PATCH quality-incidents:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.json(mapQualityIncidentRow(data as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] PATCH quality-incidents:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.delete("/api/quality-incidents/:id", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const id = String(req.params.id || "").trim();
      const existing = await assertQualityIncidentInWorkshop(id);
      if (!existing) return res.status(404).json({ error: "Ocorrência não encontrada." });

      const { error } = await supabaseAdmin
        .from("workshop_technician_incidents")
        .delete()
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);

      if (error) {
        console.error("[API] DELETE quality-incidents:", error);
        return res.status(500).json({ error: error.message });
      }
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] DELETE quality-incidents:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.post("/api/quality-incidents/:id/attachments", upload.single("file"), async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const incidentId = String(req.params.id || "").trim();
      const existing = await assertQualityIncidentInWorkshop(incidentId);
      if (!existing) return res.status(404).json({ error: "Ocorrência não encontrada." });

      const file = req.file;
      if (!file) return res.status(400).json({ error: "Arquivo não enviado." });

      const safeName = sanitizeVehiclePhotoFileName(file.originalname);
      const pathInBucket = `${WORKSHOP_ID}/incidents/${incidentId}/${Date.now()}_${safeName}`;
      const isPhoto = (file.mimetype || "").startsWith("image/");

      const { error: uploadError } = await supabaseAdmin.storage
        .from(QUALITY_INCIDENTS_BUCKET)
        .upload(pathInBucket, file.buffer, { contentType: file.mimetype, upsert: false });

      if (uploadError) {
        console.error("[API] upload quality-incident attachment:", uploadError);
        return res.status(500).json({ error: uploadError.message });
      }

      const {
        data: { publicUrl },
      } = supabaseAdmin.storage.from(QUALITY_INCIDENTS_BUCKET).getPublicUrl(pathInBucket);

      const { data: row, error } = await supabaseAdmin
        .from("workshop_technician_incident_attachments")
        .insert({
          workshop_id: WORKSHOP_ID,
          incident_id: incidentId,
          kind: isPhoto ? "photo" : "document",
          name: safeName,
          url: publicUrl,
          storage_path: pathInBucket,
          mime_type: file.mimetype,
          file_size_bytes: file.size,
        })
        .select("*")
        .single();

      if (error) return res.status(500).json({ error: error.message });

      await supabaseAdmin
        .from("workshop_technician_incidents")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", incidentId);

      return res.status(201).json(mapQualityAttachmentRow(row as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] POST quality-incident attachment:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.post("/api/quality-incidents/:id/links", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const incidentId = String(req.params.id || "").trim();
      const existing = await assertQualityIncidentInWorkshop(incidentId);
      if (!existing) return res.status(404).json({ error: "Ocorrência não encontrada." });

      const name = (req.body?.name ?? req.body?.title ?? "Link").toString().trim();
      const url = (req.body?.url ?? "").toString().trim();
      if (!url) return res.status(400).json({ error: "URL obrigatória." });

      const { data: row, error } = await supabaseAdmin
        .from("workshop_technician_incident_attachments")
        .insert({
          workshop_id: WORKSHOP_ID,
          incident_id: incidentId,
          kind: "link",
          name: name || "Link",
          url,
          storage_path: null,
        })
        .select("*")
        .single();

      if (error) return res.status(500).json({ error: error.message });

      await supabaseAdmin
        .from("workshop_technician_incidents")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", incidentId);

      return res.status(201).json(mapQualityAttachmentRow(row as Record<string, unknown>));
    } catch (err: any) {
      console.error("[API] POST quality-incident link:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.delete("/api/quality-incidents/:id/attachments/:attachmentId", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Supabase ou WORKSHOP_ID não configurados." });
      }
      const incidentId = String(req.params.id || "").trim();
      const attachmentId = String(req.params.attachmentId || "").trim();
      const existing = await assertQualityIncidentInWorkshop(incidentId);
      if (!existing) return res.status(404).json({ error: "Ocorrência não encontrada." });

      const { data: att } = await supabaseAdmin
        .from("workshop_technician_incident_attachments")
        .select("*")
        .eq("id", attachmentId)
        .eq("incident_id", incidentId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

      if (!att) return res.status(404).json({ error: "Anexo não encontrado." });

      if (att.storage_path) {
        await supabaseAdmin.storage.from(QUALITY_INCIDENTS_BUCKET).remove([att.storage_path]);
      }

      const { error } = await supabaseAdmin
        .from("workshop_technician_incident_attachments")
        .delete()
        .eq("id", attachmentId);

      if (error) return res.status(500).json({ error: error.message });
      return res.status(204).send();
    } catch (err: any) {
      console.error("[API] DELETE quality-incident attachment:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  return app;
}
