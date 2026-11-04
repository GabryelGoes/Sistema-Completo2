/**
 * Rotas Fase 1 do Radar: pessoas/identidade, reconhecimentos positivos,
 * revisões de ocorrência. ACL via requestCanAccessQualityRadar do host.
 */
import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildUnifiedPeople,
  isFaultAttribution,
  suggestPersonLinkPairs,
  type ConfirmedPersonLink,
} from "./identity.js";
import { canAccessQualityRadar } from "./access.js";

type SessionPayload = { r: "admin" | "user"; u?: string; n?: string };

type Deps = {
  WORKSHOP_ID: string | undefined;
  supabaseAdmin: SupabaseClient | null;
  requestCanAccessQualityRadar: (req: Request) => Promise<boolean>;
};

const RECOGNITION_CATEGORIES = [
  "diagnostico_complexo",
  "qualidade_execucao",
  "autonomia",
  "iniciativa",
  "organizacao",
  "colaboracao",
  "evolucao",
  "procedimentos",
  "ajuda_colegas",
  "melhoria_oficina",
  "outro",
] as const;

function authFromReq(req: Request): SessionPayload | null {
  return (req as unknown as { auth?: SessionPayload }).auth ?? null;
}

function mapRecognition(row: Record<string, unknown>) {
  return {
    id: row.id,
    workshopId: row.workshop_id,
    technicianId: row.technician_id ?? null,
    systemUserId: row.system_user_id ?? null,
    personName: row.person_name ?? "",
    category: row.category ?? "outro",
    title: row.title ?? "",
    description: row.description ?? "",
    serviceOrderId: row.service_order_id ?? null,
    serviceOrderLabel: row.service_order_label ?? "",
    occurredAt: row.occurred_at,
    registeredByUserId: row.registered_by_user_id ?? null,
    registeredByName: row.registered_by_name ?? "",
    deletedAt: row.deleted_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function registerQualityRadarPhase1Routes(app: Express, deps: Deps): void {
  const { WORKSHOP_ID, supabaseAdmin, requestCanAccessQualityRadar } = deps;

  async function actorFromReq(req: Request): Promise<{ userId: string | null; name: string }> {
    const auth = authFromReq(req);
    if (!auth) return { userId: null, name: "" };
    if (auth.r === "admin") {
      return { userId: auth.u || null, name: auth.n || "Administrador" };
    }
    if (!auth.u || !supabaseAdmin || !WORKSHOP_ID) {
      return { userId: auth.u || null, name: auth.n || "" };
    }
    const { data } = await supabaseAdmin
      .from("workshop_system_users")
      .select("display_name, username")
      .eq("id", auth.u)
      .eq("workshop_id", WORKSHOP_ID)
      .maybeSingle();
    const name =
      String((data as { display_name?: string } | null)?.display_name || "").trim() ||
      String((data as { username?: string } | null)?.username || "").trim() ||
      auth.n ||
      "";
    return { userId: auth.u, name };
  }

  app.get("/api/quality-radar/people", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }

      const [{ data: techs }, { data: users }, linksRes, proposalsRes] = await Promise.all([
        supabaseAdmin
          .from("workshop_technicians")
          .select("id, name")
          .eq("workshop_id", WORKSHOP_ID)
          .order("sort_order", { ascending: true }),
        supabaseAdmin
          .from("workshop_system_users")
          .select("id, display_name, username, job_title, is_technician")
          .eq("workshop_id", WORKSHOP_ID)
          .order("display_name", { ascending: true }),
        supabaseAdmin
          .from("workshop_quality_person_links")
          .select("workshop_technician_id, system_user_id")
          .eq("workshop_id", WORKSHOP_ID),
        supabaseAdmin
          .from("workshop_quality_person_link_proposals")
          .select("*")
          .eq("workshop_id", WORKSHOP_ID)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ]);

      const linksMissing =
        linksRes.error && /does not exist|relation/i.test(linksRes.error.message);
      const links: ConfirmedPersonLink[] = linksMissing
        ? []
        : (linksRes.data ?? []).map((r) => ({
            workshopTechnicianId: String(
              (r as { workshop_technician_id: string }).workshop_technician_id
            ),
            systemUserId: String((r as { system_user_id: string }).system_user_id),
          }));

      const people = buildUnifiedPeople({
        workshopTechnicians: (techs ?? []).map((t) => ({
          id: String((t as { id: string }).id),
          name: String((t as { name: string }).name || ""),
        })),
        systemUsers: (users ?? []).map((u) => ({
          id: String((u as { id: string }).id),
          display_name: (u as { display_name?: string }).display_name,
          username: (u as { username?: string }).username,
          job_title: (u as { job_title?: string }).job_title,
        })),
        links,
      });

      const suggestions = suggestPersonLinkPairs(people);
      const pendingProposals = proposalsRes.error
        ? []
        : (proposalsRes.data ?? []).map((p) => {
            const row = p as Record<string, unknown>;
            return {
              id: row.id,
              workshopTechnicianId: row.workshop_technician_id,
              systemUserId: row.system_user_id,
              normalizedNameHint: row.normalized_name_hint ?? "",
              status: row.status,
              proposedReason: row.proposed_reason ?? "",
              proposedByName: row.proposed_by_name ?? "",
              createdAt: row.created_at,
            };
          });

      return res.json({
        people,
        suggestions,
        pendingProposals,
        linksMissing: !!linksMissing,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] GET quality-radar/people:", err);
      return res.status(500).json({ error: message });
    }
  });

  /** Confirma vínculo WT↔SU (ou cria a partir de proposta aprovada). */
  app.post("/api/quality-radar/person-links", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const workshopTechnicianId =
        typeof body.workshopTechnicianId === "string" ? body.workshopTechnicianId.trim() : "";
      const systemUserId =
        typeof body.systemUserId === "string" ? body.systemUserId.trim() : "";
      const note = typeof body.note === "string" ? body.note.trim() : "";
      const proposalId =
        typeof body.proposalId === "string" ? body.proposalId.trim() : "";
      if (!workshopTechnicianId || !systemUserId) {
        return res.status(400).json({ error: "Informe workshopTechnicianId e systemUserId." });
      }
      const actor = await actorFromReq(req);

      const { data, error } = await supabaseAdmin
        .from("workshop_quality_person_links")
        .upsert(
          {
            workshop_id: WORKSHOP_ID,
            workshop_technician_id: workshopTechnicianId,
            system_user_id: systemUserId,
            confirmed_by_user_id: actor.userId,
            confirmed_by_name: actor.name,
            note,
          },
          { onConflict: "workshop_id,workshop_technician_id" }
        )
        .select("*")
        .single();

      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error: "Migration de identidade do Radar pendente (20261104180000).",
            code: "QUALITY_RADAR_MIGRATION_REQUIRED",
          });
        }
        return res.status(500).json({ error: error.message });
      }

      if (proposalId) {
        await supabaseAdmin
          .from("workshop_quality_person_link_proposals")
          .update({
            status: "approved",
            decided_by_user_id: actor.userId,
            decided_by_name: actor.name,
            decision_note: note,
            decided_at: new Date().toISOString(),
          })
          .eq("id", proposalId)
          .eq("workshop_id", WORKSHOP_ID);
      }

      return res.status(201).json({ link: data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST person-links:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/quality-radar/person-link-proposals", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const body = (req.body || {}) as Record<string, unknown>;
      const workshopTechnicianId =
        typeof body.workshopTechnicianId === "string" ? body.workshopTechnicianId.trim() : "";
      const systemUserId =
        typeof body.systemUserId === "string" ? body.systemUserId.trim() : "";
      const proposedReason =
        typeof body.proposedReason === "string" ? body.proposedReason.trim() : "";
      const normalizedNameHint =
        typeof body.normalizedNameHint === "string" ? body.normalizedNameHint.trim() : "";
      if (!workshopTechnicianId || !systemUserId) {
        return res.status(400).json({ error: "Informe os dois identificadores." });
      }
      if (!proposedReason || proposedReason.length < 3) {
        return res.status(400).json({ error: "Justificativa obrigatória (mín. 3 caracteres)." });
      }
      const actor = await actorFromReq(req);
      const { data, error } = await supabaseAdmin
        .from("workshop_quality_person_link_proposals")
        .insert({
          workshop_id: WORKSHOP_ID,
          workshop_technician_id: workshopTechnicianId,
          system_user_id: systemUserId,
          normalized_name_hint: normalizedNameHint,
          status: "pending",
          proposed_reason: proposedReason,
          proposed_by_user_id: actor.userId,
          proposed_by_name: actor.name,
        })
        .select("*")
        .single();
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error: "Migration de identidade do Radar pendente.",
            code: "QUALITY_RADAR_MIGRATION_REQUIRED",
          });
        }
        if (/duplicate|unique/i.test(error.message)) {
          return res.status(409).json({ error: "Já existe proposta pendente para este par." });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json({ proposal: data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      console.error("[API] POST person-link-proposals:", err);
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/quality-radar/person-link-proposals/:id/reject", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const note =
        typeof (req.body as { note?: string })?.note === "string"
          ? String((req.body as { note?: string }).note).trim()
          : "";
      const actor = await actorFromReq(req);
      const { data, error } = await supabaseAdmin
        .from("workshop_quality_person_link_proposals")
        .update({
          status: "rejected",
          decided_by_user_id: actor.userId,
          decided_by_name: actor.name,
          decision_note: note,
          decided_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Proposta não encontrada." });
      return res.json({ proposal: data });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/quality-recognitions", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado ao Radar de Qualidade." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const technicianId =
        typeof req.query.technicianId === "string" ? req.query.technicianId.trim() : "";
      const systemUserId =
        typeof req.query.systemUserId === "string" ? req.query.systemUserId.trim() : "";
      const from = typeof req.query.from === "string" ? req.query.from.trim() : "";
      const to = typeof req.query.to === "string" ? req.query.to.trim() : "";

      let query = supabaseAdmin
        .from("workshop_technician_recognitions")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .is("deleted_at", null)
        .order("occurred_at", { ascending: false })
        .limit(500);
      if (technicianId) query = query.eq("technician_id", technicianId);
      if (systemUserId) query = query.eq("system_user_id", systemUserId);
      if (from) query = query.gte("occurred_at", from);
      if (to) query = query.lte("occurred_at", to);

      const { data, error } = await query;
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.json({ recognitions: [], code: "QUALITY_RADAR_MIGRATION_REQUIRED" });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json({
        recognitions: (data ?? []).map((r) => mapRecognition(r as Record<string, unknown>)),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.post("/api/quality-recognitions", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const b = (req.body || {}) as Record<string, unknown>;
      const category =
        typeof b.category === "string" &&
        (RECOGNITION_CATEGORIES as readonly string[]).includes(b.category)
          ? b.category
          : "outro";
      const personName = typeof b.personName === "string" ? b.personName.trim() : "";
      if (!personName) {
        return res.status(400).json({ error: "Informe o funcionário (personName)." });
      }
      const actor = await actorFromReq(req);
      const now = new Date().toISOString();
      const { data, error } = await supabaseAdmin
        .from("workshop_technician_recognitions")
        .insert({
          workshop_id: WORKSHOP_ID,
          technician_id: typeof b.technicianId === "string" ? b.technicianId : null,
          system_user_id: typeof b.systemUserId === "string" ? b.systemUserId : null,
          person_name: personName,
          category,
          title: typeof b.title === "string" ? b.title.trim() : "",
          description: typeof b.description === "string" ? b.description : "",
          service_order_id: typeof b.serviceOrderId === "string" ? b.serviceOrderId : null,
          service_order_label:
            typeof b.serviceOrderLabel === "string" ? b.serviceOrderLabel : null,
          occurred_at: typeof b.occurredAt === "string" ? b.occurredAt : now,
          registered_by_user_id: actor.userId,
          registered_by_name: actor.name || (typeof b.registeredByName === "string" ? b.registeredByName : ""),
          updated_at: now,
        })
        .select("*")
        .single();
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.status(503).json({
            error: "Migration de reconhecimentos pendente (20261104180000).",
            code: "QUALITY_RADAR_MIGRATION_REQUIRED",
          });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.status(201).json(mapRecognition(data as Record<string, unknown>));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.delete("/api/quality-recognitions/:id", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const actor = await actorFromReq(req);
      const { data, error } = await supabaseAdmin
        .from("workshop_technician_recognitions")
        .update({
          deleted_at: new Date().toISOString(),
          deleted_by_user_id: actor.userId,
          deleted_by_name: actor.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("workshop_id", WORKSHOP_ID)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error) return res.status(500).json({ error: error.message });
      if (!data) return res.status(404).json({ error: "Reconhecimento não encontrado." });
      return res.status(204).send();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  app.get("/api/quality-incidents/:id/revisions", async (req, res) => {
    try {
      if (!(await requestCanAccessQualityRadar(req))) {
        return res.status(403).json({ error: "Acesso negado." });
      }
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const id = String(req.params.id || "").trim();
      const { data, error } = await supabaseAdmin
        .from("workshop_technician_incident_revisions")
        .select("*")
        .eq("workshop_id", WORKSHOP_ID)
        .eq("incident_id", id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) {
        if (/does not exist|relation/i.test(error.message)) {
          return res.json({ revisions: [] });
        }
        return res.status(500).json({ error: error.message });
      }
      return res.json({
        revisions: (data ?? []).map((r) => {
          const row = r as Record<string, unknown>;
          return {
            id: row.id,
            incidentId: row.incident_id,
            actorUserId: row.actor_user_id ?? null,
            actorName: row.actor_name ?? "",
            action: row.action,
            previousSnapshot: row.previous_snapshot ?? null,
            nextSnapshot: row.next_snapshot ?? null,
            createdAt: row.created_at,
          };
        }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erro";
      return res.status(500).json({ error: message });
    }
  });

  // Export helpers for apiApp incident patches (type guard reuse)
  void isFaultAttribution;
  void canAccessQualityRadar;
}

export async function insertIncidentRevision(
  supabaseAdmin: SupabaseClient,
  workshopId: string,
  input: {
    incidentId: string;
    actorUserId: string | null;
    actorName: string;
    action: "create" | "update" | "soft_delete" | "restore";
    previousSnapshot: unknown;
    nextSnapshot: unknown;
  }
): Promise<void> {
  try {
    await supabaseAdmin.from("workshop_technician_incident_revisions").insert({
      workshop_id: workshopId,
      incident_id: input.incidentId,
      actor_user_id: input.actorUserId,
      actor_name: input.actorName,
      action: input.action,
      previous_snapshot: input.previousSnapshot,
      next_snapshot: input.nextSnapshot,
    });
  } catch (e) {
    console.warn("[API] incident revision skipped:", e);
  }
}
