import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizeToolInvocation } from "../permissions.js";
import { resolveRdaLlmProvider } from "../providers/resolve.js";
import { RdaProviderDisabledError } from "../providers/types.js";
import { productionRdaToolRegistry } from "../tools/registry.js";
import { ensureProductionRdaToolsRegistered } from "../tools/registerProduction.js";
import { executeRdaTool } from "../tools/executors.js";
import type {
  RdaAuthContext,
  RdaLlmMessage,
  RdaOpenAiToolSpec,
} from "../types.js";
import {
  historyRowsToLlmMessages,
  sanitizeMessagesForOpenAi,
} from "./openaiMessages.js";
import { assertUnderDailyLimit, recordTokenUsage } from "./usage.js";

const MAX_ROUNDS = 6;

const SYSTEM_PROMPT = `Você é o RDA Intelligence, assistente técnico e de gestão da oficina Rei do ABS.
Regras obrigatórias:
- Use apenas as ferramentas para fatos do sistema. Distinga FATOS (com fonte interna) de HIPÓTESES.
- Nunca invente estoque, compatibilidade ABS, diagnósticos ou tempos.
- Não afirme compatibilidade de peças sem evidência explícita nas tools.
- Operações sensíveis só como proposta (requires confirmation); não diga que já executou.
- Responda em português do Brasil, objetivo e acionável.
- Se faltar dado, diga o que falta em vez de chutar.`;

export type RdaChatTurnInput = {
  workshopId: string;
  supabase: SupabaseClient;
  auth: RdaAuthContext;
  settingValue: string | null;
  conversationId?: string | null;
  userMessage: string;
  contextServiceOrderId?: string | null;
  humanConfirmedToolIds?: string[];
};

export type RdaChatTurnResult = {
  conversationId: string;
  assistantMessage: string;
  proposedActions: unknown[];
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  model?: string;
  toolTrace: Array<{ toolId: string; ok: boolean; summary: string }>;
};

async function ensureConversation(
  supabase: SupabaseClient,
  workshopId: string,
  auth: RdaAuthContext,
  conversationId: string | null | undefined,
  contextServiceOrderId?: string | null
): Promise<string> {
  if (conversationId) {
    const { data } = await supabase
      .from("rda_conversations")
      .select("id")
      .eq("workshop_id", workshopId)
      .eq("id", conversationId)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }
  const { data, error } = await supabase
    .from("rda_conversations")
    .insert({
      workshop_id: workshopId,
      created_by_user_id: auth.userId || null,
      created_by_role: auth.role,
      title: "Conversa RDA",
      context_service_order_id: contextServiceOrderId || null,
      status: "open",
    })
    .select("id")
    .single();
  if (error || !data?.id) {
    throw new Error(error?.message || "Não foi possível criar conversa RDA.");
  }
  return String(data.id);
}

async function appendMessage(
  supabase: SupabaseClient,
  workshopId: string,
  conversationId: string,
  row: {
    role: string;
    content: string;
    tool_call_id?: string | null;
    tool_name?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await supabase.from("rda_messages").insert({
    workshop_id: workshopId,
    conversation_id: conversationId,
    role: row.role,
    content: row.content,
    tool_call_id: row.tool_call_id || null,
    tool_name: row.tool_name || null,
    metadata: row.metadata || {},
  });
}

function toolsForAuth(auth: RdaAuthContext, settingValue: string | null): RdaOpenAiToolSpec[] {
  ensureProductionRdaToolsRegistered();
  const specs: RdaOpenAiToolSpec[] = [];
  for (const tool of productionRdaToolRegistry.list()) {
    const gate = authorizeToolInvocation({
      registry: productionRdaToolRegistry,
      auth,
      toolId: tool.id,
      params: {},
      humanConfirmed: tool.side === "read" ? false : false,
      settingValue,
      // For listing eligibility of read tools, bypass confirm by checking permission only for reads
      featureEnabled: true,
    });
    // Write tools still appear so model can propose; execution needs confirm.
    const permOk =
      gate.allowed === true ||
      (gate.allowed === false && gate.reason === "confirmation_required") ||
      (gate.allowed === false &&
        gate.reason === "invalid_params" &&
        tool.side === "read");
    // Simpler: check permission helper via authorize with empty params for reads that have no required fields
    const authProbe = authorizeToolInvocation({
      registry: productionRdaToolRegistry,
      auth,
      toolId: tool.id,
      params: tool.parameters.required?.length
        ? Object.fromEntries(
            (tool.parameters.required || []).map((k) => [k, k === "query" ? "x" : "00000000-0000-0000-0000-000000000000"])
          )
        : {},
      humanConfirmed: true,
      settingValue,
    });
    if (authProbe.allowed === false && authProbe.reason === "permission_denied") continue;
    if (authProbe.allowed === false && authProbe.reason === "feature_disabled") continue;
    if (authProbe.allowed === false && authProbe.reason === "tool_not_found") continue;
    void permOk;
    // OpenAI exige function.name ~= ^[a-zA-Z0-9_-]+$ (sem pontos).
    const openAiName = tool.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    specs.push({
      type: "function",
      function: {
        name: openAiName,
        description: tool.description,
        parameters: tool.parameters as unknown as Record<string, unknown>,
      },
    });
  }
  return specs;
}

export async function runRdaChatTurn(
  input: RdaChatTurnInput
): Promise<RdaChatTurnResult> {
  ensureProductionRdaToolsRegistered();
  const limit = await assertUnderDailyLimit(input.supabase, input.workshopId);
  if (limit.ok === false) {
    throw new Error(limit.error);
  }

  const provider = resolveRdaLlmProvider({ settingValue: input.settingValue });
  if (provider.id === "noop") {
    throw new RdaProviderDisabledError(
      "RDA Intelligence desligado ou provider noop. Ative a flag e RDA_LLM_PROVIDER=openai."
    );
  }

  const conversationId = await ensureConversation(
    input.supabase,
    input.workshopId,
    input.auth,
    input.conversationId,
    input.contextServiceOrderId
  );

  await appendMessage(input.supabase, input.workshopId, conversationId, {
    role: "user",
    content: input.userMessage,
  });

  const { data: history } = await input.supabase
    .from("rda_messages")
    .select("role, content, tool_call_id, tool_name, metadata")
    .eq("workshop_id", input.workshopId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  // Histórico precisa trazer tool_calls no assistant; senão a OpenAI rejeita
  // role=tool sem mensagem anterior com tool_calls (HTTP 400).
  const messages: RdaLlmMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...(input.contextServiceOrderId
      ? [
          {
            role: "system" as const,
            content: `Contexto: serviceOrderId=${input.contextServiceOrderId}`,
          },
        ]
      : []),
    ...historyRowsToLlmMessages(
      (history || []) as Array<{
        role: string;
        content?: string | null;
        tool_call_id?: string | null;
        tool_name?: string | null;
        metadata?: unknown;
      }>
    ),
  ];

  const openAiTools = toolsForAuth(input.auth, input.settingValue);
  const confirmed = new Set(input.humanConfirmedToolIds || []);
  const toolTrace: RdaChatTurnResult["toolTrace"] = [];
  const proposedActions: unknown[] = [];
  let totalUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let lastModel: string | undefined;
  let assistantText = "";

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const completion = await provider.complete({
      messages: sanitizeMessagesForOpenAi(messages),
      tools: openAiTools.length ? openAiTools : undefined,
      toolChoice: openAiTools.length ? "auto" : "none",
    });
    lastModel = completion.model;
    if (completion.usage) {
      totalUsage.promptTokens += completion.usage.promptTokens;
      totalUsage.completionTokens += completion.usage.completionTokens;
      totalUsage.totalTokens += completion.usage.totalTokens;
    }

    const toolCalls = completion.toolCalls || [];
    if (!toolCalls.length) {
      assistantText = completion.content || "Sem resposta do modelo.";
      messages.push({ role: "assistant", content: assistantText });
      await appendMessage(input.supabase, input.workshopId, conversationId, {
        role: "assistant",
        content: assistantText,
        metadata: { model: completion.model },
      });
      break;
    }

    messages.push({
      role: "assistant",
      content: completion.content || "",
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    });
    await appendMessage(input.supabase, input.workshopId, conversationId, {
      role: "assistant",
      content: completion.content || "",
      metadata: { toolCalls },
    });

    for (const tc of toolCalls) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(tc.arguments || "{}") as Record<string, unknown>;
      } catch {
        parsed = {};
      }
      const authz = authorizeToolInvocation({
        registry: productionRdaToolRegistry,
        auth: input.auth,
        toolId: tc.name,
        params: parsed,
        humanConfirmed: confirmed.has(tc.name),
        settingValue: input.settingValue,
      });

      if (authz.allowed === false) {
        await input.supabase.from("rda_tool_audit").insert({
          workshop_id: input.workshopId,
          conversation_id: conversationId,
          actor_role: input.auth.role,
          actor_user_id: input.auth.userId || null,
          tool_id: tc.name,
          allowed: false,
          reason: authz.reason,
          params: parsed,
          result_summary: authz.message,
        });
        const payload = {
          ok: false,
          error: authz.message,
          reason: authz.reason,
        };
        toolTrace.push({
          toolId: tc.name,
          ok: false,
          summary: authz.message,
        });
        const content = JSON.stringify(payload);
        messages.push({
          role: "tool",
          content,
          tool_call_id: tc.id,
          name: tc.name,
        });
        await appendMessage(input.supabase, input.workshopId, conversationId, {
          role: "tool",
          content,
          tool_call_id: tc.id,
          tool_name: tc.name,
        });
        continue;
      }

      await input.supabase.from("rda_tool_audit").insert({
        workshop_id: input.workshopId,
        conversation_id: conversationId,
        actor_role: input.auth.role,
        actor_user_id: input.auth.userId || null,
        tool_id: tc.name,
        allowed: true,
        reason: null,
        params: parsed,
        result_summary: "authorized",
      });

      const exec = await executeRdaTool(tc.name, authz.params, {
        workshopId: input.workshopId,
        supabase: input.supabase,
      });
      if (
        exec.ok &&
        exec.data &&
        typeof exec.data === "object" &&
        (exec.data as { proposedAction?: string }).proposedAction
      ) {
        proposedActions.push(exec.data);
      }
      const content = JSON.stringify(exec);
      toolTrace.push({
        toolId: tc.name,
        ok: exec.ok,
        summary: exec.ok
          ? `ok (${tc.name})`
          : `erro: ${(exec as { error: string }).error}`,
      });
      messages.push({
        role: "tool",
        content,
        tool_call_id: tc.id,
        name: tc.name,
      });
      await appendMessage(input.supabase, input.workshopId, conversationId, {
        role: "tool",
        content,
        tool_call_id: tc.id,
        tool_name: tc.name,
      });
    }
  }

  if (!assistantText) {
    assistantText =
      "Consultei as ferramentas, mas não obtive uma resposta final do modelo. Tente novamente.";
    await appendMessage(input.supabase, input.workshopId, conversationId, {
      role: "assistant",
      content: assistantText,
    });
  }

  await recordTokenUsage(input.supabase, input.workshopId, totalUsage);
  await input.supabase
    .from("rda_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("workshop_id", input.workshopId);

  return {
    conversationId,
    assistantMessage: assistantText,
    proposedActions,
    usage: totalUsage,
    model: lastModel,
    toolTrace,
  };
}
