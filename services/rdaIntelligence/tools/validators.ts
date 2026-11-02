import type { RdaJsonSchema, RdaToolValidationResult } from "../types.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validação mínima de parâmetros contra o schema declarado da tool.
 * Fase 0: checa tipo objeto, required e rejeita propriedades extras se additionalProperties === false.
 */
export function validateToolParams(
  schema: RdaJsonSchema,
  raw: unknown
): RdaToolValidationResult {
  if (raw === undefined || raw === null) {
    const required = schema.required ?? [];
    if (required.length === 0) return { ok: true, params: {} };
    return { ok: false, error: `Parâmetros obrigatórios ausentes: ${required.join(", ")}.` };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, error: "Parâmetros devem ser um objeto." };
  }

  const required = schema.required ?? [];
  for (const key of required) {
    if (!(key in raw) || raw[key] === undefined) {
      return { ok: false, error: `Parâmetro obrigatório ausente: ${key}.` };
    }
  }

  if (schema.additionalProperties === false && schema.properties) {
    const allowed = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(raw)) {
      if (!allowed.has(key)) {
        return { ok: false, error: `Parâmetro não permitido: ${key}.` };
      }
    }
  }

  return { ok: true, params: { ...raw } };
}
