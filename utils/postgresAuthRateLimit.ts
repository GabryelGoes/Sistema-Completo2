/**
 * Contador de tentativas no Postgres, via RPC.
 * A janela usa now() do banco. O relógio da instância não decide o bloqueio.
 * A limpeza física roda no máximo uma vez por hora neste processo, nunca a cada login.
 */
import {
  AuthRateLimitUnavailable,
  MemoryAuthRateLimitStore,
  type AuthRateLimitStore,
  type RateHit,
} from "./authRateLimit.js";

export type AuthRateLimitDb = {
  rpc(
    fn: string,
    args: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message?: string } | null }>;
};

const PURGE_INTERVAL_MS = 60 * 60 * 1000;
const PURGE_BATCH = 50;

function asHit(data: unknown): RateHit {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") throw new AuthRateLimitUnavailable();
  const count = (row as { hit_count?: unknown }).hit_count;
  const limited = (row as { limited?: unknown }).limited;
  const resetRaw = (row as { reset_at?: unknown }).reset_at;
  const resetAt = typeof resetRaw === "string" || typeof resetRaw === "number" ? Date.parse(String(resetRaw)) : NaN;
  if (typeof count !== "number" || !Number.isInteger(count) || count < 1) throw new AuthRateLimitUnavailable();
  if (typeof limited !== "boolean" || !Number.isFinite(resetAt)) throw new AuthRateLimitUnavailable();
  return { count, resetAt, limited };
}

export class PostgresAuthRateLimitStore implements AuthRateLimitStore {
  private nextPurgeAt: number;

  constructor(
    private readonly db: AuthRateLimitDb | null,
    private readonly purgeIntervalMs = PURGE_INTERVAL_MS
  ) {
    this.nextPurgeAt = Date.now() + this.purgeIntervalMs;
  }

  async hit(key: string, _now: number, windowMs: number, max: number): Promise<RateHit> {
    const data = await this.call("hit_auth_rate_limit", {
      p_key: key,
      p_window_ms: windowMs,
      p_max: max,
    });
    const hit = asHit(data);
    await this.maybePurge();
    return hit;
  }

  async peek(key: string, _now: number, max: number): Promise<boolean> {
    const data = await this.call("peek_auth_rate_limit", { p_key: key, p_max: max });
    if (typeof data !== "boolean") throw new AuthRateLimitUnavailable();
    return data;
  }

  async reset(key: string): Promise<void> {
    await this.call("reset_auth_rate_limit", { p_key: key });
  }

  private async call(fn: string, args: Record<string, unknown>): Promise<unknown> {
    if (!this.db) throw new AuthRateLimitUnavailable();
    try {
      const { data, error } = await this.db.rpc(fn, args);
      if (error) throw new AuthRateLimitUnavailable();
      return data;
    } catch (err) {
      if (err instanceof AuthRateLimitUnavailable) throw err;
      throw new AuthRateLimitUnavailable();
    }
  }

  private async maybePurge(): Promise<void> {
    const now = Date.now();
    if (now < this.nextPurgeAt || !this.db) return;
    this.nextPurgeAt = now + this.purgeIntervalMs;
    try {
      const { error } = await this.db.rpc("purge_expired_auth_rate_limits", { p_limit: PURGE_BATCH });
      if (error) return;
    } catch {
      // A limpeza não pode impedir o login. A expiração lógica continua no incremento.
    }
  }
}

export function resolveAuthRateLimitStore(env: NodeJS.ProcessEnv, db: AuthRateLimitDb | null): AuthRateLimitStore {
  const mode = String(env.AUTH_RATE_LIMIT_STORE ?? "memory").trim().toLowerCase();
  if (mode === "" || mode === "memory") return new MemoryAuthRateLimitStore();
  if (mode === "postgres") return new PostgresAuthRateLimitStore(db);
  return new PostgresAuthRateLimitStore(null);
}
