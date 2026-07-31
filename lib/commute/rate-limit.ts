/**
 * Light per-IP token bucket for the geocode/commute routes (TRI-45) — a public
 * demo calling a metered upstream deserves a speed bump, not a fortress.
 * In-memory and per-instance (Fluid Compute reuses instances between
 * requests); a determined abuser can rotate instances, but C4's quota floor
 * is the backstop that actually protects the ORS key.
 */

const BUCKET_SIZE = 10; // burst
const REFILL_PER_SEC = 0.5; // 30/min sustained

const buckets = new Map<string, { tokens: number; last: number }>();

export function allowRequest(ip: string): boolean {
  const now = Date.now();
  const b = buckets.get(ip) ?? { tokens: BUCKET_SIZE, last: now };
  b.tokens = Math.min(BUCKET_SIZE, b.tokens + ((now - b.last) / 1000) * REFILL_PER_SEC);
  b.last = now;
  if (b.tokens < 1) {
    buckets.set(ip, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(ip, b);
  if (buckets.size > 10_000) buckets.clear(); // crude memory cap
  return true;
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
