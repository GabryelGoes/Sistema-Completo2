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
  /** Nome de exibição ou usuário (técnico); ignorado no servidor quando admin. */
  assistantUserDisplayName?: string;
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
      ...(identity?.assistantUserDisplayName != null && identity.assistantUserDisplayName !== ""
        ? { assistantUserDisplayName: identity.assistantUserDisplayName }
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
