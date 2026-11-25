/**
 * Contador de falhas da senha de elevação (Gerência / proteção de estoque / exclusão).
 * Tentativas 1–2: sessão permanece (code invalid_credentials).
 * Tentativa 3+: encerra a sessão (code session_invalid).
 */

export const ELEVATION_PASSWORD_MAX_ATTEMPTS = 3;
export const ELEVATION_PASSWORD_WINDOW_MS = 15 * 60 * 1000;

export function elevationPasswordBucketKey(input: {
  sessionId?: string | null;
  deviceId?: string | null;
  ip: string;
}): string {
  const sid = typeof input.sessionId === "string" ? input.sessionId.trim() : "";
  if (sid) return `elevation:session:${sid}`;
  const did = typeof input.deviceId === "string" ? input.deviceId.trim() : "";
  if (did) return `elevation:device:${did}`;
  return `elevation:ip:${String(input.ip || "unknown").trim() || "unknown"}`;
}

export type ElevationPasswordFailureBody = {
  error: string;
  code: "invalid_credentials" | "session_invalid";
  attempts: number;
  attemptsRemaining?: number;
};

export function buildElevationPasswordFailure(input: {
  attempts: number;
  baseError: string;
}): { lockSession: boolean; body: ElevationPasswordFailureBody } {
  const attempts = Math.max(1, Math.floor(Number(input.attempts) || 1));
  const lockSession = attempts >= ELEVATION_PASSWORD_MAX_ATTEMPTS;
  if (lockSession) {
    return {
      lockSession: true,
      body: {
        error: "Senha incorreta. Sessão encerrada após 3 tentativas.",
        code: "session_invalid",
        attempts,
      },
    };
  }
  const base = String(input.baseError || "Senha incorreta.").trim().replace(/\s+$/, "");
  const withPeriod = /[.!?]$/.test(base) ? base : `${base}.`;
  return {
    lockSession: false,
    body: {
      error: `${withPeriod} Tentativa ${attempts} de ${ELEVATION_PASSWORD_MAX_ATTEMPTS}.`,
      code: "invalid_credentials",
      attempts,
      attemptsRemaining: ELEVATION_PASSWORD_MAX_ATTEMPTS - attempts,
    },
  };
}
