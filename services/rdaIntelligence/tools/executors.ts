import type { SupabaseClient } from "@supabase/supabase-js";
import {
  detectIncompleteSignals,
  fetchIncidents,
  fetchManagerialEvaluations,
  fetchPersonProfileBundle,
  fetchPdiAndMeetings,
  fetchPriorWeeklyReviews,
  fetchRecognitions,
  fetchServiceHistorySplit,
  fetchWorkTimes,
  resolvePersonIdentity,
} from "../../qualityRadar/personDossier.js";
import {
  orderTypeToSector,
  parseSectorParam,
  RDA_ORDER_TYPE_LAB,
  RDA_ORDER_TYPE_PATIO,
  sectorLabel,
  sectorToOrderType,
  type RdaServiceOrderType,
  type RdaWorkshopSector,
} from "./orderTypes.js";
import {
  callKnowledgeRpc,
  retrieveApprovedKnowledge,
  suggestKnowledgeKeyFromTitle,
} from "../knowledge/repository.js";
import { findKnowledgeConflicts, normalizeKnowledgeKey } from "../knowledge/rules.js";
import { allowedKnowledgeVisibilitiesForAuth } from "../knowledge/access.js";
import type { RdaKnowledgeItemRow } from "../knowledge/types.js";
import {
  queryOperationalOverview,
  queryOperationalPatterns,
  queryPauseReasonsSummary,
  queryServiceDurationStats,
  queryTechnicianBreakdown,
} from "../operationalLearning/service.js";
import type { RdaWorkTimeKind } from "../workSessions/stageRules.js";
import {
  queryPatioAttentionToday,
  queryPatioBottlenecks,
  queryPatioDeliveryRisks,
  queryPatioPriorities,
  queryPatioReadyToStart,
  queryPatioWaitingParts,
} from "../patioIntelligence/service.js";
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
  queryStockSummary,
} from "../labEstoqueIntelligence/service.js";
import { queryProactiveAlertsForAssistant } from "../proactiveIntelligence/service.js";
import type {
  ProactiveCategory,
  ProactiveSeverity,
} from "../proactiveIntelligence/types.js";
import {
  createProductivityTask,
  listAssignablePeople,
  listProductivityTasks,
  summarizePendingTasks,
  updateProductivityTask,
} from "../productivity/service.js";
import type {
  ProductivityTaskFilters,
  ProductivityTaskPriority,
  ProductivityTaskRefType,
  ProductivityTaskStatus,
} from "../productivity/types.js";

function periodFromParams(params: Record<string, unknown>): { from: string; to: string } | undefined {
  const from = typeof params.from === "string" ? params.from.trim() : "";
  const to = typeof params.to === "string" ? params.to.trim() : "";
  if (!from && !to) return undefined;
  return {
    from: from || new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    to: to || new Date().toISOString().slice(0, 10),
  };
}

function personRefFromParams(params: Record<string, unknown>) {
  return {
    personName: typeof params.personName === "string" ? params.personName : null,
    systemUserId: typeof params.systemUserId === "string" ? params.systemUserId : null,
    workshopTechnicianId:
      typeof params.workshopTechnicianId === "string" ? params.workshopTechnicianId : null,
  };
}

export type RdaToolExecContext = {
  workshopId: string;
  supabase: SupabaseClient;
  /** Necessário para filtrar memória por visibility. */
  auth?: import("../types.js").RdaAuthContext | null;
};

function clampLimit(n: unknown, fallback: number, max = 40): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), max);
}

function hoursSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, (Date.now() - t) / 3600000);
}

function normPlate(p: string): string {
  return p.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

const STALLED_SELECT =
  "id, os_number, plate, vehicle_model, vehicle_brand, status, updated_at, created_at, status_entered_at, assigned_technician, issue_description, order_type, module_identification, bench_slot, module_kind";

const STAGE_SELECT =
  "id, status, updated_at, status_entered_at, plate, os_number, order_type, module_identification, bench_slot";

async function listStalledByOrderType(
  ctx: RdaToolExecContext,
  orderType: RdaServiceOrderType,
  params: Record<string, unknown>
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const sector: RdaWorkshopSector =
    orderType === RDA_ORDER_TYPE_LAB ? "laboratorio" : "patio";
  const minHours = Number(params.minHours ?? 24);
  const limit = clampLimit(params.limit, 15);
  let select = STALLED_SELECT;
  let { data, error } = await ctx.supabase
    .from("service_orders")
    .select(select)
    .eq("workshop_id", ctx.workshopId)
    .eq("order_type", orderType)
    .neq("status", "CANCELLED")
    .neq("status", "FINALIZADO")
    .neq("status", "ENTREGUE")
    .neq("status", "PRONTO_PRA_RETIRADA")
    .order("created_at", { ascending: true })
    .limit(80);
  if (error && /status_entered_at/i.test(error.message)) {
    select = STALLED_SELECT.replace(", status_entered_at", "");
    const fallback = await ctx.supabase
      .from("service_orders")
      .select(select)
      .eq("workshop_id", ctx.workshopId)
      .eq("order_type", orderType)
      .neq("status", "CANCELLED")
      .neq("status", "FINALIZADO")
      .neq("status", "ENTREGUE")
      .neq("status", "PRONTO_PRA_RETIRADA")
      .order("created_at", { ascending: true })
      .limit(80);
    data = fallback.data;
    error = fallback.error;
  }
  if (error) return { ok: false, error: error.message };
  const threshold = Number.isFinite(minHours) ? minHours : 24;
  const sourceRows = (data || []) as unknown as Array<Record<string, unknown>>;
  const rows = sourceRows
    .map((r) => {
      const entered = r.status_entered_at;
      const known = entered != null && String(entered).trim() !== "";
      const hours = known ? hoursSince(String(entered)) : null;
      return {
        ...r,
        stageTimeKnown: known,
        stalledHours: hours,
        stageTimeLabel: known
          ? `${Math.round((hours || 0) * 10) / 10}h na etapa`
          : "Tempo na etapa desconhecido",
        sector,
        order_type: orderType,
      };
    })
    .filter((r) => r.stageTimeKnown && (r.stalledHours ?? 0) >= threshold)
    .slice(0, limit);
  return {
    ok: true,
    data: {
      sector,
      orderType,
      sectorLabel: sectorLabel(sector),
      note:
        orderType === RDA_ORDER_TYPE_PATIO
          ? "Somente OS do Pátio (veículos). Permanência = status_entered_at; sem histórico → omitido (não usa updated_at)."
          : "Somente OS do Laboratório (módulos). Não é estoque. Permanência = status_entered_at; sem histórico → omitido.",
      items: rows,
    },
  };
}

async function stageSnapshotByOrderType(
  ctx: RdaToolExecContext,
  orderType: RdaServiceOrderType
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const sector: RdaWorkshopSector =
    orderType === RDA_ORDER_TYPE_LAB ? "laboratorio" : "patio";
  const { data, error } = await ctx.supabase
    .from("service_orders")
    .select(STAGE_SELECT)
    .eq("workshop_id", ctx.workshopId)
    .eq("order_type", orderType)
    .neq("status", "CANCELLED")
    .limit(2000);
  if (error) return { ok: false, error: error.message };
  const counts: Record<string, number> = {};
  for (const r of data || []) {
    const s = String((r as { status?: string }).status || "UNKNOWN");
    counts[s] = (counts[s] || 0) + 1;
  }
  const waitingApproval = (data || []).filter((r) =>
    /APROV|ORCAMENTO|ORÇAMENT/i.test(String((r as { status?: string }).status || ""))
  );
  const waitingParts = (data || []).filter((r) =>
    /PE[CÇ]A|AGUARD/i.test(String((r as { status?: string }).status || ""))
  );
  return {
    ok: true,
    data: {
      sector,
      orderType,
      sectorLabel: sectorLabel(sector),
      countsByStatus: counts,
      waitingApprovalCount: waitingApproval.length,
      waitingPartsCount: waitingParts.length,
      sampleWaitingApproval: waitingApproval.slice(0, 8),
      sampleWaitingParts: waitingParts.slice(0, 8),
      note:
        orderType === RDA_ORDER_TYPE_PATIO
          ? "Snapshot exclusivo do Pátio (order_type=vehicle)."
          : "Snapshot exclusivo do Laboratório (order_type=module). Não inclui estoque.",
    },
  };
}

/**
 * Executa tool já autorizada. Sempre filtra por workshopId do contexto.
 */
export async function executeRdaTool(
  toolId: string,
  params: Record<string, unknown>,
  ctx: RdaToolExecContext
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const { workshopId, supabase } = ctx;
  try {
    switch (toolId) {
      case "rda_list_stalled_vehicles":
        return listStalledByOrderType(ctx, RDA_ORDER_TYPE_PATIO, params);

      case "rda_list_stalled_modules":
        return listStalledByOrderType(ctx, RDA_ORDER_TYPE_LAB, params);

      case "rda_technician_active_work": {
        const nameQ = String(params.technicianName || "").trim().toLowerCase();
        const userId = String(params.technicianUserId || "").trim();
        let techIds: string[] = userId ? [userId] : [];
        if (!techIds.length && nameQ) {
          const { data: users } = await supabase
            .from("workshop_system_users")
            .select("id, display_name, username")
            .eq("workshop_id", workshopId)
            .eq("is_technician", true);
          techIds = (users || [])
            .filter((u) => {
              const dn = String((u as { display_name?: string }).display_name || "").toLowerCase();
              const un = String((u as { username?: string }).username || "").toLowerCase();
              return dn.includes(nameQ) || un.includes(nameQ);
            })
            .map((u) => String((u as { id: string }).id));
        }
        if (!techIds.length) {
          return { ok: true, data: { technicians: [], sessions: [], message: "Técnico não encontrado." } };
        }
        const { data: sessions, error } = await supabase
          .from("rda_work_sessions")
          .select(
            "id, service_order_id, technician_user_id, status, started_at, productive_ms, paused_ms, budget_service_description"
          )
          .eq("workshop_id", workshopId)
          .in("technician_user_id", techIds)
          .in("status", ["running", "paused"])
          .order("started_at", { ascending: false });
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { technicianUserIds: techIds, sessions: sessions || [] } };
      }

      case "rda_vehicle_maintenance_history": {
        const limit = clampLimit(params.limit, 20);
        let plate = String(params.plate || "").trim();
        const soId = String(params.serviceOrderId || "").trim();
        if (!plate && soId) {
          const { data: so } = await supabase
            .from("service_orders")
            .select("plate, order_type")
            .eq("workshop_id", workshopId)
            .eq("id", soId)
            .maybeSingle();
          plate = String((so as { plate?: string } | null)?.plate || "");
        }
        if (!plate) return { ok: false, error: "Informe plate ou serviceOrderId." };
        const needle = normPlate(plate);
        const { data, error } = await supabase
          .from("service_orders")
          .select(
            "id, os_number, plate, vehicle_model, status, issue_description, created_at, updated_at, mileage_km, order_type"
          )
          .eq("workshop_id", workshopId)
          .eq("order_type", RDA_ORDER_TYPE_PATIO)
          .order("created_at", { ascending: false })
          .limit(120);
        if (error) return { ok: false, error: error.message };
        const items = (data || [])
          .filter((r) => normPlate(String((r as { plate?: string }).plate || "")) === needle)
          .slice(0, limit)
          .map((r) => ({
            ...r,
            sector: "patio" as const,
            order_type: RDA_ORDER_TYPE_PATIO,
          }));
        return {
          ok: true,
          data: {
            plate,
            sector: "patio",
            orderType: RDA_ORDER_TYPE_PATIO,
            note: "Histórico apenas de OS do Pátio (veículos).",
            items,
          },
        };
      }

      case "rda_search_similar_complaints": {
        const query = String(params.query || "").trim();
        if (!query) return { ok: false, error: "query obrigatória." };
        const limit = clampLimit(params.limit, 12);
        const modelHint = String(params.vehicleModel || "").trim().toLowerCase();
        const sectorParam = parseSectorParam(params.sector) || "all";
        let q = supabase
          .from("service_orders")
          .select(
            "id, os_number, plate, vehicle_model, status, issue_description, ai_analysis, created_at, order_type, module_identification"
          )
          .eq("workshop_id", workshopId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (sectorParam !== "all") {
          q = q.eq("order_type", sectorToOrderType(sectorParam));
        }
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        const tokens = query
          .toLowerCase()
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 3);
        const scored = (data || [])
          .map((r) => {
            const sector = orderTypeToSector((r as { order_type?: string }).order_type);
            const hay = `${(r as { issue_description?: string }).issue_description || ""} ${(r as { ai_analysis?: string }).ai_analysis || ""} ${(r as { vehicle_model?: string }).vehicle_model || ""} ${(r as { module_identification?: string }).module_identification || ""}`.toLowerCase();
            let score = 0;
            for (const t of tokens) if (hay.includes(t)) score += 1;
            if (
              modelHint &&
              String((r as { vehicle_model?: string }).vehicle_model || "")
                .toLowerCase()
                .includes(modelHint)
            ) {
              score += 0.5;
            }
            return {
              row: {
                ...r,
                sector,
                order_type:
                  (r as { order_type?: string }).order_type ||
                  sectorToOrderType(sector),
              },
              score,
            };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((x) => ({ ...x.row, matchScore: x.score }));
        return {
          ok: true,
          data: {
            sectorFilter: sectorParam,
            note: "Similaridade textual simples — não é diagnóstico confirmado. Itens trazem sector/order_type.",
            items: scored,
          },
        };
      }

      case "rda_search_error_bulletins": {
        const query = String(params.query || "").trim();
        const dtc = String(params.dtcCode || "").trim();
        const limit = clampLimit(params.limit, 15);
        const { data, error } = await supabase
          .from("error_bulletins")
          .select("id, title, summary, dtc_codes, vehicle_models, created_at")
          .eq("workshop_id", workshopId)
          .order("created_at", { ascending: false })
          .limit(80);
        if (error) {
          const alt = await supabase
            .from("workshop_error_bulletins")
            .select("*")
            .eq("workshop_id", workshopId)
            .limit(80);
          if (alt.error) {
            return {
              ok: true,
              data: {
                items: [],
                note: `Boletins indisponíveis neste schema: ${error.message}`,
              },
            };
          }
          return { ok: true, data: { items: (alt.data || []).slice(0, limit) } };
        }
        const needle = (query || dtc).toLowerCase();
        const items = (data || [])
          .filter((r) => {
            if (!needle) return true;
            const hay = JSON.stringify(r).toLowerCase();
            return hay.includes(needle);
          })
          .slice(0, limit);
        return { ok: true, data: { items } };
      }

      case "rda_search_stock_parts": {
        const query = String(params.query || "").trim();
        if (!query) return { ok: false, error: "query obrigatória." };
        const onlyInStock = params.onlyInStock !== false;
        const limit = clampLimit(params.limit, 20);
        const stockDisclaimer =
          "Resultado do ESTOQUE (workshop_parts). Código do produto = original_code (não há coluna sku). Quantidade = stock_qty. Não são OS do Lab nem unidades ABS. Sem afirmar compatibilidade sem evidência.";
        const like = `%${query}%`;
        // Colunas existentes em produção: original_code, barcode, stock_qty, min_stock_qty, location (sem sku).
        const { data, error } = await supabase
          .from("workshop_parts")
          .select(
            "id, name, barcode, brand, stock_qty, min_stock_qty, location, notes, original_code"
          )
          .eq("workshop_id", workshopId)
          .or(
            [
              `name.ilike.${like}`,
              `barcode.ilike.${like}`,
              `brand.ilike.${like}`,
              `original_code.ilike.${like}`,
            ].join(",")
          )
          .limit(Math.max(limit * 3, 40));
        if (error) {
          const all = await supabase
            .from("workshop_parts")
            .select("id, name, brand, stock_qty, location, original_code, barcode")
            .eq("workshop_id", workshopId)
            .limit(200);
          if (all.error) return { ok: false, error: all.error.message };
          const qtext = query.toLowerCase();
          const items = (all.data || [])
            .filter((r) => {
              const hay = [
                (r as { name?: string }).name,
                (r as { brand?: string }).brand,
                (r as { original_code?: string }).original_code,
                (r as { barcode?: string }).barcode,
                (r as { location?: string }).location,
              ]
                .filter(Boolean)
                .join(" ")
                .toLowerCase();
              return hay.includes(qtext);
            })
            .filter((r) =>
              onlyInStock ? Number((r as { stock_qty?: number }).stock_qty || 0) > 0 : true
            )
            .slice(0, limit);
          return {
            ok: true,
            data: {
              source: "workshop_parts",
              disclaimer: stockDisclaimer,
              items,
            },
          };
        }
        const items = (data || [])
          .filter((r) =>
            onlyInStock ? Number((r as { stock_qty?: number }).stock_qty || 0) > 0 : true
          )
          .slice(0, limit);
        return {
          ok: true,
          data: {
            source: "workshop_parts",
            disclaimer: stockDisclaimer,
            items,
          },
        };
      }

      case "rda_work_performance_summary": {
        const to = String(params.to || new Date().toISOString());
        const fromDefault = new Date(Date.now() - 7 * 86400000).toISOString();
        const from = String(params.from || fromDefault);
        const { data, error } = await supabase
          .from("rda_work_sessions")
          .select(
            "technician_user_id, status, productive_ms, paused_ms, started_at, ended_at"
          )
          .eq("workshop_id", workshopId)
          .gte("started_at", from)
          .lte("started_at", to)
          .limit(2000);
        if (error) return { ok: false, error: error.message };
        const byTech = new Map<
          string,
          { productiveMs: number; pausedMs: number; sessions: number; finished: number }
        >();
        for (const row of data || []) {
          const id = String((row as { technician_user_id: string }).technician_user_id);
          const cur = byTech.get(id) || {
            productiveMs: 0,
            pausedMs: 0,
            sessions: 0,
            finished: 0,
          };
          cur.sessions += 1;
          cur.productiveMs += Number((row as { productive_ms?: number }).productive_ms || 0);
          cur.pausedMs += Number((row as { paused_ms?: number }).paused_ms || 0);
          if ((row as { status?: string }).status === "finished") cur.finished += 1;
          byTech.set(id, cur);
        }
        return {
          ok: true,
          data: {
            from,
            to,
            technicians: [...byTech.entries()].map(([technicianUserId, v]) => ({
              technicianUserId,
              ...v,
            })),
          },
        };
      }

      case "rda_pending_evaluations": {
        const status = String(params.status || "pending").trim();
        const limit = clampLimit(params.limit, 30);
        let q = supabase
          .from("rda_eval_requests")
          .select(
            "id, status, service_order_id, technician_user_id, session_ended_at, created_at"
          )
          .eq("workshop_id", workshopId)
          .order("created_at", { ascending: false })
          .limit(limit);
        if (status && status !== "all") q = q.eq("status", status);
        const { data, error } = await q;
        if (error) return { ok: false, error: error.message };
        return { ok: true, data: { items: data || [] } };
      }

      case "rda_patio_stage_snapshot":
        return stageSnapshotByOrderType(ctx, RDA_ORDER_TYPE_PATIO);

      case "rda_lab_stage_snapshot":
        return stageSnapshotByOrderType(ctx, RDA_ORDER_TYPE_LAB);

      case "rda_get_service_order": {
        const soId = String(params.serviceOrderId || "").trim();
        const plate = String(params.plate || "").trim();
        if (!soId && !plate) return { ok: false, error: "Informe serviceOrderId ou plate." };
        let query = supabase
          .from("service_orders")
          .select(
            "id, os_number, plate, vehicle_model, vehicle_brand, vehicle_year, vehicle_engine_info, vehicle_chassis, status, issue_description, assigned_technician, created_at, updated_at, mileage_km, order_type, module_identification, module_kind"
          )
          .eq("workshop_id", workshopId);
        if (soId) query = query.eq("id", soId);
        const { data, error } = await query.limit(20);
        if (error) return { ok: false, error: error.message };
        let items: Record<string, unknown>[] = (data || []) as Record<
          string,
          unknown
        >[];
        if (plate) {
          const n = normPlate(plate);
          items = items.filter((r) => normPlate(String(r.plate || "")) === n);
          if (!items.length && !soId) {
            const all = await supabase
              .from("service_orders")
              .select(
                "id, os_number, plate, vehicle_model, vehicle_brand, vehicle_year, status, issue_description, created_at, updated_at, order_type, module_identification, module_kind"
              )
              .eq("workshop_id", workshopId)
              .order("created_at", { ascending: false })
              .limit(100);
            if (all.error) return { ok: false, error: all.error.message };
            items = ((all.data || []) as Record<string, unknown>[]).filter(
              (r) => normPlate(String(r.plate || "")) === n
            );
          }
        }
        const enriched = items.slice(0, 5).map((r) => {
          const sector = orderTypeToSector(r.order_type);
          return {
            ...r,
            sector,
            sectorLabel: sectorLabel(sector),
            order_type: r.order_type || sectorToOrderType(sector),
          };
        });
        return {
          ok: true,
          data: {
            note: "Consulta específica: pode retornar veículo (Pátio) e/ou módulo (Laboratório).",
            items: enriched,
          },
        };
      }

      case "rda_propose_open_service_order": {
        const lookup = await executeRdaTool("rda_get_service_order", params, ctx);
        if (lookup.ok === false) return lookup;
        const items = ((lookup.data as { items?: unknown[] }).items || []) as Array<{
          id?: string;
          plate?: string;
          os_number?: number;
          order_type?: string;
          sector?: string;
        }>;
        if (!items.length) {
          return { ok: false, error: "OS não encontrada para propor abertura." };
        }
        const first = items[0];
        return {
          ok: true,
          data: {
            proposedAction: "open_service_order",
            requiresHumanConfirmation: true,
            serviceOrderId: first.id,
            plate: first.plate,
            osNumber: first.os_number,
            orderType: first.order_type,
            sector: first.sector || orderTypeToSector(first.order_type),
            message:
              "Ação proposta: abrir esta OS na interface. Nenhuma alteração foi feita no banco.",
          },
        };
      }

      case "rda_quality_person_profile": {
        const data = await fetchPersonProfileBundle(
          supabase,
          workshopId,
          personRefFromParams(params),
          periodFromParams(params)
        );
        return { ok: true, data };
      }

      case "rda_quality_recognitions": {
        const identity = await resolvePersonIdentity(
          supabase,
          workshopId,
          personRefFromParams(params)
        );
        const data = await fetchRecognitions(
          supabase,
          workshopId,
          identity,
          periodFromParams(params),
          clampLimit(params.limit, 20)
        );
        return { ok: true, data: { identity, ...data } };
      }

      case "rda_quality_incidents": {
        const identity = await resolvePersonIdentity(
          supabase,
          workshopId,
          personRefFromParams(params)
        );
        const data = await fetchIncidents(
          supabase,
          workshopId,
          identity,
          periodFromParams(params),
          clampLimit(params.limit, 20)
        );
        return { ok: true, data: { identity, ...data } };
      }

      case "rda_quality_service_history": {
        const identity = await resolvePersonIdentity(
          supabase,
          workshopId,
          personRefFromParams(params)
        );
        const data = await fetchServiceHistorySplit(
          supabase,
          workshopId,
          identity,
          periodFromParams(params),
          clampLimit(params.limit, 15)
        );
        return { ok: true, data: { identity, ...data } };
      }

      case "rda_quality_work_times": {
        const identity = await resolvePersonIdentity(
          supabase,
          workshopId,
          personRefFromParams(params)
        );
        const data = await fetchWorkTimes(
          supabase,
          workshopId,
          identity,
          periodFromParams(params)
        );
        return { ok: true, data: { identity, ...data } };
      }

      case "rda_quality_career_and_pdi": {
        const identity = await resolvePersonIdentity(
          supabase,
          workshopId,
          personRefFromParams(params)
        );
        const data = await fetchPdiAndMeetings(
          supabase,
          workshopId,
          identity,
          periodFromParams(params)
        );
        return { ok: true, data: { identity, ...data } };
      }

      case "rda_quality_managerial_evaluations": {
        const identity = await resolvePersonIdentity(
          supabase,
          workshopId,
          personRefFromParams(params)
        );
        const data = await fetchManagerialEvaluations(
          supabase,
          workshopId,
          identity,
          periodFromParams(params),
          clampLimit(params.limit, 20)
        );
        return { ok: true, data: { identity, ...data } };
      }

      case "rda_quality_prior_weekly_reviews": {
        const identity = await resolvePersonIdentity(
          supabase,
          workshopId,
          personRefFromParams(params)
        );
        const data = await fetchPriorWeeklyReviews(
          supabase,
          workshopId,
          identity,
          clampLimit(params.limit, 8)
        );
        return { ok: true, data: { identity, ...data } };
      }

      case "rda_quality_week_dossier": {
        const ref = personRefFromParams(params);
        const period = periodFromParams(params);
        const profile = await fetchPersonProfileBundle(supabase, workshopId, ref, period);
        const identity = profile.identity;
        const [recog, incidents, services, times, careerPdi, evals, prior] = await Promise.all([
          fetchRecognitions(supabase, workshopId, identity, period, 10),
          fetchIncidents(supabase, workshopId, identity, period, 10),
          fetchServiceHistorySplit(supabase, workshopId, identity, period, 12),
          fetchWorkTimes(supabase, workshopId, identity, period),
          fetchPdiAndMeetings(supabase, workshopId, identity, period),
          fetchManagerialEvaluations(supabase, workshopId, identity, period, 10),
          fetchPriorWeeklyReviews(supabase, workshopId, identity, 5),
        ]);
        const incomplete = detectIncompleteSignals({
          matrixUnratedCount: profile.competencyMatrix.unrated.length,
          servicesPatio: services.patio?.length || 0,
          servicesLab: services.laboratorio?.length || 0,
          recognitions: recog.items?.length || 0,
          incidents: incidents.items?.length || 0,
          meetings: careerPdi.meetings?.length || 0,
          hasCareerLevel: !!(profile.career && "career_level_id" in (profile.career as object)),
          hasPdi: (careerPdi.pdi || []).length > 0,
          workSessions: times.totals?.sessions || 0,
        });
        return {
          ok: true,
          data: {
            classificationGuide: {
              system_fact: "Somente o que veio destas tools",
              leader_observation: "Declarado pelo líder na conversa",
              ai_suggestion: "Interpretação da RDA — não é fato",
              unconfirmed: "Lacuna ou hipótese — pedir confirmação",
            },
            identity,
            period: period || null,
            profile,
            recognitions: recog,
            incidents,
            services,
            workTimes: times,
            careerPdi,
            managerialEvaluations: evals,
            priorWeeklyReviews: prior,
            incompleteSignals: incomplete,
            provenance: "system_fact",
          },
        };
      }

      case "rda_search_approved_knowledge": {
        const query = typeof params.query === "string" ? params.query.trim() : "";
        if (!query) return { ok: false, error: "query é obrigatório." };
        const limit = clampLimit(params.limit, 8, 20);
        const allowedVisibilities = allowedKnowledgeVisibilitiesForAuth(ctx.auth);
        try {
          const hits = await retrieveApprovedKnowledge(supabase, workshopId, query, {
            limit,
            allowedVisibilities,
          });
          const conflicts = findKnowledgeConflicts(
            hits.map((h) => ({
              knowledgeKey: h.knowledgeKey,
              title: h.title,
              content: h.content,
            }))
          );
          return {
            ok: true,
            data: {
              hits: hits.map((h) => ({
                ...h,
                // Envelope explícito: dado, não instrução
                dataNotInstruction: true,
                citationKind: h.citationKind,
              })),
              allowedVisibilities,
              conflicts,
              note:
                "Somente versões aprovadas e visíveis ao ator. Cite knowledgeKey@vN. Conflitos devem ser sinalizados — não escolha silenciosamente.",
              provenance: "official_rule_or_validated_technical",
            },
          };
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "erro";
          if (/relation|does not exist|column/i.test(msg)) {
            return {
              ok: true,
              data: {
                hits: [],
                conflicts: [],
                allowedVisibilities,
                note: "Memória permanente ainda não migrada neste ambiente.",
                provenance: "unconfirmed",
              },
            };
          }
          return { ok: false, error: msg };
        }
      }

      case "rda_propose_knowledge": {
        const title = typeof params.title === "string" ? params.title.trim() : "";
        const content = typeof params.content === "string" ? params.content.trim() : "";
        if (!title || !content) {
          return { ok: false, error: "title e content são obrigatórios." };
        }
        const knowledgeKey = normalizeKnowledgeKey(
          typeof params.knowledgeKey === "string" && params.knowledgeKey.trim()
            ? params.knowledgeKey
            : suggestKnowledgeKeyFromTitle(title)
        );
        const category =
          typeof params.category === "string" && params.category.trim()
            ? params.category.trim()
            : "managerial_guidance";
        const changeReason =
          typeof params.changeReason === "string" && params.changeReason.trim()
            ? params.changeReason.trim()
            : "Proposta via assistente RDA";
        const rpc = await callKnowledgeRpc(supabase, "rda_knowledge_propose", {
          p_workshop_id: workshopId,
          p_knowledge_key: knowledgeKey,
          p_title: title,
          p_category: category,
          p_visibility: "workshop",
          p_content: content,
          p_change_reason: changeReason,
          p_structured_data: {},
          p_provenance: { source: "chat_tool", dataNotInstruction: true },
          p_actor_user_id: null,
          p_actor_label: "rda_tool",
          p_submit_for_approval: true,
          p_expected_updated_at: null,
        });
        if (rpc.missingFn) {
          return {
            ok: false,
            error: "Migration da memória pendente (rda_knowledge_propose).",
          };
        }
        if (!rpc.data || rpc.data.ok === false) {
          return {
            ok: false,
            error:
              (typeof rpc.data?.error === "string" && rpc.data.error) ||
              rpc.error ||
              "Falha ao propor conhecimento.",
          };
        }
        const item = rpc.data.item as RdaKnowledgeItemRow | undefined;
        return {
          ok: true,
          data: {
            proposed: true,
            requiresManagerApproval: true,
            activatedAsOfficial: false,
            itemId: item?.id || null,
            knowledgeKey: item?.knowledge_key || knowledgeKey,
            pendingVersion: item?.pending_version ?? null,
            approvedVersion: item?.approved_version ?? 0,
            lifecycle: item?.lifecycle || "pending_approval",
            message:
              "Proposta registrada. A gestão precisa aprovar em Memória do RDA antes de valer como regra oficial.",
          },
        };
      }

      case "rda_quality_approved_weekly_reports": {
        const identity = await resolvePersonIdentity(
          supabase,
          workshopId,
          personRefFromParams(params)
        );
        const months = Math.min(12, Math.max(1, Number(params.months || 3) || 3));
        const limit = clampLimit(params.limit, 12);
        let q = supabase
          .from("workshop_quality_weekly_person_reports")
          .select(
            "id, cycle_id, person_name, job_title, status, current_version, approved_at, approved_by_name"
          )
          .eq("workshop_id", workshopId)
          .eq("status", "approved")
          .order("approved_at", { ascending: false })
          .limit(limit);
        if (identity.systemUserId) q = q.eq("system_user_id", identity.systemUserId);
        else if (identity.workshopTechnicianId)
          q = q.eq("workshop_technician_id", identity.workshopTechnicianId);
        else if (identity.personName) q = q.ilike("person_name", `%${identity.personName}%`);
        const { data, error } = await q;
        if (error) {
          return {
            ok: true,
            data: {
              identity,
              items: [],
              note: error.message,
              provenance: "unconfirmed",
            },
          };
        }
        const fromCut = new Date();
        fromCut.setMonth(fromCut.getMonth() - months);
        const items = [];
        for (const r of data || []) {
          const { data: cycle } = await supabase
            .from("workshop_quality_weekly_cycles")
            .select("week_from, week_to")
            .eq("id", (r as { cycle_id: string }).cycle_id)
            .maybeSingle();
          const wf = String((cycle as { week_from?: string } | null)?.week_from || "");
          if (wf && wf < fromCut.toISOString().slice(0, 10)) continue;
          const { data: ver } = await supabase
            .from("workshop_quality_weekly_person_report_versions")
            .select(
              "version, status, indicators_json, analysis_json, action_plan_json, conclusion_json, unavailable_fields"
            )
            .eq("report_id", (r as { id: string }).id)
            .eq("status", "approved")
            .order("version", { ascending: false })
            .limit(1)
            .maybeSingle();
          items.push({
            ...r,
            cycle,
            latestApprovedVersion: ver,
            provenance: "system_fact",
          });
        }
        return {
          ok: true,
          data: {
            identity,
            months,
            items,
            note: "Apenas relatórios aprovados. Não inventar métricas ausentes.",
            provenance: "system_fact",
          },
        };
      }

      case "rda_ops_overview": {
        const data = await queryOperationalOverview({
          workshopId,
          from: typeof params.from === "string" ? params.from : undefined,
          to: typeof params.to === "string" ? params.to : undefined,
          days: typeof params.days === "number" ? params.days : undefined,
          serviceQuery:
            typeof params.serviceQuery === "string" ? params.serviceQuery : undefined,
          supabase,
        });
        return {
          ok: true,
          data: {
            ...data,
            provenance: "calculated",
            factsVsHypothesis:
              "Fatos: somas de productive_ms/paused_ms de sessões no período. Hipótese: qualquer interpretação causal.",
          },
        };
      }

      case "rda_ops_service_duration_stats": {
        const tkRaw = String(params.timeKind || "all").toLowerCase();
        const timeKind: RdaWorkTimeKind | "all" =
          tkRaw === "diagnostic" || tkRaw === "execution" || tkRaw === "all" ? tkRaw : "all";
        const data = await queryServiceDurationStats({
          workshopId,
          from: typeof params.from === "string" ? params.from : undefined,
          to: typeof params.to === "string" ? params.to : undefined,
          days: typeof params.days === "number" ? params.days : undefined,
          serviceQuery:
            typeof params.serviceQuery === "string" ? params.serviceQuery : undefined,
          timeKind,
          limit: clampLimit(params.limit, 25),
          supabase,
        });
        return {
          ok: true,
          data: {
            ...data,
            provenance: "calculated",
            insufficientSamples: data.rows.filter(
              (r) =>
                r.distribution.confidence === "insufficient" ||
                r.distribution.confidence === "low"
            ).length,
          },
        };
      }

      case "rda_ops_pause_reasons_summary": {
        const data = await queryPauseReasonsSummary({
          workshopId,
          from: typeof params.from === "string" ? params.from : undefined,
          to: typeof params.to === "string" ? params.to : undefined,
          days: typeof params.days === "number" ? params.days : undefined,
          limit: clampLimit(params.limit, 20),
          supabase,
        });
        return { ok: true, data: { ...data, provenance: "calculated" } };
      }

      case "rda_ops_technician_time_breakdown": {
        const data = await queryTechnicianBreakdown({
          workshopId,
          from: typeof params.from === "string" ? params.from : undefined,
          to: typeof params.to === "string" ? params.to : undefined,
          days: typeof params.days === "number" ? params.days : undefined,
          technicianUserId:
            typeof params.technicianUserId === "string" ? params.technicianUserId : undefined,
          serviceQuery:
            typeof params.serviceQuery === "string" ? params.serviceQuery : undefined,
          supabase,
        });
        return {
          ok: true,
          data: {
            ...data,
            provenance: "calculated",
            judgmentPolicy:
              "Não ranquear desempenho. Contextualizar complexidade, retrabalho e interrupções.",
          },
        };
      }

      case "rda_ops_detect_patterns": {
        const data = await queryOperationalPatterns({
          workshopId,
          from: typeof params.from === "string" ? params.from : undefined,
          to: typeof params.to === "string" ? params.to : undefined,
          days: typeof params.days === "number" ? params.days : undefined,
          serviceQuery:
            typeof params.serviceQuery === "string" ? params.serviceQuery : undefined,
          supabase,
        });
        return {
          ok: true,
          data: {
            ...data,
            provenance: "hypothesis",
            memoryBridge:
              "Para tornar orientação oficial, chame rda_propose_knowledge com o proposedKnowledge (confirmação humana). Nunca auto-aprovar.",
          },
        };
      }

      case "rda_patio_attention_today": {
        const data = await queryPatioAttentionToday({
          workshopId,
          supabase,
          auth: ctx.auth,
        });
        return { ok: true, data: { ...data, provenance: "calculated", sector: "patio" } };
      }

      case "rda_patio_bottlenecks": {
        const data = await queryPatioBottlenecks({ workshopId, supabase });
        return { ok: true, data: { ...data, provenance: "calculated", sector: "patio" } };
      }

      case "rda_patio_priorities": {
        const data = await queryPatioPriorities({
          workshopId,
          supabase,
          limit: clampLimit(params.limit, 20),
        });
        return { ok: true, data: { ...data, provenance: "calculated", sector: "patio" } };
      }

      case "rda_patio_delivery_risks": {
        const data = await queryPatioDeliveryRisks({
          workshopId,
          supabase,
          limit: clampLimit(params.limit, 20),
        });
        return { ok: true, data: { ...data, provenance: "calculated", sector: "patio" } };
      }

      case "rda_patio_waiting_parts": {
        const data = await queryPatioWaitingParts({ workshopId, supabase });
        return { ok: true, data: { ...data, provenance: "system_fact", sector: "patio" } };
      }

      case "rda_patio_ready_to_start": {
        const data = await queryPatioReadyToStart({ workshopId, supabase });
        return { ok: true, data: { ...data, provenance: "system_fact", sector: "patio" } };
      }

      case "rda_lab_estoque_dashboard": {
        const data = await queryLabEstoqueDashboard({
          workshopId,
          supabase,
          auth: ctx.auth,
          includeLab: true,
          includeStock: true,
        });
        return { ok: true, data: { ...data, provenance: "calculated", sector: "lab_estoque" } };
      }

      case "rda_lab_attention": {
        const data = await queryLabAttention({ workshopId, supabase, auth: ctx.auth });
        return { ok: true, data: { ...data, provenance: "calculated", sector: "laboratorio" } };
      }

      case "rda_lab_bottlenecks": {
        const data = await queryLabBottlenecks({ workshopId, supabase });
        return { ok: true, data: { ...data, provenance: "calculated", sector: "laboratorio" } };
      }

      case "rda_lab_bench_status": {
        const data = await queryLabBenchStatus({ workshopId, supabase });
        return { ok: true, data: { ...data, provenance: "system_fact", sector: "laboratorio" } };
      }

      case "rda_lab_ready_pickup": {
        const data = await queryLabReadyPickup({ workshopId, supabase });
        return { ok: true, data: { ...data, provenance: "system_fact", sector: "laboratorio" } };
      }

      case "rda_lab_longest_modules": {
        const data = await queryLabLongestModules({
          workshopId,
          supabase,
          limit: clampLimit(params.limit, 15),
        });
        return { ok: true, data: { ...data, provenance: "calculated", sector: "laboratorio" } };
      }

      case "rda_stock_abs_search": {
        const query = String(params.query || "").trim();
        if (!query) return { ok: false, error: "query obrigatória." };
        const data = await queryAbsStockSearch({
          workshopId,
          supabase,
          query,
          limit: clampLimit(params.limit, 40),
        });
        return { ok: true, data: { ...data, provenance: "system_fact", sector: "estoque" } };
      }

      case "rda_stock_abs_locate": {
        const query = String(params.query || "").trim();
        if (!query) return { ok: false, error: "query obrigatória (#N, ABS-######, código)." };
        const data = await queryAbsLocate({ workshopId, supabase, query });
        return { ok: true, data: { ...data, provenance: "system_fact", sector: "estoque" } };
      }

      case "rda_stock_low_parts": {
        const data = await queryStockLowParts({ workshopId, supabase });
        return { ok: true, data: { ...data, provenance: "system_fact", sector: "estoque" } };
      }

      case "rda_stock_summary": {
        const data = await queryStockSummary({ workshopId, supabase });
        return { ok: true, data: { ...data, provenance: "calculated", sector: "estoque" } };
      }

      case "rda_proactive_alerts_attention":
      case "rda_proactive_what_happened_today":
      case "rda_proactive_unresolved":
      case "rda_proactive_critical":
      case "rda_proactive_recommend_first": {
        if (!ctx.auth) {
          return { ok: false, error: "Contexto de autenticação necessário." };
        }
        const focus =
          toolId === "rda_proactive_what_happened_today"
            ? "today"
            : toolId === "rda_proactive_unresolved"
              ? "unresolved"
              : toolId === "rda_proactive_critical"
                ? "critical"
                : toolId === "rda_proactive_recommend_first"
                  ? "priority"
                  : "attention";
        const categoryRaw = String(params.category || "").trim();
        const severityRaw = String(params.severity || "").trim();
        const flags = {
          isTechnician: ctx.auth.permissions?.is_technician === true,
          permissions: ctx.auth.permissions || {},
        };
        const data = await queryProactiveAlertsForAssistant({
          workshopId,
          supabase,
          auth: ctx.auth,
          flags,
          focus,
          category: (categoryRaw || null) as ProactiveCategory | null,
          severity: (severityRaw || null) as ProactiveSeverity | null,
          limit: clampLimit(params.limit, 15),
        });
        return { ok: true, data: { ...data, provenance: "system_fact" } };
      }

      case "rda_productivity_list_tasks":
      case "rda_productivity_list_overdue": {
        if (!ctx.auth) return { ok: false, error: "Contexto de autenticação necessário." };
        let assigneeUserId = String(params.assigneeUserId || "").trim() || undefined;
        const assigneeName = String(params.assigneeName || "").trim();
        if (!assigneeUserId && assigneeName) {
          const people = await listAssignablePeople({
            supabase,
            workshopId,
            auth: ctx.auth,
            q: assigneeName,
          });
          if (people.length === 0) {
            return {
              ok: true,
              data: { tasks: [], message: `Nenhum funcionário para “${assigneeName}”.` },
            };
          }
          if (people.length > 1) {
            return {
              ok: true,
              data: {
                tasks: [],
                ambiguous: true,
                candidates: people.map((p) => ({ id: p.id, name: p.displayName })),
                message: "Ambíguo — confirme o responsável.",
              },
            };
          }
          assigneeUserId = people[0]!.id;
        }
        const filters: ProductivityTaskFilters = {
          status:
            toolId === "rda_productivity_list_overdue"
              ? "open"
              : ((String(params.status || "open") as ProductivityTaskFilters["status"]) ||
                "open"),
          assigneeUserId,
          priority: params.priority
            ? (String(params.priority) as ProductivityTaskPriority)
            : undefined,
          overdueOnly: toolId === "rda_productivity_list_overdue" || params.overdueOnly === true,
          q: params.q ? String(params.q) : undefined,
          limit: clampLimit(params.limit, 30),
        };
        const tasks = await listProductivityTasks({
          supabase,
          workshopId,
          auth: ctx.auth,
          filters,
        });
        return { ok: true, data: { tasks, count: tasks.length, provenance: "system_fact" } };
      }

      case "rda_productivity_summarize_pending": {
        if (!ctx.auth) return { ok: false, error: "Contexto de autenticação necessário." };
        const summary = await summarizePendingTasks({
          supabase,
          workshopId,
          auth: ctx.auth,
        });
        return { ok: true, data: { ...summary, provenance: "calculated" } };
      }

      case "rda_productivity_list_people": {
        if (!ctx.auth) return { ok: false, error: "Contexto de autenticação necessário." };
        const people = await listAssignablePeople({
          supabase,
          workshopId,
          auth: ctx.auth,
          q: params.q ? String(params.q) : null,
        });
        return { ok: true, data: { people, provenance: "system_fact" } };
      }

      case "rda_productivity_create_task": {
        if (!ctx.auth) return { ok: false, error: "Contexto de autenticação necessário." };
        const task = await createProductivityTask({
          supabase,
          workshopId,
          auth: ctx.auth,
          payload: {
            title: String(params.title || ""),
            description: params.description ? String(params.description) : "",
            priority: params.priority
              ? (String(params.priority) as ProductivityTaskPriority)
              : "normal",
            assigneeUserId: params.assigneeUserId ? String(params.assigneeUserId) : null,
            assigneeName: params.assigneeName ? String(params.assigneeName) : null,
            dueAt: params.dueAt ? String(params.dueAt) : null,
            refType: params.refType
              ? (String(params.refType) as ProductivityTaskRefType)
              : null,
            refId: params.refId ? String(params.refId) : null,
            refLabel: params.refLabel ? String(params.refLabel) : null,
            notes: params.notes ? String(params.notes) : "",
            clientRequestId: params.clientRequestId ? String(params.clientRequestId) : null,
          },
        });
        const dueLabel = task.dueAt
          ? new Date(task.dueAt).toLocaleString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : null;
        const message = [
          `Tarefa criada: “${task.title}”`,
          task.assigneeName ? `atribuída a ${task.assigneeName}` : null,
          dueLabel ? `prazo ${dueLabel}` : null,
          "(notificação registrada quando o destino existir).",
        ]
          .filter(Boolean)
          .join(" — ");
        return {
          ok: true,
          data: { task, message, provenance: "system_fact" },
        };
      }

      case "rda_productivity_update_status": {
        if (!ctx.auth) return { ok: false, error: "Contexto de autenticação necessário." };
        const task = await updateProductivityTask({
          supabase,
          workshopId,
          auth: ctx.auth,
          taskId: String(params.taskId || ""),
          patch: {
            status: String(params.status || "") as ProductivityTaskStatus,
            notes: params.notes != null ? String(params.notes) : undefined,
          },
        });
        return { ok: true, data: { task, provenance: "system_fact" } };
      }

      case "rda_productivity_reassign": {
        if (!ctx.auth) return { ok: false, error: "Contexto de autenticação necessário." };
        const task = await updateProductivityTask({
          supabase,
          workshopId,
          auth: ctx.auth,
          taskId: String(params.taskId || ""),
          patch: {
            assigneeUserId: params.assigneeUserId ? String(params.assigneeUserId) : undefined,
            assigneeName: params.assigneeName ? String(params.assigneeName) : undefined,
          },
        });
        return { ok: true, data: { task, provenance: "system_fact" } };
      }

      case "rda_productivity_create_reminder": {
        if (!ctx.auth) return { ok: false, error: "Contexto de autenticação necessário." };
        const text = String(params.text || "").trim();
        if (text.length < 2) return { ok: false, error: "Informe o texto do lembrete." };
        const scopeRaw = String(params.scope || "vehicle").trim().toLowerCase();
        const scope = scopeRaw === "module" ? "module" : "vehicle";
        const { data: reminder, error: rErr } = await supabase
          .from("workshop_reminders")
          .insert({
            workshop_id: workshopId,
            scope,
            text,
            done: false,
            created_by: ctx.auth.username || ctx.auth.userId || "rda",
          })
          .select("id, scope, text, done, created_at")
          .single();
        if (rErr) return { ok: false, error: rErr.message };
        const taskId = String(params.taskId || "").trim();
        if (taskId) {
          try {
            await updateProductivityTask({
              supabase,
              workshopId,
              auth: ctx.auth,
              taskId,
              patch: {
                notes: `Lembrete (${scope}): ${text}`,
              },
            });
          } catch {
            /* tarefa opcional */
          }
        }
        return {
          ok: true,
          data: { reminder, linkedTaskId: taskId || null, provenance: "system_fact" },
        };
      }

      default:
        return { ok: false, error: `Executor não implementado: ${toolId}` };
    }
  } catch (err: unknown) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Erro ao executar ferramenta",
    };
  }
}
