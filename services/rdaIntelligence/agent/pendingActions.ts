import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isPendingActionExpired,
  pendingActionExpiryIso,
  summarizePendingToolCall,
  type RdaPendingAction,
} from "../confirmationPolicy.js";
import type { RdaAuthContext } from "../types.js";

type AuditPendingMeta = {
  kind: "rda_pending_action";
  toolId: string;
  params: Record<string, unknown>;
  summary: string;
  expiresAt: string;
  conversationId: string;
  clientRequestId?: string | null;
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
      reason: "confirmation_required",
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

function parsePendingMeta(raw: unknown): AuditPendingMeta | null {
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

export async function loadPendingActionsByIds(input: {
  supabase: SupabaseClient;
  workshopId: string;
  auth: RdaAuthContext;
  conversationId: string;
  ids: string[];
}): Promise<{ actions: RdaPendingAction[]; errors: string[] }> {
  const ids = input.ids.map((x) => String(x || "").trim()).filter(Boolean);
  if (!ids.length) return { actions: [], errors: [] };
  const { data, error } = await input.supabase
    .from("rda_tool_audit")
    .select("id, tool_id, params, result_summary, actor_user_id, conversation_id, reason")
    .eq("workshop_id", input.workshopId)
    .eq("conversation_id", input.conversationId)
    .eq("reason", "confirmation_required")
    .in("id", ids);
  if (error) return { actions: [], errors: [error.message] };

  const actions: RdaPendingAction[] = [];
  const errors: string[] = [];
  for (const row of data || []) {
    const meta = parsePendingMeta((row as { result_summary?: string }).result_summary);
    if (!meta) {
      errors.push(`Ação ${String((row as { id: string }).id)} inválida.`);
      continue;
    }
    if (isPendingActionExpired(meta.expiresAt)) {
      errors.push(`Ação ${meta.toolId} expirou. Peça de novo.`);
      continue;
    }
    const actor = (row as { actor_user_id?: string | null }).actor_user_id || null;
    if (input.auth.userId && actor && String(actor) !== String(input.auth.userId)) {
      errors.push("Ação pendente de outro usuário.");
      continue;
    }
    actions.push({
      id: String((row as { id: string }).id),
      toolId: meta.toolId,
      params: meta.params || ((row as { params?: Record<string, unknown> }).params as Record<string, unknown>) || {},
      summary: meta.summary,
      expiresAt: meta.expiresAt,
      conversationId: input.conversationId,
      actorUserId: actor,
    });
  }
  return { actions, errors };
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
    .eq("reason", "confirmation_required")
    .order("created_at", { ascending: false })
    .limit(5);
  if (error || !data?.length) return null;

  const valid: RdaPendingAction[] = [];
  for (const row of data) {
    const meta = parsePendingMeta((row as { result_summary?: string }).result_summary);
    if (!meta || isPendingActionExpired(meta.expiresAt)) continue;
    const actor = (row as { actor_user_id?: string | null }).actor_user_id || null;
    if (input.auth.userId && actor && String(actor) !== String(input.auth.userId)) continue;
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
      reason: input.ok ? "confirmed_executed" : "confirmed_failed",
      result_summary: input.summary.slice(0, 2000),
    })
    .eq("workshop_id", input.workshopId)
    .eq("id", input.actionId);
}
