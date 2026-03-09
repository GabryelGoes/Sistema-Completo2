/**
 * Handler Vercel: encaminha todas as requisições /api/* para o app Express (apiApp).
 * O rewrite envia /api/:path* → /api?__path=:path*; aqui reconstruímos req.url para o Express.
 */
import { createApiApp } from "../apiApp.js";

let app: ReturnType<typeof createApiApp> | null = null;

function getApp() {
  if (!app) app = createApiApp();
  return app;
}

function fixReqUrl(req: import("http").IncomingMessage) {
  const url = req.url || "";
  const q = url.indexOf("?");
  const search = q >= 0 ? url.slice(q) : "";
  const params = new URLSearchParams(search);
  const pathSeg = params.get("__path");
  if (pathSeg) {
    params.delete("__path");
    const rest = params.toString();
    req.url = "/api/" + pathSeg + (rest ? "?" + rest : "");
  }
}

export default function handler(req: import("http").IncomingMessage, res: import("http").ServerResponse) {
  fixReqUrl(req);
  return getApp()(req, res);
}
