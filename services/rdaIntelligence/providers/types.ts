import type {
  RdaLlmCompleteRequest,
  RdaLlmCompleteResult,
  RdaProviderId,
} from "../types.js";

export class RdaProviderDisabledError extends Error {
  readonly code = "RDA_PROVIDER_DISABLED" as const;
  constructor(message: string) {
    super(message);
    this.name = "RdaProviderDisabledError";
  }
}

export interface RdaLlmProvider {
  readonly id: RdaProviderId;
  /** True se há credencial/config aparente — NÃO implica que chamadas estão liberadas. */
  isConfigured(): boolean;
  /**
   * Completions. Na Fase 0 deve falhar sem rede se RDA_ALLOW_LLM_CALLS !== "true".
   */
  complete(request: RdaLlmCompleteRequest): Promise<RdaLlmCompleteResult>;
}
