/**
 * SEC-05.1.1-B: IP confiável do limite de autenticação.
 * npm run test:sec0511b-client-ip
 */
import { VERCEL_UNKNOWN_CLIENT, clientIp } from "../utils/clientIp.ts";

let passed = 0;
let failed = 0;

function record(name: string, ok: boolean, detail: string) {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"} ${name} — ${detail}`);
}

function at(headers: Record<string, unknown>, env: NodeJS.ProcessEnv, socket = "127.0.0.1") {
  return clientIp({ ip: socket, socket: { remoteAddress: socket }, headers }, env);
}

function main() {
  const vercel = { VERCEL: "1", VERCEL_ENV: "production" };
  const preview = { VERCEL: "1", VERCEL_ENV: "preview" };
  const local = { VERCEL_ENV: "development" };

  record(
    "IPv4 válido é a chave na Vercel",
    at({ "x-vercel-forwarded-for": " 203.0.113.10 " }, vercel) === "203.0.113.10" &&
      at({ "x-vercel-forwarded-for": "203.0.113.10" }, preview) === "203.0.113.10",
    "v4"
  );
  record(
    "IPv6 válido é normalizado",
    at({ "x-vercel-forwarded-for": "2001:0DB8:0000:0000:0000:0000:0000:0001" }, vercel) === "2001:db8::1" &&
      at({ "x-vercel-forwarded-for": "[2001:db8::1]" }, vercel) === "2001:db8::1" &&
      at({ "x-vercel-forwarded-for": "2001:db8:0:0:1:0:0:1" }, vercel) === "2001:db8::1:0:0:1" &&
      at({ "x-vercel-forwarded-for": "::ffff:203.0.113.10" }, vercel) === "203.0.113.10",
    "v6"
  );
  record(
    "cabeçalho ausente, vazio ou malformado usa o identificador fixo",
    at({}, vercel) === VERCEL_UNKNOWN_CLIENT &&
      at({ "x-vercel-forwarded-for": "" }, vercel) === VERCEL_UNKNOWN_CLIENT &&
      at({ "x-vercel-forwarded-for": "   " }, vercel) === VERCEL_UNKNOWN_CLIENT &&
      at({ "x-vercel-forwarded-for": "nao-e-ip" }, vercel) === VERCEL_UNKNOWN_CLIENT &&
      at({ "x-vercel-forwarded-for": "08.8.8.8" }, vercel) === VERCEL_UNKNOWN_CLIENT &&
      at({ "x-vercel-forwarded-for": "999.1.1.1" }, vercel) === VERCEL_UNKNOWN_CLIENT &&
      at({ "x-vercel-forwarded-for": "203.0.113.10:443" }, vercel) === VERCEL_UNKNOWN_CLIENT &&
      at({ "x-vercel-forwarded-for": "lixo, 203.0.113.10" }, vercel) === VERCEL_UNKNOWN_CLIENT &&
      at({ ip: "10.9.8.7" }, vercel, "10.9.8.7") === VERCEL_UNKNOWN_CLIENT,
    VERCEL_UNKNOWN_CLIENT
  );
  record(
    "x-forwarded-for e x-real-ip forjados não criam contador",
    at(
      {
        "x-forwarded-for": "198.51.100.50, 203.0.113.20",
        "x-real-ip": "198.51.100.51",
        "x-vercel-forwarded-for": "203.0.113.10",
      },
      vercel
    ) === "203.0.113.10" &&
      at({ "x-forwarded-for": "198.51.100.77", "x-real-ip": "192.0.2.77" }, vercel, "10.1.1.1") ===
        VERCEL_UNKNOWN_CLIENT,
    "ignorados"
  );
  record(
    "só o primeiro salto válido do cabeçalho da plataforma entra",
    at({ "x-vercel-forwarded-for": "203.0.113.10, 198.51.100.8" }, vercel) === "203.0.113.10" &&
      at({ "x-vercel-forwarded-for": ["2001:db8::2", "203.0.113.10"] }, vercel) === "2001:db8::2",
    "primeiro salto"
  );
  record(
    "ambiente local sem VERCEL usa o socket e ignora cabeçalhos",
    at(
      {
        "x-vercel-forwarded-for": "203.0.113.10",
        "x-forwarded-for": "198.51.100.50",
        "x-real-ip": "198.51.100.51",
      },
      local,
      "127.0.0.1"
    ) === "127.0.0.1" &&
      at({}, {}, "::1") === "::1" &&
      clientIp({ headers: {} }, {}) === "unknown",
    "socket"
  );
  record(
    "valores arbitrários diferentes caem no mesmo identificador",
    new Set(
      ["uuid-a", "uuid-b", "oficina", "203.0.113.10 extra", ""].map((value) =>
        at({ "x-vercel-forwarded-for": value, "x-forwarded-for": value }, vercel, `10.0.0.${value.length}`)
      )
    ).size === 1,
    "um balde"
  );

  console.log(`\n${passed} ok, ${failed} falha(s)`);
  if (failed > 0) process.exit(1);
}

main();
