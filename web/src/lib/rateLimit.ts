// A small in-memory rate limiter for public endpoints. Pure: the caller passes the clock.
//
// Limits: it lives in one server instance. On a platform that runs several instances at once the limit applies
// per instance, so it slows down hammering but is not a hard cap. The hard rules are in the database (for example
// one pending deletion request per card).

export type RateLimiter = { allow(key: string, now?: number): boolean; size(): number };

export function createRateLimiter(opts: { limit: number; windowMs: number; maxKeys?: number }): RateLimiter {
  const hits = new Map<string, number[]>();
  const maxKeys = opts.maxKeys ?? 5000;

  function prune(now: number) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= opts.windowMs)) hits.delete(k);
    }
    // Still too many keys (many different callers inside one window): drop the oldest first.
    for (const k of hits.keys()) {
      if (hits.size <= maxKeys) break;
      hits.delete(k);
    }
  }

  return {
    allow(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < opts.windowMs);
      if (recent.length >= opts.limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.delete(key); // re-insert so the map stays ordered by last use
      hits.set(key, recent);
      if (hits.size > maxKeys) prune(now);
      return true;
    },
    size: () => hits.size,
  };
}

/** Best guess of who is calling, from the proxy headers. Only used to count requests, never stored or logged. */
export function clientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}
