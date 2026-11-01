/**
 * Fixed-window counter kept in memory: enough for one Node process.
 * Slows down password guessing and mass sign-ups; resets on restart.
 */
export function rateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return {
    /** Counts a hit; false once `key` has used up its window. */
    take(key: string, now = Date.now()): boolean {
      if (hits.size > 10_000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      const entry = hits.get(key);
      if (!entry || entry.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
      }
      entry.count++;
      return entry.count <= max;
    },
    reset(key: string) {
      hits.delete(key);
    },
  };
}
