/**
 * Selftest: middleware libera /api/rda/productivity/deadlines/tick sem sessão,
 * mas a rota ainda exige CRON_SECRET (ou sessão gerencial).
 * npm run test:rda-productivity-cron-auth
 */
import http from "node:http";
import type { AddressInfo } from "node:net";

process.env.CRON_SECRET = "cron-test-secret-fase6";
process.env.RDA_PROACTIVE_SCAN_SECRET = "proactive-test-secret-fase6";
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

console.log("RDA productivity cron auth selftest (Fase 6)\n");

const app = createApiApp();
const server = http.createServer(app);
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = (server.address() as AddressInfo).port;
const tickPath = "/api/rda/productivity/deadlines/tick";

try {
  console.log("1) Sem segredo e sem sessão → 403 (não 401 de middleware)");
  {
    const get = await request(port, "GET", tickPath);
    assert(get.status !== 401, `GET sem segredo status=${get.status} (não 401)`);
    assert(get.status === 403, `GET sem segredo = 403 (got ${get.status})`);

    const post = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: "127.0.0.1",
          port,
          path: tickPath,
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
    const get = await request(port, "GET", tickPath, {
      Authorization: "Bearer wrong-secret",
    });
    assert(get.status === 403, `GET Bearer inválido = 403 (got ${get.status})`);
  }

  console.log("\n3) CRON_SECRET válido → passa do gate de auth (não 401/403)");
  {
    const get = await request(port, "GET", tickPath, {
      Authorization: "Bearer cron-test-secret-fase6",
    });
    assert(
      get.status !== 401 && get.status !== 403,
      `GET CRON_SECRET ok → status=${get.status} (não 401/403)`
    );
  }

  console.log("\n4) Outras rotas de produtividade seguem exigindo sessão");
  {
    const tasks = await request(port, "GET", "/api/rda/productivity/tasks");
    assert(tasks.status === 401, `tasks sem sessão = 401 (got ${tasks.status})`);
    const summary = await request(port, "GET", "/api/rda/productivity/summary");
    assert(summary.status === 401, `summary sem sessão = 401 (got ${summary.status})`);
  }
} finally {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve()))
  );
}

console.log(`\nResultado: ${passed} ok, ${failed} fail`);
if (failed > 0) process.exit(1);
