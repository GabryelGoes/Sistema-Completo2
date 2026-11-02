import type { Express, Request, Response } from "express";
import { describeRdaFeatureFlag, RDA_INTELLIGENCE_SETTING_KEY } from "./featureFlag.js";
import { authorizeToolInvocation } from "./permissions.js";
import { productionRdaToolRegistry } from "./tools/registry.js";
import { resolveRdaLlmProvider } from "./providers/resolve.js";
import { productionRdaAuditLog } from "./audit/memoryLog.js";
import { RDA_MANAGERIAL_HUB_BLUEPRINT_VERSION } from "./future/managerialHubBlueprint.js";
import type { RdaAuthContext, RdaRole } from "./types.js";

type SessionLike = {
  r?: RdaRole;
  u?: string;
  n?: string;
};

export type RegisterRdaIntelligenceRoutesDeps = {
  getWorkshopSettingValue: (key: string) => Promise<string | null>;
  /**
   * Resolve permissões do usuário autenticado (server-side).
   * Se omitido, users sem full_access no contexto local serão negados em authorize.
   */
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

/**
 * Rotas introspectivas do RDA (Fase 0).
 * Não disparam IA, não criam notificações, não alteram OS/pátio/estoque.
 */
export function registerRdaIntelligenceRoutes(
  app: Express,
  deps: RegisterRdaIntelligenceRoutesDeps
): void {
  app.get("/api/rda/health", (_req: Request, res: Response) => {
    return res.json({
      ok: true,
      module: "rda-intelligence",
      phase: 0,
      operational: false,
    });
  });

  app.get("/api/rda/status", async (req: Request, res: Response) => {
    try {
      const settingValue = await deps.getWorkshopSettingValue(RDA_INTELLIGENCE_SETTING_KEY);
      const flag = describeRdaFeatureFlag({ settingValue });
      const provider = resolveRdaLlmProvider({
        featureEnabled: flag.enabled,
        settingValue,
      });

      return res.json({
        phase: 0,
        operational: false,
        feature: flag,
        provider: {
          id: provider.id,
          configured: provider.isConfigured(),
          callsAllowed: false,
        },
        tools: {
          registered: productionRdaToolRegistry.list({ includeDisabled: true }).length,
          /** Fase 0: zero tools de dados reais. */
          exposed: productionRdaToolRegistry.list().map((t) => ({
            id: t.id,
            side: t.side,
            requiresHumanConfirmation: t.requiresHumanConfirmation,
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

  /**
   * Endpoint de autorização (dry-run / invoke gate).
   * Sempre exige sessão. Com flag off → 403 feature_disabled.
   * Não executa tool de dados (registry de produção vazio).
   */
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

      const settingValue = await deps.getWorkshopSettingValue(RDA_INTELLIGENCE_SETTING_KEY);
      const body = (req.body || {}) as {
        toolId?: unknown;
        params?: unknown;
        humanConfirmed?: unknown;
      };
      const toolId = typeof body.toolId === "string" ? body.toolId.trim() : "";

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
          detail: { phase: 0, dryRun: true },
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
        detail: { phase: 0, dryRun: true },
      });

      return res.json({
        allowed: true,
        toolId: result.tool.id,
        side: result.tool.side,
        /** Fase 0: autorização ok não implica execução. */
        executed: false,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro desconhecido";
      console.error("[API] POST /api/rda/authorize-tool:", err);
      return res.status(500).json({ error: message });
    }
  });
}
