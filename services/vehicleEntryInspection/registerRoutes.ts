/**
 * Rotas da Inspeção de Entrada do veículo (por OS).
 * Separadas dos checklists administrativos do Pátio.
 */
import type { Express, Request, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  VEHICLE_ENTRY_CHECKLIST_ID,
  VEHICLE_ENTRY_CHECKLIST_VERSION,
  computeEntryInspectionProgress,
  deriveEntryInspectionStatus,
  mergeEntryAnswers,
  normalizeAnswersFromUnknown,
  resolveQuestionDefs,
  snapshotVehicleEntryQuestions,
  validateEntryAnswersPayload,
  type EntryInspectionStatus,
  type EntryQuestionSnapshot,
  type EntryRoadTestStatus,
} from "../../utils/vehicleEntryInspection.js";

type SessionPayload = { r: "admin" | "user"; u?: string; n?: string };

export type RegisterVehicleEntryInspectionRoutesDeps = {
  WORKSHOP_ID: string | undefined;
  supabaseAdmin: SupabaseClient | null;
};

type InspectionRow = Record<string, unknown>;

function authFromReq(req: Request): SessionPayload | null {
  return (req as unknown as { auth?: SessionPayload }).auth ?? null;
}

async function actorFromReq(
  req: Request,
  deps: RegisterVehicleEntryInspectionRoutesDeps
): Promise<{ userId: string | null; name: string }> {
  const auth = authFromReq(req);
  if (!auth) return { userId: null, name: "" };
  if (auth.r === "admin") {
    return { userId: auth.u || null, name: auth.n || "Administrador" };
  }
  const { supabaseAdmin, WORKSHOP_ID } = deps;
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

function mapInspection(row: InspectionRow) {
  const questions = resolveQuestionDefs(
    row.question_snapshot as EntryQuestionSnapshot[] | null,
    Number(row.checklist_version) || VEHICLE_ENTRY_CHECKLIST_VERSION
  );
  const answers = normalizeAnswersFromUnknown(row.answers);
  const progress = computeEntryInspectionProgress({ questions, answers });
  return {
    id: row.id,
    workshopId: row.workshop_id,
    serviceOrderId: row.service_order_id,
    checklistId: row.checklist_id,
    checklistVersion: row.checklist_version,
    status: row.status as EntryInspectionStatus,
    answers,
    questionSnapshot: questions,
    observations: row.observations ?? null,
    anomalySummary: [],
    responsibleUserId: row.responsible_user_id ?? null,
    responsibleName: row.responsible_name ?? null,
    startedAt: row.started_at ?? null,
    completedAt: row.completed_at ?? null,
    roadTestStatus: (row.road_test_status as EntryRoadTestStatus) || "not_requested",
    roadTestConfirmedAt: row.road_test_confirmed_at ?? null,
    roadTestConfirmedBy: row.road_test_confirmed_by ?? null,
    criticalCleared: false,
    criticalClearedAt: null,
    criticalClearedBy: null,
    criticalClearanceNote: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    progress,
    safety: {
      blocksRoadTest: false,
      criticalCount: 0,
      anomalyCount: 0,
      criticalFindings: [],
      anomalyFindings: [],
    },
    /** Não é diagnóstico confirmado — apenas registro de inspeção. */
    diagnosticClaim: false as const,
  };
}

async function loadOrder(
  deps: RegisterVehicleEntryInspectionRoutesDeps,
  serviceOrderId: string
): Promise<{ id: string; order_type: string | null } | null> {
  const { supabaseAdmin, WORKSHOP_ID } = deps;
  if (!supabaseAdmin || !WORKSHOP_ID) return null;
  const { data } = await supabaseAdmin
    .from("service_orders")
    .select("id, order_type")
    .eq("id", serviceOrderId)
    .eq("workshop_id", WORKSHOP_ID)
    .maybeSingle();
  return (data as { id: string; order_type: string | null } | null) ?? null;
}

async function loadInspection(
  deps: RegisterVehicleEntryInspectionRoutesDeps,
  serviceOrderId: string
): Promise<InspectionRow | null> {
  const { supabaseAdmin, WORKSHOP_ID } = deps;
  if (!supabaseAdmin || !WORKSHOP_ID) return null;
  const { data, error } = await supabaseAdmin
    .from("service_order_entry_inspections")
    .select("*")
    .eq("workshop_id", WORKSHOP_ID)
    .eq("service_order_id", serviceOrderId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InspectionRow | null) ?? null;
}

async function appendEvent(
  deps: RegisterVehicleEntryInspectionRoutesDeps,
  input: {
    inspectionId: string;
    serviceOrderId: string;
    eventType: string;
    actorUserId: string | null;
    actorName: string;
    payload?: Record<string, unknown>;
  }
): Promise<void> {
  const { supabaseAdmin, WORKSHOP_ID } = deps;
  if (!supabaseAdmin || !WORKSHOP_ID) return;
  const { error } = await supabaseAdmin.from("service_order_entry_inspection_events").insert({
    inspection_id: input.inspectionId,
    workshop_id: WORKSHOP_ID,
    service_order_id: input.serviceOrderId,
    event_type: input.eventType,
    actor_user_id: input.actorUserId,
    actor_name: input.actorName || null,
    payload: input.payload || {},
  });
  if (error) {
    console.error("[entry-inspection] falha ao gravar evento:", error.message);
  }
}

function definitionPayload() {
  return {
    checklistId: VEHICLE_ENTRY_CHECKLIST_ID,
    checklistVersion: VEHICLE_ENTRY_CHECKLIST_VERSION,
    questions: snapshotVehicleEntryQuestions(VEHICLE_ENTRY_CHECKLIST_VERSION),
  };
}

export function registerVehicleEntryInspectionRoutes(
  app: Express,
  deps: RegisterVehicleEntryInspectionRoutesDeps
): void {
  const { WORKSHOP_ID, supabaseAdmin } = deps;

  app.get("/api/service-orders/:id/entry-inspection", async (req: Request, res: Response) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const serviceOrderId = String(req.params.id || "").trim();
      const order = await loadOrder(deps, serviceOrderId);
      if (!order) return res.status(404).json({ error: "Ordem de serviço não encontrada." });

      const row = await loadInspection(deps, serviceOrderId);
      let events: unknown[] = [];
      if (row?.id) {
        const { data: ev } = await supabaseAdmin
          .from("service_order_entry_inspection_events")
          .select("id, event_type, actor_name, payload, created_at")
          .eq("inspection_id", row.id)
          .order("created_at", { ascending: false })
          .limit(40);
        events = (ev || []).map((e: Record<string, unknown>) => ({
          id: e.id,
          eventType: e.event_type,
          actorName: e.actor_name,
          payload: e.payload,
          createdAt: e.created_at,
        }));
      }

      return res.json({
        orderType: order.order_type || "vehicle",
        definition: definitionPayload(),
        inspection: row ? mapInspection(row) : null,
        events,
        note: "Respostas da inspeção não constituem diagnóstico confirmado.",
      });
    } catch (err: unknown) {
      console.error("[API] GET entry-inspection:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  });

  app.post(
    "/api/service-orders/:id/entry-inspection/start",
    async (req: Request, res: Response) => {
      try {
        if (!supabaseAdmin || !WORKSHOP_ID) {
          return res.status(500).json({ error: "Servidor não configurado." });
        }
        const serviceOrderId = String(req.params.id || "").trim();
        const order = await loadOrder(deps, serviceOrderId);
        if (!order) return res.status(404).json({ error: "Ordem de serviço não encontrada." });
        if (order.order_type === "module") {
          return res.status(400).json({
            error: "Inspeção de Entrada aplica-se apenas a OS de veículo.",
            code: "not_vehicle",
          });
        }

        const existing = await loadInspection(deps, serviceOrderId);
        if (existing) {
          return res.json({ inspection: mapInspection(existing), created: false });
        }

        const actor = await actorFromReq(req, deps);
        const now = new Date().toISOString();
        const snapshot = snapshotVehicleEntryQuestions(VEHICLE_ENTRY_CHECKLIST_VERSION);
        const insert = {
          workshop_id: WORKSHOP_ID,
          service_order_id: serviceOrderId,
          checklist_id: VEHICLE_ENTRY_CHECKLIST_ID,
          checklist_version: VEHICLE_ENTRY_CHECKLIST_VERSION,
          status: "in_progress" as EntryInspectionStatus,
          answers: {},
          question_snapshot: snapshot,
          anomaly_summary: [],
          responsible_user_id: actor.userId,
          responsible_name: actor.name || null,
          started_at: now,
          road_test_status: "not_requested" as EntryRoadTestStatus,
          critical_cleared: false,
          created_at: now,
          updated_at: now,
        };

        const { data, error } = await supabaseAdmin
          .from("service_order_entry_inspections")
          .insert(insert)
          .select("*")
          .single();

        if (error) {
          // Corrida: outra requisição criou — retorna a existente.
          if (/duplicate|unique/i.test(error.message)) {
            const again = await loadInspection(deps, serviceOrderId);
            if (again) return res.json({ inspection: mapInspection(again), created: false });
          }
          return res.status(500).json({ error: error.message });
        }

        await appendEvent(deps, {
          inspectionId: String(data.id),
          serviceOrderId,
          eventType: "started",
          actorUserId: actor.userId,
          actorName: actor.name,
          payload: {
            checklistId: VEHICLE_ENTRY_CHECKLIST_ID,
            checklistVersion: VEHICLE_ENTRY_CHECKLIST_VERSION,
          },
        });

        return res.status(201).json({ inspection: mapInspection(data as InspectionRow), created: true });
      } catch (err: unknown) {
        console.error("[API] POST entry-inspection/start:", err);
        return res.status(500).json({
          error: err instanceof Error ? err.message : "Erro desconhecido",
        });
      }
    }
  );

  app.put("/api/service-orders/:id/entry-inspection", async (req: Request, res: Response) => {
    try {
      if (!supabaseAdmin || !WORKSHOP_ID) {
        return res.status(500).json({ error: "Servidor não configurado." });
      }
      const serviceOrderId = String(req.params.id || "").trim();
      const order = await loadOrder(deps, serviceOrderId);
      if (!order) return res.status(404).json({ error: "Ordem de serviço não encontrada." });

      const row = await loadInspection(deps, serviceOrderId);
      if (!row) {
        return res.status(404).json({
          error: "Inspeção ainda não iniciada. Use POST .../entry-inspection/start.",
          code: "not_started",
        });
      }

      const body = (req.body || {}) as {
        answers?: unknown;
        observations?: unknown;
        expectedUpdatedAt?: unknown;
        markCompleted?: unknown;
      };

      const expectedUpdatedAt =
        typeof body.expectedUpdatedAt === "string" ? body.expectedUpdatedAt.trim() : "";
      if (!expectedUpdatedAt) {
        return res.status(409).json({
          error: "expectedUpdatedAt é obrigatório (controle de concorrência).",
          code: "cas_required",
        });
      }
      if (String(row.updated_at) !== expectedUpdatedAt) {
        return res.status(409).json({
          error: "Inspeção foi alterada por outro usuário. Recarregue e tente novamente.",
          code: "cas_conflict",
          inspection: mapInspection(row),
        });
      }

      const questions = resolveQuestionDefs(
        row.question_snapshot as EntryQuestionSnapshot[] | null,
        Number(row.checklist_version) || VEHICLE_ENTRY_CHECKLIST_VERSION
      );
      const patch = normalizeAnswersFromUnknown(body.answers ?? {});
      const now = new Date().toISOString();
      const merged = mergeEntryAnswers(
        normalizeAnswersFromUnknown(row.answers),
        patch,
        now
      );

      const markCompleted = body.markCompleted === true;
      const validation = validateEntryAnswersPayload({
        questions,
        answers: merged,
        requireComplete: markCompleted,
      });
      if (validation.ok === false) {
        return res.status(400).json({ error: validation.error, code: validation.code });
      }

      let status = deriveEntryInspectionStatus({
        answers: merged,
        questions,
        explicitStatus: markCompleted ? "completed" : null,
      });
      if (!markCompleted && status === "completed") {
        status = "completed";
      }
      if (status === "pending" && Object.keys(merged).length > 0) {
        status = "in_progress";
      }

      const actor = await actorFromReq(req, deps);
      const observations =
        body.observations === undefined
          ? row.observations
          : body.observations == null
            ? null
            : String(body.observations);

      // Registro simples: sem bloqueios, sem resumo de anomalias na ficha.
      const updates: Record<string, unknown> = {
        answers: merged,
        observations,
        anomaly_summary: [],
        status,
        road_test_status: "not_requested",
        critical_cleared: false,
        critical_cleared_at: null,
        critical_cleared_by: null,
        critical_clearance_note: null,
        responsible_user_id: actor.userId || row.responsible_user_id,
        responsible_name: actor.name || row.responsible_name,
        updated_at: now,
        completed_at: status === "completed" ? row.completed_at || now : null,
      };

      const { data, error } = await supabaseAdmin
        .from("service_order_entry_inspections")
        .update(updates)
        .eq("id", row.id)
        .eq("updated_at", expectedUpdatedAt)
        .select("*")
        .maybeSingle();

      if (error) return res.status(500).json({ error: error.message });
      if (!data) {
        const again = await loadInspection(deps, serviceOrderId);
        return res.status(409).json({
          error: "Inspeção foi alterada por outro usuário. Recarregue e tente novamente.",
          code: "cas_conflict",
          inspection: again ? mapInspection(again) : null,
        });
      }

      await appendEvent(deps, {
        inspectionId: String(data.id),
        serviceOrderId,
        eventType: markCompleted ? "completed" : "answers_updated",
        actorUserId: actor.userId,
        actorName: actor.name,
        payload: {
          answered: computeEntryInspectionProgress({ questions, answers: merged }).answered,
          status,
        },
      });

      return res.json({ inspection: mapInspection(data as InspectionRow) });
    } catch (err: unknown) {
      console.error("[API] PUT entry-inspection:", err);
      return res.status(500).json({
        error: err instanceof Error ? err.message : "Erro desconhecido",
      });
    }
  });

  // Rotas legadas: o checklist não bloqueia mais condições críticas nem registra rodagem.
  app.post(
    "/api/service-orders/:id/entry-inspection/clear-critical",
    async (_req: Request, res: Response) => {
      return res.status(410).json({
        error:
          "Bloqueio por condições críticas foi removido. A inspeção é apenas registro das condições de chegada.",
        code: "feature_removed",
      });
    }
  );

  app.post(
    "/api/service-orders/:id/entry-inspection/confirm-road-test",
    async (_req: Request, res: Response) => {
      return res.status(410).json({
        error:
          "Registro de teste de rodagem foi removido deste checklist. Use outros fluxos da OS se necessário.",
        code: "feature_removed",
      });
    }
  );
}

/** Helper para tools RDA (leitura). */
export async function fetchEntryInspectionForRda(
  deps: RegisterVehicleEntryInspectionRoutesDeps,
  serviceOrderId: string
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const order = await loadOrder(deps, serviceOrderId);
    if (!order) return { ok: false, error: "OS não encontrada." };
    const row = await loadInspection(deps, serviceOrderId);
    return {
      ok: true,
      data: {
        note: "Registro de inspeção de entrada — não é diagnóstico confirmado.",
        orderType: order.order_type,
        definition: definitionPayload(),
        inspection: row ? mapInspection(row) : null,
      },
    };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha ao consultar inspeção." };
  }
}
