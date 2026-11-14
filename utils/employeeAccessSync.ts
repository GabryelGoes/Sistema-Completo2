/**
 * SEC-03.3 — sincronização concorrente e confiança do snapshot de permissões.
 * Gerações e sequência impedem resposta antiga de sobrescrever a mais recente.
 */

import type { EmployeePermissions, ServerAccessSnapshot, AccessTrustState } from "./employeeAccess";
import {
  applyServerAccessSnapshot,
  initialAccessTrustState,
  refreshAccessTrust,
} from "./employeeAccess";

export type MyAccessHttpError = {
  kind: "http";
  status: number;
  message: string;
};

export type MyAccessNetworkError = {
  kind: "network";
  message: string;
};

export type MyAccessFetchError = MyAccessHttpError | MyAccessNetworkError;

export function isMyAccessFetchError(value: unknown): value is MyAccessFetchError {
  return (
    !!value &&
    typeof value === "object" &&
    "kind" in value &&
    ((value as MyAccessFetchError).kind === "http" || (value as MyAccessFetchError).kind === "network")
  );
}

export type AccessSyncOk = {
  outcome: "ok";
  snapshot: ServerAccessSnapshot;
  sequence: number;
  generation: number;
};

export type AccessSyncDenied = {
  outcome: "denied";
  status: 401 | 403 | 404;
  sequence: number;
  generation: number;
};

export type AccessSyncNetworkFail = {
  outcome: "network_error";
  sequence: number;
  generation: number;
};

export type AccessSyncSuperseded = {
  outcome: "superseded";
  sequence: number;
  generation: number;
};

export type AccessSyncResult = AccessSyncOk | AccessSyncDenied | AccessSyncNetworkFail | AccessSyncSuperseded;

export type AccessSyncController = {
  /** Invalida resultados em voo (logout / troca de sessão). */
  bumpGeneration: () => number;
  getGeneration: () => number;
  /**
   * Dispara sync. Reuses in-flight da mesma geração (evita rajadas no foco).
   * Resposta fora de ordem / geração antiga → `superseded`.
   */
  run: (fetchSnapshot: () => Promise<ServerAccessSnapshot>) => Promise<AccessSyncResult>;
};

export function createAccessSyncController(): AccessSyncController {
  let generation = 0;
  let sequence = 0;
  /** Maior sequência cujo resultado pode ser aplicado (evita resposta antiga). */
  let lastAcceptedSeq = 0;
  let inFlight: Promise<AccessSyncResult> | null = null;
  let inFlightGeneration = -1;

  return {
    bumpGeneration() {
      generation += 1;
      inFlight = null;
      inFlightGeneration = -1;
      return generation;
    },
    getGeneration() {
      return generation;
    },
    async run(fetchSnapshot) {
      const gen = generation;
      if (inFlight && inFlightGeneration === gen) {
        return inFlight;
      }
      const mySeq = ++sequence;
      const pending = (async (): Promise<AccessSyncResult> => {
        try {
          const snapshot = await fetchSnapshot();
          if (gen !== generation) {
            return { outcome: "superseded", sequence: mySeq, generation: gen };
          }
          if (mySeq < lastAcceptedSeq) {
            return { outcome: "superseded", sequence: mySeq, generation: gen };
          }
          lastAcceptedSeq = mySeq;
          return { outcome: "ok", snapshot, sequence: mySeq, generation: gen };
        } catch (err) {
          if (gen !== generation || mySeq < lastAcceptedSeq) {
            return { outcome: "superseded", sequence: mySeq, generation: gen };
          }
          lastAcceptedSeq = mySeq;
          if (isMyAccessFetchError(err) && err.kind === "http") {
            if (err.status === 401 || err.status === 403 || err.status === 404) {
              return {
                outcome: "denied",
                status: err.status as 401 | 403 | 404,
                sequence: mySeq,
                generation: gen,
              };
            }
          }
          return { outcome: "network_error", sequence: mySeq, generation: gen };
        } finally {
          if (inFlightGeneration === gen) {
            inFlight = null;
            inFlightGeneration = -1;
          }
        }
      })();
      inFlight = pending;
      inFlightGeneration = gen;
      return pending;
    },
  };
}

export type ApplySyncToTrustInput = {
  trust: AccessTrustState;
  result: AccessSyncResult;
  nowMs?: number;
};

/**
 * Atualiza estado de confiança a partir do resultado do sync.
 * Não encerra sessão; o chamador decide logout só em 401 se quiser.
 */
export function applySyncResultToTrust(input: ApplySyncToTrustInput): AccessTrustState {
  const now = input.nowMs ?? Date.now();
  const { result } = input;
  if (result.outcome === "superseded") {
    return refreshAccessTrust(input.trust, now);
  }
  if (result.outcome === "ok") {
    return { status: "verified", verifiedAt: now };
  }
  if (result.outcome === "denied") {
    const deniedReason =
      result.status === 401 ? "unauthorized" : result.status === 403 ? "forbidden" : "not_found";
    return { status: "denied", verifiedAt: input.trust.verifiedAt, deniedReason };
  }
  // network_error
  if (input.trust.status === "verified" || input.trust.status === "grace") {
    const verifiedAt = input.trust.verifiedAt ?? now;
    const next: AccessTrustState = { status: "grace", verifiedAt };
    return refreshAccessTrust(next, now);
  }
  // unverified / expired / denied + network → permanece sem liberar sensíveis
  if (input.trust.status === "unverified") return input.trust;
  if (input.trust.status === "expired") return input.trust;
  return refreshAccessTrust(input.trust, now);
}

export type SessionAccessApply = {
  permissions: EmployeePermissions;
  isTechnician: boolean;
  trust: AccessTrustState;
  changed: boolean;
  /** 401: sessão inválida — chamador pode limpar auth. */
  sessionInvalid: boolean;
};

export function applyAccessSyncToSession(
  session: {
    role: "user";
    permissions?: EmployeePermissions;
    isTechnician?: boolean;
  },
  trust: AccessTrustState,
  result: AccessSyncResult,
  nowMs = Date.now()
): SessionAccessApply {
  const nextTrust = applySyncResultToTrust({ trust, result, nowMs });

  if (result.outcome === "ok") {
    const { next, changed } = applyServerAccessSnapshot(session, result.snapshot);
    return {
      permissions: next.permissions,
      isTechnician: next.isTechnician,
      trust: nextTrust,
      changed: changed || trust.status !== "verified",
      sessionInvalid: false,
    };
  }

  if (result.outcome === "denied") {
    // Não mantém acessos elevados; zera grants (home operacional mínimo fica no strip).
    const stripped = { access_home: true as const };
    return {
      permissions: stripped,
      isTechnician: false,
      trust: nextTrust,
      changed: true,
      sessionInvalid: result.status === 401,
    };
  }

  return {
    permissions: session.permissions || {},
    isTechnician: !!session.isTechnician,
    trust: nextTrust,
    changed: false,
    sessionInvalid: false,
  };
}

export { initialAccessTrustState };
