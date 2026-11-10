import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPendingActionExpired,
  pendingActionExpiryIso,
  summarizePendingToolCall,
  type RdaPendingAction,
} from "../confirmationPolicy.js";
import type { RdaAuthContext } from "../types.js";

/** Estados da ação pendente (coluna `reason` em rda_tool_audit). */
export const PENDING_REASON = {
  pending: "confirmation_required",
  executing: "confirmation_executing",
  executed: "confirmed_executed",
  failed: "confirmed_failed",
  expired: "confirmation_expired",
  interrupted: "confirmation_interrupted",
} as const;

/** Após quanto tempo um `executing` órfão é tratado como interrompido (não reexecuta). */
export const EXECUTING_STALE_MS = 2 * 60 * 1000;

type AuditPendingMeta = {
  kind: "rda_pending_action";
  toolId: string;
  params: Record<string, unknown>;
  summary: string;
  expiresAt: string;
  conversationId: string;
  clientRequestId?: string | null;
  claimedAt?: string;
  claimCount?: number;
};

export type ClaimPendingResult =
  | { status: "claimed"; action: RdaPendingAction }
  | {
      status:
        | "already_executed"
        | "already_failed"
        | "in_progress"
        | "expired"
        | "interrupted"
        | "not_found"
        | "forbidden"
        | "invalid"
        | "error";
      message: string;
    };

export async function createPendingAction(input: {
  supabase: SupabaseClient;
  workshopId: string;
  conversationId: string;
  auth: RdaAuthContext;
  toolId: string;
  params: Record<string, unknown>;
  clientRequestId?: string | null;
}): Promise<RdaPendingAction> {
  const expiresAt = pendingActionExpiryIso();
  const summary = summarizePendingToolCall(input.toolId, input.params);
  const meta: AuditPendingMeta = {
    kind: "rda_pending_action",
    toolId: input.toolId,
    params: input.params,
    summary,
    expiresAt,
    conversationId: input.conversationId,
    clientRequestId: input.clientRequestId || null,
  };
  const { data, error } = await input.supabase
    .from("rda_tool_audit")
    .insert({
      workshop_id: input.workshopId,
      conversation_id: input.conversationId,
      actor_role: input.auth.role,
      actor_user_id: input.auth.userId || null,
      tool_id: input.toolId,
      allowed: false,
      reason: PENDING_REASON.pending,
      params: input.params,
      result_summary: JSON.stringify(meta),
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(error?.message || "Falha ao registrar ação pendente.");
  }
  return {
    id: String(data.id),
    toolId: input.toolId,
    params: input.params,
    summary,
    expiresAt,
    conversationId: input.conversationId,
    actorUserId: input.auth.userId || null,
  };
}

export function parsePendingMeta(raw: unknown): AuditPendingMeta | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as AuditPendingMeta;
    if (parsed?.kind !== "rda_pending_action") return null;
    if (!parsed.toolId || !parsed.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function actorForbidden(
  auth: RdaAuthContext,
  actorUserId: string | null | undefined
): boolean {
  if (!auth.userId || !actorUserId) return false;
  return String(actorUserId) !== String(auth.userId);
}

function rowToAction(
  row: {
    id: string;
    params?: Record<string, unknown> | null;
    actor_user_id?: string | null;
  },
  meta: AuditPendingMeta,
  conversationId: string
): RdaPendingAction {
  return {
    id: String(row.id),
    toolId: meta.toolId,
    params: meta.params || row.params || {},
    summary: meta.summary,
    expiresAt: meta.expiresAt,
    conversationId,
    actorUserId: row.actor_user_id || null,
  };
}

/** Classifica negação de claim a partir do estado atual (testável sem banco). */
export function classifyPendingRowDenial(input: {
  reason: string | null | undefined;
  meta: AuditPendingMeta | null;
  actorUserId: string | null | undefined;
  auth: RdaAuthContext;
  nowMs?: number;
}): Exclude<ClaimPendingResult, { status: "claimed" }> {
  const now = input.nowMs ?? Date.now();
  if (actorForbidden(input.auth, input.actorUserId)) {
    return { status: "forbidden", message: "Ação pendente de outro usuário." };
  }
  if (!input.meta) {
    return { status: "invalid", message: "Ação pendente inválida." };
  }
  if (input.reason === PENDING_REASON.executed) {
    return {
      status: "already_executed",
      message: "Esta ação já foi executada e não pode ser reutilizada.",
    };
  }
  if (input.reason === PENDING_REASON.failed) {
    return {
      status: "already_failed",
      message: "Esta ação já falhou. Solicite a operação novamente.",
    };
  }
  if (
    input.reason === PENDING_REASON.expired ||
    input.reason === PENDING_REASON.interrupted
  ) {
    return {
      status:
        input.reason === PENDING_REASON.interrupted ? "interrupted" : "expired",
      message: "Ação pendente expirada ou interrompida. Solicite de novo.",
    };
  }
  if (isPendingActionExpired(input.meta.expiresAt, now)) {
    return {
      status: "expired",
      message: `Ação ${input.meta.toolId} expirou. Peça de novo.`,
    };
  }
  if (input.reason === PENDING_REASON.executing) {
    const claimedAt = input.meta.claimedAt
      ? Date.parse(input.meta.claimedAt)
      : NaN;
    const stale =
      Number.isFinite(claimedAt) && now - claimedAt >= EXECUTING_STALE_MS;
    if (stale) {
      return {
        status: "interrupted",
        message:
          "Ação anterior ficou interrompida. Solicite a operação novamente (não reexecuta automaticamente).",
      };
    }
    return {
      status: "in_progress",
      message: "Ação já está sendo executada por outra requisição.",
    };
  }
  if (input.reason !== PENDING_REASON.pending) {
    return {
      status: "invalid",
      message: "Estado de confirmação inválido para execução.",
    };
  }
  return { status: "invalid", message: "Não foi possível reivindicar a ação." };
}

/**
 * Transição atômica pending → executing.
 * Somente uma requisição obtém `claimed`; concorrentes e reuso são rejeitados.
 * Ações interrompidas (executing órfão além do TTL) NÃO são reexecutadas.
 */
export async function claimPendingActionForExecution(input: {
  supabase: SupabaseClient;
  workshopId: string;
  auth: RdaAuthContext;
  conversationId: string;
  actionId: string;
  nowMs?: number;
}): Promise<ClaimPendingResult> {
  const id = String(input.actionId || "").trim();
  if (!id) return { status: "not_found", message: "ID de ação ausente." };
  const now = input.nowMs ?? Date.now();
  const claimedAt = new Date(now).toISOString();

  const { data: existing, error: loadError } = await input.supabase
    .from("rda_tool_audit")
    .select(
      "id, tool_id, params, result_summary, actor_user_id, conversation_id, reason"
    )
    .eq("workshop_id", input.workshopId)
    .eq("conversation_id", input.conversationId)
    .eq("id", id)
    .maybeSingle();

  if (loadError) return { status: "error", message: loadError.message };
  if (!existing) {
    return {
      status: "not_found",
      message: "Ação pendente não encontrada nesta conversa.",
    };
  }

  const row = existing as {
    id: string;
    tool_id: string;
    params?: Record<string, unknown> | null;
    result_summary?: string | null;
    actor_user_id?: string | null;
    reason?: string | null;
  };

  const meta = parsePendingMeta(row.result_summary);

  if (row.reason !== PENDING_REASON.pending) {
    const denial = classifyPendingRowDenial({
      reason: row.reason,
      meta,
      actorUserId: row.actor_user_id,
      auth: input.auth,
      nowMs: now,
    });
    if (denial.status === "expired" || denial.status === "interrupted") {
      await input.supabase
        .from("rda_tool_audit")
        .update({
          allowed: false,
          reason:
            denial.status === "interrupted"
              ? PENDING_REASON.interrupted
              : PENDING_REASON.expired,
          result_summary: denial.message.slice(0, 2000),
        })
        .eq("workshop_id", input.workshopId)
        .eq("id", id)
        .in("reason", [PENDING_REASON.pending, PENDING_REASON.executing]);
    }
    return denial;
  }

  if (actorForbidden(input.auth, row.actor_user_id)) {
    return { status: "forbidden", message: "Ação pendente de outro usuário." };
  }
  if (!meta) {
    return { status: "invalid", message: "Ação pendente inválida." };
  }
  if (isPendingActionExpired(meta.expiresAt, now)) {
    await input.supabase
      .from("rda_tool_audit")
      .update({
        allowed: false,
        reason: PENDING_REASON.expired,
        result_summary: `Ação ${meta.toolId} expirou. Peça de novo.`,
      })
      .eq("workshop_id", input.workshopId)
      .eq("id", id)
      .eq("reason", PENDING_REASON.pending);
    return {
      status: "expired",
      message: `Ação ${meta.toolId} expirou. Peça de novo.`,
    };
  }

  const nextMeta: AuditPendingMeta = {
    ...meta,
    claimedAt,
    claimCount: (meta.claimCount || 0) + 1,
  };

  // Atomicidade: só quem ainda está `pending` consegue o UPDATE.
  const { data: claimedRows, error: claimError } = await input.supabase
    .from("rda_tool_audit")
    .update({
      reason: PENDING_REASON.executing,
      result_summary: JSON.stringify(nextMeta),
    })
    .eq("workshop_id", input.workshopId)
    .eq("conversation_id", input.conversationId)
    .eq("id", id)
    .eq("reason", PENDING_REASON.pending)
    .select("id");

  if (claimError) {
    return { status: "error", message: claimError.message };
  }

  const claimed = Array.isArray(claimedRows) ? claimedRows[0] : claimedRows;
  if (!claimed) {
    return {
      status: "in_progress",
      message: "Ação já está sendo executada por outra requisição.",
    };
  }

  return {
    status: "claimed",
    action: rowToAction(row, nextMeta, input.conversationId),
  };
}

/** Única ação pendente recente da conversa (para "Sim"/"Confirmo"). */
export async function findSingleRecentPendingAction(input: {
  supabase: SupabaseClient;
  workshopId: string;
  auth: RdaAuthContext;
  conversationId: string;
}): Promise<RdaPendingAction | null> {
  const { data, error } = await input.supabase
    .from("rda_tool_audit")
    .select("id, tool_id, params, result_summary, actor_user_id, created_at")
    .eq("workshop_id", input.workshopId)
    .eq("conversation_id", input.conversationId)
    .eq("reason", PENDING_REASON.pending)
    .order("created_at", { ascending: false })
    .limit(5);
  if (error || !data?.length) return null;

  const valid: RdaPendingAction[] = [];
  for (const row of data) {
    const meta = parsePendingMeta(
      (row as { result_summary?: string }).result_summary
    );
    if (!meta || isPendingActionExpired(meta.expiresAt)) continue;
    const actor =
      (row as { actor_user_id?: string | null }).actor_user_id || null;
    if (input.auth.userId && actor && String(actor) !== String(input.auth.userId)) {
      continue;
    }
    valid.push({
      id: String((row as { id: string }).id),
      toolId: meta.toolId,
      params: meta.params || {},
      summary: meta.summary,
      expiresAt: meta.expiresAt,
      conversationId: input.conversationId,
      actorUserId: actor,
    });
  }
  if (valid.length !== 1) return null;
  return valid[0];
}

export async function markPendingActionExecuted(input: {
  supabase: SupabaseClient;
  workshopId: string;
  actionId: string;
  ok: boolean;
  summary: string;
}): Promise<void> {
  await input.supabase
    .from("rda_tool_audit")
    .update({
      allowed: input.ok,
      reason: input.ok ? PENDING_REASON.executed : PENDING_REASON.failed,
      result_summary: input.summary.slice(0, 2000),
    })
    .eq("workshop_id", input.workshopId)
    .eq("id", input.actionId)
    .eq("reason", PENDING_REASON.executing);
}
