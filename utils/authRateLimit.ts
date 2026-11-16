/**
 * Limite de tentativas por janela.
 * O armazenamento em memória vale para uma instância. Duas instâncias só compartilham
 * contagem se usarem o mesmo store. Persistência distribuída fica fora desta etapa:
 * exigiria tabela nova e não foi aprovada.
 */

export type RateHit = { count: number; resetAt: number; limited: boolean };

export type AuthRateLimitStore = {
  hit(key: string, now: number, windowMs: number, max: number): RateHit;
  peek(key: string, now: number, max: number): boolean;
  reset(key: string): void;
};

type Bucket = { count: number; resetAt: number };

export class MemoryAuthRateLimitStore implements AuthRateLimitStore {
  private buckets = new Map<string, Bucket>();

  constructor(private readonly maxKeys = 5000) {}

  hit(key: string, now: number, windowMs: number, max: number): RateHit {
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

  peek(key: string, now: number, max: number): boolean {
    const current = this.buckets.get(key);
    if (!current || current.resetAt <= now) return false;
    return current.count >= max;
  }

  reset(key: string): void {
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
