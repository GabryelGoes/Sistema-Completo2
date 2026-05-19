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
} from "./constants/serviceOrderStages.js";
import { normalizeTvChimeConfig } from "./utils/tvChimeSchedule.js";
import { SYSTEM_NOTIFICATION_IDS } from "./constants/systemNotificationTypes.js";

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
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(computed, "hex"));
}

/**
 * Origens do painel da TV (Patio-View em patio-view.vercel.app) — CORS.
 * PATIO_VIEW_ORIGINS / PATIO_VIEW_ORIGIN: lista extra (domínios adicionais).
 * https://patio-view.vercel.app é sempre incluído (painel da TV).
 */
const PATIO_VIEW_TV_ORIGIN = "https://patio-view.vercel.app";

function parsePatioViewOrigins(): string[] {
  const raw = process.env.PATIO_VIEW_ORIGINS || process.env.PATIO_VIEW_ORIGIN || PATIO_VIEW_TV_ORIGIN;
  const list = raw
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
  const merged = [...list];
  if (!merged.includes(PATIO_VIEW_TV_ORIGIN)) merged.push(PATIO_VIEW_TV_ORIGIN);
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

  /** Atualiza `updated_at` na OS para disparar Realtime/SSE (ex.: após mudança só no Storage). */
  async function touchServiceOrderUpdatedAt(serviceOrderId: string): Promise<void> {
    if (!supabaseAdmin) return;
    const { error } = await supabaseAdmin
      .from("service_orders")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", serviceOrderId);
    if (error) console.warn("[API] touchServiceOrderUpdatedAt:", error.message);
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
      "Content-Type, Authorization, X-Requested-With, Accept, Accept-Language"
    );
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

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
  const DEFAULT_ADMIN_PASSWORD = "admin";
  const ADMIN_USERNAME = "Gerência";

  async function getAdminPassword(): Promise<string> {
    if (!supabaseAdmin || !WORKSHOP_ID) return process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    const { data: row } = await supabaseAdmin
      .from("workshop_settings")
      .select("value")
      .eq("workshop_id", WORKSHOP_ID)
      .eq("key", "admin_password")
      .maybeSingle();
    const db = row?.value != null && String(row.value).trim() !== "" ? String(row.value).trim() : "";
    return db || process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  }

  async function verifyAdmin(username: string, password: string): Promise<boolean> {
    const normalized = String(username).trim();
    if (normalized.toLowerCase() !== ADMIN_USERNAME.toLowerCase()) return false;
    return verifyAdminPasswordOnly(password);
  }

  async function verifyAdminPasswordOnly(password: string): Promise<boolean> {
    const expected = await getAdminPassword();
    return String(password).trim() === expected;
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

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body || {};
      const u = typeof username === "string" ? username.trim() : "";
      const p = typeof password === "string" ? password : "";
      if (!u) {
        return res.status(400).json({ error: "Informe o usuário." });
      }
      if (await verifyAdmin(u, p)) {
        return res.json({ role: "admin" });
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
        String(r.username).trim().toLowerCase() === uLower && r.profile_token === t && r.profile_token_expires_at && r.profile_token_expires_at > now
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
      if (!np || np.length < 4) {
        return res.status(400).json({ error: "A nova senha deve ter no mínimo 4 caracteres." });
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
      const adminPassword = typeof req.query.adminPassword === "string" ? req.query.adminPassword : "";
      if (!WORKSHOP_ID || !(await verifyAdmin(ADMIN_USERNAME, adminPassword))) {
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
      if (!p || p.length < 4) return res.status(400).json({ error: "Senha deve ter no mínimo 4 caracteres." });
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
      if (typeof password === "string" && password.length >= 4) updates.password_hash = hashPassword(password);
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
      const adminPassword = typeof req.query.adminPassword === "string" ? req.query.adminPassword : "";
      if (!WORKSHOP_ID || !(await verifyAdmin(ADMIN_USERNAME, adminPassword))) {
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
      } = req.body || {};
      const updates: { key: string; value: string; updated_at: string }[] = [];
      if (typeof patioLoginEnabled === "boolean") {
        updates.push({ key: "patio_login_enabled", value: String(patioLoginEnabled), updated_at: new Date().toISOString() });
      }
      if (typeof patioPin === "string") {
        updates.push({ key: "patio_pin", value: patioPin.trim(), updated_at: new Date().toISOString() });
      }
      if (typeof adminPassword === "string" && adminPassword.trim()) {
        updates.push({ key: "admin_password", value: adminPassword.trim(), updated_at: new Date().toISOString() });
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

  // ----------------- TV DO PÁTIO (playlist pública + gestão admin) -----------------
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

  async function fetchTvChimeScheduleNormalized() {
    if (!supabaseAdmin || !WORKSHOP_ID) {
      return normalizeTvChimeConfig(null);
    }
    const { data, error } = await supabaseAdmin
      .from("workshop_tv_chime_schedule")
      .select("config")
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    if (error && (error as { code?: string }).code !== "PGRST116") {
      console.error("[API] TV chime schedule:", error.message);
    }
    return normalizeTvChimeConfig((data as { config?: unknown } | null)?.config ?? null);
  }

  async function fetchTvPlaylistForWorkshop(): Promise<{
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
    const { data: slideRows, error: slideErr } = await supabaseAdmin
      .from("workshop_tv_slides")
      .select(
        "id, slide_type, title, body, media_url, duration_seconds, sort_order, is_active, goal_current, goal_target, goal_label, play_sound, goal_show_values, pin_immediate, media_object_fit"
      )
      .eq("workshop_id", WORKSHOP_ID)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (slideErr) {
      console.error("[API] TV slides:", slideErr);
    }

    const slides = (slideRows ?? []).map((row: Record<string, unknown>) => {
      const parsed = parseTvBodyAndFullscreen(row.body);
      const st = String(row.slide_type ?? "");
      const hasMedia = row.media_url != null && String(row.media_url).trim() !== "";
      /** Na TV, imagem/vídeo com URL ocupam a área inteira (sem cabeçalho de marca no cliente). */
      const mediaFullscreen =
        (st === "image" || st === "video") && hasMedia ? true : parsed.mediaFullscreen;
      return {
        id: row.id,
        slideType: row.slide_type,
        title: row.title ?? "",
        body: parsed.body,
        mediaUrl: row.media_url ?? null,
        durationSeconds: row.duration_seconds ?? 10,
        sortOrder: row.sort_order ?? 0,
        goalCurrent: row.goal_current != null ? Number(row.goal_current) : null,
        goalTarget: row.goal_target != null ? Number(row.goal_target) : null,
        goalLabel: row.goal_label ?? null,
        playSound: (row as { play_sound?: boolean }).play_sound === true,
        goalShowValues: (row as { goal_show_values?: boolean }).goal_show_values === true,
        pinImmediate: (row as { pin_immediate?: boolean }).pin_immediate === true,
        mediaFullscreen,
        mediaObjectFit: normalizeTvMediaObjectFit((row as { media_object_fit?: unknown }).media_object_fit),
      };
    });

    const { data: goalRow } = await supabaseAdmin
      .from("workshop_tv_weekly_goal")
      .select("label, current_amount, target_amount, show_weekly_bar")
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();

    const weeklyGoal = goalRow
      ? {
          label: String((goalRow as { label?: string }).label ?? "Meta semanal"),
          currentAmount: Number((goalRow as { current_amount?: number }).current_amount ?? 0),
          targetAmount: Number((goalRow as { target_amount?: number }).target_amount ?? 0),
          showWeeklyBar: (goalRow as { show_weekly_bar?: boolean }).show_weekly_bar !== false,
        }
      : null;

    const chimeSchedule = await fetchTvChimeScheduleNormalized();
    return { slides, weeklyGoal, chimeSchedule };
  }

  /** Playlist para o painel da TV (sem autenticação; CORS já limita origem do Patio-View). */
  app.get("/api/tv/playlist", async (_req, res) => {
    try {
      const { slides, weeklyGoal, chimeSchedule } = await fetchTvPlaylistForWorkshop();
      return res.json({ slides, weeklyGoal, chimeSchedule });
    } catch (err: any) {
      console.error("[API] GET /api/tv/playlist:", err);
      return res.status(500).json({ error: err?.message ?? "Erro ao carregar playlist da TV." });
    }
  });

  /** Lista completa (inclui inativos) para tela de gestão — mesmo acesso do app logado (sem senha extra). */
  app.get("/api/tv/manage", async (_req, res) => {
    try {
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const { data: slideRows, error } = await supabaseAdmin
        .from("workshop_tv_slides")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      const slides = (slideRows ?? []).map((row: Record<string, unknown>) => {
        const parsed = parseTvBodyAndFullscreen(row.body);
        return {
          id: row.id,
          slideType: row.slide_type,
          title: row.title ?? "",
          body: parsed.body,
          mediaUrl: row.media_url ?? null,
          durationSeconds: row.duration_seconds ?? 10,
          sortOrder: row.sort_order ?? 0,
          isActive: row.is_active === true,
          goalCurrent: row.goal_current != null ? Number(row.goal_current) : null,
          goalTarget: row.goal_target != null ? Number(row.goal_target) : null,
          goalLabel: row.goal_label ?? null,
          playSound: (row as { play_sound?: boolean }).play_sound === true,
          goalShowValues: (row as { goal_show_values?: boolean }).goal_show_values === true,
          pinImmediate: (row as { pin_immediate?: boolean }).pin_immediate === true,
          mediaFullscreen: parsed.mediaFullscreen,
          mediaObjectFit: normalizeTvMediaObjectFit((row as { media_object_fit?: unknown }).media_object_fit),
        };
      });

      const { data: goalRow } = await supabaseAdmin
        .from("workshop_tv_weekly_goal")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .maybeSingle();

      const weeklyGoal = goalRow
        ? {
            label: String((goalRow as { label?: string }).label ?? "Meta semanal"),
            currentAmount: Number((goalRow as { current_amount?: number }).current_amount ?? 0),
            targetAmount: Number((goalRow as { target_amount?: number }).target_amount ?? 0),
            showWeeklyBar: (goalRow as { show_weekly_bar?: boolean }).show_weekly_bar !== false,
          }
        : null;

      const chimeSchedule = await fetchTvChimeScheduleNormalized();
      res.setHeader("Cache-Control", "no-store");
      return res.json({ slides, weeklyGoal, chimeSchedule });
    } catch (err: any) {
      console.error("[API] GET /api/tv/manage:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.put("/api/tv/weekly-goal", async (req, res) => {
    try {
      const { label, currentAmount, targetAmount, showWeeklyBar } = req.body || {};
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const row = {
        workshop_id: WORKSHOP_ID,
        label: typeof label === "string" && label.trim() ? label.trim() : "Meta semanal",
        current_amount: Number(currentAmount) || 0,
        target_amount: Number(targetAmount) || 0,
        show_weekly_bar: showWeeklyBar !== false,
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabaseAdmin.from("workshop_tv_weekly_goal").upsert(row, {
        onConflict: "workshop_id",
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

  app.delete("/api/tv/weekly-goal", async (_req, res) => {
    try {
      if (!WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      if (!supabaseAdmin) {
        return res.status(500).json({ error: "Supabase não configurado." });
      }
      const { error } = await supabaseAdmin
        .from("workshop_tv_weekly_goal")
        .delete()
        .eq("workshop_id", WORKSHOP_ID);
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] DELETE /api/tv/weekly-goal:", err);
      return res.status(500).json({ error: err?.message ?? "Erro" });
    }
  });

  app.put("/api/tv/chime-schedule", async (req, res) => {
    try {
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
          config,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workshop_id" }
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
      const slideType = String(s.slideType ?? "notice");
      if (!["notice", "image", "video", "goal", "alert"].includes(slideType)) {
        return res.status(400).json({ error: "slideType inválido." });
      }
      const mediaFullscreen = s.mediaFullscreen === true;
      const mediaObjectFit = normalizeTvMediaObjectFit(s.mediaObjectFit);
      const insert = {
        workshop_id: WORKSHOP_ID,
        slide_type: slideType,
        title: s.title != null ? String(s.title) : null,
        body: buildTvBodyWithFullscreen(s.body, mediaFullscreen),
        media_url: s.mediaUrl != null && String(s.mediaUrl).trim() ? String(s.mediaUrl).trim() : null,
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
      const { data, error } = await supabaseAdmin.from("workshop_tv_slides").insert(insert).select("id").single();
      if (error) {
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json({ id: data?.id });
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
      if (s.mediaUrl !== undefined) updates.media_url = s.mediaUrl != null && String(s.mediaUrl).trim() ? String(s.mediaUrl).trim() : null;
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
          const { error: clearErr } = await supabaseAdmin
            .from("workshop_tv_slides")
            .update({ pin_immediate: false, updated_at: new Date().toISOString() })
            .eq("workshop_id", WORKSHOP_ID);
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

      const { error } = await supabaseAdmin
        .from("workshop_tv_slides")
        .update(updates)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) {
        return res.status(500).json({ error: error.message });
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

  /** Upload de imagem ou vídeo para a TV (Storage público). Multipart: file */
  app.post("/api/tv/media/upload", tvMediaUpload.single("file"), async (req, res) => {
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
      const mime = String(file.mimetype || "");
      if (!mime.startsWith("image/") && !mime.startsWith("video/")) {
        return res.status(400).json({ error: "Apenas arquivos de imagem ou vídeo são permitidos." });
      }
      let ext = path.extname(file.originalname || "").replace(/^\./, "").toLowerCase();
      if (!ext || !/^[a-z0-9]{2,8}$/.test(ext)) {
        const map: Record<string, string> = {
          "image/jpeg": "jpg",
          "image/png": "png",
          "image/webp": "webp",
          "image/gif": "gif",
          "video/mp4": "mp4",
          "video/webm": "webm",
          "video/quicktime": "mov",
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
      return res.json({ url: publicUrl });
    } catch (err: any) {
      console.error("[API] POST /api/tv/media/upload:", err);
      return res.status(500).json({ error: err?.message ?? "Erro no upload." });
    }
  });

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
    "id, os_number, customer_id, vehicle_model, vehicle_brand, module_identification, plate, mileage_km, delivery_date, issue_description, ai_analysis, status, assigned_technician, garantia_tag, order_type, vehicle_category, vehicle_color, vehicle_year, vehicle_engine_info, reference_links, diagnostic_authorization_signed_at, diagnostic_authorization_signature_path, created_at, updated_at";
  const SERVICE_ORDERS_PAGE_SIZE = 1000;

  /** PostgREST limita ~1000 linhas por request — pagina até trazer todas as OS da oficina. */
  async function fetchAllServiceOrderRows(filters: {
    status?: string;
    orderType?: string;
  }): Promise<Record<string, unknown>[]> {
    if (!supabaseAdmin || !WORKSHOP_ID) return [];
    const all: Record<string, unknown>[] = [];
    let offset = 0;
    for (;;) {
      let query = supabaseAdmin
        .from("service_orders")
        .select(SERVICE_ORDERS_LIST_SELECT)
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

      const techValues = [...new Set(rows.map((r: { assigned_technician?: string | null }) => r.assigned_technician).filter(Boolean))] as string[];
      const technicianNameMap: Record<string, string> = {};

      if (techValues.length > 0) {
        const looksLikeUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
        const uuids = techValues.filter(looksLikeUuid);
        const slugs = techValues.filter((v) => !looksLikeUuid(v));

        if (uuids.length > 0) {
          const { data: techUsers } = await supabaseAdmin
            .from("workshop_system_users")
            .select("id, display_name, username")
            .eq("workshop_id", WORKSHOP_ID)
            .in("id", uuids);
          (techUsers ?? []).forEach((u: { id: string; display_name?: string | null; username?: string | null }) => {
            technicianNameMap[u.id] = (u.display_name || u.username || "").trim() || "Técnico";
          });
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

  /** Orçamentos de veículos em OS ativas no Pátio (exclui arquivadas) — hub na home + badge. */
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
        .select("id, status, plate, vehicle_model, vehicle_brand, os_number, customer_id")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("order_type", "vehicle")
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
        .select("id, service_order_id, created_at, updated_at, diagnosis, services, parts, observations, card_name")
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
            }
          | undefined;
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
          customerName: cid && customerNameMap[cid] ? customerNameMap[cid] : null,
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
      } = req.body;

      const orderType = bodyOrderType === "module" ? "module" : "vehicle";

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
          error: "Para módulos: preencha ao menos Veículo ou Identificação do módulo.",
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

      const trimOrNull = (v: unknown) => {
        if (v == null) return null;
        const t = String(v).trim();
        return t === "" ? null : t;
      };
      const vehicleColorIns =
        orderType === "vehicle" ? trimOrNull(bodyVehicleColor) : null;
      const vehicleYearIns =
        orderType === "vehicle" ? trimOrNull(bodyVehicleYear) : null;
      const vehicleEngineInfoIns =
        orderType === "vehicle" ? trimOrNull(bodyVehicleEngineInfo) : null;
      const vehicleBrandIns =
        orderType === "vehicle" ? trimOrNull(bodyVehicleBrand) : null;

      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .insert({
          workshop_id: WORKSHOP_ID,
          os_number: nextOsNumber,
          customer_id: customerId,
          vehicle_model: vehicleModel ?? null,
          vehicle_brand: vehicleBrandIns,
          module_identification: orderType === "module" ? (moduleIdentification ?? null) : null,
          plate: orderType === "vehicle" ? String(plate || '').toUpperCase() : null,
          mileage_km: orderType === "vehicle" && mileageKm != null && String(mileageKm).trim() !== '' ? String(mileageKm).trim() : null,
          issue_description: issueDescription ?? null,
          ai_analysis: aiAnalysis ?? null,
          status: FIRST_STAGE,
          order_type: orderType,
          vehicle_category: vehicleCategoryTrimmed,
          vehicle_color: vehicleColorIns,
          vehicle_year: vehicleYearIns,
          vehicle_engine_info: vehicleEngineInfoIns,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[API] Erro ao criar service_order:", error);
        return res.status(500).json({ error: error.message });
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

        const { error: uploadError } = await supabaseAdmin.storage
          .from(bucket)
          .upload(pathInBucket, file.buffer, {
            contentType: file.mimetype,
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
        .select("id, service_order_id, card_name, diagnosis, services, parts, observations, created_at, updated_at")
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
      return res.json(rows);
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
          .select("id, service_order_id, card_name, diagnosis, services, parts, observations, created_at, updated_at")
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
      return res.status(201).json(created);
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
          .select("id, service_order_id, card_name, diagnosis, services, parts, observations, created_at, updated_at")
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

      const updated = Array.isArray(data) ? data[0] : data;
      if (!updated) {
        return res.status(404).json({ error: "Orçamento não encontrado." });
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

      return res.json(updated);
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/service-orders/:id/budgets/:budgetId:", err);
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

  // ----------------- ESTOQUE DE PEÇAS (para orçamentos) -----------------
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
        .select("id, name, unit_price, stock_qty, photo_url, sort_order, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      if (error) {
        console.error("[API] Erro ao listar peças:", error);
        return res.status(500).json({ error: error.message });
      }

      const list = data ?? [];
      const catMap = await loadWorkshopPartCategoryMap(list.map((p: { id: string }) => p.id));
      return res.json(workshopPartsWithCategories(list as Record<string, unknown>[], catMap));
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

      const { name, unit_price, stock_qty, photo_url } = req.body || {};
      const trimmed = typeof name === "string" ? name.trim() : "";
      const unitPrice = Number(unit_price ?? 0);
      const stockQty = Number(stock_qty ?? 0);

      if (!trimmed) {
        return res.status(400).json({ error: "Nome da peça é obrigatório." });
      }
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return res.status(400).json({ error: "Preço unitário inválido." });
      }
      if (!Number.isFinite(stockQty) || stockQty < 0) {
        return res.status(400).json({ error: "Quantidade em estoque inválida." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_parts")
        .insert({
          workshop_id: WORKSHOP_ID,
          name: trimmed,
          unit_price: unitPrice,
          stock_qty: stockQty,
          photo_url: typeof photo_url === "string" && photo_url.trim() ? photo_url.trim() : null,
          sort_order: 0,
        })
        .select("id, name, unit_price, stock_qty, photo_url, sort_order, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe uma peça com este nome." });
        }
        console.error("[API] Erro ao criar peça:", error);
        return res.status(500).json({ error: error.message });
      }

      const catMap = await loadWorkshopPartCategoryMap([data.id]);
      return res.status(201).json({ ...data, category_ids: catMap.get(data.id) ?? [] });
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
      const { name, unit_price, stock_qty, photo_url } = req.body || {};
      const patch: Record<string, any> = {};

      if (name !== undefined) {
        const trimmed = String(name).trim();
        if (!trimmed) return res.status(400).json({ error: "Nome da peça é obrigatório." });
        patch.name = trimmed;
      }
      if (unit_price !== undefined) {
        const unitPrice = Number(unit_price);
        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
          return res.status(400).json({ error: "Preço unitário inválido." });
        }
        patch.unit_price = unitPrice;
      }
      if (stock_qty !== undefined) {
        const stockQty = Number(stock_qty);
        if (!Number.isFinite(stockQty) || stockQty < 0) {
          return res.status(400).json({ error: "Quantidade em estoque inválida." });
        }
        patch.stock_qty = stockQty;
      }
      if (photo_url !== undefined) {
        patch.photo_url = typeof photo_url === "string" && photo_url.trim() ? photo_url.trim() : null;
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_parts")
        .update(patch)
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, name, unit_price, stock_qty, photo_url, sort_order, created_at")
        .single();

      if (error) {
        if (error.code === "23505") {
          return res.status(409).json({ error: "Já existe uma peça com este nome." });
        }
        console.error("[API] Erro ao atualizar peça:", error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) return res.status(404).json({ error: "Peça não encontrada." });
      const catMap = await loadWorkshopPartCategoryMap([data.id]);
      return res.json({ ...data, category_ids: catMap.get(data.id) ?? [] });
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

  /** Upload da foto da peça do estoque (arquivo de imagem). */
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
      if (!id) return res.status(400).json({ error: "ID da peça é obrigatório." });
      if (!file) return res.status(400).json({ error: "Arquivo não enviado." });
      const mime = file.mimetype || "application/octet-stream";
      if (!mime.startsWith("image/")) {
        return res.status(400).json({ error: "Envie apenas imagem." });
      }

      const bucket = VEHICLE_PHOTOS_BUCKET;
      const ext = (file.originalname?.split(".").pop() || "jpg").toLowerCase();
      const safeExt = /^[a-z0-9]+$/.test(ext) ? ext : "jpg";
      const pathInBucket = `workshops/${WORKSHOP_ID}/parts/${id}_${Date.now()}.${safeExt}`;

      const { error: uploadErr } = await supabaseAdmin.storage
        .from(bucket)
        .upload(pathInBucket, file.buffer, { contentType: mime, upsert: true });
      if (uploadErr) {
        console.error("[API] Erro upload foto da peça:", uploadErr);
        return res.status(500).json({ error: uploadErr.message });
      }

      const { data: { publicUrl } } = supabaseAdmin.storage.from(bucket).getPublicUrl(pathInBucket);
      const photoUrlWithCacheBust = `${publicUrl}${publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;

      const { data, error } = await supabaseAdmin
        .from("workshop_parts")
        .update({ photo_url: photoUrlWithCacheBust })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, name, unit_price, stock_qty, photo_url, sort_order, created_at")
        .single();
      if (error) {
        console.error("[API] Erro ao atualizar foto da peça:", error);
        return res.status(500).json({ error: error.message });
      }
      const catMap = await loadWorkshopPartCategoryMap([data.id]);
      return res.json({ ...data, category_ids: catMap.get(data.id) ?? [] });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/workshop-parts/:id/photo:", err);
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
        .select("id, name, unit_price, stock_qty, photo_url, sort_order, created_at")
        .eq("id", partId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      if (fullErr || !fullPart) {
        return res.status(500).json({ error: fullErr?.message ?? "Peça não encontrada após atualizar." });
      }
      const catMap = await loadWorkshopPartCategoryMap([partId]);
      return res.json({ ...fullPart, category_ids: catMap.get(partId) ?? [] });
    } catch (err: any) {
      console.error("[API] Erro em PUT /api/workshop-parts/:partId/categories:", err);
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
        vehicleModel,
        moduleIdentification,
        plate,
        orderType: bodyOrderType,
        vehicleCategory: bodyVehicleCategoryPut,
        referenceLinks: bodyReferenceLinks,
        vehicleColor: bodyVehicleColorPut,
        vehicleYear: bodyVehicleYearPut,
        vehicleEngineInfo: bodyVehicleEngineInfoPut,
        vehicleBrand: bodyVehicleBrandPut,
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
      if (plate !== undefined) {
        updatePayload.plate = typeof plate === "string" ? String(plate).trim().toUpperCase() : "";
      }
      if (mileageKm !== undefined) {
        updatePayload.mileage_km = mileageKm == null || String(mileageKm).trim() === '' ? null : String(mileageKm).trim();
      }
      if (deliveryDate !== undefined) {
        updatePayload.delivery_date = deliveryDate == null || String(deliveryDate).trim() === '' ? null : String(deliveryDate).trim();
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
        .select("status, issue_description, delivery_date, assigned_technician, plate, vehicle_model, customers(name)")
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .single();

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
      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .update({ status: CANCELLED_STATUS, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id")
        .single();
      if (error) {
        console.error("[API] Falha ao arquivar OS:", id, error);
        return res.status(500).json({ error: error.message || "Falha ao arquivar a ordem de serviço." });
      }
      if (!data) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
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

  function accompanimentBudgetHasApproved(b: { services?: unknown; parts?: unknown }): boolean {
    const sv = Array.isArray(b.services) ? b.services : [];
    const pt = Array.isArray(b.parts) ? b.parts : [];
    const svcHit = sv.some((s: { approved?: unknown }) => s && s.approved === true);
    const partHit = pt.some((p: { approved?: unknown }) => p && p.approved === true);
    return svcHit || partHit;
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
      return res.json(row ?? null);
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
        return res.json(existing);
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
      if (!Array.isArray(photosRaw)) {
        return res.status(400).json({ error: "intake_photos deve ser um array." });
      }
      const photos = photosRaw.map((p: unknown, i: number) => {
        if (!p || typeof p !== "object") return null;
        const o = p as Record<string, unknown>;
        const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : `ph_${i}`;
        const path = typeof o.path === "string" && o.path.trim() ? o.path.trim() : "";
        if (!path) return null;
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
        return { id, path, markers };
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
      const { error } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .update({
          intake_observations: obs,
          intake_photos: photos,
          updated_at: new Date().toISOString(),
        })
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID);
      if (error) {
        console.error("[API] PUT vehicle-accompaniment:", error);
        return res.status(500).json({ error: error.message });
      }
      const { data: out } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .select("*")
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .single();
      return res.json(out);
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
      const budgets = (budgetsRaw ?? [])
        .filter((b) => accompanimentBudgetHasApproved(b as { services?: unknown; parts?: unknown }))
        .map((b) => ({
          id: b.id,
          diagnosis: b.diagnosis,
          services: b.services,
          parts: b.parts,
          observations: b.observations,
          created_at: b.created_at,
          updated_at: b.updated_at,
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

  /** Cliente submete avaliação (uma vez). */
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
        .select("id, client_rating_at")
        .eq("share_token", token)
        .maybeSingle();
      if (!acc) {
        return res.status(404).json({ error: "Link inválido." });
      }
      if (acc.client_rating_at) {
        return res.status(409).json({ error: "Avaliação já foi enviada." });
      }
      const a = Number(req.body?.client_rating_attendance);
      const s = Number(req.body?.client_rating_service);
      const r = Number(req.body?.client_rating_recommend);
      const comment =
        typeof req.body?.client_rating_comment === "string" ? req.body.client_rating_comment.trim().slice(0, 2000) : "";
      if (![1, 2, 3, 4, 5].includes(a) || ![1, 2, 3, 4, 5].includes(s) || ![1, 2, 3, 4, 5].includes(r)) {
        return res.status(400).json({ error: "Informe as três avaliações de 1 a 5 estrelas." });
      }
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from("workshop_vehicle_accompaniment")
        .update({
          client_rating_attendance: a,
          client_rating_service: s,
          client_rating_recommend: r,
          client_rating_comment: comment || null,
          client_rating_at: now,
          updated_at: now,
        })
        .eq("id", acc.id)
        .is("client_rating_at", null);
      if (error) {
        console.error("[API] PATCH public vehicle-accompaniment:", error);
        return res.status(500).json({ error: error.message });
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
