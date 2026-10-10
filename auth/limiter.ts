import { AuthError } from './errors';

/** In-memory sliding window, per process. */
export function windowLimiter(max: number, windowMs: number, clock: () => number) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const now = clock(), recent = (hits.get(key) ?? []).filter(at => now - at < windowMs);
    if (recent.length >= max) { hits.set(key, recent); throw new AuthError('rate_limited', 'Too many requests. Try again later.', Math.ceil((recent[0] + windowMs - now) / 1000)); }
    recent.push(now); hits.set(key, recent);
    if (hits.size > 20_000) for (const [k, v] of hits) if (!v.some(at => now - at < windowMs)) hits.delete(k);
  };
}
