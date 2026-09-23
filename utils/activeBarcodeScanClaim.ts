/**
 * Permite que uma tela (ex.: modal da OS) reivindique leituras da pistola USB
 * antes do handler global (QR de lab, hub de peças, etc.).
 */

export type ActiveBarcodeScanClaimHandler = (
  code: string
) => boolean | void | Promise<boolean | void>;

let activeClaim: ActiveBarcodeScanClaimHandler | null = null;

export function setActiveBarcodeScanClaim(handler: ActiveBarcodeScanClaimHandler | null): void {
  activeClaim = handler;
}

/** Retorna true se algum claim tratou o código (não chamar o fallback). */
export async function tryActiveBarcodeScanClaim(code: string): Promise<boolean> {
  const handler = activeClaim;
  if (!handler) return false;
  try {
    const result = await handler(code);
    return result !== false;
  } catch (err) {
    console.error('[activeBarcodeScanClaim]', err);
    return true;
  }
}
