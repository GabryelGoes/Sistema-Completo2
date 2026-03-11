import "dotenv/config";
import crypto from "crypto";
import express from "express";
import multer from "multer";
import { supabaseAdmin, VEHICLE_PHOTOS_BUCKET } from "./supabaseClient.js";
import { FIRST_STAGE, ALL_STATUSES } from "./constants/serviceOrderStages.js";

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

export function createApiApp() {
  const app = express();
  const WORKSHOP_ID = process.env.WORKSHOP_ID;
  app.use(express.json());

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
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
    const expected = await getAdminPassword();
    return String(password).trim() === expected;
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
      return res.json({
        patioLoginEnabled: map.patio_login_enabled !== "false",
        patioPin: map.patio_pin || DEFAULT_PATIO_PIN,
        technicianAccessReception: map.technician_access_reception === "true",
        technicianAccessAgenda: map.technician_access_agenda === "true",
        technicianAccessPatio: map.technician_access_patio !== "false",
        adminDisplayName: map.admin_display_name || "Rei do ABS",
        adminPhotoUrl: map.admin_photo_url || null,
        vehicleDeletePassword: map.vehicle_delete_password || "",
      });
    } catch (err: any) {
      console.error("[API] Erro em GET /api/workshop-settings:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  app.put("/api/workshop-settings", async (req, res) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { patioLoginEnabled, patioPin, adminPassword, adminDisplayName, adminPhotoUrl, technicianAccessReception, technicianAccessAgenda, technicianAccessPatio, vehicleDeletePassword } = req.body || {};
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
        .in("key", ["patio_login_enabled", "patio_pin", "technician_access_reception", "technician_access_agenda", "technician_access_patio", "admin_display_name", "admin_photo_url", "vehicle_delete_password"]);
      const map = (data || []).reduce((acc: Record<string, string>, r: { key: string; value: string | null }) => {
        acc[r.key] = r.value ?? "";
        return acc;
      }, {});
      return res.json({
        patioLoginEnabled: map.patio_login_enabled !== "false",
        patioPin: map.patio_pin || "",
        technicianAccessReception: map.technician_access_reception === "true",
        technicianAccessAgenda: map.technician_access_agenda === "true",
        technicianAccessPatio: map.technician_access_patio !== "false",
        adminDisplayName: map.admin_display_name || "Rei do ABS",
        adminPhotoUrl: map.admin_photo_url || null,
        vehicleDeletePassword: map.vehicle_delete_password || "",
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

      const { name, cpf, phone, email, cep, address, addressNumber } = req.body;

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
      const { name, cpf, phone, email, cep, address, addressNumber } = req.body;
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = String(name).trim();
      if (cpf !== undefined) updates.cpf = cpf == null || String(cpf).trim() === "" ? null : String(cpf).trim();
      if (phone !== undefined) updates.phone = String(phone).trim();
      if (email !== undefined) updates.email = email == null || String(email).trim() === "" ? null : String(email).trim();
      if (cep !== undefined) updates.cep = cep == null || String(cep).trim() === "" ? null : String(cep).trim();
      if (address !== undefined) updates.address = address == null || String(address).trim() === "" ? null : String(address).trim();
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

  // ----------------- ORDENS DE SERVIÇO -----------------
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

      let query = supabaseAdmin
        .from("service_orders")
        .select(
          "id, customer_id, vehicle_model, module_identification, plate, mileage_km, delivery_date, issue_description, ai_analysis, status, assigned_technician, garantia_tag, order_type, created_at, updated_at, customers(id, name, phone)"
        )
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false });

      if (status) {
        query = query.eq("status", status);
      }
      if (orderType === "vehicle" || orderType === "module") {
        query = query.eq("order_type", orderType);
      }

      const { data, error } = await query;

      if (error) {
        console.error("[API] Erro ao listar service_orders:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data);
    } catch (err: any) {
      console.error("[API] Erro inesperado em GET /api/service-orders:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
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

      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .insert({
          workshop_id: WORKSHOP_ID,
          customer_id: customerId,
          vehicle_model: vehicleModel ?? null,
          module_identification: orderType === "module" ? (moduleIdentification ?? null) : null,
          plate: orderType === "vehicle" ? String(plate || '').toUpperCase() : null,
          mileage_km: orderType === "vehicle" && mileageKm != null && String(mileageKm).trim() !== '' ? String(mileageKm).trim() : null,
          issue_description: issueDescription ?? null,
          ai_analysis: aiAnalysis ?? null,
          status: FIRST_STAGE,
          order_type: orderType,
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

        const serviceOrderId = req.params.id;
        const file = req.file;

        if (!file) {
          return res.status(400).json({ error: "Arquivo não enviado." });
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
        const safeName = file.originalname.replace(/\s+/g, "_");
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

        return res.status(201).json({
          url: publicUrl,
          path: pathInBucket,
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

      const { id: serviceOrderId } = req.params;
      const { path: currentPath, newName } = req.body as { path?: string; newName?: string };

      if (!currentPath || typeof currentPath !== "string" || !newName || typeof newName !== "string") {
        return res.status(400).json({ error: "Corpo inválido: envie path e newName." });
      }

      const trimmedNewName = newName.trim().replace(/\s+/g, "_");
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

      const newPath = `${folderPath}/${trimmedNewName}`;
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

      return res.json({
        url: publicUrl,
        name: trimmedNewName,
        path: newPath,
      });
    } catch (err: any) {
      console.error("[API] Erro em PATCH /api/service-orders/:id/photos/rename:", err);
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
        .select("id, service_order_id, card_name, diagnosis, services, parts, observations, created_at")
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("[API] Erro ao listar orçamentos:", error);
        return res.status(500).json({ error: error.message });
      }

      return res.json(data ?? []);
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

      const { data, error } = await supabaseAdmin
        .from("budgets")
        .insert(payload)
        .select("id, service_order_id, card_name, diagnosis, services, parts, observations, created_at")
        .single();

      if (error) {
        console.error("[API] Erro ao criar orçamento:", error);
        return res.status(500).json({ error: error.message });
      }

      const budgetPayload = {
        service_order_id: serviceOrderId,
        vehicle_plate: so?.plate ?? null,
        vehicle_model: so?.vehicle_model ?? null,
        customer_name: customerNameBudget || null,
      };
      const isTechnicianActor = actor === "technician" && (typeof actorTechnicianSlug === "string" || typeof actorTechnicianName === "string");
      if (isTechnicianActor) {
        const technicianLabel = typeof actorTechnicianName === "string" && actorTechnicianName.trim() ? actorTechnicianName.trim() : (actorTechnicianSlug || "Técnico");
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "budget_created",
          payload: { ...budgetPayload, technician_name: technicianLabel },
          target_type: "admin",
          target_slug: null,
        }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_created:", e); });
      } else if (so?.assigned_technician) {
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "budget_created",
          payload: budgetPayload,
          target_type: "technician",
          target_slug: so.assigned_technician,
        }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_created (técnico):", e); });
      }

      return res.status(201).json(data);
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

      const updatePayload: Record<string, unknown> = {
        card_name: cardName ?? null,
        diagnosis: typeof diagnosis === "string" ? diagnosis : "",
        services: Array.isArray(services) ? services : [],
        parts: Array.isArray(parts) ? parts : [],
        observations: typeof observations === "string" ? observations : "",
      };

      const { data, error } = await supabaseAdmin
        .from("budgets")
        .update(updatePayload)
        .eq("id", budgetId)
        .eq("service_order_id", serviceOrderId)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, service_order_id, card_name, diagnosis, services, parts, observations, created_at")
        .single();

      if (error) {
        console.error("[API] Erro ao atualizar orçamento:", error);
        return res.status(500).json({ error: error.message });
      }

      if (!data) {
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
        const technicianLabel = typeof actorTechnicianName === "string" && actorTechnicianName.trim() ? actorTechnicianName.trim() : (actorTechnicianSlug || "Técnico");
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "budget_edited",
          payload: { ...budgetEditPayload, technician_name: technicianLabel },
          target_type: "admin",
          target_slug: null,
        }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_edited:", e); });
      } else if (so?.assigned_technician) {
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "budget_edited",
          payload: budgetEditPayload,
          target_type: "technician",
          target_slug: so.assigned_technician,
        }).then(({ error: e }) => { if (e) console.error("[API] Notificação budget_edited (técnico):", e); });
      }

      return res.json(data);
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
      const { text, authorDisplayName } = req.body;

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

      const isAdminComment = /rei\s*do\s*abs/i.test(author);
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

      // Admin só recebe notificação de comentários feitos por técnicos (não dos seus próprios)
      if (!isAdminComment) {
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "comment",
          payload: commentPayload,
          target_type: "admin",
          target_slug: null,
        }).then(({ error: notifErr }) => { if (notifErr) console.error("[API] Erro ao criar notificação de comentário (admin):", notifErr); });
      }
      if (isAdminComment && so.assigned_technician) {
        await supabaseAdmin.from("notifications").insert({
          workshop_id: WORKSHOP_ID,
          type: "comment",
          payload: commentPayload,
          target_type: "technician",
          target_slug: so.assigned_technician,
        }).then(({ error: notifErr }) => { if (notifErr) console.error("[API] Erro ao criar notificação de comentário (técnico):", notifErr); });
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
        .select("id, type, payload, read_at, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (forWho === "technician" && technicianSlug) {
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
      if (forWho === "technician" && technicianSlug) {
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
      if (forWho === "technician" && technicianSlug) {
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
      const forWho = (req.body?.for ?? req.query.for) === "technician" ? "technician" : "admin";
      const technicianSlug = typeof (req.body?.slug ?? req.query.slug) === "string" ? String(req.body?.slug ?? req.query.slug).trim() : "";
      let updateQuery = supabaseAdmin
        .from("notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("workshop_id", WORKSHOP_ID)
        .is("read_at", null);
      if (forWho === "technician" && technicianSlug) {
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
        .select("id, name, sort_order, created_at")
        .eq("workshop_id", WORKSHOP_ID)
        .order("sort_order", { ascending: true })
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

      const { name } = req.body;
      const trimmed = typeof name === "string" ? name.trim() : "";

      if (!trimmed) {
        return res.status(400).json({ error: "Nome do serviço é obrigatório." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_services")
        .insert({
          workshop_id: WORKSHOP_ID,
          name: trimmed,
          sort_order: 0,
        })
        .select("id, name, sort_order, created_at")
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
      const { name } = req.body;
      const trimmed = typeof name === "string" ? name.trim() : "";

      if (!trimmed) {
        return res.status(400).json({ error: "Nome do serviço é obrigatório." });
      }

      const { data, error } = await supabaseAdmin
        .from("workshop_services")
        .update({ name: trimmed })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id, name, sort_order, created_at")
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
      const { status, issueDescription, aiAnalysis, assignedTechnician, garantiaTag, mileageKm, deliveryDate, vehicleModel, moduleIdentification, plate, actor, actorTechnicianSlug, actorTechnicianName } = req.body;
      const isAdminActor = actor !== "technician";

      const updatePayload: any = {};
      if (vehicleModel !== undefined) {
        updatePayload.vehicle_model = typeof vehicleModel === "string" ? vehicleModel.trim() : "";
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
        if (isAdminActor && techSlug) {
          // Ações do admin: notificar apenas o técnico
          if (updatePayload.status !== undefined && previous.status !== data?.status) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "stage_change",
              payload: { ...payloadBase, new_status: data?.status },
              target_type: "technician",
              target_slug: techSlug,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação stage_change:", e); });
          }
          if (updatePayload.issue_description !== undefined && previous.issue_description !== data?.issue_description) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "complaint_edited",
              payload: payloadBase,
              target_type: "technician",
              target_slug: techSlug,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação complaint_edited:", e); });
          }
          if (updatePayload.delivery_date !== undefined && String(previous?.delivery_date ?? "") !== String(data?.delivery_date ?? "")) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "delivery_date_changed",
              payload: { ...payloadBase, delivery_date: data?.delivery_date ?? null },
              target_type: "technician",
              target_slug: techSlug,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação delivery_date_changed:", e); });
          }
        } else if (!isAdminActor && (typeof actorTechnicianSlug === "string" || typeof actorTechnicianName === "string")) {
          // Ações do técnico: notificar apenas o admin (Rei do ABS)
          const technicianLabel = typeof actorTechnicianName === "string" && actorTechnicianName.trim() ? actorTechnicianName.trim() : (actorTechnicianSlug || "Técnico");
          if (updatePayload.status !== undefined && previous.status !== data?.status) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "stage_change",
              payload: { ...payloadBase, new_status: data?.status, technician_name: technicianLabel },
              target_type: "admin",
              target_slug: null,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação stage_change (admin):", e); });
          }
          if (updatePayload.issue_description !== undefined && previous.issue_description !== data?.issue_description) {
            await supabaseAdmin.from("notifications").insert({
              workshop_id: WORKSHOP_ID,
              type: "complaint_edited",
              payload: { ...payloadBase, technician_name: technicianLabel },
              target_type: "admin",
              target_slug: null,
            }).then(({ error: e }) => { if (e) console.error("[API] Notificação complaint_edited (admin):", e); });
          }
          if (updatePayload.delivery_date !== undefined && String(previous?.delivery_date ?? "") !== String(data?.delivery_date ?? "")) {
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
      const expected = await supabaseAdmin
        .from("workshop_settings")
        .select("value")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("key", "vehicle_delete_password")
        .maybeSingle();
      const expectedPassword = expected?.data?.value?.trim() ?? "";
      if (!expectedPassword) {
        return res.status(400).json({ error: "Configure a senha para excluir veículos em Alterar senhas (página inicial)." });
      }
      if (String(password).trim() !== expectedPassword) {
        return res.status(401).json({ error: "Senha incorreta." });
      }
      const { data, error } = await supabaseAdmin
        .from("service_orders")
        .update({ status: "CANCELLED", updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .select("id")
        .single();
      if (error || !data) {
        return res.status(404).json({ error: "Ordem de serviço não encontrada." });
      }
      return res.json({ ok: true });
    } catch (err: any) {
      console.error("[API] Erro em POST /api/service-orders/:id/delete-with-password:", err);
      return res.status(500).json({ error: err?.message ?? "Erro desconhecido" });
    }
  });

  return app;
}
