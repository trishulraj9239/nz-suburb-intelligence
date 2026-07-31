/**
 * openrouteservice client for the live-commute path (TRI-50) with the quota
 * guard (TRI-51). Precomputed anchor times never touch this — only
 * user-specific destinations do (the bulk/live split, plan §2).
 *
 * Quota guard: every ORS response reports x-ratelimit-remaining for the
 * directions endpoint (2,000/day observed 2026-07-31 — docs/sources.md).
 * Below QUOTA_FLOOR the route serves the labelled straight-line fallback
 * instead of burning the tail of the quota, so the demo degrades honestly
 * instead of 403ing mid-evening. State is per-instance (Fluid Compute reuses
 * instances); the floor is high enough that a cold instance rediscovers the
 * situation in one call.
 */

export const MODES = ["driving-car", "cycling-regular", "foot-walking"] as const;
export type Mode = (typeof MODES)[number];

export const QUOTA_FLOOR = 100;

export const CAVEAT = "Typical time — no live traffic.";
export const ATTRIBUTION = "Routing: openrouteservice · © OpenStreetMap contributors (ODbL)";

/** Pure floor decision — exported for the unit test. */
export function belowQuotaFloor(remaining: number | null, floor = QUOTA_FLOOR): boolean {
  return remaining !== null && remaining < floor;
}

let quotaRemaining: number | null = null;
export function getQuotaRemaining(): number | null {
  return quotaRemaining;
}

export interface RoutedLeg {
  duration_s: number;
  distance_m: number;
}

export class OrsUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "OrsUnavailableError";
  }
}

export async function orsDirections(
  mode: Mode,
  from: [number, number],
  to: [number, number],
): Promise<RoutedLeg> {
  if (belowQuotaFloor(quotaRemaining)) {
    console.warn(`[commute] quota floor: ${quotaRemaining} remaining — serving fallback only`);
    throw new OrsUnavailableError("quota floor reached");
  }
  const key = process.env.ORS_API_KEY;
  if (!key) throw new OrsUnavailableError("ORS_API_KEY not configured");

  let res: Response;
  try {
    res = await fetch(
      `https://api.openrouteservice.org/v2/directions/${mode}?start=${from[0]},${from[1]}&end=${to[0]},${to[1]}`,
      { headers: { authorization: key }, signal: AbortSignal.timeout(10_000) },
    );
  } catch {
    throw new OrsUnavailableError("ORS unreachable");
  }

  const remaining = res.headers.get("x-ratelimit-remaining");
  if (remaining !== null) quotaRemaining = Number(remaining);

  if (res.status === 404) throw new OrsUnavailableError("no routable point near a coordinate");
  if (!res.ok) throw new OrsUnavailableError(`ORS ${res.status}`);

  const json = (await res.json()) as {
    features?: { properties?: { summary?: { duration: number; distance: number } } }[];
  };
  const s = json.features?.[0]?.properties?.summary;
  if (!s) throw new OrsUnavailableError("no route in ORS response");
  return { duration_s: Math.round(s.duration), distance_m: Math.round(s.distance) };
}

/** Straight-line fallback — geodesic distance, clearly labelled by the caller. */
export function haversineMeters(from: [number, number], to: [number, number]): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(to[1] - from[1]);
  const dLng = rad(to[0] - from[0]);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(from[1])) * Math.cos(rad(to[1])) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
