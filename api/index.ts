/**
 * Handler Vercel: encaminha todas as requisições /api/* para o app Express (apiApp).
 * O rewrite envia /api/:path* → /api?__path=:path*; aqui reconstruímos req.url para o Express.
 */
import type { IncomingMessage, ServerResponse } from "http";

let app: Awaited<ReturnType<typeof loadApp>> | null = null;

async function loadApp() {
  const mod = await import("../apiApp.js");
  return mod.createApiApp();
}

async function getApp() {
  if (!app) app = await loadApp();
  return app;
}

function fixReqUrl(req: IncomingMessage) {
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

function sendJsonError(res: ServerResponse, status: number, message: string) {
  if (res.headersSent) return;
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: message }));
}

/**
 * Deixa o corpo da requisição intacto para o Express/multer (multipart quebra na Vercel
 * quando o parser padrão consome o stream antes do multer).
 */
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    fixReqUrl(req);
    const application = await getApp();
    const result = application(req, res);
    if (result && typeof (result as Promise<unknown>).then === "function") {
      await result;
    }
  } catch (err: unknown) {
    console.error("[Vercel API handler]", err);
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Erro interno do servidor";
    sendJsonError(res, 500, message);
  }
}
