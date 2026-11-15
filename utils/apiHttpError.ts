/**
 * Erro HTTP tipado para o frontend distinguir 401 / 403 / rede / 5xx
 * sem tratar 403 como logout e sem misturar com falha de rede.
 */

export type ApiHttpErrorKind = "unauthorized" | "forbidden" | "server" | "network" | "other";

export class ApiHttpError extends Error {
  readonly status: number;
  readonly kind: ApiHttpErrorKind;
  readonly bodyMessage?: string;

  constructor(status: number, message: string, bodyMessage?: string) {
    super(message);
    this.name = "ApiHttpError";
    this.status = status;
    this.bodyMessage = bodyMessage;
    this.kind =
      status === 401
        ? "unauthorized"
        : status === 403
          ? "forbidden"
          : status >= 500
            ? "server"
            : "other";
  }
}

export function isApiHttpError(err: unknown): err is ApiHttpError {
  return err instanceof ApiHttpError;
}

export function isNetworkFetchError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return m.includes("failed to fetch") || m.includes("networkerror") || m.includes("load failed");
}

/** Mensagem amigável padronizada (SEC-04.4). */
export function formatApiFailureMessage(err: unknown, fallback: string): string {
  if (isApiHttpError(err)) {
    if (err.kind === "unauthorized") {
      return err.bodyMessage || "Sessão inválida ou expirada. Faça login novamente.";
    }
    if (err.kind === "forbidden") {
      return err.bodyMessage || "Você não tem permissão para esta operação.";
    }
    if (err.kind === "server") {
      return err.bodyMessage || "Falha no servidor. Tente novamente em instantes.";
    }
    return err.bodyMessage || err.message || fallback;
  }
  if (isNetworkFetchError(err)) {
    return "Falha de conexão. Verifique a rede e tente novamente.";
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

export async function throwIfNotOk(
  response: Response,
  fallback: string
): Promise<void> {
  if (response.ok) return;
  const err = await response.json().catch(() => ({} as { error?: string }));
  const bodyMessage = typeof err?.error === "string" ? err.error : undefined;
  throw new ApiHttpError(
    response.status,
    bodyMessage || `${fallback} (${response.status})`,
    bodyMessage
  );
}
