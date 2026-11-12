/**
 * Senha nova de login (funcionário ou Gerência).
 * Senha já gravada continua válida mesmo se for mais curta.
 * PIN, exclusão de veículo e estoque não usam esta regra.
 */

export const LOGIN_PASSWORD_MIN_LENGTH = 6;

export type NewLoginPassword =
  | { status: "absent" }
  | { status: "invalid"; message: string }
  | { status: "ready"; value: string };

export function classifyNewLoginPassword(value: unknown): NewLoginPassword {
  if (typeof value !== "string") return { status: "absent" };
  const trimmed = value.trim();
  if (!trimmed) return { status: "absent" };
  if (trimmed.length < LOGIN_PASSWORD_MIN_LENGTH) {
    return {
      status: "invalid",
      message: `A nova senha deve ter no mínimo ${LOGIN_PASSWORD_MIN_LENGTH} caracteres.`,
    };
  }
  return { status: "ready", value: trimmed };
}
