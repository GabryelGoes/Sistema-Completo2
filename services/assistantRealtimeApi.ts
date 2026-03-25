import type { TabId } from "../components/TabBar";
import type { AssistantSessionIdentityPayload } from "./assistantApi";

const API_BASE = "/api";

export interface AssistantRealtimeSessionResponse {
  client_secret: string;
  expires_at: number;
  model: string;
}

export async function postAssistantRealtimeSession(
  allowedTabs: TabId[],
  identity?: AssistantSessionIdentityPayload
): Promise<AssistantRealtimeSessionResponse> {
  const response = await fetch(`${API_BASE}/assistant/realtime/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      allowedTabs,
      assistantIsAdmin: identity?.assistantIsAdmin ?? false,
      ...(identity?.assistantUserDisplayName != null && identity.assistantUserDisplayName !== ""
        ? { assistantUserDisplayName: identity.assistantUserDisplayName }
        : {}),
      ...(identity?.relaySessionRole != null && identity.relaySessionRole !== "none"
        ? { relaySessionRole: identity.relaySessionRole }
        : {}),
    }),
  });
  const data = (await response.json().catch(() => ({}))) as AssistantRealtimeSessionResponse & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(data.error || `Erro ${response.status}`);
  }
  if (!data.client_secret || !data.model) {
    throw new Error("Resposta inválida do servidor (Realtime).");
  }
  return data;
}
