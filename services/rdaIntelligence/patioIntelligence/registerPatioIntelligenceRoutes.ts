import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canConfigurePatioThresholds, canViewPatioIntelligence } from "./access.js";
import {
  queryPatioAttentionToday,
  queryPatioBottlenecks,
  queryPatioDashboard,
  queryPatioDeliveryRisks,
  queryPatioPriorities,
  queryPatioReadyToStart,
  queryPatioWaitingParts,
} from "./service.js";
import {
  DEFAULT_PATIO_STAGE_THRESHOLD_HOURS,
  parsePatioThresholds,
  RDA_PATIO_THRESHOLDS_SETTING_KEY,
  serializePatioThresholds,
} from "./thresholds.js";
import type { RdaAuthContext, RdaRole } from "../types.js";

type SessionLike = { r?: string; u?: string; n?: string };

export type RegisterPatioIntelligenceRoutesDeps = {
  WORKSHOP_ID?: string;
  supabaseAdmin?: SupabaseClient | null;
  loadUserPermissions?: (userId: string) => Promise<Record<string, boolean> | null>;
  getWorkshopSettingValue?: (key: string) => Promise<string | null>;
  setWorkshopSettingValue?: (key: string, value: string) => Promise<void>;
};

function authFromReq(req: Request): RdaAuthContext | null {
  const auth = (req as unknown as { auth?: SessionLike }).auth;
  if (!auth?.r) return null;
  return { role: auth.r as RdaRole, userId: auth.u, username: auth.n };
}

async function resolveFlags(
  deps: RegisterPatioIntelligenceRoutesDeps,
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

export function registerPatioIntelligenceRoutes(
  app: Express,
  deps: RegisterPatioIntelligenceRoutesDeps
): void {
  async function requireView(
    req: Request,
    res: Response
  ): Promise<{ workshopId: string; auth: RdaAuthContext; flags: { isTechnician: boolean; permissions: Record<string, boolean> } } | null> {
    const workshopId = deps.WORKSHOP_ID;
    if (!workshopId || !deps.supabaseAdmin) {
      res.status(503).json({ error: "Gestão Inteligente do Pátio indisponível." });
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
      !canViewPatioIntelligence({
        role: auth.role,
        userId: auth.userId,
        flags,
        permissions: flags.permissions,
      })
    ) {
      res.status(403).json({ error: "Sem permissão para Gestão Inteligente do Pátio." });
      return null;
    }
    return { workshopId, auth, flags };
  }

  app.get("/api/rda/patio-intel/dashboard", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const thresholdsRaw = deps.getWorkshopSettingValue
        ? await deps.getWorkshopSettingValue(RDA_PATIO_THRESHOLDS_SETTING_KEY)
        : null;
      const data = await queryPatioDashboard({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        thresholdsRaw,
        auth: ctx.auth,
        includeKnowledge: true,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET /api/rda/patio-intel/dashboard:", err);
      return res.status(500).json({ error: "Falha ao montar gestão inteligente do pátio." });
    }
  });

  app.get("/api/rda/patio-intel/attention", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const thresholdsRaw = deps.getWorkshopSettingValue
        ? await deps.getWorkshopSettingValue(RDA_PATIO_THRESHOLDS_SETTING_KEY)
        : null;
      const data = await queryPatioAttentionToday({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        thresholdsRaw,
        auth: ctx.auth,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET patio-intel/attention:", err);
      return res.status(500).json({ error: "Falha ao listar atenção do pátio." });
    }
  });

  app.get("/api/rda/patio-intel/bottlenecks", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const thresholdsRaw = deps.getWorkshopSettingValue
        ? await deps.getWorkshopSettingValue(RDA_PATIO_THRESHOLDS_SETTING_KEY)
        : null;
      const data = await queryPatioBottlenecks({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        thresholdsRaw,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET patio-intel/bottlenecks:", err);
      return res.status(500).json({ error: "Falha ao detectar gargalos." });
    }
  });

  app.get("/api/rda/patio-intel/priorities", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const thresholdsRaw = deps.getWorkshopSettingValue
        ? await deps.getWorkshopSettingValue(RDA_PATIO_THRESHOLDS_SETTING_KEY)
        : null;
      const data = await queryPatioPriorities({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        thresholdsRaw,
        limit: req.query.limit != null ? Number(req.query.limit) : 20,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET patio-intel/priorities:", err);
      return res.status(500).json({ error: "Falha ao sugerir prioridades." });
    }
  });

  app.get("/api/rda/patio-intel/risks", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const data = await queryPatioDeliveryRisks({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET patio-intel/risks:", err);
      return res.status(500).json({ error: "Falha ao calcular riscos de entrega." });
    }
  });

  app.get("/api/rda/patio-intel/waiting-parts", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const data = await queryPatioWaitingParts({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET patio-intel/waiting-parts:", err);
      return res.status(500).json({ error: "Falha ao listar aguardando peças." });
    }
  });

  app.get("/api/rda/patio-intel/ready-to-start", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const data = await queryPatioReadyToStart({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET patio-intel/ready-to-start:", err);
      return res.status(500).json({ error: "Falha ao listar prontos para iniciar." });
    }
  });

  app.get("/api/rda/patio-intel/thresholds", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      const raw = deps.getWorkshopSettingValue
        ? await deps.getWorkshopSettingValue(RDA_PATIO_THRESHOLDS_SETTING_KEY)
        : null;
      const thresholds = parsePatioThresholds(raw);
      return res.json({
        ok: true,
        thresholds,
        defaults: DEFAULT_PATIO_STAGE_THRESHOLD_HOURS,
        settingKey: RDA_PATIO_THRESHOLDS_SETTING_KEY,
        canConfigure: canConfigurePatioThresholds({
          role: ctx.auth.role,
          userId: ctx.auth.userId,
          flags: ctx.flags,
        }),
      });
    } catch (err) {
      console.error("[API] GET patio-intel/thresholds:", err);
      return res.status(500).json({ error: "Falha ao ler limiares." });
    }
  });

  app.put("/api/rda/patio-intel/thresholds", async (req, res) => {
    try {
      const ctx = await requireView(req, res);
      if (!ctx) return;
      if (
        !canConfigurePatioThresholds({
          role: ctx.auth.role,
          userId: ctx.auth.userId,
          flags: ctx.flags,
        })
      ) {
        return res.status(403).json({ error: "Somente gestão pode alterar limiares." });
      }
      if (!deps.setWorkshopSettingValue) {
        return res.status(503).json({ error: "Persistência de settings indisponível." });
      }
      const body = (req.body || {}) as { thresholds?: Record<string, number> };
      const merged = parsePatioThresholds(
        JSON.stringify({ ...DEFAULT_PATIO_STAGE_THRESHOLD_HOURS, ...(body.thresholds || {}) })
      );
      const serialized = serializePatioThresholds(merged);
      await deps.setWorkshopSettingValue(RDA_PATIO_THRESHOLDS_SETTING_KEY, serialized);
      return res.json({ ok: true, thresholds: merged });
    } catch (err) {
      console.error("[API] PUT patio-intel/thresholds:", err);
      return res.status(500).json({ error: "Falha ao salvar limiares." });
    }
  });
}
