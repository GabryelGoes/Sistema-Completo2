import { RdaProviderDisabledError, type RdaLlmProvider } from "./types.js";
import type { RdaLlmCompleteRequest, RdaLlmCompleteResult } from "../types.js";

/**
 * Provider padrão da Fase 0: nenhuma chamada externa, nenhuma cobrança.
 */
export class NoopRdaProvider implements RdaLlmProvider {
  readonly id = "noop" as const;

  isConfigured(): boolean {
    return true;
  }

  async complete(_request: RdaLlmCompleteRequest): Promise<RdaLlmCompleteResult> {
    throw new RdaProviderDisabledError(
      "RDA NoopProvider: chamadas de IA desabilitadas (Fase 0)."
    );
  }
}

export const noopRdaProvider = new NoopRdaProvider();
