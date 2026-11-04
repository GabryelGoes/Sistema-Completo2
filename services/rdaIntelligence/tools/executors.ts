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
  "id, os_number, plate, vehicle_model, vehicle_brand, status, updated_at, created_at, assigned_technician, issue_description, order_type, module_identification";

const STAGE_SELECT = "id, status, updated_at, plate, os_number, order_type, module_identification";

async function listStalledByOrderType(
  ctx: RdaToolExecContext,
  orderType: RdaServiceOrderType,
  params: Record<string, unknown>
): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  const sector: RdaWorkshopSector =
    orderType === RDA_ORDER_TYPE_LAB ? "laboratorio" : "patio";
  const minHours = Number(params.minHours ?? 24);
  const limit = clampLimit(params.limit, 15);
  const { data, error } = await ctx.supabase
    .from("service_orders")
    .select(STALLED_SELECT)
    .eq("workshop_id", ctx.workshopId)
    .eq("order_type", orderType)
    .neq("status", "CANCELLED")
    .neq("status", "FINALIZADO")
    .neq("status", "ENTREGUE")
    .order("updated_at", { ascending: true })
    .limit(80);
  if (error) return { ok: false, error: error.message };
  const rows = (data || [])
    .map((r) => {
      const hours = hoursSince(String((r as { updated_at?: string }).updated_at || ""));
      return {
        ...r,
        stalledHours: hours,
        sector,
        order_type: orderType,
      };
    })
    .filter((r) => (r.stalledHours ?? 0) >= (Number.isFinite(minHours) ? minHours : 24))
    .slice(0, limit);
  return {
    ok: true,
    data: {
      sector,
      orderType,
      sectorLabel: sectorLabel(sector),
      note:
        orderType === RDA_ORDER_TYPE_PATIO
          ? "Somente OS do Pátio (veículos). Idade baseada em updated_at; não implica culpa."
          : "Somente OS do Laboratório (módulos recebidos). Não é estoque de peças. Idade por updated_at.",
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
          "Resultado do ESTOQUE (workshop_parts). Não são OS do Laboratório nem módulos recebidos para reparo. NÃO afirma compatibilidade ABS/veículo sem evidência documentada.";
        const { data, error } = await supabase
          .from("workshop_parts")
          .select(
            "id, name, sku, barcode, brand, quantity, min_quantity, location, notes"
          )
          .eq("workshop_id", workshopId)
          .ilike("name", `%${query}%`)
          .limit(limit);
        if (error) {
          const all = await supabase
            .from("workshop_parts")
            .select("id, name, sku, barcode, brand, quantity, location")
            .eq("workshop_id", workshopId)
            .limit(100);
          if (all.error) return { ok: false, error: all.error.message };
          const qtext = query.toLowerCase();
          const items = (all.data || [])
            .filter((r) => JSON.stringify(r).toLowerCase().includes(qtext))
            .filter((r) =>
              onlyInStock ? Number((r as { quantity?: number }).quantity || 0) > 0 : true
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
        const items = (data || []).filter((r) =>
          onlyInStock ? Number((r as { quantity?: number }).quantity || 0) > 0 : true
        );
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
