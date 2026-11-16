/**
 * IP usado só no limite de tentativas de autenticação.
 *
 * Na Vercel (Production e Preview definem VERCEL), a chave é o primeiro
 * endereço de x-vercel-forwarded-for. A plataforma escreve esse cabeçalho com
 * o IP público de quem conectou nela e o mantém mesmo se um proxy reescrever
 * x-forwarded-for. x-forwarded-for e x-real-ip não entram: o cliente pode
 * enviá-los. Endereço ausente ou que não seja IPv4/IPv6 vira o identificador
 * fixo vercel-unknown, sem usar o socket e sem abrir um contador por valor.
 *
 * Fora da Vercel, a chave é o endereço real da conexão.
 */

export const VERCEL_UNKNOWN_CLIENT = "vercel-unknown";

function headerText(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string").join(",");
  return "";
}

function firstHop(value: unknown): string {
  return headerText(value).split(",")[0]?.trim() || "";
}

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

function parseHextets(value: string): number[] | null {
  if (value === "") return [];
  const parts = value.split(":");
  const hextets: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
    hextets.push(Number.parseInt(part, 16));
  }
  return hextets;
}

function compressIpv6(groups: number[]): string {
  let bestStart = -1;
  let bestLength = 0;
  let index = 0;
  while (index < groups.length) {
    if (groups[index] !== 0) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < groups.length && groups[end] === 0) end += 1;
    const length = end - index;
    if (length > bestLength) {
      bestStart = index;
      bestLength = length;
    }
    index = end;
  }
  const hex = groups.map((group) => group.toString(16));
  if (bestLength < 2) return hex.join(":");
  const left = hex.slice(0, bestStart).join(":");
  const right = hex.slice(bestStart + bestLength).join(":");
  if (!left && !right) return "::";
  if (!left) return `::${right}`;
  if (!right) return `${left}::`;
  return `${left}::${right}`;
}

function canonicalIp(value: string): string | null {
  let text = value.trim();
  if (text.startsWith("[") && text.endsWith("]")) text = text.slice(1, -1);
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  text = text.trim().toLowerCase();
  if (!text || text.length > 128 || /[\s/]/.test(text)) return null;

  if (!text.includes(":")) {
    const octets = parseIpv4(text);
    return octets ? octets.join(".") : null;
  }

  let v4: number[] | null = null;
  if (text.includes(".")) {
    const lastColon = text.lastIndexOf(":");
    v4 = parseIpv4(text.slice(lastColon + 1));
    if (!v4 || lastColon < 0) return null;
    text = text.slice(0, lastColon + 1);
    if (!text.endsWith("::") && text.endsWith(":")) text = text.slice(0, -1);
    if (!text) return null;
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;
  const left = parseHextets(halves[0] || "");
  if (!left) return null;
  const compressed = halves.length === 2;
  const right = compressed ? parseHextets(halves[1] || "") : [];
  if (!right) return null;
  const written = left.length + right.length + (v4 ? 2 : 0);
  if ((!compressed && written !== 8) || (compressed && written >= 8)) return null;
  const groups = compressed
    ? [...left, ...Array(8 - written).fill(0), ...right]
    : [...left];
  if (v4) groups.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
  if (groups.length !== 8 || groups.some((group) => group > 0xffff)) return null;

  const mapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;
  if (mapped) {
    const high = groups[6];
    const low = groups[7];
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return compressIpv6(groups);
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
    return canonicalIp(firstHop(req.headers["x-vercel-forwarded-for"])) || VERCEL_UNKNOWN_CLIENT;
  }
  const socketIp = String(req.ip || req.socket?.remoteAddress || "").trim();
  return (socketIp || "unknown").slice(0, 128);
}
