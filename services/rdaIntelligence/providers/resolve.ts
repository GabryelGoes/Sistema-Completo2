import { resolveRdaIntelligenceEnabled } from "../featureFlag.js";
import type { RdaLlmProvider } from "./types.js";
import { noopRdaProvider } from "./noop.js";
import { openAiRdaProvider } from "./openai.js";
import type { RdaProviderId } from "../types.js";

/**
 * Escolhe o provider. Com feature off → sempre noop.
 * Com feature on: openai se RDA_LLM_PROVIDER=openai OU (omitido e key presente).
 * Default seguro sem key: noop.
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
  const preferred = String(preferredRaw || "")
    .trim()
    .toLowerCase() as RdaProviderId | string;

  if (preferred === "noop") return noopRdaProvider;
  if (preferred === "openai") return openAiRdaProvider;
  // Preferência omitida: usa OpenAI se a chave existir; senão noop.
  if (openAiRdaProvider.isConfigured()) return openAiRdaProvider;
  return noopRdaProvider;
}
