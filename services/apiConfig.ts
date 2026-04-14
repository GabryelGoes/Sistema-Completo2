/**
 * Base URL dos endpoints HTTP (`/api/...`).
 * - Web + dev: `/api` relativo (Express em `server.ts` na mesma origem).
 * - Outro domínio / APK: defina `VITE_API_BASE` (ex.: `https://seu-dominio.com/api`) e na API `CORS_ALLOWED_ORIGINS` com a origem do front (senão o upload vira "Failed to fetch").
 */
export const API_BASE: string = (() => {
  const v = import.meta.env.VITE_API_BASE as string | undefined;
  if (typeof v === "string" && v.trim() !== "") {
    return v.trim().replace(/\/$/, "");
  }
  return "/api";
})();
