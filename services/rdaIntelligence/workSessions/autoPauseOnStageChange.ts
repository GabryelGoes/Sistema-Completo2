/**
 * Auto-pausa sessões running ao mudar etapa da OS (backend).
 * Preferência: RPC atômica; fallback: pause via update se RPC ausente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  RDA_PAUSE_REASON_STAGE_CHANGE,
  timeKindsToAutoPauseOnStageChange,
  type RdaWorkTimeKind,
} from "./stageRules.js";

export type AutoPauseOnStageChangeResult = {
  pausedCount: number;
  sessionIds: string[];
  kinds: RdaWorkTimeKind[];
  via: "rpc" | "fallback" | "noop" | "error";
  error?: string;
};

export async function autoPauseWorkSessionsOnStageChange(input: {
  supabase: SupabaseClient;
  workshopId: string;
  serviceOrderId: string;
  previousStatus: string;
  nextStatus: string;
  actorUserId?: string | null;
}): Promise<AutoPauseOnStageChangeResult> {
  const kinds = timeKindsToAutoPauseOnStageChange({
    previousStatus: input.previousStatus,
    nextStatus: input.nextStatus,
  });
  if (kinds.length === 0) {
    return { pausedCount: 0, sessionIds: [], kinds: [], via: "noop" };
  }

  const { data, error } = await input.supabase.rpc(
    "rda_work_sessions_auto_pause_for_os_stage",
    {
      p_workshop_id: input.workshopId,
      p_service_order_id: input.serviceOrderId,
      p_previous_status: input.previousStatus,
      p_next_status: input.nextStatus,
      p_actor_user_id: input.actorUserId || null,
    }
  );

  if (!error && data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    const ids = Array.isArray(row.sessionIds)
      ? (row.sessionIds as unknown[]).map(String)
      : [];
    return {
      pausedCount: Number(row.pausedCount || ids.length || 0),
      sessionIds: ids,
      kinds,
      via: "rpc",
    };
  }

  if (error && !/does not exist|function|Could not find/i.test(error.message || "")) {
    console.error("[RDA] autoPause RPC:", error.message);
    return {
      pausedCount: 0,
      sessionIds: [],
      kinds,
      via: "error",
      error: error.message,
    };
  }

  // Fallback sem RPC (migration pendente): congela productive e marca paused.
  const { data: running, error: listErr } = await input.supabase
    .from("rda_work_sessions")
    .select(
      "id, productive_ms, segment_started_at, time_kind, technician_user_id"
    )
    .eq("workshop_id", input.workshopId)
    .eq("service_order_id", input.serviceOrderId)
    .eq("status", "running")
    .in("time_kind", kinds);

  if (listErr) {
    // Coluna time_kind pode não existir ainda — tenta sem filtro de kind (só execução legada)
    if (/time_kind|column/i.test(listErr.message || "")) {
      const legacy = await input.supabase
        .from("rda_work_sessions")
        .select("id, productive_ms, segment_started_at, technician_user_id")
        .eq("workshop_id", input.workshopId)
        .eq("service_order_id", input.serviceOrderId)
        .eq("status", "running");
      if (legacy.error || !legacy.data?.length) {
        return { pausedCount: 0, sessionIds: [], kinds, via: "noop" };
      }
      if (!kinds.includes("execution")) {
        return { pausedCount: 0, sessionIds: [], kinds, via: "noop" };
      }
      return pauseRowsFallback(input, legacy.data as Array<Record<string, unknown>>, kinds);
    }
    return {
      pausedCount: 0,
      sessionIds: [],
      kinds,
      via: "error",
      error: listErr.message,
    };
  }

  if (!running?.length) {
    return { pausedCount: 0, sessionIds: [], kinds, via: "noop" };
  }

  return pauseRowsFallback(input, running as Array<Record<string, unknown>>, kinds);
}

async function pauseRowsFallback(
  input: {
    supabase: SupabaseClient;
    workshopId: string;
    actorUserId?: string | null;
    previousStatus: string;
    nextStatus: string;
  },
  rows: Array<Record<string, unknown>>,
  kinds: RdaWorkTimeKind[]
): Promise<AutoPauseOnStageChangeResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const pausedIds: string[] = [];

  for (const row of rows) {
    const id = String(row.id);
    let productive = Math.max(0, Number(row.productive_ms || 0));
    const seg = row.segment_started_at ? Date.parse(String(row.segment_started_at)) : NaN;
    if (Number.isFinite(seg)) {
      productive += Math.max(0, now.getTime() - seg);
    }
    const { error: updErr } = await input.supabase
      .from("rda_work_sessions")
      .update({
        status: "paused",
        productive_ms: productive,
        segment_started_at: null,
        current_pause_reason_id: RDA_PAUSE_REASON_STAGE_CHANGE,
        current_pause_note: "Pausa automática: OS saiu da etapa produtiva.",
        current_pause_started_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", id)
      .eq("workshop_id", input.workshopId)
      .eq("status", "running");
    if (updErr) {
      console.warn("[RDA] autoPause fallback update:", updErr.message);
      continue;
    }
    await input.supabase.from("rda_work_session_events").insert({
      workshop_id: input.workshopId,
      session_id: id,
      event_type: "pause",
      occurred_at: nowIso,
      pause_reason_id: RDA_PAUSE_REASON_STAGE_CHANGE,
      pause_note: "Pausa automática: OS saiu da etapa produtiva.",
      actor_user_id: input.actorUserId || null,
      meta: {
        auto: true,
        previousStatus: input.previousStatus,
        nextStatus: input.nextStatus,
        via: "fallback",
      },
    });
    pausedIds.push(id);
  }

  return {
    pausedCount: pausedIds.length,
    sessionIds: pausedIds,
    kinds,
    via: "fallback",
  };
}
