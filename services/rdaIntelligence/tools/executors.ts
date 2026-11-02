import type { SupabaseClient } from "@supabase/supabase-js";

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
      case "rda_list_stalled_vehicles": {
        const minHours = Number(params.minHours ?? 24);
        const limit = clampLimit(params.limit, 15);
        const { data, error } = await supabase
          .from("service_orders")
          .select(
            "id, os_number, plate, vehicle_model, vehicle_brand, status, updated_at, created_at, assigned_technician, issue_description"
          )
          .eq("workshop_id", workshopId)
          .neq("status", "CANCELLED")
          .neq("status", "FINALIZADO")
          .neq("status", "ENTREGUE")
          .order("updated_at", { ascending: true })
          .limit(80);
        if (error) return { ok: false, error: error.message };
        const rows = (data || [])
          .map((r) => {
            const hours = hoursSince(
              String((r as { updated_at?: string }).updated_at || "")
            );
            return { ...r, stalledHours: hours };
          })
          .filter((r) => (r.stalledHours ?? 0) >= (Number.isFinite(minHours) ? minHours : 24))
          .slice(0, limit);
        return {
          ok: true,
          data: {
            note: "Idade baseada em updated_at da OS; não implica culpa.",
            items: rows,
          },
        };
      }

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
            .select("plate")
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
            "id, os_number, plate, vehicle_model, status, issue_description, created_at, updated_at, mileage_km"
          )
          .eq("workshop_id", workshopId)
          .order("created_at", { ascending: false })
          .limit(120);
        if (error) return { ok: false, error: error.message };
        const items = (data || [])
          .filter((r) => normPlate(String((r as { plate?: string }).plate || "")) === needle)
          .slice(0, limit);
        return { ok: true, data: { plate, items } };
      }

      case "rda_search_similar_complaints": {
        const query = String(params.query || "").trim();
        if (!query) return { ok: false, error: "query obrigatória." };
        const limit = clampLimit(params.limit, 12);
        const modelHint = String(params.vehicleModel || "").trim().toLowerCase();
        const { data, error } = await supabase
          .from("service_orders")
          .select(
            "id, os_number, plate, vehicle_model, status, issue_description, ai_analysis, created_at"
          )
          .eq("workshop_id", workshopId)
          .order("created_at", { ascending: false })
          .limit(200);
        if (error) return { ok: false, error: error.message };
        const tokens = query
          .toLowerCase()
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 3);
        const scored = (data || [])
          .map((r) => {
            const hay = `${(r as { issue_description?: string }).issue_description || ""} ${(r as { ai_analysis?: string }).ai_analysis || ""} ${(r as { vehicle_model?: string }).vehicle_model || ""}`.toLowerCase();
            let score = 0;
            for (const t of tokens) if (hay.includes(t)) score += 1;
            if (modelHint && String((r as { vehicle_model?: string }).vehicle_model || "").toLowerCase().includes(modelHint)) {
              score += 0.5;
            }
            return { row: r, score };
          })
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map((x) => ({ ...x.row, matchScore: x.score }));
        return {
          ok: true,
          data: {
            note: "Similaridade textual simples sobre queixas internas — não é diagnóstico confirmado.",
            items: scored,
          },
        };
      }

      case "rda_search_error_bulletins": {
        const query = String(params.query || "").trim();
        const dtc = String(params.dtcCode || "").trim();
        const limit = clampLimit(params.limit, 15);
        let q = supabase
          .from("error_bulletins")
          .select("id, title, summary, dtc_codes, vehicle_models, created_at")
          .eq("workshop_id", workshopId)
          .order("created_at", { ascending: false })
          .limit(80);
        const { data, error } = await q;
        if (error) {
          // fallback nomes alternativos
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
        const { data, error } = await supabase
          .from("workshop_parts")
          .select(
            "id, name, sku, barcode, brand, quantity, min_quantity, location, notes"
          )
          .eq("workshop_id", workshopId)
          .ilike("name", `%${query}%`)
          .limit(limit);
        if (error) {
          // tenta busca ampla
          const all = await supabase
            .from("workshop_parts")
            .select("id, name, sku, barcode, brand, quantity, location")
            .eq("workshop_id", workshopId)
            .limit(100);
          if (all.error) return { ok: false, error: all.error.message };
          const q = query.toLowerCase();
          const items = (all.data || [])
            .filter((r) => JSON.stringify(r).toLowerCase().includes(q))
            .filter((r) =>
              onlyInStock ? Number((r as { quantity?: number }).quantity || 0) > 0 : true
            )
            .slice(0, limit);
          return {
            ok: true,
            data: {
              disclaimer:
                "Itens encontrados por texto. NÃO afirma compatibilidade ABS/veículo sem evidência documentada.",
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
            disclaimer:
              "Itens encontrados por texto. NÃO afirma compatibilidade ABS/veículo sem evidência documentada.",
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

      case "rda_patio_stage_snapshot": {
        const { data, error } = await supabase
          .from("service_orders")
          .select("id, status, updated_at, plate, os_number")
          .eq("workshop_id", workshopId)
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
            countsByStatus: counts,
            waitingApprovalCount: waitingApproval.length,
            waitingPartsCount: waitingParts.length,
            sampleWaitingApproval: waitingApproval.slice(0, 8),
            sampleWaitingParts: waitingParts.slice(0, 8),
          },
        };
      }

      case "rda_get_service_order": {
        const soId = String(params.serviceOrderId || "").trim();
        const plate = String(params.plate || "").trim();
        if (!soId && !plate) return { ok: false, error: "Informe serviceOrderId ou plate." };
        let query = supabase
          .from("service_orders")
          .select(
            "id, os_number, plate, vehicle_model, vehicle_brand, vehicle_year, vehicle_engine_info, vehicle_chassis, status, issue_description, assigned_technician, created_at, updated_at, mileage_km, order_type"
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
          items = items.filter(
            (r) => normPlate(String(r.plate || "")) === n
          );
          if (!items.length && !soId) {
            const all = await supabase
              .from("service_orders")
              .select(
                "id, os_number, plate, vehicle_model, vehicle_brand, vehicle_year, status, issue_description, created_at, updated_at"
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
        return { ok: true, data: { items: items.slice(0, 5) } };
      }

      case "rda_propose_open_service_order": {
        const lookup = await executeRdaTool("rda_get_service_order", params, ctx);
        if (lookup.ok === false) return lookup;
        const items = ((lookup.data as { items?: unknown[] }).items || []) as Array<{
          id?: string;
          plate?: string;
          os_number?: number;
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
            message:
              "Ação proposta: abrir esta OS na interface. Nenhuma alteração foi feita no banco.",
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
