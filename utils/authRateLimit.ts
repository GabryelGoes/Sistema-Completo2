/**
 * Limite de tentativas por janela.
 * memory: só nesta instância. É o padrão e o rollback (AUTH_RATE_LIMIT_STORE=memory).
 * postgres: contador compartilhado, implementado em postgresAuthRateLimit.ts.
 * O relógio `now` vale apenas para a memória. O Postgres usa now() do banco.
 */

export type RateHit = { count: number; resetAt: number; limited: boolean };

export type AuthRateLimitStore = {
  hit(key: string, now: number, windowMs: number, max: number): Promise<RateHit>;
  peek(key: string, now: number, max: number): Promise<boolean>;
  reset(key: string): Promise<void>;
};

export class AuthRateLimitUnavailable extends Error {
  constructor() {
    super("Contador de tentativas indisponível.");
    this.name = "AuthRateLimitUnavailable";
  }
}

type Bucket = { count: number; resetAt: number };

export class MemoryAuthRateLimitStore implements AuthRateLimitStore {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly maxKeys = 5000) {}

  async hit(key: string, now: number, windowMs: number, max: number): Promise<RateHit> {
    this.evict(now, key);
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) {
      const resetAt = now + windowMs;
      this.buckets.set(key, { count: 1, resetAt });
      return { count: 1, resetAt, limited: false };
    }
    current.count += 1;
    return { count: current.count, resetAt: current.resetAt, limited: current.count > max };
  }

  async peek(key: string, now: number, max: number): Promise<boolean> {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) return false;
    return current.count >= max;
  }

  async reset(key: string): Promise<void> {
    this.buckets.delete(key);
  }

  private evict(now: number, incomingKey: string): void {
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
    if (this.buckets.has(incomingKey)) return;
    while (this.buckets.size >= this.maxKeys) {
      const oldest = this.buckets.keys().next().value;
      if (oldest === undefined) break;
      this.buckets.delete(oldest);
    }
  }
}
