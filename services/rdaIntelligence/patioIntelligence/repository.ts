import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichOrderFact } from "./analysis.js";
import { PATIO_TERMINAL_STAGES } from "./stages.js";
import type { PatioOrderFact } from "./types.js";

const PATIO_SELECT_BASE =
  "id, os_number, plate, vehicle_model, vehicle_brand, status, assigned_technician, issue_description, delivery_date, created_at, updated_at, order_type";

const PATIO_SELECT_WITH_ENTERED = `${PATIO_SELECT_BASE}, status_entered_at`;

function isMissingStatusEnteredAtColumn(message: string): boolean {
  return /status_entered_at/i.test(message) && /column|does not exist|schema cache/i.test(message);
}

export async function loadPatioActiveOrders(
  workshopId: string,
  supabase: SupabaseClient,
  limit = 800
): Promise<PatioOrderFact[]> {
  const capped = Math.min(Math.max(limit, 1), 2000);
  let rows: unknown[] | null = null;

  const primary = await supabase
    .from("service_orders")
    .select(PATIO_SELECT_WITH_ENTERED)
    .eq("workshop_id", workshopId)
    .eq("order_type", "vehicle")
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: true })
    .limit(capped);

  if (primary.error && isMissingStatusEnteredAtColumn(primary.error.message)) {
    const fallback = await supabase
      .from("service_orders")
      .select(PATIO_SELECT_BASE)
      .eq("workshop_id", workshopId)
      .eq("order_type", "vehicle")
      .neq("status", "CANCELLED")
      .order("created_at", { ascending: true })
      .limit(capped);
    if (fallback.error) throw new Error(fallback.error.message);
    rows = fallback.data || [];
  } else if (primary.error) {
    throw new Error(primary.error.message);
  } else {
    rows = primary.data || [];
  }

  const now = Date.now();
  const facts: PatioOrderFact[] = [];
  for (const row of rows || []) {
    const status = String((row as { status?: string }).status || "");
    if (PATIO_TERMINAL_STAGES.has(status)) continue;
    facts.push(enrichOrderFact(row as Parameters<typeof enrichOrderFact>[0], now));
  }
  return facts;
}

/**
 * Medianas leves de tempo produtivo (Fase 2) — apenas contexto descritivo.
 * Nunca usar para concluir atraso por permanência na etapa.
 */
export async function loadLightHistoricalHints(
  workshopId: string,
  supabase: SupabaseClient
): Promise<Array<{ medianMs: number | null; sampleCount: number; confidence: string }>> {
  try {
    const from = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data, error } = await supabase
      .from("rda_work_sessions")
      .select("productive_ms, status, time_kind")
      .eq("workshop_id", workshopId)
      .eq("status", "finished")
      .eq("time_kind", "execution")
      .gte("ended_at", from)
      .limit(500);
    if (error || !data?.length) return [];
    const values = data
      .map((r) => Number((r as { productive_ms?: number }).productive_ms) || 0)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    if (values.length < 5) {
      return [{ medianMs: null, sampleCount: values.length, confidence: "insufficient" }];
    }
    const mid = Math.floor(values.length / 2);
    const median =
      values.length % 2 === 0
        ? Math.round((values[mid - 1]! + values[mid]!) / 2)
        : values[mid]!;
    const confidence =
      values.length >= 40 ? "high" : values.length >= 15 ? "medium" : "low";
    return [{ medianMs: median, sampleCount: values.length, confidence }];
  } catch {
    return [];
  }
}
