export type Clock = { now(): number };

export type RateLimitPolicy = { limit: number; windowMs: number };

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

type Entry = { count: number; expiresAt: number };

function normalize(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

export function createRateLimitKey(scope: string, socketAddress: string, identity = "") {
  return `${scope}\u0000${socketAddress}\u0000${normalize(identity)}`;
}

/** A deliberately process-local, timer-free fixed-window store. */
export class BoundedRateLimitStore {
  private readonly entries = new Map<string, Entry>();

  constructor(private readonly clock: Clock = { now: () => Date.now() }, private readonly capacity = 4096) {}

  size() {
    this.prune();
    return this.entries.size;
  }

  consume(key: string, policy: RateLimitPolicy): RateLimitDecision {
    const now = this.clock.now();
    this.prune(now);
    const current = this.entries.get(key);
    if (current) {
      if (current.count < policy.limit) {
        current.count += 1;
        return { allowed: true };
      }
      return { allowed: false, retryAfterSeconds: this.retryAfter(current.expiresAt, now) };
    }
    if (this.entries.size >= this.capacity) {
      const earliest = Math.min(...[...this.entries.values()].map((entry) => entry.expiresAt));
      return { allowed: false, retryAfterSeconds: this.retryAfter(earliest, now) };
    }
    this.entries.set(key, { count: 1, expiresAt: now + policy.windowMs });
    return { allowed: true };
  }

  private prune(now = this.clock.now()) {
    for (const [key, entry] of this.entries) if (entry.expiresAt <= now) this.entries.delete(key);
  }

  private retryAfter(expiresAt: number, now: number) {
    return Math.max(1, Math.min(60, Math.ceil((expiresAt - now) / 1000)));
  }
}
