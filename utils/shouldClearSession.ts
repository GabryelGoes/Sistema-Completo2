/**
 * 401 de senha atual incorreta não encerra a sessão.
 * Sessão inválida, sessão revogada e aparelho bloqueado encerram.
 */
export function shouldClearSession(
  status: number,
  body: { code?: unknown; error?: unknown } | null
): boolean {
  if (status === 401) return body?.code !== "invalid_credentials";
  if (status === 403) return typeof body?.error === "string" && /bloqueado/i.test(body.error);
  return false;
}
