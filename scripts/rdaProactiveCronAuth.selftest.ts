/**
 * Selftest: middleware libera /api/rda/proactive/scan/cron sem sessão,
 * mas a rota ainda exige CRON_SECRET / RDA_PROACTIVE_SCAN_SECRET.
 * npm run test:rda-proactive-cron-auth
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.CRON_SECRET = "cron-test-secret-fase5";
process.env.RDA_PROACTIVE_SCAN_SECRET = "proactive-test-secret-fase5";
// Evita varredura real se a rota autenticar: workshop/supabase podem faltar.
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { createApiApp } = await import("../apiApp.js");

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string) {
  if (cond) {
    passed += 1;
    console.log(`  OK  ${msg}`);
  } else {
    failed += 1;
    console.error(`  FAIL ${msg}`);
  }
}

function request(
  port: number,
  method: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("error", reject);
    req.end();
  });
}

console.log("RDA proactive cron auth selftest\n");

const app = createApiApp();
const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;

try {
  console.log("1) Sem segredo → não é 401 de sessão; rota bloqueia (403)");
  {
    const get = await request(port, "GET", "/api/rda/proactive/scan/cron");
    assert(get.status !== 401, `GET sem segredo status=${get.status} (não 401)`);
    assert(get.status === 403, `GET sem segredo = 403 (got ${get.status})`);
    assert(
      /RDA_PROACTIVE_SCAN_SECRET|CRON_SECRET/i.test(get.body),
      "GET sem segredo menciona secrets"
    );

    const post = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/rda/proactive/scan/cron",
          method: "POST",
          headers: { "Content-Type": "application/json" },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode || 0,
              body: Buffer.concat(chunks).toString("utf8"),
            })
          );
        }
      );
      req.on("error", reject);
      req.write("{}");
      req.end();
    });
    assert(post.status !== 401, `POST sem segredo status=${post.status} (não 401)`);
    assert(post.status === 403, `POST sem segredo = 403 (got ${post.status})`);
  }

  console.log("\n2) Segredo inválido → 403");
  {
    const get = await request(port, "GET", "/api/rda/proactive/scan/cron", {
      Authorization: "Bearer wrong-secret",
    });
    assert(get.status === 403, `GET Bearer inválido = 403 (got ${get.status})`);

    const post = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/rda/proactive/scan/cron",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-rda-proactive-secret": "wrong-secret",
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode || 0,
              body: Buffer.concat(chunks).toString("utf8"),
            })
          );
        }
      );
      req.on("error", reject);
      req.write("{}");
      req.end();
    });
    assert(post.status === 403, `POST secret inválido = 403 (got ${post.status})`);
  }

  console.log("\n3) Segredo correto → passa do gate de auth (não 401/403)");
  {
    const get = await request(port, "GET", "/api/rda/proactive/scan/cron", {
      Authorization: "Bearer cron-test-secret-fase5",
    });
    assert(
      get.status !== 401 && get.status !== 403,
      `GET CRON_SECRET ok → status=${get.status} (não 401/403)`
    );

    const post = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: "/api/rda/proactive/scan/cron",
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-rda-proactive-secret": "proactive-test-secret-fase5",
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode || 0,
              body: Buffer.concat(chunks).toString("utf8"),
            })
          );
        }
      );
      req.on("error", reject);
      req.write("{}");
      req.end();
    });
    assert(
      post.status !== 401 && post.status !== 403,
      `POST RDA_PROACTIVE_SCAN_SECRET ok → status=${post.status} (não 401/403)`
    );
  }

  console.log("\n4) Outras rotas RDA seguem exigindo sessão");
  {
    const other = await request(port, "GET", "/api/rda/proactive/dashboard");
    assert(other.status === 401, `dashboard sem sessão = 401 (got ${other.status})`);
    const scan = await request(port, "POST", "/api/rda/proactive/scan");
    assert(scan.status === 401, `scan manual sem sessão = 401 (got ${scan.status})`);
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
