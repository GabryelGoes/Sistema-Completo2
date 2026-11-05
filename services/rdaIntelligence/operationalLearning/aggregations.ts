import type { RdaWorkTimeKind } from "../workSessions/stageRules.js";
import { buildDistribution } from "./stats.js";
import { definitiveProductiveValues, sumMs } from "./sessionFacts.js";
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

  const diagnosticMs = sumMs(
    finished.filter((f) => f.timeKind === "diagnostic"),
    (f) => f.productiveMs
  );
  const executionMs = sumMs(
    finished.filter((f) => f.timeKind === "execution"),
    (f) => f.productiveMs
  );
  const pausedMs = sumMs(
    facts.filter((f) => f.status !== "cancelled"),
    (f) => f.pausedMs
  );

  const servicesFinishedCount = new Set(
    finished.map((f) => `${f.serviceOrderId}:${f.serviceKey}:${f.timeKind}`)
  ).size;

  const n = finished.length;
  return {
    period,
    diagnosticMs,
    executionMs,
    pausedMs,
    totalPointedMs: diagnosticMs + executionMs + pausedMs,
    finishedSessions: finished.length,
    openSessions: open.length,
    cancelledSessions: cancelled.length,
    servicesFinishedCount,
    confidenceNote:
      n === 0
        ? "Sem sessões finalizadas no período. Totais parciais de sessões abertas não entram como duração definitiva."
        : `Base: ${n} sessão(ões) finalizada(s). Tempos abertos/pausados não contam como duração definitiva. Tempo apontado ≠ tempo desde a entrada do veículo.`,
  };
}

export function buildServiceDurationRows(
  facts: OpsSessionFact[],
  timeKind: RdaWorkTimeKind | "all" = "all",
  limit = 40
): OpsServiceDurationRow[] {
  const byKey = new Map<string, OpsSessionFact[]>();
  for (const f of facts) {
    if (timeKind !== "all" && f.timeKind !== timeKind) continue;
    const list = byKey.get(f.serviceKey) || [];
    list.push(f);
    byKey.set(f.serviceKey, list);
  }

  const rows: OpsServiceDurationRow[] = [];
  for (const [serviceKey, group] of byKey) {
    const values = definitiveProductiveValues(group, timeKind === "all" ? "all" : timeKind);
    const finished = group.filter((f) => f.status === "finished");
    const open = group.filter((f) => f.status === "running" || f.status === "paused");
    const label =
      finished.find((f) => f.serviceLabel)?.serviceLabel ||
      open.find((f) => f.serviceLabel)?.serviceLabel ||
      serviceKey;
    rows.push({
      serviceKey,
      serviceLabel: label,
      timeKind,
      distribution: buildDistribution(values),
      finishedSessionCount: finished.length,
      openSessionCount: open.length,
      distinctTechnicians: new Set(finished.map((f) => f.technicianUserId)).size,
      distinctOs: new Set(finished.map((f) => f.serviceOrderId)).size,
    });
  }

  rows.sort((a, b) => {
    const am = a.distribution.medianMs ?? -1;
    const bm = b.distribution.medianMs ?? -1;
    if (bm !== am) return bm - am;
    return b.finishedSessionCount - a.finishedSessionCount;
  });
  return rows.slice(0, Math.max(1, limit));
}

export function buildPauseReasonRows(
  pauseEvents: Array<{ reasonId: string; label: string; pausedMs: number | null }>,
  limit = 30
): OpsPauseReasonRow[] {
  const byId = new Map<string, OpsPauseReasonRow>();
  for (const ev of pauseEvents) {
    const id = ev.reasonId || "unknown";
    const cur = byId.get(id) || {
      reasonId: id,
      label: ev.label || id,
      pauseEventCount: 0,
      pausedMs: 0,
    };
    cur.pauseEventCount += 1;
    if (ev.pausedMs != null && Number.isFinite(ev.pausedMs)) {
      cur.pausedMs = (cur.pausedMs || 0) + Math.max(0, ev.pausedMs);
    }
    byId.set(id, cur);
  }
  return [...byId.values()]
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
    const diagnosticMs = sumMs(
      finished.filter((f) => f.timeKind === "diagnostic"),
      (f) => f.productiveMs
    );
    const executionMs = sumMs(
      finished.filter((f) => f.timeKind === "execution"),
      (f) => f.productiveMs
    );
    const pausedMs = sumMs(group, (f) => f.pausedMs);
    rows.push({
      technicianUserId,
      displayName: nameById.get(technicianUserId) || technicianUserId.slice(0, 8),
      diagnosticMs,
      executionMs,
      pausedMs,
      totalPointedMs: diagnosticMs + executionMs + pausedMs,
      finishedSessions: finished.length,
      openSessions: open.length,
      servicesCount: new Set(finished.map((f) => f.serviceKey)).size,
    });
  }

  rows.sort((a, b) => b.totalPointedMs - a.totalPointedMs);
  return rows;
}

export function filterFactsByTechnician(facts: OpsSessionFact[], technicianUserId?: string | null): OpsSessionFact[] {
  if (!technicianUserId) return facts;
  return facts.filter((f) => f.technicianUserId === technicianUserId);
}

export function filterFactsByServiceKey(facts: OpsSessionFact[], serviceKey?: string | null): OpsSessionFact[] {
  if (!serviceKey) return facts;
  const q = serviceKey.trim().toLowerCase();
  if (!q) return facts;
  return facts.filter(
    (f) => f.serviceKey.includes(q) || f.serviceLabel.toLowerCase().includes(q)
  );
}
