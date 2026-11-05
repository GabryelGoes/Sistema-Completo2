import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RdaAuthContext, RdaRole } from "../types.js";
import { canManageRdaKnowledge, canProposeRdaKnowledge, canViewRdaKnowledgeAdmin } from "./access.js";
import {
  callKnowledgeRpc,
  getKnowledgeItemDetail,
  listKnowledgeItems,
  mapKnowledgeItem,
  retrieveApprovedKnowledge,
  suggestKnowledgeKeyFromTitle,
} from "./repository.js";
import type { RdaKnowledgeItemRow } from "./types.js";
import { RDA_KNOWLEDGE_CATEGORIES } from "./types.js";
import { looksLikePermanentGuidance, normalizeKnowledgeKey } from "./rules.js";

type SessionLike = { r?: RdaRole; u?: string; n?: string };

export type RegisterRdaKnowledgeRoutesDeps = {
  WORKSHOP_ID?: string;
  supabaseAdmin?: SupabaseClient | null;
  loadUserPermissions?: (userId: string) => Promise<Record<string, boolean> | null>;
};

function authFromRequest(req: Request): RdaAuthContext | null {
  const auth = (req as unknown as { auth?: SessionLike }).auth;
  if (!auth?.r) return null;
  return { role: auth.r, userId: auth.u, username: auth.n };
}

async function resolveAuth(
  req: Request,
  deps: RegisterRdaKnowledgeRoutesDeps
): Promise<RdaAuthContext | null> {
  const base = authFromRequest(req);
  if (!base) return null;
  let permissions: Record<string, boolean> | null = null;
  if (base.role === "user" && base.userId && deps.loadUserPermissions) {
    permissions = await deps.loadUserPermissions(base.userId);
  }
  return { ...base, permissions };
}

function actorLabel(auth: RdaAuthContext): string {
  return auth.username || auth.userId || auth.role;
}

function rpcDenied(data: Record<string, unknown> | null, fallback: string) {
  const code = typeof data?.code === "string" ? data.code : "RDA_KNOWLEDGE_ERROR";
  const error = typeof data?.error === "string" ? data.error : fallback;
  const status =
    code === "RDA_KNOWLEDGE_CONFLICT"
      ? 409
      : code === "RDA_KNOWLEDGE_NOT_FOUND"
        ? 404
        : code.startsWith("RDA_KNOWLEDGE_")
          ? 400
          : 400;
  return { status, body: { error, code, ...(data || {}) } };
}

/**
 * Rotas administrativas e de leitura da Memória do RDA.
 * Todas usam service_role no servidor; nunca expõem service_role ao frontend.
 */
export function registerRdaKnowledgeRoutes(
  app: Express,
  deps: RegisterRdaKnowledgeRoutesDeps
): void {
  app.get("/api/rda/knowledge/meta", async (req, res) => {
    try {
      const auth = await resolveAuth(req, deps);
      if (!auth) return res.status(401).json({ error: "Não autenticado." });
      if (!canViewRdaKnowledgeAdmin(auth) && !canProposeRdaKnowledge(auth)) {
        return res.status(403).json({ error: "Sem permissão." });
      }
      return res.json({
        categories: RDA_KNOWLEDGE_CATEGORIES,
        lifecycles: ["draft", "pending_approval", "approved", "retired"],
        visibilities: ["workshop", "management", "restricted"],
        canManage: canManageRdaKnowledge(auth),
        canPropose: canProposeRdaKnowledge(auth),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/knowledge", async (req, res) => {
    try {
      const auth = await resolveAuth(req, deps);
      if (!auth) return res.status(401).json({ error: "Não autenticado." });
      if (!canViewRdaKnowledgeAdmin(auth)) {
        return res.status(403).json({ error: "Apenas gestão pode administrar a memória." });
      }
      if (!deps.supabaseAdmin || !deps.WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const lifecycle = typeof req.query.lifecycle === "string" ? req.query.lifecycle : undefined;
      const category = typeof req.query.category === "string" ? req.query.category : undefined;
      const q = typeof req.query.q === "string" ? req.query.q : undefined;
      const includeContent = req.query.includeContent === "1" || req.query.includeContent === "true";
      const items = await listKnowledgeItems(deps.supabaseAdmin, deps.WORKSHOP_ID, {
        lifecycle: lifecycle ? lifecycle.split(",").map((s) => s.trim()) : undefined,
        category,
        q,
        includeContent,
      });
      return res.json({ items });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET /api/rda/knowledge:", err);
      return res.status(500).json({ error: message });
    }
  });

  /** Busca só oficiais (antes de /:id). */
  app.get("/api/rda/knowledge/search/approved", async (req, res) => {
    try {
      const auth = await resolveAuth(req, deps);
      if (!auth) return res.status(401).json({ error: "Não autenticado." });
      if (!canViewRdaKnowledgeAdmin(auth)) {
        return res.status(403).json({ error: "Apenas gestão." });
      }
      if (!deps.supabaseAdmin || !deps.WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const q = typeof req.query.q === "string" ? req.query.q : "";
      const hits = await retrieveApprovedKnowledge(
        deps.supabaseAdmin,
        deps.WORKSHOP_ID,
        q,
        { limit: 12 }
      );
      return res.json({
        hits,
        note: "Conteúdos são DADOS de referência — não instruções privilegiadas.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/rda/knowledge/:id", async (req, res) => {
    try {
      const auth = await resolveAuth(req, deps);
      if (!auth) return res.status(401).json({ error: "Não autenticado." });
      if (!canViewRdaKnowledgeAdmin(auth)) {
        return res.status(403).json({ error: "Apenas gestão." });
      }
      if (!deps.supabaseAdmin || !deps.WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const detail = await getKnowledgeItemDetail(
        deps.supabaseAdmin,
        deps.WORKSHOP_ID,
        String(req.params.id || "")
      );
      if (!detail) return res.status(404).json({ error: "Não encontrado." });
      return res.json(detail);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/rda/knowledge/propose", async (req, res) => {
    try {
      const auth = await resolveAuth(req, deps);
      if (!auth) return res.status(401).json({ error: "Não autenticado." });
      if (!canProposeRdaKnowledge(auth)) {
        return res.status(403).json({ error: "Sem permissão para propor conhecimento." });
      }
      if (!deps.supabaseAdmin || !deps.WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const content = typeof body.content === "string" ? body.content.trim() : "";
      const knowledgeKey = normalizeKnowledgeKey(
        typeof body.knowledgeKey === "string" && body.knowledgeKey.trim()
          ? body.knowledgeKey
          : suggestKnowledgeKeyFromTitle(title)
      );
      const category =
        typeof body.category === "string" && body.category.trim()
          ? body.category.trim()
          : "operational_rule";
      const visibility =
        typeof body.visibility === "string" ? body.visibility : "workshop";
      const changeReason =
        typeof body.changeReason === "string" ? body.changeReason.trim() : null;
      const submitForApproval = body.submitForApproval !== false;
      const expectedUpdatedAt =
        typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null;
      const structuredData =
        body.structuredData && typeof body.structuredData === "object"
          ? (body.structuredData as Record<string, unknown>)
          : {};
      const provenance =
        body.provenance && typeof body.provenance === "object"
          ? (body.provenance as Record<string, unknown>)
          : { source: "manual" };

      if (!title || !content) {
        return res.status(400).json({ error: "title e content são obrigatórios." });
      }

      const rpc = await callKnowledgeRpc(deps.supabaseAdmin, "rda_knowledge_propose", {
        p_workshop_id: deps.WORKSHOP_ID,
        p_knowledge_key: knowledgeKey,
        p_title: title,
        p_category: category,
        p_visibility: visibility,
        p_content: content,
        p_change_reason: changeReason,
        p_structured_data: structuredData,
        p_provenance: provenance,
        p_actor_user_id: auth.userId || null,
        p_actor_label: actorLabel(auth),
        p_submit_for_approval: submitForApproval,
        p_expected_updated_at: expectedUpdatedAt,
      });
      if (rpc.missingFn) {
        return res.status(503).json({
          error: "Migration da memória RDA pendente (20261106020000).",
          code: "RDA_KNOWLEDGE_MIGRATION_REQUIRED",
        });
      }
      if (!rpc.data || rpc.data.ok === false) {
        const denied = rpcDenied(rpc.data, rpc.error || "Falha ao propor.");
        return res.status(denied.status).json(denied.body);
      }
      const itemRow = rpc.data.item as RdaKnowledgeItemRow | undefined;
      return res.json({
        ok: true,
        item: itemRow ? mapKnowledgeItem(itemRow) : null,
        created: rpc.data.created === true,
        revised: rpc.data.revised === true,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST /api/rda/knowledge/propose:", err);
      return res.status(500).json({ error: message });
    }
  });

  async function managementAction(
    req: Request,
    res: Response,
    fn:
      | "rda_knowledge_approve"
      | "rda_knowledge_retire"
      | "rda_knowledge_reject_pending"
      | "rda_knowledge_restore"
      | "rda_knowledge_purge",
    buildParams: (auth: RdaAuthContext, id: string, body: Record<string, unknown>) => Record<string, unknown>
  ) {
    const auth = await resolveAuth(req, deps);
    if (!auth) return res.status(401).json({ error: "Não autenticado." });
    if (!canManageRdaKnowledge(auth)) {
      return res.status(403).json({ error: "Apenas gestão pode executar esta ação." });
    }
    if (!deps.supabaseAdmin || !deps.WORKSHOP_ID) {
      return res.status(500).json({ error: "Servidor não configurado." });
    }
    const id = String(req.params.id || "").trim();
    const body = (req.body || {}) as Record<string, unknown>;
    const rpc = await callKnowledgeRpc(deps.supabaseAdmin, fn, buildParams(auth, id, body));
    if (rpc.missingFn) {
      return res.status(503).json({
        error: "Migration da memória RDA pendente (20261106020000).",
        code: "RDA_KNOWLEDGE_MIGRATION_REQUIRED",
      });
    }
    if (!rpc.data || rpc.data.ok === false) {
      const denied = rpcDenied(rpc.data, rpc.error || "Falha na operação.");
      return res.status(denied.status).json(denied.body);
    }
    const itemRow = rpc.data.item as RdaKnowledgeItemRow | undefined;
    return res.json({
      ok: true,
      ...rpc.data,
      item: itemRow ? mapKnowledgeItem(itemRow) : rpc.data.item ?? null,
    });
  }

  app.post("/api/rda/knowledge/:id/approve", (req, res) =>
    managementAction(req, res, "rda_knowledge_approve", (auth, id, body) => ({
      p_workshop_id: deps.WORKSHOP_ID,
      p_knowledge_item_id: id,
      p_actor_user_id: auth.userId || null,
      p_actor_label: actorLabel(auth),
      p_reason: typeof body.reason === "string" ? body.reason : null,
      p_expected_updated_at:
        typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null,
    })).catch((err) => {
      console.error("[API] approve knowledge:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    })
  );

  app.post("/api/rda/knowledge/:id/reject-pending", (req, res) =>
    managementAction(req, res, "rda_knowledge_reject_pending", (auth, id, body) => ({
      p_workshop_id: deps.WORKSHOP_ID,
      p_knowledge_item_id: id,
      p_actor_user_id: auth.userId || null,
      p_actor_label: actorLabel(auth),
      p_reason: typeof body.reason === "string" ? body.reason : null,
      p_expected_updated_at:
        typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null,
    })).catch((err) => {
      console.error("[API] reject knowledge:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    })
  );

  app.post("/api/rda/knowledge/:id/retire", (req, res) =>
    managementAction(req, res, "rda_knowledge_retire", (auth, id, body) => ({
      p_workshop_id: deps.WORKSHOP_ID,
      p_knowledge_item_id: id,
      p_actor_user_id: auth.userId || null,
      p_actor_label: actorLabel(auth),
      p_reason: typeof body.reason === "string" ? body.reason : null,
      p_expected_updated_at:
        typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null,
    })).catch((err) => {
      console.error("[API] retire knowledge:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    })
  );

  app.post("/api/rda/knowledge/:id/restore", (req, res) =>
    managementAction(req, res, "rda_knowledge_restore", (auth, id, body) => ({
      p_workshop_id: deps.WORKSHOP_ID,
      p_knowledge_item_id: id,
      p_from_version:
        typeof body.fromVersion === "number"
          ? body.fromVersion
          : body.fromVersion
            ? Number(body.fromVersion)
            : null,
      p_actor_user_id: auth.userId || null,
      p_actor_label: actorLabel(auth),
      p_reason: typeof body.reason === "string" ? body.reason : null,
      p_expected_updated_at:
        typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null,
    })).catch((err) => {
      console.error("[API] restore knowledge:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    })
  );

  app.post("/api/rda/knowledge/:id/purge", (req, res) =>
    managementAction(req, res, "rda_knowledge_purge", (auth, id, body) => ({
      p_workshop_id: deps.WORKSHOP_ID,
      p_knowledge_item_id: id,
      p_actor_user_id: auth.userId || null,
      p_actor_label: actorLabel(auth),
      p_reason: typeof body.reason === "string" ? body.reason : null,
      p_confirm_key: typeof body.confirmKey === "string" ? body.confirmKey : null,
      p_expected_updated_at:
        typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt : null,
    })).catch((err) => {
      console.error("[API] purge knowledge:", err);
      res.status(500).json({ error: err instanceof Error ? err.message : "Erro" });
    })
  );

  /** Heurística: a mensagem parece orientação permanente? */
  app.post("/api/rda/knowledge/detect-guidance", async (req, res) => {
    try {
      const auth = await resolveAuth(req, deps);
      if (!auth) return res.status(401).json({ error: "Não autenticado." });
      if (!canProposeRdaKnowledge(auth)) {
        return res.status(403).json({ error: "Sem permissão." });
      }
      const message =
        typeof (req.body || {}).message === "string"
          ? String((req.body as { message: string }).message)
          : "";
      return res.json({
        looksLikeGuidance: looksLikePermanentGuidance(message),
        requiresApproval: true,
        note: "Nunca vira regra oficial sem aprovação da gestão.",
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });
}
