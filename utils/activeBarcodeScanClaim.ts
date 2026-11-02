/**
 * Permite que uma tela (ex.: modal da OS / Módulos ABS) reivindique leituras da
 * pistola USB antes do handler global (QR de lab, hub de peças, etc.).
 *
 * O cleanup retornado só limpa o claim se ainda for o “dono” atual — evita a
 * corrida em que o efeito do Estoque zera o claim logo depois da página ABS
 * registrar o dela (filho monta → pai faz cleanup do claim antigo).
 */

export type ActiveBarcodeScanClaimHandler = (
  code: string
) => boolean | void | Promise<boolean | void>;

let activeClaim: ActiveBarcodeScanClaimHandler | null = null;
let activeEpoch = 0;
let claimEpoch = 0;

/**
 * Define o handler ativo. Devolve um disposer seguro para usar no `useEffect`.
 */
export function setActiveBarcodeScanClaim(
  handler: ActiveBarcodeScanClaimHandler | null
): () => void {
  const epoch = ++claimEpoch;
  activeClaim = handler;
  activeEpoch = epoch;
  return () => {
    if (activeEpoch === epoch) {
      activeClaim = null;
    }
  };
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
