/**
 * Auto-pausa sessões running ao mudar etapa da OS (backend).
 * Usa somente a RPC atômica `rda_work_sessions_auto_pause_for_os_stage`
 * (espelhada pelo trigger AFTER UPDATE OF status). Sem fallback de updates
 * separados em sessão/evento — evita corrida e histórico inconsistente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  timeKindsToAutoPauseOnStageChange,
  type RdaWorkTimeKind,
} from "./stageRules.js";

export type AutoPauseOnStageChangeResult = {
  pausedCount: number;
  sessionIds: string[];
  kinds: RdaWorkTimeKind[];
  via: "rpc" | "noop" | "error";
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

  if (error) {
    console.error("[RDA] autoPause RPC:", error.message);
    return {
      pausedCount: 0,
      sessionIds: [],
      kinds,
      via: "error",
      error: error.message,
    };
  }

  if (!data || typeof data !== "object") {
    return {
      pausedCount: 0,
      sessionIds: [],
      kinds,
      via: "error",
      error: "RPC auto-pause sem resposta.",
    };
  }

  const row = data as Record<string, unknown>;
  if (row.ok === false) {
    const msg = typeof row.error === "string" ? row.error : "RPC auto-pause falhou.";
    console.error("[RDA] autoPause RPC ok=false:", msg);
    return {
      pausedCount: 0,
      sessionIds: [],
      kinds,
      via: "error",
      error: msg,
    };
  }

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

/**
 * Sessões ainda `running` dos kinds informados (pós-mudança de etapa).
 * Usado para confirmar que nada produtivo ficou ativo após sair da etapa.
 */
export async function listRunningWorkSessionIdsForKinds(input: {
  supabase: SupabaseClient;
  workshopId: string;
  serviceOrderId: string;
  kinds: RdaWorkTimeKind[];
}): Promise<{ ids: string[]; error?: string }> {
  if (input.kinds.length === 0) return { ids: [] };

  const { data, error } = await input.supabase
    .from("rda_work_sessions")
    .select("id")
    .eq("workshop_id", input.workshopId)
    .eq("service_order_id", input.serviceOrderId)
    .eq("status", "running")
    .in("time_kind", input.kinds);

  if (error) {
    return { ids: [], error: error.message };
  }
  return {
    ids: (data || []).map((r) => String((r as { id: string }).id)),
  };
}

/**
 * Simula o efeito da auto-pausa sobre o conjunto de kinds running
 * (pura — testes de concorrência/idempotência sem banco).
 */
export function applyAutoPauseKindsToRunning(
  runningKinds: readonly RdaWorkTimeKind[],
  previousStatus: string,
  nextStatus: string
): RdaWorkTimeKind[] {
  const toPause = new Set(
    timeKindsToAutoPauseOnStageChange({ previousStatus, nextStatus })
  );
  return runningKinds.filter((k) => !toPause.has(k));
}
