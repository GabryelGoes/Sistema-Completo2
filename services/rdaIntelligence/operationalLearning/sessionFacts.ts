import type { RdaWorkTimeKind } from "../workSessions/stageRules.js";
import type { OpsSessionFact } from "./types.js";

/**
 * Linha bruta compatível com produção.
 * `budget_service_line_id` é opcional — ausente no schema atual de produção.
 */
export type RawWorkSessionRow = {
  id: string;
  workshop_id: string;
  service_order_id: string;
  technician_user_id: string;
  time_kind?: string | null;
  status: string;
  started_at: string;
  ended_at: string | null;
  productive_ms: number | null;
  paused_ms: number | null;
  budget_service_description: string | null;
  current_pause_reason_id: string | null;
  /** Só se a coluna existir; nunca obrigatória na query. */
  budget_service_line_id?: string | null;
  order_type?: string | null;
};

function normalizeServiceLabel(raw: string | null | undefined): string {
  const t = String(raw || "").trim().replace(/\s+/g, " ");
  return t || "Serviço sem descrição";
}

/** Chave estável por descrição (e line_id só se informado). */
export function serviceKeyFromDescription(
  description: string | null | undefined,
  lineId?: string | null
): string {
  const label = normalizeServiceLabel(description).toLowerCase();
  const compact = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120);
  if (compact) return compact;
  if (lineId) return `line_${lineId}`;
  return "sem_descricao";
}

/** Chave de ocorrência: mesma OS + mesmo serviço + mesmo time_kind. */
export function serviceOccurrenceKey(fact: {
  serviceOrderId: string;
  serviceKey: string;
  timeKind: RdaWorkTimeKind;
}): string {
  return `${fact.serviceOrderId}::${fact.serviceKey}::${fact.timeKind}`;
}

export function toSessionFact(row: RawWorkSessionRow): OpsSessionFact | null {
  const status = String(row.status || "");
  if (!["running", "paused", "finished", "cancelled"].includes(status)) return null;

  // Legado / schema sem valor: default execution (mesmo default da migration time_kind).
  const rawKind = String(row.time_kind || "execution").toLowerCase();
  const timeKind = rawKind as RdaWorkTimeKind;
  if (timeKind !== "diagnostic" && timeKind !== "execution") return null;

  const productiveMs = Math.max(0, Number(row.productive_ms) || 0);
  const pausedMs = Math.max(0, Number(row.paused_ms) || 0);
  const isFinished = status === "finished";
  const isPartial = status === "running" || status === "paused";
  const serviceLabel = normalizeServiceLabel(row.budget_service_description);
  const lineId =
    row.budget_service_line_id != null && String(row.budget_service_line_id).trim()
      ? String(row.budget_service_line_id).trim()
      : null;

  return {
    sessionId: row.id,
    workshopId: row.workshop_id,
    serviceOrderId: row.service_order_id,
    technicianUserId: row.technician_user_id,
    timeKind,
    status: status as OpsSessionFact["status"],
    startedAt: row.started_at,
    endedAt: row.ended_at,
    productiveMs,
    pausedMs,
    definitiveProductiveMs: isFinished ? productiveMs : null,
    isPartial,
    serviceKey: serviceKeyFromDescription(row.budget_service_description, lineId),
    serviceLabel,
    budgetServiceLineId: lineId,
    orderType: row.order_type === "module" || row.order_type === "vehicle" ? row.order_type : null,
    currentPauseReasonId: row.current_pause_reason_id,
  };
}

/**
 * Valores definitivos por ocorrência (OS+serviço+kind): soma sessões finished.
 * Não conta sessões abertas; não mistura kinds.
 */
export function definitiveOccurrenceDurations(
  facts: OpsSessionFact[],
  timeKind: RdaWorkTimeKind
): { valuesMs: number[]; occurrenceKeys: string[]; sessionCount: number } {
  const byOcc = new Map<string, number>();
  let sessionCount = 0;
  for (const f of facts) {
    if (f.status !== "finished" || f.timeKind !== timeKind) continue;
    sessionCount += 1;
    const key = serviceOccurrenceKey(f);
    byOcc.set(key, (byOcc.get(key) || 0) + f.productiveMs);
  }
  return {
    valuesMs: [...byOcc.values()],
    occurrenceKeys: [...byOcc.keys()],
    sessionCount,
  };
}

/** @deprecated Prefer definitiveOccurrenceDurations — mantido para testes de filtragem simples. */
export function definitiveProductiveValues(
  facts: OpsSessionFact[],
  timeKind?: RdaWorkTimeKind | "all"
): number[] {
  return facts
    .filter((f) => f.status === "finished" && f.definitiveProductiveMs != null)
    .filter((f) => timeKind == null || timeKind === "all" || f.timeKind === timeKind)
    .map((f) => f.definitiveProductiveMs!);
}

export function sumMs(facts: OpsSessionFact[], pick: (f: OpsSessionFact) => number): number {
  return facts.reduce((acc, f) => acc + Math.max(0, pick(f)), 0);
}

export function bucketTotals(facts: OpsSessionFact[]): {
  diagnosticProductiveMs: number;
  executionProductiveMs: number;
  productiveMs: number;
  pausedMs: number;
  totalPointedMs: number;
  sessions: number;
} {
  const diagnosticProductiveMs = sumMs(
    facts.filter((f) => f.timeKind === "diagnostic"),
    (f) => f.productiveMs
  );
  const executionProductiveMs = sumMs(
    facts.filter((f) => f.timeKind === "execution"),
    (f) => f.productiveMs
  );
  const pausedMs = sumMs(facts, (f) => f.pausedMs);
  const productiveMs = diagnosticProductiveMs + executionProductiveMs;
  return {
    diagnosticProductiveMs,
    executionProductiveMs,
    productiveMs,
    pausedMs,
    totalPointedMs: productiveMs + pausedMs,
    sessions: facts.length,
  };
}
