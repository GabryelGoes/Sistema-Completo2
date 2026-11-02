import { RDA_ALLOW_LLM_CALLS_ENV_KEY } from "../types.js";
import { RdaProviderDisabledError, type RdaLlmProvider } from "./types.js";
import type { RdaLlmCompleteRequest, RdaLlmCompleteResult } from "../types.js";

/**
 * Adaptador OpenAI — apenas interface nesta fase.
 * Não realiza fetch/HTTP mesmo se OPENAI_API_KEY estiver presente,
 * salvo RDA_ALLOW_LLM_CALLS=true (ainda assim Fase 0 não implementa o HTTP).
 */
export class OpenAiRdaProvider implements RdaLlmProvider {
  readonly id = "openai" as const;

  isConfigured(): boolean {
    const key =
      typeof process !== "undefined" ? process.env.OPENAI_API_KEY?.trim() : "";
    return Boolean(key);
  }

  private llmCallsAllowed(): boolean {
    if (typeof process === "undefined") return false;
    return process.env[RDA_ALLOW_LLM_CALLS_ENV_KEY]?.trim().toLowerCase() === "true";
  }

  async complete(_request: RdaLlmCompleteRequest): Promise<RdaLlmCompleteResult> {
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
    // Fase 0: mesmo com allow, não há implementação de rede — evita consumo acidental.
    throw new RdaProviderDisabledError(
      "OpenAI provider: transporte HTTP ainda não implementado (Fase 0)."
    );
  }
}

export const openAiRdaProvider = new OpenAiRdaProvider();
