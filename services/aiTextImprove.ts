/**
 * Melhora textos curtos da oficina via OpenAI (diagnóstico de orçamento, etc.).
 * Chave só no servidor: OPENAI_API_KEY.
 */

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export type AiImproveTextKind = "budget_diagnosis" | "general";

const KIND_PROMPTS: Record<AiImproveTextKind, string> = {
  budget_diagnosis: `Você ajuda mecânicos a deixar o diagnóstico de um orçamento mais claro e fácil de entender.
Reescreva o texto em português do Brasil: corrija erros, organize a ideia e deixe fluindo bem.
Use tom natural de oficina — claro e direto, sem linguagem corporativa ou excessivamente formal.
Preserve o sentido técnico e os fatos; não invente sintomas, peças ou conclusões.
Se o texto já estiver bom, só faça ajustes leves.
Responda APENAS com o texto melhorado, sem aspas, títulos ou explicações.`,
  general: `Melhore o texto abaixo em português do Brasil para ficar mais claro e fácil de entender.
Tom natural e direto, sem exagerar no formalismo.
Preserve o sentido; não invente informações.
Responda APENAS com o texto melhorado, sem aspas nem explicações.`,
};

export type AiImproveTextResult = {
  text: string;
  model: string;
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
  const model = resolveModel();

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
        temperature: 0.45,
        max_tokens: 1500,
        messages: [
          { role: "system", content: KIND_PROMPTS[kind] },
          { role: "user", content: original },
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

  return { text: improved, model };
}
