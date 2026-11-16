/**
 * Chaves HMAC da sessão.
 * Produção nunca usa o segredo fixo de desenvolvimento.
 * Sem SESSION_SECRET, a chave já em uso continua valendo para não derrubar sessões.
 * SESSION_SECRET_PREVIOUS só verifica tokens antigos durante uma rotação.
 */

const DEV_ONLY_SESSION_SECRET = "dev-only-insecure-secret";

export type SessionKeyRing = {
  current: string;
  verify: readonly string[];
  dedicated: boolean;
};

let warnedMissingDedicated = false;
let warnedMissingAll = false;

function trim(value: string | undefined): string {
  return String(value || "").trim();
}

export function resolveSessionKeyRing(env: NodeJS.ProcessEnv = process.env): SessionKeyRing | null {
  const dedicated = trim(env.SESSION_SECRET);
  const previous = trim(env.SESSION_SECRET_PREVIOUS);
  const serviceRole = trim(env.SUPABASE_SERVICE_ROLE_KEY);
  const production = env.NODE_ENV === "production";

  let current = "";
  if (dedicated) {
    current = dedicated;
  } else if (serviceRole) {
    current = serviceRole;
    if (production && !warnedMissingDedicated) {
      warnedMissingDedicated = true;
      console.warn(
        "[auth] SESSION_SECRET não está definido. Os tokens atuais continuam válidos. Defina SESSION_SECRET com um valor novo só depois de colocar a chave atual em SESSION_SECRET_PREVIOUS."
      );
    }
  } else if (!production) {
    current = DEV_ONLY_SESSION_SECRET;
  } else {
    if (!warnedMissingAll) {
      warnedMissingAll = true;
      console.error(
        "[auth] Produção sem SESSION_SECRET e sem chave de serviço. Login recusado. O segredo fixo de desenvolvimento não é usado."
      );
    }
    return null;
  }

  const verify = [current];
  if (dedicated && previous && previous !== current) verify.push(previous);
  return { current, verify, dedicated: Boolean(dedicated) };
}
