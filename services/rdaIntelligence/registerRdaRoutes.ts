import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  describeRdaFeatureFlag,
  RDA_INTELLIGENCE_SETTING_KEY,
  resolveRdaIntelligenceEnabled,
} from "./featureFlag.js";
import { authorizeToolInvocation, authHasFullAccess } from "./permissions.js";
import { productionRdaToolRegistry } from "./tools/registry.js";
import { ensureProductionRdaToolsRegistered } from "./tools/registerProduction.js";
import { resolveRdaLlmProvider } from "./providers/resolve.js";
import { RdaProviderDisabledError } from "./providers/types.js";
import { productionRdaAuditLog } from "./audit/memoryLog.js";
import { RDA_MANAGERIAL_HUB_BLUEPRINT_VERSION } from "./future/managerialHubBlueprint.js";
import { runRdaChatTurn } from "./agent/orchestrator.js";
import { getTodayUsage, resolveDailyTokenLimit } from "./agent/usage.js";
import { runManagementScan } from "./insights/managementScan.js";
import { RDA_ALLOW_LLM_CALLS_ENV_KEY, type RdaAuthContext, type RdaRole } from "./types.js";
import { createRdaSystemEvent, productionRdaEventBus } from "./events/bus.js";
import { registerRdaKnowledgeRoutes } from "./knowledge/registerKnowledgeRoutes.js";

type SessionLike = {
  r?: RdaRole;
  u?: string;
  n?: string;
};

export type RegisterRdaIntelligenceRoutesDeps = {
  WORKSHOP_ID?: string;
  supabaseAdmin?: SupabaseClient | null;
  getWorkshopSettingValue: (key: string) => Promise<string | null>;
  setWorkshopSettingValue?: (key: string, value: string) => Promise<void>;
  loadUserPermissions?: (
    userId: string
  ) => Promise<Record<string, boolean> | null>;
};

function authFromRequest(req: Request): RdaAuthContext | null {
  const auth = (req as unknown as { auth?: SessionLike }).auth;
  if (!auth?.r) return null;
  return {
    role: auth.r,
    userId: auth.u,
    username: auth.n,
  };
}

function canUseRdaAssistant(auth: RdaAuthContext): boolean {
  if (authHasFullAccess(auth)) return true;
  const p = auth.permissions || {};
  return (
    p.access_radar_qualidade === true ||
    p.access_patio === true ||
    p.access_laboratorio === true ||
    p.access_home === true
  );
}

function llmCallsAllowed(): boolean {
  return (
    typeof process !== "undefined" &&
    process.env[RDA_ALLOW_LLM_CALLS_ENV_KEY]?.trim().toLowerCase() === "true"
  );
}

/**
 * Rotas RDA Intelligence (motor real + tempo/avaliações registrados à parte).
 */
export function registerRdaIntelligenceRoutes(
  app: Express,
  deps: RegisterRdaIntelligenceRoutesDeps
): void {
  ensureProductionRdaToolsRegistered();

  registerRdaKnowledgeRoutes(app, {
    WORKSHOP_ID: deps.WORKSHOP_ID,
    supabaseAdmin: deps.supabaseAdmin,
    loadUserPermissions: deps.loadUserPermissions,
  });

  app.get("/api/rda/health", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      module: "rda-intelligence",
      phase: 1,
      memory: true,
      operational: true,
    });
  });

  app.get("/api/rda/status", async (req: Request, res: Response) => {
    try {
      const settingValue = await deps.getWorkshopSettingValue(
        RDA_INTELLIGENCE_SETTING_KEY
      );
      const flag = describeRdaFeatureFlag({ settingValue });
      const provider = resolveRdaLlmProvider({
        featureEnabled: flag.enabled,
        settingValue,
      });
      ensureProductionRdaToolsRegistered();

      let usage = null;
      if (deps.supabaseAdmin && deps.WORKSHOP_ID && flag.enabled) {
        usage = await getTodayUsage(deps.supabaseAdmin, deps.WORKSHOP_ID);
      }

      return res.json({
        phase: 1,
        operational: flag.enabled && provider.id !== "noop",
        feature: flag,
        provider: {
          id: provider.id,
          configured: provider.isConfigured(),
          callsAllowed: llmCallsAllowed(),
        },
        usage: usage
          ? {
              ...usage,
              dailyTokenLimit: resolveDailyTokenLimit(),
            }
          : null,
        tools: {
          registered: productionRdaToolRegistry.list({ includeDisabled: true })
            .length,
          exposed: productionRdaToolRegistry.list().map((t) => ({
            id: t.id,
            side: t.side,
            requiresHumanConfirmation: t.requiresHumanConfirmation,
            requiredPermission: t.requiredPermission,
          })),
        },
        managerialHubBlueprintVersion: RDA_MANAGERIAL_HUB_BLUEPRINT_VERSION,
        authPresent: Boolean(authFromRequest(req)),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[API] GET /api/rda/status:", err);
      return res.status(500).json({ error: message });
    }
  });

  /** Ativa/desativa via workshop_settings (admin/full_access). */
  app.post("/api/rda/settings", async (req: Request, res: Response) => {
    try {
      const baseAuth = authFromRequest(req);
      if (!baseAuth) return res.status(401).json({ error: "Não autenticado." });
      let permissions: Record<string, boolean> | null = null;
      if (baseAuth.role === "user" && baseAuth.userId && deps.loadUserPermissions) {
        permissions = await deps.loadUserPermissions(baseAuth.userId);
      }
      const auth = { ...baseAuth, permissions };
      if (!authHasFullAccess(auth)) {
        return res.status(403).json({ error: "Apenas gerência/full_access." });
      }
      if (!deps.setWorkshopSettingValue) {
        return res.status(500).json({ error: "Persistência de settings indisponível." });
      }
      const enabled = (req.body || {}).enabled === true;
      await deps.setWorkshopSettingValue(
        RDA_INTELLIGENCE_SETTING_KEY,
        enabled ? "true" : "false"
      );
      return res.json({
        ok: true,
        feature: describeRdaFeatureFlag({
          settingValue: enabled ? "true" : "false",
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST /api/rda/settings:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/rda/authorize-tool", async (req: Request, res: Response) => {
    try {
      const baseAuth = authFromRequest(req);
      if (!baseAuth) {
        return res.status(401).json({ error: "Não autenticado." });
      }

      let permissions: Record<string, boolean> | null = null;
      if (baseAuth.role === "user" && baseAuth.userId && deps.loadUserPermissions) {
        permissions = await deps.loadUserPermissions(baseAuth.userId);
      }
      const auth: RdaAuthContext = { ...baseAuth, permissions };

      const settingValue = await deps.getWorkshopSettingValue(
        RDA_INTELLIGENCE_SETTING_KEY
      );
      const body = (req.body || {}) as {
        toolId?: unknown;
        params?: unknown;
        humanConfirmed?: unknown;
      };
      const toolId = typeof body.toolId === "string" ? body.toolId.trim() : "";

      ensureProductionRdaToolsRegistered();
      const result = authorizeToolInvocation({
        registry: productionRdaToolRegistry,
        auth,
        toolId,
        params: body.params,
        humanConfirmed: body.humanConfirmed === true,
        settingValue,
      });

      if (result.allowed === false) {
        productionRdaAuditLog.append({
          actorRole: auth.role,
          actorUserId: auth.userId,
          toolId: toolId || undefined,
          allowed: false,
          reason: result.reason,
        });
        const status =
          result.reason === "feature_disabled"
            ? 403
            : result.reason === "permission_denied"
              ? 403
              : result.reason === "confirmation_required"
                ? 409
                : result.reason === "invalid_params"
                  ? 400
                  : 404;
        return res.status(status).json({
          allowed: false,
          reason: result.reason,
          message: result.message,
        });
      }

      productionRdaAuditLog.append({
        actorRole: auth.role,
        actorUserId: auth.userId,
        toolId: result.tool.id,
        allowed: true,
      });

      return res.json({
        allowed: true,
        toolId: result.tool.id,
        side: result.tool.side,
        executed: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[API] POST /api/rda/authorize-tool:", err);
      return res.status(500).json({ error: message });
    }
  });

  /** Chat do assistente (tools + OpenAI). */
  app.post("/api/rda/chat", async (req: Request, res: Response) => {
    try {
      const baseAuth = authFromRequest(req);
      if (!baseAuth) return res.status(401).json({ error: "Não autenticado." });
      if (!deps.supabaseAdmin || !deps.WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      let permissions: Record<string, boolean> | null = null;
      if (baseAuth.role === "user" && baseAuth.userId && deps.loadUserPermissions) {
        permissions = await deps.loadUserPermissions(baseAuth.userId);
      }
      const auth: RdaAuthContext = { ...baseAuth, permissions };
      if (!canUseRdaAssistant(auth)) {
        return res.status(403).json({ error: "Sem permissão para o assistente RDA." });
      }

      const settingValue = await deps.getWorkshopSettingValue(
        RDA_INTELLIGENCE_SETTING_KEY
      );
      if (!resolveRdaIntelligenceEnabled({ settingValue })) {
        return res.status(403).json({
          error: "RDA Intelligence desligado. Ative em Ajustes ou via API /api/rda/settings.",
          code: "RDA_FEATURE_DISABLED",
        });
      }

      const body = (req.body || {}) as Record<string, unknown>;
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return res.status(400).json({ error: "message é obrigatório." });
      const conversationId =
        typeof body.conversationId === "string" ? body.conversationId.trim() : null;
      const contextServiceOrderId =
        typeof body.contextServiceOrderId === "string"
          ? body.contextServiceOrderId.trim()
          : null;
      const humanConfirmedToolIds = Array.isArray(body.humanConfirmedToolIds)
        ? body.humanConfirmedToolIds.filter((x): x is string => typeof x === "string")
        : [];

      const result = await runRdaChatTurn({
        workshopId: deps.WORKSHOP_ID,
        supabase: deps.supabaseAdmin,
        auth,
        settingValue,
        conversationId,
        userMessage: message,
        contextServiceOrderId,
        humanConfirmedToolIds,
      });
      return res.json(result);
    } catch (err: unknown) {
      if (err instanceof RdaProviderDisabledError) {
        return res.status(503).json({ error: err.message, code: err.code });
      }
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST /api/rda/chat:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/conversations/:id/messages", async (req: Request, res: Response) => {
    try {
      const baseAuth = authFromRequest(req);
      if (!baseAuth) return res.status(401).json({ error: "Não autenticado." });
      if (!deps.supabaseAdmin || !deps.WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const { data, error } = await deps.supabaseAdmin
        .from("rda_messages")
        .select("id, role, content, tool_name, created_at, metadata")
        .eq("workshop_id", deps.WORKSHOP_ID)
        .eq("conversation_id", id)
        .order("created_at", { ascending: true })
        .limit(100);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ messages: data || [] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  /** Varredura de gestão → alertas + notificações. */
  app.post("/api/rda/management/scan", async (req: Request, res: Response) => {
    try {
      const baseAuth = authFromRequest(req);
      if (!baseAuth) return res.status(401).json({ error: "Não autenticado." });
      let permissions: Record<string, boolean> | null = null;
      if (baseAuth.role === "user" && baseAuth.userId && deps.loadUserPermissions) {
        permissions = await deps.loadUserPermissions(baseAuth.userId);
      }
      const auth = { ...baseAuth, permissions };
      if (!authHasFullAccess(auth) && auth.permissions?.access_radar_qualidade !== true) {
        return res.status(403).json({ error: "Acesso gerencial necessário." });
      }
      if (!deps.supabaseAdmin || !deps.WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const settingValue = await deps.getWorkshopSettingValue(
        RDA_INTELLIGENCE_SETTING_KEY
      );
      const result = await runManagementScan({
        workshopId: deps.WORKSHOP_ID,
        supabase: deps.supabaseAdmin,
        settingValue,
      });
      await productionRdaEventBus.publish(
        createRdaSystemEvent(
          "rda.management_scan",
          { alertsCreated: result.alertsCreated },
          deps.WORKSHOP_ID
        ),
        { settingValue }
      );
      return res.json(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST management/scan:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/management/alerts", async (req: Request, res: Response) => {
    try {
      const baseAuth = authFromRequest(req);
      if (!baseAuth) return res.status(401).json({ error: "Não autenticado." });
      if (!deps.supabaseAdmin || !deps.WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const { data, error } = await deps.supabaseAdmin
        .from("rda_management_alerts")
        .select("*")
        .eq("workshop_id", deps.WORKSHOP_ID)
        .is("dismissed_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) return res.status(500).json({ error: error.message });
      return res.json({ alerts: data || [] });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });
}
