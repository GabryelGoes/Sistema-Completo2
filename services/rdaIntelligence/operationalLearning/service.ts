import type { SupabaseClient } from "@supabase/supabase-js";
import type { RdaWorkTimeKind } from "../workSessions/stageRules.js";
import {
  buildOverview,
  buildPauseReasonRows,
  buildServiceDurationRows,
  buildTechnicianBreakdown,
  clampOpsLimit,
  clampOpsOffset,
  filterFactsByServiceKey,
  filterFactsByTechnician,
} from "./aggregations.js";
import { detectOperationalPatterns } from "./patterns.js";
import { factsForPeriodAnalysis } from "./periodAttribution.js";
import {
  loadPauseEvents,
  loadSessionFacts,
  loadTechnicianNames,
  parsePeriod,
} from "./repository.js";
import { formatDurationPt } from "./stats.js";
import type { OpsLoadCompleteness, OpsPeriod } from "./types.js";

export type OpsQueryInput = {
  workshopId: string;
  from?: string;
  to?: string;
  days?: number;
  technicianUserId?: string | null;
  serviceQuery?: string | null;
  timeKind?: RdaWorkTimeKind | "all";
  limit?: number;
  offset?: number;
  supabase?: SupabaseClient;
};

const COMPLETE: OpsLoadCompleteness = {
  complete: true,
  truncated: false,
  finishedFetched: 0,
  finishedLimit: 0,
  openFetched: 0,
  openLimit: 0,
  note: null,
};

function mergeCompleteness(a: OpsLoadCompleteness, b: OpsLoadCompleteness): OpsLoadCompleteness {
  const truncated = a.truncated || b.truncated;
  const notes = [a.note, b.note].filter(Boolean);
  return {
    complete: !truncated,
    truncated,
    finishedFetched: Math.max(a.finishedFetched, b.finishedFetched),
    finishedLimit: Math.max(a.finishedLimit, b.finishedLimit),
    openFetched: Math.max(a.openFetched, b.openFetched),
    openLimit: Math.max(a.openLimit, b.openLimit),
    pauseEventsFetched: Math.max(a.pauseEventsFetched || 0, b.pauseEventsFetched || 0) || undefined,
    pauseEventsLimit: Math.max(a.pauseEventsLimit || 0, b.pauseEventsLimit || 0) || undefined,
    note: notes.length ? notes.join(" ") : null,
  };
}

async function loadBase(input: OpsQueryInput) {
  const period = parsePeriod({ from: input.from, to: input.to, days: input.days });
  const loaded = await loadSessionFacts(
    input.workshopId,
    period,
    {
      technicianUserId: input.technicianUserId,
      limit: input.limit != null ? clampOpsLimit(input.limit, 5000, 5000) : undefined,
      offset: input.offset != null ? clampOpsOffset(input.offset) : undefined,
    },
    input.supabase
  );
  // Defesa em profundidade: finished por ended_at; abertas separadas.
  const scoped = factsForPeriodAnalysis(loaded.facts, period);
  const filtered = filterFactsByServiceKey(scoped, input.serviceQuery);
  return { period, facts: filtered, completeness: loaded.completeness };
}

export async function queryOperationalOverview(input: OpsQueryInput) {
  const { period, facts, completeness } = await loadBase(input);
  const overview = buildOverview(facts, period);
  return {
    kind: "overview" as const,
    disclaimer:
      "Finished atribuídos por ended_at no período. open.* são parciais. Tempo apontado ≠ tempo corrido da OS.",
    overview,
    completeness,
    formatted: {
      diagnostic: formatDurationPt(overview.diagnosticMs),
      execution: formatDurationPt(overview.executionMs),
      paused: formatDurationPt(overview.pausedMs),
      totalPointed: formatDurationPt(overview.totalPointedMs),
      openProductive: formatDurationPt(overview.open.productiveMs),
      openPaused: formatDurationPt(overview.open.pausedMs),
      openTotalPointed: formatDurationPt(overview.open.totalPointedMs),
    },
  };
}

export async function queryServiceDurationStats(input: OpsQueryInput) {
  const { period, facts, completeness } = await loadBase(input);
  const timeKind = input.timeKind || "all";
  const limit = clampOpsLimit(input.limit, 40);
  const rows = buildServiceDurationRows(facts, timeKind, limit);
  return {
    kind: "service_durations" as const,
    period,
    timeKind,
    criteria:
      "Finished pelo ended_at. Cada amostra = soma produtivo finished de (OS + serviço + time_kind). Diag/exec separados.",
    limit,
    offset: clampOpsOffset(input.offset),
    completeness,
    rows,
  };
}

export async function queryPauseReasonsSummary(input: OpsQueryInput) {
  const period = parsePeriod({ from: input.from, to: input.to, days: input.days });
  const loaded = await loadPauseEvents(input.workshopId, period, input.supabase);
  const limit = clampOpsLimit(input.limit, 30);
  const rows = buildPauseReasonRows(
    loaded.events.map((e) => ({
      reasonId: e.reasonId,
      label: e.label,
      pausedMs: e.pausedMs,
      crossesPeriodBoundary: e.crossesPeriodBoundary,
    })),
    limit
  );
  return {
    kind: "pause_reasons" as const,
    period,
    criteria:
      "Inclui pausas iniciadas antes e encerradas no período. Duração = clipada ao recorte (não integral se atravessar limites).",
    limit,
    completeness: loaded.completeness,
    rows,
  };
}

export async function queryTechnicianBreakdown(input: OpsQueryInput) {
  const { period, facts, completeness } = await loadBase(input);
  const scoped = filterFactsByTechnician(facts, input.technicianUserId);
  const names = await loadTechnicianNames(
    input.workshopId,
    scoped.map((f) => f.technicianUserId),
    input.supabase
  );
  const rows = buildTechnicianBreakdown(scoped, names);
  return {
    kind: "technician_breakdown" as const,
    period,
    disclaimer:
      "diagnosticMs/executionMs/pausedMs/totalPointedMs = finished (ended_at no período). open.* parciais. Não é ranking.",
    completeness,
    rows: rows.map((r) => ({
      ...r,
      diagnosticFormatted: formatDurationPt(r.diagnosticMs),
      executionFormatted: formatDurationPt(r.executionMs),
      pausedFormatted: formatDurationPt(r.pausedMs),
      totalFormatted: formatDurationPt(r.totalPointedMs),
      openProductiveFormatted: formatDurationPt(r.open.productiveMs),
      openPausedFormatted: formatDurationPt(r.open.pausedMs),
    })),
  };
}

export async function queryOperationalPatterns(input: OpsQueryInput) {
  const { period, facts, completeness: sessionCompleteness } = await loadBase(input);
  const pauses = await loadPauseEvents(input.workshopId, period, input.supabase);
  const patterns = detectOperationalPatterns(facts, pauses.events, period);
  return {
    kind: "patterns" as const,
    period,
    note: "Padrões são hipóteses/cálculos — nunca regras oficiais. Use rda_propose_knowledge / fluxo de Memória para aprovação humana.",
    completeness: mergeCompleteness(sessionCompleteness, pauses.completeness),
    patterns,
  };
}

export async function queryOperationalDashboard(input: OpsQueryInput) {
  const overview = await queryOperationalOverview(input);
  const servicesAll = await queryServiceDurationStats({ ...input, timeKind: "all", limit: 15 });
  const servicesDiag = await queryServiceDurationStats({
    ...input,
    timeKind: "diagnostic",
    limit: 10,
  });
  const servicesExec = await queryServiceDurationStats({
    ...input,
    timeKind: "execution",
    limit: 10,
  });
  const pauses = await queryPauseReasonsSummary(input);
  const techs = await queryTechnicianBreakdown(input);
  const patterns = await queryOperationalPatterns(input);
  const completeness = [
    overview.completeness,
    servicesAll.completeness,
    pauses.completeness,
    techs.completeness,
    patterns.completeness,
  ].reduce((acc, c) => mergeCompleteness(acc, c || COMPLETE), COMPLETE);

  return {
    overview: overview.overview,
    formatted: overview.formatted,
    disclaimer: overview.disclaimer,
    period: overview.overview.period as OpsPeriod,
    completeness,
    services: servicesAll.rows,
    diagnostics: servicesDiag.rows,
    executions: servicesExec.rows,
    pauses: pauses.rows,
    technicians: techs.rows,
    patterns: patterns.patterns,
  };
}
