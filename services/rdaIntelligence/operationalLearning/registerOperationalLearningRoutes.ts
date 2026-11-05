import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canViewOperationalIntelligence } from "./access.js";
import {
  queryOperationalDashboard,
  queryOperationalOverview,
  queryOperationalPatterns,
  queryPauseReasonsSummary,
  queryServiceDurationStats,
  queryTechnicianBreakdown,
} from "./service.js";
import type { RdaWorkTimeKind } from "../workSessions/stageRules.js";

type SessionLike = { r?: string; u?: string; n?: string };

export type RegisterOperationalLearningRoutesDeps = {
  WORKSHOP_ID?: string;
  supabaseAdmin?: SupabaseClient | null;
  loadUserPermissions?: (userId: string) => Promise<Record<string, boolean> | null>;
};

function authFromReq(req: Request): SessionLike | null {
  return (req as unknown as { auth?: SessionLike }).auth || null;
}

async function resolveFlags(
  deps: RegisterOperationalLearningRoutesDeps,
  userId: string | undefined
): Promise<{ isTechnician: boolean; permissions: Record<string, boolean> } | null> {
  if (!userId || !deps.loadUserPermissions) {
    return { isTechnician: false, permissions: {} };
  }
  const permissions = (await deps.loadUserPermissions(userId)) || {};
  return {
    isTechnician: permissions.access_patio === true || permissions.is_technician === true,
    permissions,
  };
}

function parseTimeKind(raw: unknown): RdaWorkTimeKind | "all" {
  const v = String(raw || "all").toLowerCase();
  if (v === "diagnostic" || v === "execution" || v === "all") return v;
  return "all";
}

/**
 * Inteligência Operacional — agregações sobre rda_work_sessions (sem duplicar na memória).
 */
export function registerOperationalLearningRoutes(
  app: Express,
  deps: RegisterOperationalLearningRoutesDeps
): void {
  async function requireOpsAccess(
    req: Request,
    res: Response
  ): Promise<{ workshopId: string; role: string; userId?: string } | null> {
    const workshopId = deps.WORKSHOP_ID;
    if (!workshopId || !deps.supabaseAdmin) {
      res.status(503).json({ error: "RDA operacional indisponível." });
      return null;
    }
    const auth = authFromReq(req);
    if (!auth?.r) {
      res.status(401).json({ error: "Não autenticado." });
      return null;
    }
    const flags = await resolveFlags(deps, auth.u);
    if (
      !canViewOperationalIntelligence({
        role: auth.r,
        userId: auth.u,
        flags,
      })
    ) {
      res.status(403).json({
        error: "Inteligência Operacional restrita à gestão (admin / full_access / radar).",
      });
      return null;
    }
    return { workshopId, role: auth.r, userId: auth.u };
  }

  app.get("/api/rda/operational/overview", async (req, res) => {
    try {
      const ctx = await requireOpsAccess(req, res);
      if (!ctx) return;
      const data = await queryOperationalOverview({
        workshopId: ctx.workshopId,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        days: req.query.days != null ? Number(req.query.days) : undefined,
        technicianUserId:
          typeof req.query.technicianUserId === "string" ? req.query.technicianUserId : undefined,
        serviceQuery: typeof req.query.service === "string" ? req.query.service : undefined,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET /api/rda/operational/overview:", err);
      return res.status(500).json({ error: "Falha ao agregar visão operacional." });
    }
  });

  app.get("/api/rda/operational/services", async (req, res) => {
    try {
      const ctx = await requireOpsAccess(req, res);
      if (!ctx) return;
      const data = await queryServiceDurationStats({
        workshopId: ctx.workshopId,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        days: req.query.days != null ? Number(req.query.days) : undefined,
        technicianUserId:
          typeof req.query.technicianUserId === "string" ? req.query.technicianUserId : undefined,
        serviceQuery: typeof req.query.service === "string" ? req.query.service : undefined,
        timeKind: parseTimeKind(req.query.timeKind),
        limit: req.query.limit != null ? Number(req.query.limit) : 40,
        offset: req.query.offset != null ? Number(req.query.offset) : 0,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET /api/rda/operational/services:", err);
      return res.status(500).json({ error: "Falha ao agregar durações de serviço." });
    }
  });

  app.get("/api/rda/operational/pauses", async (req, res) => {
    try {
      const ctx = await requireOpsAccess(req, res);
      if (!ctx) return;
      const data = await queryPauseReasonsSummary({
        workshopId: ctx.workshopId,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        days: req.query.days != null ? Number(req.query.days) : undefined,
        limit: req.query.limit != null ? Number(req.query.limit) : 30,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET /api/rda/operational/pauses:", err);
      return res.status(500).json({ error: "Falha ao agregar pausas." });
    }
  });

  app.get("/api/rda/operational/technicians", async (req, res) => {
    try {
      const ctx = await requireOpsAccess(req, res);
      if (!ctx) return;
      const data = await queryTechnicianBreakdown({
        workshopId: ctx.workshopId,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        days: req.query.days != null ? Number(req.query.days) : undefined,
        technicianUserId:
          typeof req.query.technicianUserId === "string" ? req.query.technicianUserId : undefined,
        serviceQuery: typeof req.query.service === "string" ? req.query.service : undefined,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET /api/rda/operational/technicians:", err);
      return res.status(500).json({ error: "Falha ao agregar tempos por técnico." });
    }
  });

  app.get("/api/rda/operational/patterns", async (req, res) => {
    try {
      const ctx = await requireOpsAccess(req, res);
      if (!ctx) return;
      const data = await queryOperationalPatterns({
        workshopId: ctx.workshopId,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        days: req.query.days != null ? Number(req.query.days) : undefined,
        technicianUserId:
          typeof req.query.technicianUserId === "string" ? req.query.technicianUserId : undefined,
        serviceQuery: typeof req.query.service === "string" ? req.query.service : undefined,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET /api/rda/operational/patterns:", err);
      return res.status(500).json({ error: "Falha ao detectar padrões." });
    }
  });

  app.get("/api/rda/operational/dashboard", async (req, res) => {
    try {
      const ctx = await requireOpsAccess(req, res);
      if (!ctx) return;
      const data = await queryOperationalDashboard({
        workshopId: ctx.workshopId,
        from: typeof req.query.from === "string" ? req.query.from : undefined,
        to: typeof req.query.to === "string" ? req.query.to : undefined,
        days: req.query.days != null ? Number(req.query.days) : 30,
        technicianUserId:
          typeof req.query.technicianUserId === "string" ? req.query.technicianUserId : undefined,
        serviceQuery: typeof req.query.service === "string" ? req.query.service : undefined,
        supabase: deps.supabaseAdmin!,
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      console.error("[API] GET /api/rda/operational/dashboard:", err);
      return res.status(500).json({ error: "Falha ao montar dashboard operacional." });
    }
  });
}
