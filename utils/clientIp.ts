/**
 * IP usado no limite de tentativas.
 * Na Vercel, a chave é x-vercel-forwarded-for, cabeçalho escrito pela plataforma.
 * x-forwarded-for e x-real-ip não entram: o cliente pode enviá-los, e um proxy
 * na frente da Vercel pode reescrever o primeiro. Fora da Vercel, ou sem o
 * cabeçalho da plataforma, a chave é o endereço do socket.
 */

function firstAddress(value: unknown): string {
  const raw = typeof value === "string" ? value : Array.isArray(value) ? value.join(",") : "";
  const hop = raw.split(",")[0]?.trim() || "";
  return hop.slice(0, 128);
}

export function clientIp(
  req: {
    ip?: string;
    socket?: { remoteAddress?: string | null };
    headers: { [key: string]: unknown };
  },
  env: NodeJS.ProcessEnv = process.env
): string {
  if (env.VERCEL) {
    const platform = firstAddress(req.headers["x-vercel-forwarded-for"]);
    if (platform) return platform;
  }
  const socketIp = String(req.ip || req.socket?.remoteAddress || "").trim();
  return (socketIp || "unknown").slice(0, 128);
}
