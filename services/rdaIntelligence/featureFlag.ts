import {
  RDA_INTELLIGENCE_ENV_KEY,
  RDA_INTELLIGENCE_SETTING_KEY,
} from "./types.js";

export { RDA_INTELLIGENCE_ENV_KEY, RDA_INTELLIGENCE_SETTING_KEY };

/**
 * Interpreta valor textual de setting/env.
 * Somente a string "true" (case-insensitive, trim) habilita.
 * Ausência, null, "", "false", "0", etc. → desligado.
 */
export function parseRdaEnabledFlag(raw: string | null | undefined): boolean {
  if (typeof raw !== "string") return false;
  return raw.trim().toLowerCase() === "true";
}

/**
 * Resolução da feature flag (default seguro: false).
 * Ordem: setting de oficina (se informado) OR env — ambos precisam ser true? Não:
 * qualquer um true habilita, mas default de ambos é false.
 * Preferimos setting explícito quando o resolver o passa; env é override de emergência/dev.
 */
export function resolveRdaIntelligenceEnabled(options?: {
  settingValue?: string | null;
  envValue?: string | null;
}): boolean {
  const envRaw =
    options && "envValue" in (options || {})
      ? options!.envValue
      : typeof process !== "undefined"
        ? process.env[RDA_INTELLIGENCE_ENV_KEY]
        : undefined;
  if (parseRdaEnabledFlag(envRaw)) return true;
  if (parseRdaEnabledFlag(options?.settingValue)) return true;
  return false;
}

/** Snapshot para /api/rda/status — sem efeitos colaterais. */
export function describeRdaFeatureFlag(options?: {
  settingValue?: string | null;
  envValue?: string | null;
}): {
  key: typeof RDA_INTELLIGENCE_SETTING_KEY;
  enabled: boolean;
  defaultEnabled: false;
  source: "env" | "setting" | "default";
} {
  const envRaw =
    options && "envValue" in (options || {})
      ? options!.envValue
      : typeof process !== "undefined"
        ? process.env[RDA_INTELLIGENCE_ENV_KEY]
        : undefined;
  if (parseRdaEnabledFlag(envRaw)) {
    return {
      key: RDA_INTELLIGENCE_SETTING_KEY,
      enabled: true,
      defaultEnabled: false,
      source: "env",
    };
  }
  if (parseRdaEnabledFlag(options?.settingValue)) {
    return {
      key: RDA_INTELLIGENCE_SETTING_KEY,
      enabled: true,
      defaultEnabled: false,
      source: "setting",
    };
  }
  return {
    key: RDA_INTELLIGENCE_SETTING_KEY,
    enabled: false,
    defaultEnabled: false,
    source: "default",
  };
}
