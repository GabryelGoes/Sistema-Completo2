import type { SupabaseClient } from "@supabase/supabase-js";
import { allowedKnowledgeVisibilitiesForAuth } from "../knowledge/access.js";
import { retrieveApprovedKnowledge } from "../knowledge/repository.js";
import type { RdaAuthContext } from "../types.js";
import {
  buildPatioDashboard,
  buildProductiveContext,
  detectDeliveryRisks,
  detectPatioBottlenecks,
  filterOrdersByStatus,
  ordersReadyToStart,
  suggestPatioPriorities,
} from "./analysis.js";
import { loadLightHistoricalHints, loadPatioActiveOrders } from "./repository.js";
import {
  DEFAULT_PATIO_STAGE_THRESHOLD_HOURS,
  parsePatioThresholds,
  type PatioThresholds,
} from "./thresholds.js";
import type { PatioDashboard } from "./types.js";

export type PatioIntelQueryInput = {
  workshopId: string;
  supabase: SupabaseClient;
  thresholdsRaw?: string | null;
  auth?: RdaAuthContext | null;
  includeKnowledge?: boolean;
};

async function resolveThresholds(raw?: string | null): Promise<PatioThresholds> {
  return parsePatioThresholds(raw ?? null);
}

export async function queryPatioDashboard(
  input: PatioIntelQueryInput
): Promise<PatioDashboard> {
  const thresholds = await resolveThresholds(input.thresholdsRaw);
  const orders = await loadPatioActiveOrders(input.workshopId, input.supabase);
  const histHints = await loadLightHistoricalHints(input.workshopId, input.supabase);

  let knowledgeHints: PatioDashboard["knowledgeHints"] = [];
  if (input.includeKnowledge !== false && input.auth) {
    try {
      const hits = await retrieveApprovedKnowledge(
        input.supabase,
        input.workshopId,
        "pátio fila peças prioridade etapa",
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

  return buildPatioDashboard({
    orders,
    thresholds,
    histHints,
    knowledgeHints,
  });
}

export async function queryPatioBottlenecks(input: PatioIntelQueryInput) {
  const thresholds = await resolveThresholds(input.thresholdsRaw);
  const orders = await loadPatioActiveOrders(input.workshopId, input.supabase);
  const histHints = await loadLightHistoricalHints(input.workshopId, input.supabase);
  return {
    bottlenecks: detectPatioBottlenecks(orders, thresholds, histHints),
    thresholds,
    productiveContext: buildProductiveContext(histHints),
    note: "Gargalos por permanência real na etapa (status_entered_at) vs limiares. Sem comparar com tempo produtivo da Fase 2. Sem alteração automática de etapa.",
  };
}

export async function queryPatioPriorities(input: PatioIntelQueryInput & { limit?: number }) {
  const thresholds = await resolveThresholds(input.thresholdsRaw);
  const orders = await loadPatioActiveOrders(input.workshopId, input.supabase);
  return {
    priorities: suggestPatioPriorities(orders, thresholds, input.limit || 20),
    note: "Prioridades sugeridas com motivos. Permanência usa status_entered_at; sem histórico → tempo desconhecido. RDA não altera atribuições nem datas.",
  };
}

export async function queryPatioDeliveryRisks(input: PatioIntelQueryInput & { limit?: number }) {
  const orders = await loadPatioActiveOrders(input.workshopId, input.supabase);
  return {
    risks: detectDeliveryRisks(orders, input.limit || 20),
    note: "Baseado em delivery_date das OS. Sem inventar prazos.",
  };
}

export async function queryPatioWaitingParts(input: PatioIntelQueryInput) {
  const orders = await loadPatioActiveOrders(input.workshopId, input.supabase);
  const list = filterOrdersByStatus(orders, "AGUARDANDO_PECAS");
  return {
    status: "AGUARDANDO_PECAS",
    count: list.length,
    items: list.slice(0, 40),
  };
}

export async function queryPatioReadyToStart(input: PatioIntelQueryInput) {
  const orders = await loadPatioActiveOrders(input.workshopId, input.supabase);
  const list = ordersReadyToStart(orders);
  return {
    count: list.length,
    items: list.slice(0, 40),
    note: "ORCAMENTO_APROVADO ou PECAS_DISPONIVEIS — candidatos a iniciar serviço.",
  };
}

export async function queryPatioAttentionToday(input: PatioIntelQueryInput) {
  const dash = await queryPatioDashboard({ ...input, includeKnowledge: false });
  return {
    attention: dash.attention,
    summary: dash.summary,
    topBottleneck: dash.bottlenecks[0] || null,
    productiveContext: dash.productiveContext,
    disclaimer: dash.disclaimer,
  };
}

export { DEFAULT_PATIO_STAGE_THRESHOLD_HOURS, parsePatioThresholds };
