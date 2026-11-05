import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRdaIntelligenceEnabled, RDA_INTELLIGENCE_SETTING_KEY } from "../featureFlag.js";
import type { RdaAuthContext, RdaRole } from "../types.js";
import {
  canConfigureProactiveMonitor,
  canMutateProactiveAlerts,
  canViewProactiveIntelligence,
} from "./access.js";
import { runProactiveScan } from "./runner.js";
import {
  loadProactiveMonitorConfig,
  queryProactiveDashboard,
  saveProactiveMonitorConfig,
  transitionProactiveAlert,
  listAlertEvents,
  listProactiveAlerts,
  filterAlertsForAuth,
} from "./service.js";
import type { ProactiveAlertStatus, ProactiveCategory, ProactiveSeverity } from "./types.js";

type SessionLike = { r?: string; u?: string; n?: string };

export type RegisterProactiveIntelligenceRoutesDeps = {
  WORKSHOP_ID?: string;
  supabaseAdmin?: SupabaseClient | null;
  loadUserPermissions?: (userId: string) => Promise<Record<string, boolean> | null>;
  getWorkshopSettingValue: (key: string) => Promise<string | null>;
  setWorkshopSettingValue?: (key: string, value: string) => Promise<void>;
};

function authFromReq(req: Request): RdaAuthContext | null {
  const auth = (req as unknown as { auth?: SessionLike }).auth;
  if (!auth?.r) return null;
  return { role: auth.r as RdaRole, userId: auth.u, username: auth.n };
}

async function resolveFlags(
  deps: RegisterProactiveIntelligenceRoutesDeps,
  userId: string | undefined
): Promise<{ isTechnician: boolean; permissions: Record<string, boolean> }> {
  if (!userId || !deps.loadUserPermissions) {
    return { isTechnician: false, permissions: {} };
  }
  const permissions = (await deps.loadUserPermissions(userId)) || {};
  return {
    isTechnician: permissions.is_technician === true,
    permissions,
  };
}

function proactiveSecretOk(req: Request): boolean {
  const expected = (process.env.RDA_PROACTIVE_SCAN_SECRET || "").trim();
  if (!expected) return false;
  const got =
    String(req.headers["x-rda-proactive-secret"] || "").trim() ||
    String((req.body as { secret?: string } | undefined)?.secret || "").trim();
  return got.length > 0 && got === expected;
}

function cronBearerOk(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  return String(req.headers.authorization || "") === `Bearer ${secret}`;
}

export function registerProactiveIntelligenceRoutes(
  app: Express,
  deps: RegisterProactiveIntelligenceRoutesDeps
): void {
  async function requireView(req: Request, res: Response) {
    const workshopId = deps.WORKSHOP_ID;
    if (!workshopId || !deps.supabaseAdmin) {
      res.status(503).json({ error: "Monitoramento Proativo indisponível." });
      return null;
    }
    const auth = authFromReq(req);
    if (!auth) {
      res.status(401).json({ error: "Não autenticado." });
      return null;
    }
    const flags = await resolveFlags(deps, auth.userId);
    auth.permissions = flags.permissions;
    if (
      !canViewProactiveIntelligence({
        role: auth.role,
        userId: auth.userId,
        flags,
        permissions: flags.permissions,
      })
    ) {
      res.status(403).json({ error: "Sem permissão para Monitoramento Proativo." });
      return null;
    }
    return { workshopId, auth, flags };
  }

  app.get("/api/rda/proactive/dashboard", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const data = await queryProactiveDashboard({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        auth: ctx.auth,
        flags: ctx.flags,
        getWorkshopSettingValue: deps.getWorkshopSettingValue,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET proactive/dashboard:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Falha no painel proativo.",
      });
    }
  });

  app.get("/api/rda/proactive/alerts", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const statusQ = String(req.query.status || "").trim();
      const statuses = (
        statusQ
          ? statusQ.split(",").map((s) => s.trim())
          : ["active", "acknowledged"]
      ) as ProactiveAlertStatus[];
      const category = (String(req.query.category || "").trim() || null) as ProactiveCategory | null;
      const severity = (String(req.query.severity || "").trim() || null) as ProactiveSeverity | null;
      const raw = await listProactiveAlerts({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        statuses,
        category,
        severity,
        limit: req.query.limit != null ? Number(req.query.limit) : 80,
      });
      const alerts = filterAlertsForAuth(raw, ctx.auth, ctx.flags);
      return res.json({ ok: true, alerts });
    } catch (err) {
      console.error("[API] GET proactive/alerts:", err);
      return res.status(500).json({ error: "Falha ao listar alertas." });
    }
  });

  app.post("/api/rda/proactive/alerts/:id/transition", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      if (
        !canMutateProactiveAlerts({
          role: ctx.auth.role,
          userId: ctx.auth.userId,
          flags: ctx.flags,
          permissions: ctx.flags.permissions,
        })
      ) {
        return res.status(403).json({ error: "Sem permissão para alterar alertas." });
      }
      const toStatus = String((req.body as { status?: string })?.status || "").trim() as ProactiveAlertStatus;
      if (!["active", "acknowledged", "resolved", "dismissed"].includes(toStatus)) {
        return res.status(400).json({ error: "status inválido." });
      }
      const note = String((req.body as { note?: string })?.note || "").trim() || undefined;
      const alert = await transitionProactiveAlert({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        alertId: String(req.params.id || ""),
        toStatus,
        actorUserId: ctx.auth.userId,
        note,
      });
      if (!alert) return res.status(404).json({ error: "Alerta não encontrado." });
      return res.json({ ok: true, alert });
    } catch (err) {
      console.error("[API] POST proactive transition:", err);
      return res.status(500).json({ error: "Falha ao atualizar alerta." });
    }
  });

  app.get("/api/rda/proactive/alerts/:id/events", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const events = await listAlertEvents({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        alertId: String(req.params.id || ""),
        limit: 50,
      });
      return res.json({ ok: true, events });
    } catch (err) {
      console.error("[API] GET proactive events:", err);
      return res.status(500).json({ error: "Falha ao carregar histórico." });
    }
  });

  app.get("/api/rda/proactive/config", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const config = await loadProactiveMonitorConfig({
        getWorkshopSettingValue: deps.getWorkshopSettingValue,
      });
      return res.json({
        ok: true,
        config,
        canConfigure: canConfigureProactiveMonitor({
          role: ctx.auth.role,
          userId: ctx.auth.userId,
          flags: ctx.flags,
        }),
      });
    } catch (err) {
      return res.status(500).json({ error: "Falha ao ler configuração." });
    }
  });

  app.put("/api/rda/proactive/config", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      if (
        !canConfigureProactiveMonitor({
          role: ctx.auth.role,
          userId: ctx.auth.userId,
          flags: ctx.flags,
        })
      ) {
        return res.status(403).json({ error: "Somente gestão configura o monitor." });
      }
      if (!deps.setWorkshopSettingValue) {
        return res.status(503).json({ error: "Persistência de settings indisponível." });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const config = await saveProactiveMonitorConfig({
        config: {
          enabled: body.enabled !== false && body.enabled !== "false",
          intervalMinutes:
            body.intervalMinutes != null ? Number(body.intervalMinutes) : undefined,
          reopenAfterHours:
            body.reopenAfterHours != null ? Number(body.reopenAfterHours) : undefined,
          notifyOnCreate: body.notifyOnCreate !== false && body.notifyOnCreate !== "false",
        },
        setWorkshopSettingValue: deps.setWorkshopSettingValue,
      });
      return res.json({ ok: true, config });
    } catch (err) {
      console.error("[API] PUT proactive/config:", err);
      return res.status(500).json({ error: "Falha ao salvar configuração." });
    }
  });

  /** Varredura manual (gestão autenticada). */
  app.post("/api/rda/proactive/scan", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      if (
        !canConfigureProactiveMonitor({
          role: ctx.auth.role,
          userId: ctx.auth.userId,
          flags: ctx.flags,
        })
      ) {
        return res.status(403).json({ error: "Acesso gerencial necessário para varredura." });
      }
      const settingValue = await deps.getWorkshopSettingValue(RDA_INTELLIGENCE_SETTING_KEY);
      const result = await runProactiveScan({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        triggerSource: "manual",
        force: true,
        settingValue,
        getWorkshopSettingValue: deps.getWorkshopSettingValue,
      });
      return res.status(result.ok ? 200 : 500).json(result);
    } catch (err) {
      console.error("[API] POST proactive/scan:", err);
      return res.status(500).json({ error: "Falha na varredura proativa." });
    }
  });

  /**
   * Cron autenticado (Vercel CRON_SECRET Bearer OU RDA_PROACTIVE_SCAN_SECRET).
   * GET para Hobby cron; POST para pg_cron/manual secret.
   */
  async function handleCronScan(req: Request, res: Response, fromCronGet: boolean) {
    if (!deps.WORKSHOP_ID || !deps.supabaseAdmin) {
      return res.status(500).json({ error: "Servidor não configurado." });
    }
    const secretOk = proactiveSecretOk(req);
    const cronAuth = fromCronGet && cronBearerOk(req);
    if (!secretOk && !cronAuth) {
      return res.status(403).json({
        error: "Acesso negado (RDA_PROACTIVE_SCAN_SECRET ou CRON_SECRET).",
      });
    }

    const settingValue = await deps.getWorkshopSettingValue(RDA_INTELLIGENCE_SETTING_KEY);
    if (!resolveRdaIntelligenceEnabled({ settingValue })) {
      return res.json({
        ok: true,
        skipped: true,
        skipReason: "rda_intelligence_disabled",
        alertsCreated: 0,
        alertsUpdated: 0,
        alertsReopened: 0,
        alerts: [],
      });
    }

    const body = (req.body || {}) as { force?: boolean };
    const result = await runProactiveScan({
      workshopId: deps.WORKSHOP_ID,
      supabase: deps.supabaseAdmin,
      triggerSource: fromCronGet ? "vercel" : "cron",
      force: body.force === true,
      settingValue,
      getWorkshopSettingValue: deps.getWorkshopSettingValue,
    });
    return res.status(result.ok ? 200 : result.skipped ? 200 : 500).json(result);
  }

  app.get("/api/rda/proactive/scan/cron", async (req, res) => {
    try {
      await handleCronScan(req, res, true);
    } catch (err) {
      console.error("[API] GET proactive/scan/cron:", err);
      return res.status(500).json({ error: "Falha no cron proativo." });
    }
  });

  app.post("/api/rda/proactive/scan/cron", async (req, res) => {
    try {
      await handleCronScan(req, res, false);
    } catch (err) {
      console.error("[API] POST proactive/scan/cron:", err);
      return res.status(500).json({ error: "Falha no cron proativo." });
    }
  });
}
