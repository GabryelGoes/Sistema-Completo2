/**
 * Interceptor global de fetch para a API do app.
 *
 * - Anexa `Authorization: Bearer <token>` automaticamente em toda requisição
 *   para a API (mesma origem `/api/...` ou `API_BASE` absoluto), usando o token
 *   de sessão salvo no login. Assim não é preciso alterar as ~150 funções de
 *   `apiService.ts` individualmente.
 * - Em respostas 401 (sessão inválida/expirada) limpa a sessão e volta ao login.
 *
 * Importado por `apiService.ts`, então é ativado assim que qualquer chamada de
 * API é usada. Requisições para o Supabase (Realtime) não são tocadas.
 */
import { API_BASE } from "./apiConfig";

const AUTH_STORAGE_KEY = "rei_do_abs_auth";

function getSessionToken(): string | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return typeof data?.token === "string" && data.token ? data.token : null;
  } catch {
    return null;
  }
}

function isApiUrl(url: string): boolean {
  if (!url) return false;
  // API_BASE pode ser relativo ("/api") ou absoluto ("https://dominio/api").
  if (API_BASE.startsWith("http")) {
    return url.startsWith(API_BASE);
  }
  // Relativo: trata caminhos "/api/..." e URLs absolutas do mesmo host terminando em /api.
  if (url.startsWith(API_BASE + "/") || url === API_BASE) return true;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function isLoginUrl(url: string): boolean {
  return url.includes("/api/auth/login");
}

function handleUnauthorized(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  // Evita loop: só redireciona se não estiver já na tela de login pública.
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/acompanhamento/")) {
    window.location.reload();
  }
}

let installed = false;

export function installHttpInterceptor(): void {
  if (installed) return;
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let url = "";
    if (typeof input === "string") url = input;
    else if (input instanceof URL) url = input.toString();
    else if (input instanceof Request) url = input.url;

    if (!isApiUrl(url)) {
      return originalFetch(input as RequestInfo, init);
    }

    const token = getSessionToken();
    let nextInit = init;
    if (token) {
      const headers = new Headers(
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      );
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      nextInit = { ...init, headers };
    }

    const response = await originalFetch(input as RequestInfo, nextInit);

    if (response.status === 401 && !isLoginUrl(url)) {
      handleUnauthorized();
    }

    return response;
  };
}

installHttpInterceptor();
