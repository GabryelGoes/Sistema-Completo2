import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  canConfigureLabThresholds,
  canViewLabEstoqueIntelligence,
  canViewLabIntelligence,
  canViewStockIntelligence,
} from "./access.js";
import {
  queryAbsLocate,
  queryAbsStockSearch,
  queryLabAttention,
  queryLabBenchStatus,
  queryLabBottlenecks,
  queryLabEstoqueDashboard,
  queryLabLongestModules,
  queryLabReadyPickup,
  queryStockLowParts,
  queryStockPartsText,
  queryStockSummary,
} from "./service.js";
import {
  DEFAULT_LAB_STAGE_THRESHOLD_HOURS,
  parseLabThresholds,
  RDA_LAB_THRESHOLDS_SETTING_KEY,
  serializeLabThresholds,
} from "./thresholds.js";
import type { RdaAuthContext, RdaRole } from "../types.js";

type SessionLike = { r?: string; u?: string; n?: string };

export type RegisterLabEstoqueIntelligenceRoutesDeps = {
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
  deps: RegisterLabEstoqueIntelligenceRoutesDeps,
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

export function registerLabEstoqueIntelligenceRoutes(
  app: Express,
  deps: RegisterLabEstoqueIntelligenceRoutesDeps
): void {
  async function requireCombined(
    req: Request,
    res: Response
  ): Promise<{
    workshopId: string;
    auth: RdaAuthContext;
    flags: { isTechnician: boolean; permissions: Record<string, boolean> };
    canLab: boolean;
    canStock: boolean;
  } | null> {
    const workshopId = deps.WORKSHOP_ID;
    if (!workshopId || !deps.supabaseAdmin) {
      res.status(503).json({ error: "Inteligência Lab/Estoque indisponível." });
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
      !canViewLabEstoqueIntelligence({
        role: auth.role,
        userId: auth.userId,
        flags,
        permissions: flags.permissions,
      })
    ) {
      res.status(403).json({ error: "Sem permissão para Inteligência do Laboratório e Estoque." });
      return null;
    }
    const canLab = canViewLabIntelligence({
      role: auth.role,
      userId: auth.userId,
      flags,
      permissions: flags.permissions,
    });
    const canStock = canViewStockIntelligence({
      role: auth.role,
      userId: auth.userId,
      flags,
      permissions: flags.permissions,
    });
    return { workshopId, auth, flags, canLab, canStock };
  }

  async function requireLab(req: Request, res: Response) {
    const ctx = await requireCombined(req, res);
    if (!ctx) return null;
    if (!ctx.canLab) {
      res.status(403).json({ error: "Sem permissão de laboratório." });
      return null;
    }
    return ctx;
  }

  async function requireStock(req: Request, res: Response) {
    const ctx = await requireCombined(req, res);
    if (!ctx) return null;
    if (!ctx.canStock) {
      res.status(403).json({ error: "Sem permissão de estoque." });
      return null;
    }
    return ctx;
  }

  app.get("/api/rda/lab-estoque-intel/dashboard", async (req, res) => {
    try {
      const ctx = await requireCombined(req, res);
      if (!ctx) return;
      const thresholdsRaw = deps.getWorkshopSettingValue
        ? await deps.getWorkshopSettingValue(RDA_LAB_THRESHOLDS_SETTING_KEY)
        : null;
      const data = await queryLabEstoqueDashboard({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        thresholdsRaw,
        auth: ctx.auth,
        includeKnowledge: true,
        includeLab: ctx.canLab,
        includeStock: ctx.canStock,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET lab-estoque-intel/dashboard:", err);
      return res.status(500).json({ error: "Falha ao montar inteligência Lab/Estoque." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/lab/attention", async (req, res) => {
    try {
      const ctx = await requireLab(req, res);
      if (!ctx) return;
      const thresholdsRaw = deps.getWorkshopSettingValue
        ? await deps.getWorkshopSettingValue(RDA_LAB_THRESHOLDS_SETTING_KEY)
        : null;
      const data = await queryLabAttention({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        thresholdsRaw,
        auth: ctx.auth,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET lab attention:", err);
      return res.status(500).json({ error: "Falha ao listar atenção do laboratório." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/lab/bottlenecks", async (req, res) => {
    try {
      const ctx = await requireLab(req, res);
      if (!ctx) return;
      const thresholdsRaw = deps.getWorkshopSettingValue
        ? await deps.getWorkshopSettingValue(RDA_LAB_THRESHOLDS_SETTING_KEY)
        : null;
      const data = await queryLabBottlenecks({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        thresholdsRaw,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET lab bottlenecks:", err);
      return res.status(500).json({ error: "Falha ao detectar gargalos do lab." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/lab/bench", async (req, res) => {
    try {
      const ctx = await requireLab(req, res);
      if (!ctx) return;
      const data = await queryLabBenchStatus({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET lab bench:", err);
      return res.status(500).json({ error: "Falha ao ler bancada." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/lab/ready-pickup", async (req, res) => {
    try {
      const ctx = await requireLab(req, res);
      if (!ctx) return;
      const data = await queryLabReadyPickup({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET lab ready-pickup:", err);
      return res.status(500).json({ error: "Falha ao listar prontos pra entrega." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/lab/longest", async (req, res) => {
    try {
      const ctx = await requireLab(req, res);
      if (!ctx) return;
      const data = await queryLabLongestModules({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        limit: req.query.limit != null ? Number(req.query.limit) : 15,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET lab longest:", err);
      return res.status(500).json({ error: "Falha ao listar módulos mais antigos." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/stock/summary", async (req, res) => {
    try {
      const ctx = await requireStock(req, res);
      if (!ctx) return;
      const data = await queryStockSummary({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET stock summary:", err);
      return res.status(500).json({ error: "Falha ao resumir estoque." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/stock/abs-search", async (req, res) => {
    try {
      const ctx = await requireStock(req, res);
      if (!ctx) return;
      const q = String(req.query.q || "").trim();
      if (!q) return res.status(400).json({ error: "Parâmetro q obrigatório." });
      const data = await queryAbsStockSearch({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        query: q,
        limit: req.query.limit != null ? Number(req.query.limit) : 40,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET abs-search:", err);
      return res.status(500).json({ error: "Falha na busca ABS." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/stock/abs-locate", async (req, res) => {
    try {
      const ctx = await requireStock(req, res);
      if (!ctx) return;
      const q = String(req.query.q || "").trim();
      if (!q) return res.status(400).json({ error: "Parâmetro q obrigatório." });
      const data = await queryAbsLocate({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        query: q,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET abs-locate:", err);
      return res.status(500).json({ error: "Falha ao localizar unidade ABS." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/stock/low", async (req, res) => {
    try {
      const ctx = await requireStock(req, res);
      if (!ctx) return;
      const data = await queryStockLowParts({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET stock low:", err);
      return res.status(500).json({ error: "Falha ao listar estoque baixo." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/stock/parts", async (req, res) => {
    try {
      const ctx = await requireStock(req, res);
      if (!ctx) return;
      const q = String(req.query.q || "").trim();
      if (!q) return res.status(400).json({ error: "Parâmetro q obrigatório." });
      const data = await queryStockPartsText({
        workshopId: ctx.workshopId,
        supabase: deps.supabaseAdmin!,
        query: q,
        onlyInStock: req.query.onlyInStock !== "false",
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET stock parts:", err);
      return res.status(500).json({ error: "Falha ao buscar peças." });
    }
  });

  app.get("/api/rda/lab-estoque-intel/thresholds", async (req, res) => {
    try {
      const ctx = await requireLab(req, res);
      if (!ctx) return;
      const raw = deps.getWorkshopSettingValue
        ? await deps.getWorkshopSettingValue(RDA_LAB_THRESHOLDS_SETTING_KEY)
        : null;
      return res.json({
        ok: true,
        thresholds: parseLabThresholds(raw),
        defaults: DEFAULT_LAB_STAGE_THRESHOLD_HOURS,
        settingKey: RDA_LAB_THRESHOLDS_SETTING_KEY,
        canConfigure: canConfigureLabThresholds({
          role: ctx.auth.role,
          userId: ctx.auth.userId,
          flags: ctx.flags,
        }),
      });
    } catch (err) {
      console.error("[API] GET lab thresholds:", err);
      return res.status(500).json({ error: "Falha ao ler limiares do lab." });
    }
  });

  app.put("/api/rda/lab-estoque-intel/thresholds", async (req, res) => {
    try {
      const ctx = await requireLab(req, res);
      if (!ctx) return;
      if (
        !canConfigureLabThresholds({
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
      const merged = parseLabThresholds(
        JSON.stringify({ ...DEFAULT_LAB_STAGE_THRESHOLD_HOURS, ...(body.thresholds || {}) })
      );
      await deps.setWorkshopSettingValue(
        RDA_LAB_THRESHOLDS_SETTING_KEY,
        serializeLabThresholds(merged)
      );
      return res.json({ ok: true, thresholds: merged });
    } catch (err) {
      console.error("[API] PUT lab thresholds:", err);
      return res.status(500).json({ error: "Falha ao salvar limiares do lab." });
    }
  });
}
