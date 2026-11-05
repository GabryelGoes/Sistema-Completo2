import type { RdaWorkTimeKind } from "../workSessions/stageRules.js";
import type { OpsSessionFact } from "./types.js";

export type RawWorkSessionRow = {
  id: string;
  workshop_id: string;
  service_order_id: string;
  technician_user_id: string;
  time_kind: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  productive_ms: number | null;
  paused_ms: number | null;
  budget_service_line_id: string | null;
  budget_service_description: string | null;
  current_pause_reason_id: string | null;
  order_type?: string | null;
};

function normalizeServiceLabel(raw: string | null | undefined): string {
  const t = String(raw || "").trim().replace(/\s+/g, " ");
  return t || "Serviço sem descrição";
}

/** Chave estável para comparar serviços equivalentes (descrição normalizada). */
export function serviceKeyFromDescription(description: string | null | undefined, lineId?: string | null): string {
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

export function toSessionFact(row: RawWorkSessionRow): OpsSessionFact | null {
  const status = String(row.status || "");
  if (!["running", "paused", "finished", "cancelled"].includes(status)) return null;
  const timeKind = String(row.time_kind || "") as RdaWorkTimeKind;
  if (timeKind !== "diagnostic" && timeKind !== "execution") return null;

  const productiveMs = Math.max(0, Number(row.productive_ms) || 0);
  const pausedMs = Math.max(0, Number(row.paused_ms) || 0);
  const isFinished = status === "finished";
  const isPartial = status === "running" || status === "paused";
  const serviceLabel = normalizeServiceLabel(row.budget_service_description);

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
    serviceKey: serviceKeyFromDescription(row.budget_service_description, row.budget_service_line_id),
    serviceLabel,
    budgetServiceLineId: row.budget_service_line_id,
    orderType: row.order_type === "module" || row.order_type === "vehicle" ? row.order_type : null,
    currentPauseReasonId: row.current_pause_reason_id,
  };
}

/** Só sessões finished entram em duração definitiva de serviço. */
export function definitiveProductiveValues(facts: OpsSessionFact[], timeKind?: RdaWorkTimeKind | "all"): number[] {
  return facts
    .filter((f) => f.status === "finished" && f.definitiveProductiveMs != null)
    .filter((f) => timeKind == null || timeKind === "all" || f.timeKind === timeKind)
    .map((f) => f.definitiveProductiveMs!);
}

export function sumMs(facts: OpsSessionFact[], pick: (f: OpsSessionFact) => number): number {
  return facts.reduce((acc, f) => acc + Math.max(0, pick(f)), 0);
}
