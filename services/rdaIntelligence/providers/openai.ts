import {
  RDA_ALLOW_LLM_CALLS_ENV_KEY,
  type RdaLlmCompleteRequest,
  type RdaLlmCompleteResult,
  type RdaLlmToolCall,
} from "../types.js";
import { RdaProviderDisabledError, type RdaLlmProvider } from "./types.js";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

function envFlagTrue(key: string): boolean {
  if (typeof process === "undefined") return false;
  return process.env[key]?.trim().toLowerCase() === "true";
}

function defaultModel(): string {
  return (
    (typeof process !== "undefined" && process.env.RDA_OPENAI_MODEL?.trim()) ||
    "gpt-4o-mini"
  );
}

/**
 * Provider OpenAI real (Chat Completions + tool calling).
 * Chave só no servidor (OPENAI_API_KEY). Exige RDA_ALLOW_LLM_CALLS=true.
 */
export class OpenAiRdaProvider implements RdaLlmProvider {
  readonly id = "openai" as const;

  isConfigured(): boolean {
    const key =
      typeof process !== "undefined" ? process.env.OPENAI_API_KEY?.trim() : "";
    return Boolean(key);
  }

  private llmCallsAllowed(): boolean {
    return envFlagTrue(RDA_ALLOW_LLM_CALLS_ENV_KEY);
  }

  async complete(request: RdaLlmCompleteRequest): Promise<RdaLlmCompleteResult> {
    if (!this.isConfigured()) {
      throw new RdaProviderDisabledError(
        "OpenAI API key ausente (OPENAI_API_KEY). Nenhuma chamada foi feita."
      );
    }
    if (!this.llmCallsAllowed()) {
      throw new RdaProviderDisabledError(
        "Chamadas LLM bloqueadas (RDA_ALLOW_LLM_CALLS≠true). Nenhuma chamada externa foi feita."
      );
    }

    const apiKey = process.env.OPENAI_API_KEY!.trim();
    const model = request.model?.trim() || defaultModel();
    const body: Record<string, unknown> = {
      model,
      messages: request.messages.map((m) => {
        const row: Record<string, unknown> = {
          role: m.role,
          content: m.content ?? "",
        };
        if (m.role === "tool") {
          // Chat Completions: tool = { role, tool_call_id, content } (sem name).
          if (m.tool_call_id) row.tool_call_id = m.tool_call_id;
          return row;
        }
        if (m.name) row.name = m.name;
        if (m.tool_calls && m.tool_calls.length > 0) {
          row.tool_calls = m.tool_calls;
        }
        return row;
      }),
      temperature: request.temperature ?? 0.2,
      max_tokens: request.maxTokens ?? 1200,
    };
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools;
      body.tool_choice = request.toolChoice ?? "auto";
    }

    let response: Response;
    try {
      response = await fetch(OPENAI_CHAT_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "falha de rede";
      throw new Error(`OpenAI indisponível: ${message}`);
    }

    const raw = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok) {
      const errObj = raw.error as { message?: string } | undefined;
      throw new Error(
        `OpenAI HTTP ${response.status}: ${errObj?.message || response.statusText}`
      );
    }

    const choices = raw.choices as
      | Array<{ message?: Record<string, unknown> }>
      | undefined;
    const message = choices?.[0]?.message || {};
    const content =
      typeof message.content === "string" ? message.content : "";
    const toolCallsRaw = Array.isArray(message.tool_calls)
      ? (message.tool_calls as Array<Record<string, unknown>>)
      : [];
    const toolCalls: RdaLlmToolCall[] = toolCallsRaw
      .map((tc) => {
        const fn = (tc.function || {}) as Record<string, unknown>;
        return {
          id: String(tc.id || ""),
          name: String(fn.name || ""),
          arguments: String(fn.arguments || "{}"),
        };
      })
      .filter((tc) => tc.id && tc.name);

    const usageRaw = (raw.usage || {}) as Record<string, number>;
    return {
      provider: "openai",
      content,
      toolCalls: toolCalls.length ? toolCalls : undefined,
      model,
      usage: {
        promptTokens: Number(usageRaw.prompt_tokens || 0),
        completionTokens: Number(usageRaw.completion_tokens || 0),
        totalTokens: Number(usageRaw.total_tokens || 0),
      },
      raw,
    };
  }
}

export const openAiRdaProvider = new OpenAiRdaProvider();
