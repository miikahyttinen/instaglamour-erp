/**
 * A small in-memory fixed-window rate limiter (per process). Used for the unauthenticated public
 * offer endpoint (BR-104) to slow down token guessing and scraping.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window ends (for Retry-After). */
  retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
  private windowStart = 0;
  private counts = new Map<string, number>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
    /** Upper bound on tracked keys per window; new keys beyond it are refused (fail closed). */
    readonly maxKeys = 100_000,
    private readonly now: () => number = Date.now,
  ) {}

  hit(key: string): RateLimitResult {
    const now = this.now();
    if (now - this.windowStart >= this.windowMs) {
      this.windowStart = now - (now % this.windowMs);
      this.counts.clear();
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((this.windowStart + this.windowMs - now) / 1000));
    const count = this.counts.get(key);
    if (count === undefined && this.counts.size >= this.maxKeys) return { allowed: false, retryAfterSeconds };
    const next = (count ?? 0) + 1;
    this.counts.set(key, next);
    return { allowed: next <= this.limit, retryAfterSeconds };
  }
}
