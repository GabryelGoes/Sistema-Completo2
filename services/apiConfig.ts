/**
 * Base URL dos endpoints HTTP (`/api/...`).
 * - Web + dev: `/api` relativo (Express em `server.ts` na mesma origem).
 * - Capacitor/Android: defina `VITE_API_BASE` no build (ex.: `https://seu-dominio.com/api`).
 */
export const API_BASE: string = (() => {
  const v = import.meta.env.VITE_API_BASE as string | undefined;
  if (typeof v === "string" && v.trim() !== "") {
    return v.trim().replace(/\/$/, "");
  }
  return "/api";
})();
