import type { RdaLlmMessage } from "../types.js";

type HistoryRow = {
  role: string;
  content?: string | null;
  tool_call_id?: string | null;
  tool_name?: string | null;
  metadata?: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Reconstrói tool_calls do metadata gravado no banco
 * (`metadata.toolCalls` = [{ id, name, arguments }]).
 */
export function toolCallsFromMetadata(
  metadata: unknown
): RdaLlmMessage["tool_calls"] | undefined {
  const meta = asRecord(metadata);
  const raw = meta?.toolCalls;
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const calls = raw
    .map((item) => {
      const row = asRecord(item);
      if (!row) return null;
      const id = String(row.id || "");
      const name = String(row.name || "");
      const args =
        typeof row.arguments === "string"
          ? row.arguments
          : JSON.stringify(row.arguments ?? {});
      if (!id || !name) return null;
      return {
        id,
        type: "function" as const,
        function: { name, arguments: args || "{}" },
      };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));
  return calls.length ? calls : undefined;
}

/** Converte linhas de `rda_messages` para o formato Chat Completions. */
export function historyRowsToLlmMessages(rows: HistoryRow[]): RdaLlmMessage[] {
  const out: RdaLlmMessage[] = [];
  for (const row of rows) {
    const role = String(row.role || "");
    if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
      continue;
    }
    if (role === "tool") {
      const toolCallId = row.tool_call_id ? String(row.tool_call_id) : "";
      if (!toolCallId) continue;
      out.push({
        role: "tool",
        content: String(row.content || ""),
        tool_call_id: toolCallId,
        name: row.tool_name ? String(row.tool_name) : undefined,
      });
      continue;
    }
    if (role === "assistant") {
      const tool_calls = toolCallsFromMetadata(row.metadata);
      out.push({
        role: "assistant",
        content: String(row.content || ""),
        ...(tool_calls ? { tool_calls } : {}),
      });
      continue;
    }
    out.push({
      role,
      content: String(row.content || ""),
    });
  }
  return out;
}

/**
 * Garante a ordem exigida pela OpenAI:
 * `tool` só após um `assistant` com `tool_calls` que contenha o mesmo id.
 * Reconstrói tool_calls faltantes a partir das tool messages seguintes.
 * Descarta tools órfãs.
 */
export function sanitizeMessagesForOpenAi(
  messages: RdaLlmMessage[]
): RdaLlmMessage[] {
  const out: RdaLlmMessage[] = [];
  let i = 0;
  while (i < messages.length) {
    const msg = messages[i];
    if (msg.role === "tool") {
      // Órfã no início / após user|system — não enviar.
      i += 1;
      continue;
    }

    if (msg.role !== "assistant") {
      out.push({
        role: msg.role,
        content: msg.content || "",
        ...(msg.name ? { name: msg.name } : {}),
      });
      i += 1;
      continue;
    }

    const followingTools: RdaLlmMessage[] = [];
    let j = i + 1;
    while (j < messages.length && messages[j].role === "tool") {
      followingTools.push(messages[j]);
      j += 1;
    }

    if (followingTools.length === 0) {
      // Assistente final (sem tools) — não reenviar tool_calls vazios/stale.
      out.push({
        role: "assistant",
        content: msg.content || "",
      });
      i += 1;
      continue;
    }

    const toolCalls = [...(msg.tool_calls || [])];
    const knownIds = new Set(toolCalls.map((c) => c.id));
    for (const toolMsg of followingTools) {
      const id = toolMsg.tool_call_id;
      if (!id || knownIds.has(id)) continue;
      toolCalls.push({
        id,
        type: "function",
        function: {
          name: toolMsg.name || "unknown_tool",
          arguments: "{}",
        },
      });
      knownIds.add(id);
    }

    const validTools = followingTools.filter(
      (t) => t.tool_call_id && knownIds.has(t.tool_call_id)
    );

    if (toolCalls.length === 0 || validTools.length === 0) {
      out.push({
        role: "assistant",
        content: msg.content || "",
      });
      i = j;
      continue;
    }

    out.push({
      role: "assistant",
      content: msg.content || "",
      tool_calls: toolCalls,
    });
    for (const toolMsg of validTools) {
      out.push({
        role: "tool",
        content: toolMsg.content || "",
        tool_call_id: toolMsg.tool_call_id!,
      });
    }
    i = j;
  }
  return out;
}
