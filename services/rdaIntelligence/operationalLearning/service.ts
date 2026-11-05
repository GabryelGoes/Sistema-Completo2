import type { SupabaseClient } from "@supabase/supabase-js";
import type { RdaWorkTimeKind } from "../workSessions/stageRules.js";
import {
  buildOverview,
  buildPauseReasonRows,
  buildServiceDurationRows,
  buildTechnicianBreakdown,
  filterFactsByServiceKey,
  filterFactsByTechnician,
} from "./aggregations.js";
import { detectOperationalPatterns } from "./patterns.js";
import {
  loadPauseEvents,
  loadSessionFacts,
  loadTechnicianNames,
  parsePeriod,
} from "./repository.js";
import { formatDurationPt } from "./stats.js";
import type { OpsPeriod } from "./types.js";

export type OpsQueryInput = {
  workshopId: string;
  from?: string;
  to?: string;
  days?: number;
  technicianUserId?: string | null;
  serviceQuery?: string | null;
  timeKind?: RdaWorkTimeKind | "all";
  limit?: number;
  supabase?: SupabaseClient;
};

async function loadBase(input: OpsQueryInput) {
  const period = parsePeriod({ from: input.from, to: input.to, days: input.days });
  const facts = await loadSessionFacts(
    input.workshopId,
    period,
    { technicianUserId: input.technicianUserId },
    input.supabase
  );
  const filtered = filterFactsByServiceKey(facts, input.serviceQuery);
  return { period, facts: filtered };
}

export async function queryOperationalOverview(input: OpsQueryInput) {
  const { period, facts } = await loadBase(input);
  const overview = buildOverview(facts, period);
  return {
    kind: "overview" as const,
    disclaimer:
      "Tempo apontado (produtivo + pausas) ≠ tempo corrido desde a entrada do veículo. Sessões abertas/pausadas não entram como duração definitiva.",
    overview,
    formatted: {
      diagnostic: formatDurationPt(overview.diagnosticMs),
      execution: formatDurationPt(overview.executionMs),
      paused: formatDurationPt(overview.pausedMs),
      totalPointed: formatDurationPt(overview.totalPointedMs),
    },
  };
}

export async function queryServiceDurationStats(input: OpsQueryInput) {
  const { period, facts } = await loadBase(input);
  const timeKind = input.timeKind || "all";
  const rows = buildServiceDurationRows(facts, timeKind, input.limit || 40);
  return {
    kind: "service_durations" as const,
    period,
    timeKind,
    criteria:
      "Mediana e percentis só com sessões status=finished. Abertas/pausadas listadas em openSessionCount, sem entrar na distribuição.",
    rows,
  };
}

export async function queryPauseReasonsSummary(input: OpsQueryInput) {
  const period = parsePeriod({ from: input.from, to: input.to, days: input.days });
  const events = await loadPauseEvents(input.workshopId, period, input.supabase);
  const rows = buildPauseReasonRows(events, input.limit || 30);
  return {
    kind: "pause_reasons" as const,
    period,
    criteria:
      "Contagem de eventos event_type=pause. Paused_ms por evento é estimativa (paused_ms da sessão / nº de pauses). Pausas não são tempo produtivo.",
    rows,
  };
}

export async function queryTechnicianBreakdown(input: OpsQueryInput) {
  const { period, facts } = await loadBase(input);
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
      "Comparação descritiva de tempo apontado — não é ranking de desempenho. Considere complexidade, retrabalho e interrupções.",
    rows: rows.map((r) => ({
      ...r,
      diagnosticFormatted: formatDurationPt(r.diagnosticMs),
      executionFormatted: formatDurationPt(r.executionMs),
      pausedFormatted: formatDurationPt(r.pausedMs),
      totalFormatted: formatDurationPt(r.totalPointedMs),
    })),
  };
}

export async function queryOperationalPatterns(input: OpsQueryInput) {
  const { period, facts } = await loadBase(input);
  const events = await loadPauseEvents(input.workshopId, period, input.supabase);
  const patterns = detectOperationalPatterns(facts, events, period);
  return {
    kind: "patterns" as const,
    period,
    note: "Padrões são hipóteses/cálculos — nunca regras oficiais. Use rda_propose_knowledge / fluxo de Memória para aprovação humana.",
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
  return {
    overview: overview.overview,
    formatted: overview.formatted,
    disclaimer: overview.disclaimer,
    period: overview.overview.period as OpsPeriod,
    services: servicesAll.rows,
    diagnostics: servicesDiag.rows,
    executions: servicesExec.rows,
    pauses: pauses.rows,
    technicians: techs.rows,
    patterns: patterns.patterns,
  };
}
