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

function resolveEnvRaw(options?: {
  envValue?: string | null;
}): string | null | undefined {
  if (options && "envValue" in (options || {})) {
    return options!.envValue;
  }
  return typeof process !== "undefined"
    ? process.env[RDA_INTELLIGENCE_ENV_KEY]
    : undefined;
}

/**
 * Setting de oficina **explícito** (qualquer string não vazia) manda.
 * Assim “Desligar” em Ajustes sempre corta tokens, mesmo com
 * RDA_INTELLIGENCE_ENABLED=true no .env (env só vale quando não há setting).
 */
export function resolveRdaIntelligenceEnabled(options?: {
  settingValue?: string | null;
  envValue?: string | null;
}): boolean {
  const setting = options?.settingValue;
  if (typeof setting === "string" && setting.trim() !== "") {
    return parseRdaEnabledFlag(setting);
  }
  return parseRdaEnabledFlag(resolveEnvRaw(options));
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
  /** true se workshop_settings tem valor gravado (true/false). */
  settingExplicit: boolean;
  /** true se o env sozinho ligaria o RDA (ignorado quando há setting). */
  envWouldEnable: boolean;
} {
  const envRaw = resolveEnvRaw(options);
  const envWouldEnable = parseRdaEnabledFlag(envRaw);
  const setting = options?.settingValue;

  if (typeof setting === "string" && setting.trim() !== "") {
    return {
      key: RDA_INTELLIGENCE_SETTING_KEY,
      enabled: parseRdaEnabledFlag(setting),
      defaultEnabled: false,
      source: "setting",
      settingExplicit: true,
      envWouldEnable,
    };
  }
  if (envWouldEnable) {
    return {
      key: RDA_INTELLIGENCE_SETTING_KEY,
      enabled: true,
      defaultEnabled: false,
      source: "env",
      settingExplicit: false,
      envWouldEnable: true,
    };
  }
  return {
    key: RDA_INTELLIGENCE_SETTING_KEY,
    enabled: false,
    defaultEnabled: false,
    source: "default",
    settingExplicit: false,
    envWouldEnable: false,
  };
}
