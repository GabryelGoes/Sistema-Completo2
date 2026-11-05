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
  offset?: number;
  supabase?: SupabaseClient;
};

async function loadBase(input: OpsQueryInput) {
  const period = parsePeriod({ from: input.from, to: input.to, days: input.days });
  const facts = await loadSessionFacts(
    input.workshopId,
    period,
    {
      technicianUserId: input.technicianUserId,
      limit: input.limit != null ? clampOpsLimit(input.limit, 5000, 5000) : undefined,
      offset: input.offset != null ? clampOpsOffset(input.offset) : undefined,
    },
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
      "Totais consolidados = sessões finished. open.* são parciais. Tempo apontado ≠ tempo corrido da OS.",
    overview,
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
  const { period, facts } = await loadBase(input);
  const timeKind = input.timeKind || "all";
  const limit = clampOpsLimit(input.limit, 40);
  const rows = buildServiceDurationRows(facts, timeKind, limit);
  return {
    kind: "service_durations" as const,
    period,
    timeKind,
    criteria:
      "Cada amostra = soma do produtivo finished de (OS + serviço + time_kind). Diagnóstico e execução nunca na mesma distribuição. Abertas só em openSessionCount.",
    limit,
    offset: clampOpsOffset(input.offset),
    rows,
  };
}

export async function queryPauseReasonsSummary(input: OpsQueryInput) {
  const period = parsePeriod({ from: input.from, to: input.to, days: input.days });
  const events = await loadPauseEvents(input.workshopId, period, input.supabase);
  const limit = clampOpsLimit(input.limit, 30);
  const rows = buildPauseReasonRows(events, limit);
  return {
    kind: "pause_reasons" as const,
    period,
    criteria:
      "Duração por motivo via timestamps pause→resume/finish/cancel. Sem rateio de paused_ms. Se faltar fechamento, só contagem (duração desconhecida).",
    limit,
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
      "diagnosticMs/executionMs/pausedMs/totalPointedMs = finished apenas. open.* são parciais. Não é ranking de desempenho.",
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
  // Lista "serviços" mostra ambos kinds em linhas separadas (sem misturar distribuições).
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
