/**
 * Melhora textos curtos da oficina via OpenAI (diagnóstico de orçamento, etc.).
 * Chave só no servidor: OPENAI_API_KEY.
 */

import {
  aiImproveMaxTokens,
  aiImproveTemperature,
  buildAiImproveSystemPrompt,
  normalizeAiImproveTextLevel,
  type AiImproveTextKind,
  type AiImproveTextLevel,
} from "../utils/aiImproveTextLevel.js";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export type { AiImproveTextKind, AiImproveTextLevel };

export type AiImproveTextResult = {
  text: string;
  model: string;
  level: AiImproveTextLevel;
};

function resolveModel(): string {
  return (
    process.env.AI_IMPROVE_TEXT_MODEL?.trim() ||
    process.env.RDA_OPENAI_MODEL?.trim() ||
    "gpt-4o-mini"
  );
}

export function isAiImproveTextConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export async function improveTextWithOpenAi(params: {
  text: string;
  kind?: AiImproveTextKind;
  level?: AiImproveTextLevel | string | null;
}): Promise<AiImproveTextResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY não configurada no servidor.");
  }

  const original = String(params.text || "").trim();
  if (!original) {
    throw new Error("Informe um texto para melhorar.");
  }
  if (original.length > 6000) {
    throw new Error("Texto muito longo para melhorar (máx. 6000 caracteres).");
  }

  const kind: AiImproveTextKind =
    params.kind === "budget_diagnosis" ? "budget_diagnosis" : "general";
  const level = normalizeAiImproveTextLevel(params.level);
  const model = resolveModel();
  const system = buildAiImproveSystemPrompt(kind, level);

  let response: Response;
  try {
    response = await fetch(OPENAI_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: aiImproveTemperature(level),
        max_tokens: aiImproveMaxTokens(level),
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content:
              kind === "budget_diagnosis"
                ? `Melhore este diagnóstico de orçamento (nível ${level}):\n\n${original}`
                : `Melhore este texto (nível ${level}):\n\n${original}`,
          },
        ],
      }),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "falha de rede";
    throw new Error(`OpenAI indisponível: ${message}`);
  }

  const raw = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const errObj = raw.error as { message?: string } | undefined;
    throw new Error(
      `OpenAI HTTP ${response.status}: ${errObj?.message || response.statusText}`
    );
  }

  const choices = raw.choices as Array<{ message?: { content?: unknown } }> | undefined;
  const content = choices?.[0]?.message?.content;
  const improved = typeof content === "string" ? content.trim() : "";
  if (!improved) {
    throw new Error("A IA não retornou texto. Tente de novo.");
  }

  return { text: improved, model, level };
}
