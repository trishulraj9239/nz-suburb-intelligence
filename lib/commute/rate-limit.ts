/**
 * Light per-IP token buckets for the point routes (TRI-45, TRI-142) — a public
 * demo calling upstream services deserves a speed bump, not a fortress.
 * In-memory and per-instance (Fluid Compute reuses instances between
 * requests); a determined abuser can rotate instances, but C4's quota floor
 * is the backstop that actually protects the ORS key.
 *
 * TRI-142 — two buckets, because the routes have two very different costs:
 *   "metered" — geocode and commute, which spend the ORS daily quota. Tight:
 *               a burst of 10, refilling 0.5/s (30/min).
 *   "point"   — the council / LINZ / Stats NZ point lookups behind the
 *               "This property" panel (hazards ×2, title, built form,
 *               overlays, block stats, nearby). Free upstreams, ~8 calls per
 *               pin, and the shortlist makes a second pin within seconds
 *               normal. Burst of 30, refilling 1/s (60/min) — three pins
 *               back to back fit; a scraper still hits the wall.
 * The two buckets are independent, so a burst of property lookups never
 * starves a commute call and vice versa.
 */

export type BucketKind = "metered" | "point";

export const BUCKETS: Record<BucketKind, { size: number; refillPerSec: number }> = {
  metered: { size: 10, refillPerSec: 0.5 },
  point: { size: 30, refillPerSec: 1 },
};

const buckets = new Map<string, { tokens: number; last: number }>();

/** Consume one token from `kind`'s bucket for this IP; false = over the limit. */
export function allowRequest(ip: string, kind: BucketKind = "metered", now: number = Date.now()): boolean {
  const cfg = BUCKETS[kind];
  const key = `${kind}|${ip}`;
  const b = buckets.get(key) ?? { tokens: cfg.size, last: now };
  b.tokens = Math.min(cfg.size, b.tokens + ((now - b.last) / 1000) * cfg.refillPerSec);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10_000) buckets.clear(); // crude memory cap
  return true;
}

/** Test hook: forget every bucket. */
export function resetRateLimits(): void {
  buckets.clear();
}

export function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

export const RATE_LIMIT_MESSAGE =
  "Easy on! This public demo rate-limits address and commute lookups — try again in a few seconds.";
