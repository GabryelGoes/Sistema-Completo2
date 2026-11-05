import type { SupabaseClient } from "@supabase/supabase-js";
import { enrichAbsUnit, enrichLabOrderFact } from "./analysis.js";
import { LAB_TERMINAL_STAGES } from "./stages.js";
import type { AbsSearchResult, AbsUnitFact, LabOrderFact, StockPartFact } from "./types.js";

const LAB_SELECT_BASE =
  "id, os_number, plate, vehicle_model, vehicle_brand, module_identification, module_kind, status, assigned_technician, bench_slot, delivery_date, created_at, updated_at, order_type, customers(name)";

const LAB_SELECT_WITH_ENTERED = `${LAB_SELECT_BASE}, status_entered_at`;

function isMissingStatusEnteredAt(message: string): boolean {
  return /status_entered_at/i.test(message) && /column|does not exist|schema cache/i.test(message);
}

export async function loadLabActiveOrders(
  workshopId: string,
  supabase: SupabaseClient,
  limit = 800
): Promise<LabOrderFact[]> {
  const capped = Math.min(Math.max(limit, 1), 2000);
  let rows: unknown[] | null = null;

  const primary = await supabase
    .from("service_orders")
    .select(LAB_SELECT_WITH_ENTERED)
    .eq("workshop_id", workshopId)
    .eq("order_type", "module")
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: true })
    .limit(capped);

  if (primary.error && isMissingStatusEnteredAt(primary.error.message)) {
    const fallback = await supabase
      .from("service_orders")
      .select(LAB_SELECT_BASE)
      .eq("workshop_id", workshopId)
      .eq("order_type", "module")
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
  const facts: LabOrderFact[] = [];
  for (const row of rows || []) {
    const status = String((row as { status?: string }).status || "");
    if (LAB_TERMINAL_STAGES.has(status)) continue;
    facts.push(enrichLabOrderFact(row as Parameters<typeof enrichLabOrderFact>[0], now));
  }
  return facts;
}

export async function loadAbsUnitRows(
  workshopId: string,
  supabase: SupabaseClient,
  limit = 2000
): Promise<
  Array<{
    id: string;
    status?: string | null;
    module_kind?: string | null;
    public_id?: string | null;
    sequence_number?: number | null;
    location?: string | null;
  }>
> {
  const { data, error } = await supabase
    .from("workshop_abs_modules")
    .select(
      "id, public_id, sequence_number, module_kind, status, condition, item_state, item_condition, manufacturer, original_code, application, model, location, model_id"
    )
    .eq("workshop_id", workshopId)
    .limit(Math.min(Math.max(limit, 1), 5000));
  if (error) throw new Error(error.message);
  return (data || []) as Array<{
    id: string;
    status?: string | null;
    module_kind?: string | null;
  }>;
}

export async function loadWorkshopPartsFacts(
  workshopId: string,
  supabase: SupabaseClient,
  limit = 1500
): Promise<StockPartFact[]> {
  const { data, error } = await supabase
    .from("workshop_parts")
    .select("id, name, sku, barcode, brand, quantity, min_quantity, location")
    .eq("workshop_id", workshopId)
    .limit(Math.min(Math.max(limit, 1), 3000));
  if (error) {
    // Schema parcial
    const alt = await supabase
      .from("workshop_parts")
      .select("id, name, sku, brand, quantity, location")
      .eq("workshop_id", workshopId)
      .limit(Math.min(Math.max(limit, 1), 3000));
    if (alt.error) throw new Error(alt.error.message);
    return (alt.data || []).map((r) => {
      const qty = Number((r as { quantity?: number }).quantity) || 0;
      return {
        id: String((r as { id: string }).id),
        name: String((r as { name?: string }).name || ""),
        sku: (r as { sku?: string | null }).sku ?? null,
        barcode: null,
        brand: (r as { brand?: string | null }).brand ?? null,
        quantity: qty,
        minQuantity: null,
        location: (r as { location?: string | null }).location ?? null,
        lowStock: false,
      };
    });
  }
  return (data || []).map((r) => {
    const qty = Number((r as { quantity?: number }).quantity) || 0;
    const minRaw = (r as { min_quantity?: number | null }).min_quantity;
    const min =
      minRaw != null && Number.isFinite(Number(minRaw)) ? Number(minRaw) : null;
    return {
      id: String((r as { id: string }).id),
      name: String((r as { name?: string }).name || ""),
      sku: (r as { sku?: string | null }).sku ?? null,
      barcode: (r as { barcode?: string | null }).barcode ?? null,
      brand: (r as { brand?: string | null }).brand ?? null,
      quantity: qty,
      minQuantity: min,
      location: (r as { location?: string | null }).location ?? null,
      lowStock: min != null ? qty <= min : qty <= 0,
    };
  });
}

/** Localiza unidade por public_id, #sequência ou texto — qualquer status. */
export async function locateAbsUnits(
  workshopId: string,
  supabase: SupabaseClient,
  query: string,
  limit = 40
): Promise<AbsUnitFact[]> {
  const q = String(query || "").trim();
  if (!q) return [];
  const like = `%${q}%`;
  const seqRaw = q.replace(/^#/, "");
  const seqNum = Number(seqRaw);
  const isSeq = Number.isFinite(seqNum) && String(Math.floor(seqNum)) === seqRaw;

  let req = supabase
    .from("workshop_abs_modules")
    .select(
      "id, public_id, sequence_number, module_kind, status, condition, item_state, item_condition, manufacturer, original_code, application, model, location, model_id"
    )
    .eq("workshop_id", workshopId)
    .or(
      [
        `public_id.ilike.${like}`,
        `manufacturer.ilike.${like}`,
        `original_code.ilike.${like}`,
        `application.ilike.${like}`,
        `model.ilike.${like}`,
        `location.ilike.${like}`,
        ...(isSeq ? [`sequence_number.eq.${Math.floor(seqNum)}`] : []),
      ].join(",")
    )
    .order("public_id", { ascending: true })
    .limit(limit);

  const { data, error } = await req;
  if (error) throw new Error(error.message);
  return (data || []).map((r) => enrichAbsUnit(r as Parameters<typeof enrichAbsUnit>[0]));
}

/**
 * Busca ABS alinhada à API /abs-modules/search:
 * - partes eletrônicas/hidráulicas disponíveis = vendáveis direto
 * - completos disponíveis = só via desmembramento (nunca tratar como parte separada)
 */
export async function searchAbsInventory(
  workshopId: string,
  supabase: SupabaseClient,
  query: string,
  limit = 40
): Promise<AbsSearchResult> {
  const q = String(query || "").trim();
  if (!q) {
    return {
      query: q,
      availableParts: [],
      availableComplete: [],
      availableViaDisassembly: [],
      located: [],
      note: "Informe código, aplicação, ABS-###### ou #sequência.",
      compatibilityConfirmed: false,
    };
  }

  const like = `%${q}%`;
  const { data: codeHits } = await supabase
    .from("workshop_abs_module_codes")
    .select("model_id")
    .eq("workshop_id", workshopId)
    .ilike("code_value", like)
    .limit(80);
  const { data: appHits } = await supabase
    .from("workshop_abs_module_applications")
    .select("model_id")
    .eq("workshop_id", workshopId)
    .or(
      [
        `vehicle_brand.ilike.${like}`,
        `vehicle_model.ilike.${like}`,
        `generation.ilike.${like}`,
        `engine.ilike.${like}`,
        `version.ilike.${like}`,
        `notes.ilike.${like}`,
      ].join(",")
    )
    .limit(80);

  const modelIds = [
    ...new Set([
      ...(codeHits || []).map((r) => String((r as { model_id: string }).model_id)),
      ...(appHits || []).map((r) => String((r as { model_id: string }).model_id)),
    ]),
  ];

  const seqRaw = q.replace(/^#/, "");
  const seqNum = Number(seqRaw);
  const isSeq = Number.isFinite(seqNum) && String(Math.floor(seqNum)) === seqRaw;

  const orParts = [
    `public_id.ilike.${like}`,
    `manufacturer.ilike.${like}`,
    `original_code.ilike.${like}`,
    `application.ilike.${like}`,
    `model.ilike.${like}`,
    ...(isSeq ? [`sequence_number.eq.${Math.floor(seqNum)}`] : []),
    ...(modelIds.length ? [`model_id.in.(${modelIds.join(",")})`] : []),
  ].join(",");

  const partsQ = await supabase
    .from("workshop_abs_modules")
    .select(
      "id, public_id, sequence_number, module_kind, status, condition, item_state, item_condition, manufacturer, original_code, application, model, location, model_id"
    )
    .eq("workshop_id", workshopId)
    .eq("status", "disponivel")
    .in("module_kind", ["eletronico", "hidraulico"])
    .or(orParts)
    .order("public_id", { ascending: true })
    .limit(limit);

  const completeQ = await supabase
    .from("workshop_abs_modules")
    .select(
      "id, public_id, sequence_number, module_kind, status, condition, item_state, item_condition, manufacturer, original_code, application, model, location, model_id"
    )
    .eq("workshop_id", workshopId)
    .eq("status", "disponivel")
    .eq("module_kind", "completo")
    .or(orParts)
    .order("public_id", { ascending: true })
    .limit(limit);

  if (partsQ.error) throw new Error(partsQ.error.message);
  if (completeQ.error) throw new Error(completeQ.error.message);

  const availableParts = (partsQ.data || []).map((r) =>
    enrichAbsUnit(r as Parameters<typeof enrichAbsUnit>[0])
  );
  const availableViaDisassembly = (completeQ.data || []).map((r) =>
    enrichAbsUnit(r as Parameters<typeof enrichAbsUnit>[0])
  );
  const located = await locateAbsUnits(workshopId, supabase, q, limit);

  const matchedCatalog = modelIds.length > 0 || availableParts.length + availableViaDisassembly.length > 0;

  return {
    query: q,
    availableParts,
    availableComplete: availableViaDisassembly,
    availableViaDisassembly,
    located,
    note: matchedCatalog
      ? "Resultados do estoque ABS. Partes listadas em availableParts são unidades já desmembradas. Completos em availableViaDisassembly NÃO estão disponíveis para venda separada sem desmembramento. Compatibilidade baseada em códigos/aplicações cadastrados — confirme no veículo."
      : "Pouca ou nenhuma evidência de catálogo para este termo. Compatibilidade NÃO confirmada.",
    compatibilityConfirmed: Boolean(codeHits?.length || appHits?.length),
  };
}

export async function searchWorkshopPartsByText(
  workshopId: string,
  supabase: SupabaseClient,
  query: string,
  onlyInStock = true,
  limit = 30
): Promise<StockPartFact[]> {
  const all = await loadWorkshopPartsFacts(workshopId, supabase, 2000);
  const q = String(query || "").trim().toLowerCase();
  if (!q) return [];
  return all
    .filter((p) => {
      const hay = `${p.name} ${p.sku || ""} ${p.barcode || ""} ${p.brand || ""} ${p.location || ""}`.toLowerCase();
      return hay.includes(q);
    })
    .filter((p) => (onlyInStock ? p.quantity > 0 : true))
    .slice(0, limit);
}
