import type { RdaWorkTimeKind } from "../workSessions/stageRules.js";
import { buildDistribution } from "./stats.js";
import { bucketTotals, definitiveOccurrenceDurations, serviceOccurrenceKey } from "./sessionFacts.js";
import type {
  OpsOverview,
  OpsPauseReasonRow,
  OpsPeriod,
  OpsServiceDurationRow,
  OpsSessionFact,
  OpsTechnicianBreakdownRow,
} from "./types.js";

export function buildOverview(facts: OpsSessionFact[], period: OpsPeriod): OpsOverview {
  const finished = facts.filter((f) => f.status === "finished");
  const open = facts.filter((f) => f.status === "running" || f.status === "paused");
  const cancelled = facts.filter((f) => f.status === "cancelled");

  const finishedBucket = bucketTotals(finished);
  const openBucket = bucketTotals(open);

  const servicesFinishedCount = new Set(
    finished.map((f) => serviceOccurrenceKey(f))
  ).size;

  const n = finished.length;
  const reconciliationNote =
    `finished.totalPointedMs (${finishedBucket.totalPointedMs}) = ` +
    `finished.productiveMs (${finishedBucket.productiveMs}) + finished.pausedMs (${finishedBucket.pausedMs}); ` +
    `open.totalPointedMs (${openBucket.totalPointedMs}) é parcial e NÃO entra nos totais consolidados; ` +
    `nenhum valor é tempo corrido da OS.`;

  return {
    period,
    finished: finishedBucket,
    open: openBucket,
    cancelledSessions: cancelled.length,
    servicesFinishedCount,
    diagnosticMs: finishedBucket.diagnosticProductiveMs,
    executionMs: finishedBucket.executionProductiveMs,
    pausedMs: finishedBucket.pausedMs,
    totalPointedMs: finishedBucket.totalPointedMs,
    finishedSessions: finished.length,
    openSessions: open.length,
    confidenceNote:
      n === 0
        ? "Sem sessões finalizadas no período. Totais consolidados usam só finished; abertas ficam em open (parciais)."
        : `Base consolidada: ${n} sessão(ões) finalizada(s). Abertas/pausadas em open.*. Tempo apontado ≠ tempo desde a entrada do veículo.`,
    reconciliationNote,
  };
}

/**
 * Duração típica por tipo de serviço.
 * - Sempre separa diagnostic vs execution (nunca mistura na mesma distribuição).
 * - Várias sessões finished da mesma OS+serviço+kind viram UMA amostra (soma).
 */
export function buildServiceDurationRows(
  facts: OpsSessionFact[],
  timeKind: RdaWorkTimeKind | "all" = "all",
  limit = 40
): OpsServiceDurationRow[] {
  const kinds: RdaWorkTimeKind[] =
    timeKind === "all" ? ["diagnostic", "execution"] : [timeKind];

  const rows: OpsServiceDurationRow[] = [];

  for (const kind of kinds) {
    const scoped = facts.filter((f) => f.timeKind === kind);
    const byService = new Map<string, OpsSessionFact[]>();
    for (const f of scoped) {
      const list = byService.get(f.serviceKey) || [];
      list.push(f);
      byService.set(f.serviceKey, list);
    }

    for (const [serviceKey, group] of byService) {
      const collapsed = definitiveOccurrenceDurations(group, kind);
      const finished = group.filter((f) => f.status === "finished");
      const open = group.filter((f) => f.status === "running" || f.status === "paused");
      const label =
        finished.find((f) => f.serviceLabel)?.serviceLabel ||
        open.find((f) => f.serviceLabel)?.serviceLabel ||
        serviceKey;

      rows.push({
        serviceKey,
        serviceLabel: label,
        timeKind: kind,
        distribution: buildDistribution(collapsed.valuesMs),
        finishedSessionCount: collapsed.sessionCount,
        finishedOccurrenceCount: collapsed.valuesMs.length,
        openSessionCount: open.length,
        distinctTechnicians: new Set(finished.map((f) => f.technicianUserId)).size,
        distinctOs: new Set(finished.map((f) => f.serviceOrderId)).size,
      });
    }
  }

  rows.sort((a, b) => {
    const am = a.distribution.medianMs ?? -1;
    const bm = b.distribution.medianMs ?? -1;
    if (bm !== am) return bm - am;
    return b.finishedOccurrenceCount - a.finishedOccurrenceCount;
  });
  return rows.slice(0, Math.max(1, Math.min(limit, 200)));
}

export function buildPauseReasonRows(
  pauseEvents: Array<{
    reasonId: string;
    label: string;
    pausedMs: number | null;
  }>,
  limit = 30
): OpsPauseReasonRow[] {
  const byId = new Map<
    string,
    {
      reasonId: string;
      label: string;
      pauseEventCount: number;
      knownSum: number;
      knownCount: number;
      unknownCount: number;
    }
  >();

  for (const ev of pauseEvents) {
    const id = ev.reasonId || "unknown";
    const cur = byId.get(id) || {
      reasonId: id,
      label: ev.label || id,
      pauseEventCount: 0,
      knownSum: 0,
      knownCount: 0,
      unknownCount: 0,
    };
    cur.pauseEventCount += 1;
    if (ev.pausedMs != null && Number.isFinite(ev.pausedMs) && ev.pausedMs >= 0) {
      cur.knownSum += ev.pausedMs;
      cur.knownCount += 1;
    } else {
      cur.unknownCount += 1;
    }
    byId.set(id, cur);
  }

  return [...byId.values()]
    .map((cur) => {
      const allKnown = cur.unknownCount === 0 && cur.knownCount > 0;
      const noneKnown = cur.knownCount === 0;
      return {
        reasonId: cur.reasonId,
        label: cur.label,
        pauseEventCount: cur.pauseEventCount,
        pausedMs: allKnown ? cur.knownSum : null,
        durationKnownCount: cur.knownCount,
        durationUnknownCount: cur.unknownCount,
        durationNote: noneKnown
          ? "Duração por motivo desconhecida (faltam timestamps de fechamento pause→resume/finish)."
          : allKnown
            ? `Duração somada a partir de ${cur.knownCount} intervalo(s) com timestamps.`
            : `Parcial: ${cur.knownCount} com duração conhecida, ${cur.unknownCount} desconhecida(s) — total por motivo omitido.`,
      } satisfies OpsPauseReasonRow;
    })
    .sort((a, b) => b.pauseEventCount - a.pauseEventCount)
    .slice(0, limit);
}

export function buildTechnicianBreakdown(
  facts: OpsSessionFact[],
  nameById: Map<string, string>
): OpsTechnicianBreakdownRow[] {
  const byTech = new Map<string, OpsSessionFact[]>();
  for (const f of facts) {
    if (f.status === "cancelled") continue;
    const list = byTech.get(f.technicianUserId) || [];
    list.push(f);
    byTech.set(f.technicianUserId, list);
  }

  const rows: OpsTechnicianBreakdownRow[] = [];
  for (const [technicianUserId, group] of byTech) {
    const finished = group.filter((f) => f.status === "finished");
    const open = group.filter((f) => f.status === "running" || f.status === "paused");
    const finishedBucket = bucketTotals(finished);
    const openBucket = bucketTotals(open);
    rows.push({
      technicianUserId,
      displayName: nameById.get(technicianUserId) || technicianUserId.slice(0, 8),
      finished: finishedBucket,
      open: openBucket,
      finishedSessions: finished.length,
      openSessions: open.length,
      servicesCount: new Set(finished.map((f) => `${f.serviceKey}:${f.timeKind}`)).size,
      diagnosticMs: finishedBucket.diagnosticProductiveMs,
      executionMs: finishedBucket.executionProductiveMs,
      pausedMs: finishedBucket.pausedMs,
      totalPointedMs: finishedBucket.totalPointedMs,
    });
  }

  rows.sort((a, b) => b.totalPointedMs - a.totalPointedMs);
  return rows;
}

export function filterFactsByTechnician(
  facts: OpsSessionFact[],
  technicianUserId?: string | null
): OpsSessionFact[] {
  if (!technicianUserId) return facts;
  return facts.filter((f) => f.technicianUserId === technicianUserId);
}

export function filterFactsByServiceKey(
  facts: OpsSessionFact[],
  serviceKey?: string | null
): OpsSessionFact[] {
  if (!serviceKey) return facts;
  const q = serviceKey.trim().toLowerCase();
  if (!q) return facts;
  return facts.filter(
    (f) => f.serviceKey.includes(q) || f.serviceLabel.toLowerCase().includes(q)
  );
}

export function clampOpsLimit(n: unknown, fallback = 40, max = 200): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return fallback;
  return Math.min(Math.floor(v), max);
}

export function clampOpsOffset(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v <= 0) return 0;
  return Math.min(Math.floor(v), 10_000);
}
