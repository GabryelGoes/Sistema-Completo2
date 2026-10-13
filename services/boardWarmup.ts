/**
 * Acelera a 1ª abertura do Pátio/Laboratório:
 * - prefetch do chunk JS (PatioView é ~grande)
 * - reaproveita o mesmo Promise de listagem por alguns segundos (hover → clique)
 */
import { getServiceOrders, getSystemUserTechnicians, type ServiceOrderType } from "./apiService";

const CHUNK_PREFETCHED = { patio: false };

export function prefetchPatioViewChunk(): void {
  if (CHUNK_PREFETCHED.patio) return;
  CHUNK_PREFETCHED.patio = true;
  void import("../components/views/PatioView");
}

type BoardCacheEntry = {
  at: number;
  promise: Promise<Awaited<ReturnType<typeof getServiceOrders>>>;
};

type TechCacheEntry = {
  at: number;
  promise: Promise<Awaited<ReturnType<typeof getSystemUserTechnicians>>>;
};

const BOARD_TTL_MS = 12_000;
const TECH_TTL_MS = 60_000;

const boardCache = new Map<string, BoardCacheEntry>();
let techCache: TechCacheEntry | null = null;

function boardKey(orderType?: ServiceOrderType, status?: string): string {
  return `${orderType ?? "all"}|${status ?? ""}`;
}

/** Lista de OS com cache curto — warmup no Home e carga do quadro usam o mesmo Promise. */
export function getServiceOrdersWarm(
  status?: string,
  orderType?: ServiceOrderType
): Promise<Awaited<ReturnType<typeof getServiceOrders>>> {
  const key = boardKey(orderType, status);
  const hit = boardCache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < BOARD_TTL_MS) return hit.promise;
  const promise = getServiceOrders(status, orderType).catch((err) => {
    boardCache.delete(key);
    throw err;
  });
  boardCache.set(key, { at: now, promise });
  return promise;
}

export function getSystemUserTechniciansWarm(): Promise<
  Awaited<ReturnType<typeof getSystemUserTechnicians>>
> {
  const now = Date.now();
  if (techCache && now - techCache.at < TECH_TTL_MS) return techCache.promise;
  const promise = getSystemUserTechnicians().catch((err) => {
    techCache = null;
    throw err;
  });
  techCache = { at: now, promise };
  return promise;
}

/** Invalida cache após mutação no quadro (mover card, etc.) — próximo fetch pega dados novos. */
export function invalidateServiceOrdersWarm(orderType?: ServiceOrderType): void {
  if (!orderType) {
    boardCache.clear();
    return;
  }
  for (const key of [...boardCache.keys()]) {
    if (key.startsWith(`${orderType}|`)) boardCache.delete(key);
  }
}

/** Prefetch de chunk + aquecimento da API (chamado no hover/toque do ícone na Home). */
export function warmPatioOrLaboratoryBoard(orderType: ServiceOrderType = "vehicle"): void {
  prefetchPatioViewChunk();
  void getServiceOrdersWarm(undefined, orderType);
  void getSystemUserTechniciansWarm();
}
