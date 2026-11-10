import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RdaAuthContext, RdaRole } from "../types.js";
import { canManageProductivity, canViewProductivity } from "./access.js";
import {
  createProductivityTask,
  getProductivityTask,
  listAssignablePeople,
  listProductivityTasks,
  runProductivityDeadlineTick,
  summarizePendingTasks,
  updateProductivityTask,
} from "./service.js";
import type {
  CreateProductivityTaskInput,
  ProductivityTaskFilters,
  ProductivityTaskPriority,
  ProductivityTaskStatus,
  UpdateProductivityTaskInput,
} from "./types.js";

type SessionLike = { r?: RdaRole; u?: string; n?: string };

export type RegisterProductivityRoutesDeps = {
  WORKSHOP_ID?: string;
  supabaseAdmin?: SupabaseClient | null;
  loadUserPermissions?: (userId: string) => Promise<Record<string, boolean> | null>;
};

function authFromReq(req: Request): RdaAuthContext | null {
  const auth = (req as unknown as { auth?: SessionLike }).auth;
  if (!auth?.r) return null;
  return { role: auth.r, userId: auth.u, username: auth.n };
}

async function hydrate(
  deps: RegisterProductivityRoutesDeps,
  auth: RdaAuthContext
): Promise<RdaAuthContext> {
  if (auth.role === "user" && auth.userId && deps.loadUserPermissions) {
    const permissions = await deps.loadUserPermissions(auth.userId);
    return { ...auth, permissions: permissions || {} };
  }
  return auth;
}

export function registerProductivityRoutes(
  app: Express,
  deps: RegisterProductivityRoutesDeps
): void {
  async function requireCtx(req: Request, res: Response) {
    const workshopId = deps.WORKSHOP_ID;
    if (!workshopId || !deps.supabaseAdmin) {
      res.status(503).json({ error: "Produtividade RDA indisponível." });
      return null;
    }
    const raw = authFromReq(req);
    if (!raw) {
      res.status(401).json({ error: "Não autenticado." });
      return null;
    }
    const auth = await hydrate(deps, raw);
    if (!canViewProductivity(auth)) {
      res.status(403).json({ error: "Sem permissão para Produtividade RDA." });
      return null;
    }
    return { workshopId, auth, supabase: deps.supabaseAdmin };
  }

  app.get("/api/rda/productivity/tasks", async (req, res) => {
    try {
      const ctx = await requireCtx(req, res);
      if (!ctx) return;
      const filters: ProductivityTaskFilters = {
        status: (String(req.query.status || "open") as ProductivityTaskFilters["status"]) || "open",
        assigneeUserId: req.query.assigneeUserId
          ? String(req.query.assigneeUserId)
          : undefined,
        priority: req.query.priority
          ? (String(req.query.priority) as ProductivityTaskPriority)
          : undefined,
        overdueOnly: String(req.query.overdueOnly || "") === "1",
        q: req.query.q ? String(req.query.q) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 40,
      };
      const tasks = await listProductivityTasks({
        supabase: ctx.supabase,
        workshopId: ctx.workshopId,
        auth: ctx.auth,
        filters,
      });
      return res.json({ ok: true, tasks });
    } catch (err) {
      console.error("[API] GET productivity/tasks:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Falha ao listar tarefas.",
      });
    }
  });

  app.get("/api/rda/productivity/tasks/:id", async (req, res) => {
    try {
      const ctx = await requireCtx(req, res);
      if (!ctx) return;
      const data = await getProductivityTask({
        supabase: ctx.supabase,
        workshopId: ctx.workshopId,
        auth: ctx.auth,
        taskId: String(req.params.id),
      });
      return res.json({ ok: true, ...data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Falha ao carregar tarefa.";
      const code = /não encontrada/i.test(msg) ? 404 : 500;
      return res.status(code).json({ error: msg });
    }
  });

  app.post("/api/rda/productivity/tasks", async (req, res) => {
    try {
      const ctx = await requireCtx(req, res);
      if (!ctx) return;
      const body = (req.body || {}) as CreateProductivityTaskInput;
      const task = await createProductivityTask({
        supabase: ctx.supabase,
        workshopId: ctx.workshopId,
        auth: ctx.auth,
        payload: body,
      });
      return res.status(201).json({ ok: true, task });
    } catch (err) {
      console.error("[API] POST productivity/tasks:", err);
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Falha ao criar tarefa.",
      });
    }
  });

  app.patch("/api/rda/productivity/tasks/:id", async (req, res) => {
    try {
      const ctx = await requireCtx(req, res);
      if (!ctx) return;
      const patch = (req.body || {}) as UpdateProductivityTaskInput;
      if (patch.status) {
        patch.status = String(patch.status) as ProductivityTaskStatus;
      }
      const task = await updateProductivityTask({
        supabase: ctx.supabase,
        workshopId: ctx.workshopId,
        auth: ctx.auth,
        taskId: String(req.params.id),
        patch,
      });
      return res.json({ ok: true, task });
    } catch (err) {
      console.error("[API] PATCH productivity/tasks:", err);
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Falha ao atualizar tarefa.",
      });
    }
  });

  app.get("/api/rda/productivity/summary", async (req, res) => {
    try {
      const ctx = await requireCtx(req, res);
      if (!ctx) return;
      const summary = await summarizePendingTasks({
        supabase: ctx.supabase,
        workshopId: ctx.workshopId,
        auth: ctx.auth,
      });
      return res.json({ ok: true, summary, canManage: canManageProductivity(ctx.auth) });
    } catch (err) {
      console.error("[API] GET productivity/summary:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Falha no resumo.",
      });
    }
  });

  app.get("/api/rda/productivity/people", async (req, res) => {
    try {
      const ctx = await requireCtx(req, res);
      if (!ctx) return;
      const people = await listAssignablePeople({
        supabase: ctx.supabase,
        workshopId: ctx.workshopId,
        auth: ctx.auth,
        q: req.query.q ? String(req.query.q) : null,
      });
      return res.json({ ok: true, people });
    } catch (err) {
      console.error("[API] GET productivity/people:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Falha ao listar pessoas.",
      });
    }
  });

  /** Tick de prazos (cron / gestão). Não substitui o scan proativo. */
  async function handleDeadlineTick(req: Request, res: Response, fromCronGet: boolean) {
    const workshopId = deps.WORKSHOP_ID;
    if (!workshopId || !deps.supabaseAdmin) {
      return res.status(503).json({ error: "Indisponível." });
    }
    const cronSecret = (process.env.CRON_SECRET || "").trim();
    const scanSecret = (process.env.RDA_PROACTIVE_SCAN_SECRET || "").trim();
    const authHeader = String(req.headers.authorization || "");
    const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
    const bodySecret = String((req.body as { secret?: string } | undefined)?.secret || "");
    const headerSecret = String(req.headers["x-rda-scan-secret"] || "");
    const cronOk = fromCronGet && !!cronSecret && authHeader === `Bearer ${cronSecret}`;
    const secretOk =
      (!!scanSecret &&
        (bearer === scanSecret || bodySecret === scanSecret || headerSecret === scanSecret)) ||
      (!!cronSecret && bearer === cronSecret);
    if (!cronOk && !secretOk) {
      const raw = authFromReq(req);
      if (!raw) return res.status(403).json({ error: "Não autorizado." });
      const auth = await hydrate(deps, raw);
      if (!canManageProductivity(auth)) {
        return res.status(403).json({ error: "Não autorizado." });
      }
    }
    const result = await runProductivityDeadlineTick({
      supabase: deps.supabaseAdmin,
      workshopId,
    });
    return res.json({ ok: true, ...result });
  }

  app.get("/api/rda/productivity/deadlines/tick", async (req, res) => {
    try {
      await handleDeadlineTick(req, res, true);
    } catch (err) {
      console.error("[API] GET productivity/deadlines/tick:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Falha no tick de prazos.",
      });
    }
  });

  app.post("/api/rda/productivity/deadlines/tick", async (req, res) => {
    try {
      await handleDeadlineTick(req, res, false);
    } catch (err) {
      console.error("[API] POST productivity/deadlines/tick:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Falha no tick de prazos.",
      });
    }
  });
}
