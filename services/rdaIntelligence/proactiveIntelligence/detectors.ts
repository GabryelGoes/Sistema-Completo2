import type { SupabaseClient } from "@supabase/supabase-js";
import { detectPatioBottlenecks, detectDeliveryRisks } from "../patioIntelligence/analysis.js";
import { loadPatioActiveOrders } from "../patioIntelligence/repository.js";
import { parsePatioThresholds } from "../patioIntelligence/thresholds.js";
import {
  buildLabBenchOccupancy,
  detectLabBottlenecks,
  listReadyForPickup,
} from "../labEstoqueIntelligence/analysis.js";
import {
  loadLabActiveOrders,
  loadWorkshopPartsFacts,
} from "../labEstoqueIntelligence/repository.js";
import { parseLabThresholds } from "../labEstoqueIntelligence/thresholds.js";
import { queryOperationalPatterns } from "../operationalLearning/service.js";
import { buildRecommendation } from "./recommendations.js";
import type { ProactiveAlertDraft } from "./types.js";

export type DetectInput = {
  workshopId: string;
  supabase: SupabaseClient;
  patioThresholdsRaw?: string | null;
  labThresholdsRaw?: string | null;
};

function draft(
  partial: Omit<ProactiveAlertDraft, "recommendation"> & { recommendation?: string; kind: string }
): ProactiveAlertDraft {
  const recommendation =
    partial.recommendation ||
    buildRecommendation({ category: partial.category, kind: partial.kind });
  const { kind: _k, recommendation: _r, ...rest } = partial;
  return { ...rest, recommendation };
}

/** Detecta alertas reutilizando análises das Fases 2–4. Não inventa dados. */
export async function detectProactiveAlerts(input: DetectInput): Promise<ProactiveAlertDraft[]> {
  const out: ProactiveAlertDraft[] = [];

  // ----- Pátio (Fase 3) -----
  try {
    const patioOrders = await loadPatioActiveOrders(input.workshopId, input.supabase);
    const patioTh = parsePatioThresholds(input.patioThresholdsRaw ?? null);
    const bots = detectPatioBottlenecks(patioOrders, patioTh);
    for (const b of bots.slice(0, 8)) {
      const severity =
        b.count >= 8 || b.kind === "waiting_parts" ? "critical" : b.count >= 3 ? "warning" : "info";
      out.push(
        draft({
          kind:
            b.kind === "waiting_parts"
              ? "waiting_parts"
              : b.kind === "waiting_approval"
                ? "waiting_approval"
                : b.kind === "approved_not_started"
                  ? "approved_not_started"
                  : "stage_bottleneck",
          alertKey: `patio:bottleneck:${b.kind}`,
          category: "patio",
          severity,
          title: `Pátio: ${b.title}`,
          body: `${b.count} veículo(s) acima do limiar na etapa ${b.status}.`,
          evidence: b.evidence,
          refType: "patio_stage",
          refId: b.status,
          payload: {
            sector: "patio",
            kind: b.kind,
            orderIds: b.orderIds.slice(0, 20),
            thresholdHours: b.thresholdHours,
          },
        })
      );
    }

    const risks = detectDeliveryRisks(patioOrders, 15);
    for (const r of risks.filter((x) => x.risk === "overdue" || x.risk === "imminent").slice(0, 10)) {
      out.push(
        draft({
          kind: r.risk === "overdue" ? "delivery_overdue" : "delivery_imminent",
          alertKey: `patio:delivery:${r.orderId}`,
          category: "patio",
          severity: r.risk === "overdue" ? "critical" : "warning",
          title:
            r.risk === "overdue"
              ? `Entrega atrasada: ${r.plate || r.osNumber || r.orderId.slice(0, 8)}`
              : `Entrega iminente: ${r.plate || r.osNumber || r.orderId.slice(0, 8)}`,
          body: r.reasons[0] || `Status ${r.statusLabel}; entrega ${r.deliveryDate}.`,
          evidence: r.reasons.join(" · "),
          refType: "service_order",
          refId: r.orderId,
          payload: {
            sector: "patio",
            risk: r.risk,
            hoursToDelivery: r.hoursToDelivery,
            status: r.status,
          },
        })
      );
    }
  } catch (err) {
    console.warn("[proactive] patio detectors:", err instanceof Error ? err.message : err);
  }

  // ----- Laboratório (Fase 4) -----
  try {
    const labOrders = await loadLabActiveOrders(input.workshopId, input.supabase);
    const labTh = parseLabThresholds(input.labThresholdsRaw ?? null);
    const bots = detectLabBottlenecks(labOrders, labTh);
    for (const b of bots.slice(0, 8)) {
      const severity =
        b.kind === "ready_for_pickup" || b.count >= 6
          ? "warning"
          : b.count >= 3
            ? "warning"
            : "info";
      out.push(
        draft({
          kind:
            b.kind === "slow_analysis"
              ? "lab_analysis_slow"
              : b.kind === "ready_for_pickup" || b.kind === "finished_awaiting_pickup"
                ? "lab_ready_pickup"
                : b.kind === "waiting_parts"
                  ? "waiting_parts"
                  : b.kind === "waiting_approval"
                    ? "waiting_approval"
                    : "stage_bottleneck",
          alertKey: `lab:bottleneck:${b.kind}`,
          category: "laboratorio",
          severity,
          title: `Lab: ${b.title}`,
          body: `${b.count} módulo(s) acima do limiar na etapa ${b.status}.`,
          evidence: b.evidence,
          refType: "lab_stage",
          refId: b.status,
          payload: {
            sector: "laboratorio",
            kind: b.kind,
            orderIds: b.orderIds.slice(0, 20),
            thresholdHours: b.thresholdHours,
          },
        })
      );
    }

    const ready = listReadyForPickup(labOrders);
    if (ready.length >= 3) {
      out.push(
        draft({
          kind: "lab_ready_pickup",
          alertKey: "lab:ready_pickup_batch",
          category: "laboratorio",
          severity: ready.length >= 6 ? "warning" : "info",
          title: `Lab: ${ready.length} módulos prontos pra entrega`,
          body: "Há módulos finalizados aguardando retirada.",
          evidence: ready
            .slice(0, 5)
            .map((o) => o.moduleIdentification || o.osNumber || o.id.slice(0, 8))
            .join("; "),
          payload: { orderIds: ready.map((o) => o.id).slice(0, 20) },
        })
      );
    }

    const bench = buildLabBenchOccupancy(labOrders);
    if (bench.free <= 2 && bench.occupied >= 20) {
      out.push(
        draft({
          kind: "bench_full",
          alertKey: "lab:bench_near_full",
          category: "laboratorio",
          severity: bench.free === 0 ? "critical" : "warning",
          title: `Lab: bancada quase cheia (${bench.occupied}/${bench.totalSlots})`,
          body: `${bench.free} slot(s) livre(s)${bench.queuedEstimate ? `; ~${bench.queuedEstimate} sem slot` : ""}.`,
          evidence: `Ocupação ${bench.occupied}/${bench.totalSlots}.`,
          payload: { occupied: bench.occupied, free: bench.free, queued: bench.queuedEstimate },
        })
      );
    }
  } catch (err) {
    console.warn("[proactive] lab detectors:", err instanceof Error ? err.message : err);
  }

  // ----- Estoque (Fase 4) -----
  try {
    const parts = await loadWorkshopPartsFacts(input.workshopId, input.supabase);
    const low = parts.filter((p) => p.lowStock && p.quantity > 0);
    const outOfStock = parts.filter((p) => p.quantity <= 0);
    for (const p of low.slice(0, 12)) {
      out.push(
        draft({
          kind: "low_stock",
          alertKey: `estoque:low:${p.id}`,
          category: "estoque",
          severity: "warning",
          title: `Estoque baixo: ${p.name}`,
          body: `Quantidade ${p.quantity}${p.minQuantity != null ? ` (mín. ${p.minQuantity})` : ""}.`,
          evidence: `stock_qty=${p.quantity}; min_stock_qty=${p.minQuantity ?? "n/d"}; código=${p.sku || "—"}; local=${p.location || "—"}.`,
          refType: "workshop_part",
          refId: p.id,
          payload: { stock_qty: p.quantity, min_stock_qty: p.minQuantity, original_code: p.sku },
        })
      );
    }
    for (const p of outOfStock.slice(0, 8)) {
      out.push(
        draft({
          kind: "out_of_stock",
          alertKey: `estoque:out:${p.id}`,
          category: "estoque",
          severity: "critical",
          title: `Peça esgotada: ${p.name}`,
          body: "Quantidade zerada no cadastro de estoque.",
          evidence: `stock_qty=0; código=${p.sku || "—"}; local=${p.location || "—"}.`,
          refType: "workshop_part",
          refId: p.id,
          payload: { stock_qty: 0, original_code: p.sku },
        })
      );
    }
  } catch (err) {
    console.warn("[proactive] stock detectors:", err instanceof Error ? err.message : err);
  }

  // ----- Produtividade (Fase 2) -----
  try {
    const patterns = await queryOperationalPatterns({
      workshopId: input.workshopId,
      supabase: input.supabase,
      days: 30,
    });
    const list = (patterns.patterns || []).filter(
      (p) => p.confidence === "medium" || p.confidence === "high"
    );
    for (const p of list.slice(0, 5)) {
      out.push(
        draft({
          kind: "ops_pattern",
          alertKey: `prod:${p.id}`,
          category: "produtividade",
          severity: p.kind === "frequent_pause" ? "warning" : "info",
          title: `Produtividade: ${p.title}`,
          body: p.summary,
          evidence: `n=${p.sampleCount}; confiança=${p.confidence}. Hipótese operacional — não é julgamento individual.`,
          refType: "ops_pattern",
          refId: p.id,
          payload: {
            patternKind: p.kind,
            sampleCount: p.sampleCount,
            confidence: p.confidence,
            proposedKnowledge: p.proposedKnowledge || null,
          },
          recommendation: buildRecommendation({
            category: "produtividade",
            kind: "ops_pattern",
            context: "Não gravar como memória oficial sem aprovação.",
          }),
        })
      );
    }

    const { data: longSessions } = await input.supabase
      .from("rda_work_sessions")
      .select("id")
      .eq("workshop_id", input.workshopId)
      .in("status", ["running", "paused"])
      .lt("started_at", new Date(Date.now() - 6 * 3600000).toISOString())
      .limit(20);
    if ((longSessions || []).length > 0) {
      out.push(
        draft({
          kind: "long_session",
          alertKey: "prod:long_sessions",
          category: "produtividade",
          severity: "info",
          title: `${longSessions!.length} cronômetro(s) ativo(s) há mais de 6h`,
          body: "Possível pausa esquecida ou serviço longo — conferir no Radar/Desempenho.",
          evidence: `Sessões running/paused com started_at < 6h. ids=${longSessions!
            .slice(0, 8)
            .map((s) => (s as { id: string }).id)
            .join(",")}`,
          payload: { sessionIds: longSessions!.map((s) => (s as { id: string }).id) },
        })
      );
    }
  } catch (err) {
    console.warn("[proactive] productivity detectors:", err instanceof Error ? err.message : err);
  }

  return out;
}
