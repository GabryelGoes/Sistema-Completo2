import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedKnowledgeVisibilitiesForAuth } from "../knowledge/access.js";
import { retrieveApprovedKnowledge } from "../knowledge/repository.js";
import type { RdaAuthContext } from "../types.js";
import {
  buildLabBenchOccupancy,
  buildLabEstoqueDashboard,
  buildStockSummary,
  detectLabBottlenecks,
  listLongestInLab,
  listReadyForPickup,
} from "./analysis.js";
import {
  loadAbsUnitRows,
  loadLabActiveOrders,
  loadWorkshopPartsFacts,
  locateAbsUnits,
  searchAbsInventory,
  searchWorkshopPartsByText,
} from "./repository.js";
import {
  DEFAULT_LAB_STAGE_THRESHOLD_HOURS,
  parseLabThresholds,
  type LabThresholds,
} from "./thresholds.js";
import type { LabEstoqueDashboard } from "./types.js";

export type LabEstoqueQueryInput = {
  workshopId: string;
  supabase: SupabaseClient;
  thresholdsRaw?: string | null;
  auth?: RdaAuthContext | null;
  includeKnowledge?: boolean;
  includeLab?: boolean;
  includeStock?: boolean;
};

async function resolveThresholds(raw?: string | null): Promise<LabThresholds> {
  return parseLabThresholds(raw ?? null);
}

export async function queryLabEstoqueDashboard(
  input: LabEstoqueQueryInput
): Promise<LabEstoqueDashboard> {
  const includeLab = input.includeLab !== false;
  const includeStock = input.includeStock !== false;
  const thresholds = await resolveThresholds(input.thresholdsRaw);

  const labOrders = includeLab
    ? await loadLabActiveOrders(input.workshopId, input.supabase)
    : [];

  let stockSummary: ReturnType<typeof buildStockSummary> | null = null;
  let lowStockParts: Awaited<ReturnType<typeof loadWorkshopPartsFacts>> = [];
  if (includeStock) {
    const [absRows, parts] = await Promise.all([
      loadAbsUnitRows(input.workshopId, input.supabase),
      loadWorkshopPartsFacts(input.workshopId, input.supabase),
    ]);
    stockSummary = buildStockSummary(absRows, parts);
    lowStockParts = parts.filter((p) => p.lowStock);
  }

  let knowledgeHints: LabEstoqueDashboard["knowledgeHints"] = [];
  if (input.includeKnowledge !== false && input.auth) {
    try {
      const hits = await retrieveApprovedKnowledge(
        input.supabase,
        input.workshopId,
        "laboratório módulo ABS bancada estoque desmembramento hidráulico eletrônico",
        {
          limit: 5,
          allowedVisibilities: allowedKnowledgeVisibilitiesForAuth(input.auth),
        }
      );
      knowledgeHints = (hits || []).map((h) => ({
        knowledgeKey: h.knowledgeKey,
        title: h.title,
        excerpt: String(h.content || "").slice(0, 240),
      }));
    } catch {
      knowledgeHints = [];
    }
  }

  return buildLabEstoqueDashboard({
    labOrders,
    thresholds,
    includeLab,
    includeStock,
    stockSummary,
    lowStockParts,
    knowledgeHints,
  });
}

export async function queryLabBottlenecks(input: LabEstoqueQueryInput) {
  const thresholds = await resolveThresholds(input.thresholdsRaw);
  const orders = await loadLabActiveOrders(input.workshopId, input.supabase);
  return {
    bottlenecks: detectLabBottlenecks(orders, thresholds),
    thresholds,
    note: "Gargalos por permanência real (status_entered_at). Sem comparar com tempo produtivo. Sem alteração automática.",
  };
}

export async function queryLabBenchStatus(input: LabEstoqueQueryInput) {
  const orders = await loadLabActiveOrders(input.workshopId, input.supabase);
  return {
    bench: buildLabBenchOccupancy(orders),
    note: "Bancada 1–24. Sem slot = possível fila (bench_queued) ou conserto externo.",
  };
}

export async function queryLabReadyPickup(input: LabEstoqueQueryInput) {
  const orders = await loadLabActiveOrders(input.workshopId, input.supabase);
  const items = listReadyForPickup(orders);
  return {
    count: items.length,
    items: items.slice(0, 40),
    note: "Status PRONTO_PRA_RETIRADA (Pronto pra entrega).",
  };
}

export async function queryLabLongestModules(
  input: LabEstoqueQueryInput & { limit?: number }
) {
  const orders = await loadLabActiveOrders(input.workshopId, input.supabase);
  const items = listLongestInLab(orders, input.limit || 15);
  return {
    items,
    note: "Ordenado por created_at (tempo no laboratório). Permanência na etapa usa status_entered_at.",
  };
}

export async function queryLabAttention(input: LabEstoqueQueryInput) {
  const dash = await queryLabEstoqueDashboard({
    ...input,
    includeLab: true,
    includeStock: false,
    includeKnowledge: false,
  });
  return {
    attention: dash.labAttention,
    summary: dash.summary,
    topBottleneck: dash.labBottlenecks[0] || null,
    disclaimer: dash.disclaimer,
  };
}

export async function queryAbsStockSearch(
  input: LabEstoqueQueryInput & { query: string; limit?: number }
) {
  return searchAbsInventory(
    input.workshopId,
    input.supabase,
    input.query,
    input.limit || 40
  );
}

export async function queryAbsLocate(
  input: LabEstoqueQueryInput & { query: string; limit?: number }
) {
  const items = await locateAbsUnits(
    input.workshopId,
    input.supabase,
    input.query,
    input.limit || 40
  );
  return {
    query: input.query,
    items,
    note: "Localização por public_id, #sequência, código ou aplicação. Qualquer status (disponível/reservado/fora).",
  };
}

export async function queryStockLowParts(input: LabEstoqueQueryInput) {
  const parts = await loadWorkshopPartsFacts(input.workshopId, input.supabase);
  const low = parts.filter((p) => p.lowStock);
  return {
    count: low.length,
    items: low.slice(0, 50),
    note: "Baixo estoque = stock_qty ≤ min_stock_qty (ou stock_qty≤0 se min ausente).",
  };
}

export async function queryStockPartsText(
  input: LabEstoqueQueryInput & { query: string; onlyInStock?: boolean; limit?: number }
) {
  const items = await searchWorkshopPartsByText(
    input.workshopId,
    input.supabase,
    input.query,
    input.onlyInStock !== false,
    input.limit || 30
  );
  return {
    source: "workshop_parts",
    items,
    disclaimer:
      "Peças do cadastro workshop_parts. Não são OS do Laboratório nem unidades ABS individuais.",
  };
}

export async function queryStockSummary(input: LabEstoqueQueryInput) {
  const [absRows, parts] = await Promise.all([
    loadAbsUnitRows(input.workshopId, input.supabase),
    loadWorkshopPartsFacts(input.workshopId, input.supabase),
  ]);
  return {
    summary: buildStockSummary(absRows, parts),
    lowStockPreview: parts.filter((p) => p.lowStock).slice(0, 15),
  };
}

export { DEFAULT_LAB_STAGE_THRESHOLD_HOURS, parseLabThresholds };
