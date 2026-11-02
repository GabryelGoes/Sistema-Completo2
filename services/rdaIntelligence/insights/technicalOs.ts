import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRdaLlmProvider } from "../providers/resolve.js";
import { executeRdaTool } from "../tools/executors.js";
import { assertUnderDailyLimit, recordTokenUsage } from "../agent/usage.js";
import { resolveRdaIntelligenceEnabled } from "../featureFlag.js";

export type TechnicalInsightResult = {
  serviceOrderId: string;
  status: "ready" | "failed" | "skipped";
  summary: string;
  facts: Array<{ text: string; source: string }>;
  hypotheses: Array<{ text: string; confidence: "baixa" | "media" | "alta" }>;
  sources: string[];
  error?: string;
};

/**
 * Gera insight técnico automático para uma OS (fatos internos + hipóteses).
 * Não grava diagnóstico falso como fato.
 */
export async function generateTechnicalOsInsight(input: {
  workshopId: string;
  supabase: SupabaseClient;
  serviceOrderId: string;
  settingValue?: string | null;
}): Promise<TechnicalInsightResult> {
  const enabled = resolveRdaIntelligenceEnabled({
    settingValue: input.settingValue,
  });
  if (!enabled) {
    return {
      serviceOrderId: input.serviceOrderId,
      status: "skipped",
      summary: "RDA desligado.",
      facts: [],
      hypotheses: [],
      sources: [],
    };
  }

  const limit = await assertUnderDailyLimit(input.supabase, input.workshopId);
  if (limit.ok === false) {
    return {
      serviceOrderId: input.serviceOrderId,
      status: "failed",
      summary: limit.error,
      facts: [],
      hypotheses: [],
      sources: [],
      error: limit.error,
    };
  }

  await input.supabase.from("rda_os_insights").upsert(
    {
      workshop_id: input.workshopId,
      service_order_id: input.serviceOrderId,
      status: "pending",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workshop_id,service_order_id" }
  );

  const so = await executeRdaTool(
    "rda_get_service_order",
    { serviceOrderId: input.serviceOrderId },
    { workshopId: input.workshopId, supabase: input.supabase }
  );
  const soItem =
    so.ok && Array.isArray((so.data as { items?: unknown[] }).items)
      ? ((so.data as { items: Record<string, unknown>[] }).items[0] || null)
      : null;

  if (!soItem) {
    const err = so.ok === false ? so.error : "OS não encontrada";
    await input.supabase
      .from("rda_os_insights")
      .update({
        status: "failed",
        error_message: err,
        updated_at: new Date().toISOString(),
      })
      .eq("workshop_id", input.workshopId)
      .eq("service_order_id", input.serviceOrderId);
    return {
      serviceOrderId: input.serviceOrderId,
      status: "failed",
      summary: err,
      facts: [],
      hypotheses: [],
      sources: [],
      error: err,
    };
  }

  const plate = String(soItem.plate || "");
  const complaint = String(soItem.issue_description || "");
  const model = String(soItem.vehicle_model || "");

  const [history, similar, stock, bulletins] = await Promise.all([
    executeRdaTool(
      "rda_vehicle_maintenance_history",
      { plate, limit: 10 },
      { workshopId: input.workshopId, supabase: input.supabase }
    ),
    complaint
      ? executeRdaTool(
          "rda_search_similar_complaints",
          { query: complaint, vehicleModel: model, limit: 8 },
          { workshopId: input.workshopId, supabase: input.supabase }
        )
      : Promise.resolve({ ok: true as const, data: { items: [] } }),
    executeRdaTool(
      "rda_search_stock_parts",
      { query: model.split(/\s+/)[0] || "ABS", onlyInStock: true, limit: 8 },
      { workshopId: input.workshopId, supabase: input.supabase }
    ),
    executeRdaTool(
      "rda_search_error_bulletins",
      { query: complaint || model, limit: 5 },
      { workshopId: input.workshopId, supabase: input.supabase }
    ),
  ]);

  const facts: TechnicalInsightResult["facts"] = [
    {
      text: `OS ${soItem.os_number ?? ""} — ${soItem.vehicle_brand || ""} ${model} ${soItem.vehicle_year || ""} placa ${plate || "—"}. Status: ${soItem.status}.`,
      source: "service_orders",
    },
  ];
  if (complaint) {
    facts.push({ text: `Queixa registrada: ${complaint}`, source: "service_orders.issue_description" });
  }
  if (soItem.vehicle_engine_info) {
    facts.push({
      text: `Motorização informada: ${String(soItem.vehicle_engine_info)}`,
      source: "service_orders.vehicle_engine_info",
    });
  }
  if (history.ok) {
    const n = ((history.data as { items?: unknown[] }).items || []).length;
    facts.push({
      text: `Histórico interno: ${n} OS(s) anteriores com a mesma placa.`,
      source: "service_orders(history)",
    });
  }
  if (similar.ok) {
    const n = ((similar.data as { items?: unknown[] }).items || []).length;
    facts.push({
      text: `Ocorrências com queixa semelhante (texto): ${n}.`,
      source: "service_orders(similar)",
    });
  }
  if (stock.ok) {
    const n = ((stock.data as { items?: unknown[] }).items || []).length;
    facts.push({
      text: `Peças no estoque batendo texto de busca (sem afirmar compatibilidade): ${n}.`,
      source: "workshop_parts",
    });
  }
  if (bulletins.ok) {
    const n = ((bulletins.data as { items?: unknown[] }).items || []).length;
    facts.push({
      text: `Boletins técnicos potencialmente relacionados: ${n}.`,
      source: "error_bulletins",
    });
  }

  const sources = [...new Set(facts.map((f) => f.source))];
  let hypotheses: TechnicalInsightResult["hypotheses"] = [];
  let summary =
    "Leitura interna concluída. Hipóteses abaixo são sugestões — validar no diagnóstico.";
  let modelName: string | undefined;

  const provider = resolveRdaLlmProvider({ settingValue: input.settingValue });
  if (provider.id === "openai" && provider.isConfigured()) {
    try {
      const completion = await provider.complete({
        messages: [
          {
            role: "system",
            content:
              "Você é um assistente técnico automotivo. Com base APENAS no JSON de fatos internos, liste até 5 hipóteses de diagnóstico e próximos procedimentos. Responda em JSON: {\"summary\": string, \"hypotheses\": [{\"text\": string, \"confidence\": \"baixa\"|\"media\"|\"alta\"}]}. Não invente peças/compatibilidade. Separe fato de hipótese.",
          },
          {
            role: "user",
            content: JSON.stringify({
              facts,
              history: history.ok ? history.data : null,
              similar: similar.ok ? similar.data : null,
              stock: stock.ok ? stock.data : null,
              bulletins: bulletins.ok ? bulletins.data : null,
            }),
          },
        ],
        maxTokens: 900,
        temperature: 0.2,
      });
      modelName = completion.model;
      if (completion.usage) {
        await recordTokenUsage(input.supabase, input.workshopId, completion.usage);
      }
      const match = completion.content.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]) as {
          summary?: string;
          hypotheses?: Array<{ text?: string; confidence?: string }>;
        };
        if (parsed.summary) summary = String(parsed.summary);
        hypotheses = (parsed.hypotheses || [])
          .map((h) => {
            const c = String(h.confidence || "media");
            const confidence: "baixa" | "media" | "alta" =
              c === "alta" || c === "baixa" ? c : "media";
            return {
              text: String(h.text || "").trim(),
              confidence,
            };
          })
          .filter((h) => h.text);
      }
    } catch (err: unknown) {
      hypotheses = [
        {
          text:
            "Modelo indisponível no momento; use os fatos internos e o histórico listado para o diagnóstico manual.",
          confidence: "baixa",
        },
      ];
      summary = `Fatos coletados; LLM falhou: ${err instanceof Error ? err.message : "erro"}`;
    }
  } else {
    hypotheses = [
      {
        text: "Ative OPENAI_API_KEY + RDA_ALLOW_LLM_CALLS para hipóteses geradas por modelo. Os fatos internos já estão disponíveis.",
        confidence: "baixa",
      },
    ];
  }

  await input.supabase.from("rda_os_insights").upsert(
    {
      workshop_id: input.workshopId,
      service_order_id: input.serviceOrderId,
      status: "ready",
      facts,
      hypotheses,
      sources,
      summary,
      model: modelName || null,
      error_message: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "workshop_id,service_order_id" }
  );

  return {
    serviceOrderId: input.serviceOrderId,
    status: "ready",
    summary,
    facts,
    hypotheses,
    sources,
  };
}
