import type { TabId } from "../components/TabBar";

const API_BASE = "/api";

/** Mensagens no formato compatível com a API OpenAI (histórico completo). */
export type AssistantApiMessage =
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: AssistantToolCall[];
    }
  | { role: "tool"; tool_call_id: string; content: string };

export interface AssistantToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface AssistantChatResponse {
  message: {
    role: "assistant";
    content: string | null;
    tool_calls?: AssistantToolCall[];
  };
  finish_reason: string;
}

export interface AssistantSessionIdentityPayload {
  /** true = login admin: a assistente não deve usar o nome do usuário. */
  assistantIsAdmin: boolean;
  /** ID estável do usuário (preferencialmente workshop_system_users.id). */
  assistantUserId?: string;
  /** Nome de exibição ou usuário (técnico); ignorado no servidor quando admin. */
  assistantUserDisplayName?: string;
  /** Ferramentas de recado gerência↔técnicos na Zaya. */
  relaySessionRole?: "management" | "technician" | "none";
}

export async function postAssistantChat(
  messages: AssistantApiMessage[],
  allowedTabs: TabId[],
  identity?: AssistantSessionIdentityPayload
): Promise<AssistantChatResponse> {
  const response = await fetch(`${API_BASE}/assistant/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages,
      allowedTabs,
      assistantIsAdmin: identity?.assistantIsAdmin ?? false,
      ...(identity?.assistantUserId != null && identity.assistantUserId !== ""
        ? { assistantUserId: identity.assistantUserId }
        : {}),
      ...(identity?.assistantUserDisplayName != null && identity.assistantUserDisplayName !== ""
        ? { assistantUserDisplayName: identity.assistantUserDisplayName }
        : {}),
      ...(identity?.relaySessionRole != null && identity.relaySessionRole !== "none"
        ? { relaySessionRole: identity.relaySessionRole }
        : {}),
    }),
  });
  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: AssistantChatResponse["message"];
    finish_reason?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || `Erro ${response.status}`);
  }
  if (!data.message) {
    throw new Error("Resposta inválida do servidor.");
  }
  return {
    message: data.message,
    finish_reason: data.finish_reason ?? "stop",
  };
}

export interface AssistantMemorySavePayload {
  assistantIsAdmin: boolean;
  assistantUserId?: string;
  assistantUserDisplayName?: string;
  memoryText: string;
  category?: "preference" | "routine" | "context";
}

export async function saveAssistantMemory(payload: AssistantMemorySavePayload): Promise<{
  ok: boolean;
  message?: string;
}> {
  const response = await fetch(`${API_BASE}/assistant/memory/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return { ok: data.ok === true, message: data.message };
}

export interface AssistantLearnedCommandPayload {
  assistantIsAdmin: boolean;
  assistantUserId?: string;
  assistantUserDisplayName?: string;
  triggerPhrase: string;
  behaviorText: string;
  behaviorKind?: "action_text" | "action_only" | "text_only";
}

export async function saveAssistantLearnedCommand(payload: AssistantLearnedCommandPayload): Promise<{
  ok: boolean;
  message?: string;
}> {
  const response = await fetch(`${API_BASE}/assistant/commands/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return { ok: data.ok === true, message: data.message };
}

export interface AssistantIdentityLookupPayload {
  assistantIsAdmin: boolean;
  assistantUserId?: string;
  assistantUserDisplayName?: string;
}

export async function listAssistantMemories(
  payload: AssistantIdentityLookupPayload
): Promise<{ ok: boolean; memories?: Array<{ memory_text: string; category: string }>; message?: string }> {
  const response = await fetch(`${API_BASE}/assistant/memory/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    message?: string;
    memories?: Array<{ memory_text: string; category: string }>;
  };
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return { ok: data.ok === true, message: data.message, memories: data.memories };
}

export async function listAssistantLearnedCommands(
  payload: AssistantIdentityLookupPayload
): Promise<{
  ok: boolean;
  commands?: Array<{ trigger_phrase: string; behavior_text: string; behavior_kind: string }>;
  message?: string;
}> {
  const response = await fetch(`${API_BASE}/assistant/commands/list`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
    message?: string;
    commands?: Array<{ trigger_phrase: string; behavior_text: string; behavior_kind: string }>;
  };
  if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
  return { ok: data.ok === true, message: data.message, commands: data.commands };
}
