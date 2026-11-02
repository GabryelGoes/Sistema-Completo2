import { resolveRdaIntelligenceEnabled } from "../featureFlag.js";
import type { RdaLlmProvider } from "./types.js";
import { noopRdaProvider } from "./noop.js";
import { openAiRdaProvider } from "./openai.js";
import type { RdaProviderId } from "../types.js";

/**
 * Escolhe o provider. Com feature off → sempre noop.
 * Com feature on e RDA_LLM_PROVIDER=openai + key → openai (ainda sem HTTP na Fase 0).
 * Default seguro: noop.
 */
export function resolveRdaLlmProvider(options?: {
  featureEnabled?: boolean;
  settingValue?: string | null;
  envValue?: string | null;
  preferred?: RdaProviderId | string | null;
}): RdaLlmProvider {
  const enabled =
    typeof options?.featureEnabled === "boolean"
      ? options.featureEnabled
      : resolveRdaIntelligenceEnabled({
          settingValue: options?.settingValue,
          envValue: options?.envValue,
        });

  if (!enabled) return noopRdaProvider;

  const preferredRaw =
    options?.preferred ??
    (typeof process !== "undefined" ? process.env.RDA_LLM_PROVIDER : undefined);
  const preferred = String(preferredRaw || "noop")
    .trim()
    .toLowerCase() as RdaProviderId | string;

  if (preferred === "openai") {
    return openAiRdaProvider;
  }
  return noopRdaProvider;
}
