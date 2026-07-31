import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  ATTRIBUTION,
  CAVEAT,
  MODES,
  type Mode,
  OrsUnavailableError,
  haversineMeters,
  orsDirections,
} from "@/lib/commute/ors";
import { allowRequest, clientIp, RATE_LIMIT_MESSAGE } from "@/lib/commute/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * TRI-50 — /api/commute
 *
 * POST { origin: {sa2_code} | {lng,lat}, destination: {lng,lat}, mode }
 *
 * Flow: cache (indefinite TTL, migration 0007) → one server-side ORS
 * directions call on miss → cache the ROUTED result only. On ORS failure or
 * the TRI-51 quota floor: straight-line geodesic distance, flagged
 * `fallback: true` with its own labelling — the app degrades honestly, never
 * silently. Every response carries source + retrieved-at + the no-live-traffic
 * caveat.
 */

const AKL = { minLng: 173.8, maxLng: 175.8, minLat: -37.4, maxLat: -35.9 };

interface Body {
  origin?: { sa2_code?: string; lng?: number; lat?: number };
  destination?: { lng?: number; lat?: number };
  mode?: string;
}

function inAuckland(lng: number, lat: number): boolean {
  return lng >= AKL.minLng && lng <= AKL.maxLng && lat >= AKL.minLat && lat <= AKL.maxLat;
}

const ptKey = (lng: number, lat: number) => `pt:${lng.toFixed(5)},${lat.toFixed(5)}`;

export async function POST(req: NextRequest) {
  if (!allowRequest(clientIp(req))) {
    return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const mode = body?.mode as Mode | undefined;
  if (!body || !mode || !MODES.includes(mode)) {
    return Response.json({ error: `mode must be one of ${MODES.join(", ")}` }, { status: 400 });
  }
  const dest = body.destination;
  if (
    typeof dest?.lng !== "number" ||
    typeof dest?.lat !== "number" ||
    !inAuckland(dest.lng, dest.lat)
  ) {
    return Response.json({ error: "destination {lng,lat} within Auckland required" }, { status: 400 });
  }

  const supabase = await createClient();

  // Resolve the origin to a routable point + cache key.
  let from: [number, number];
  let originKey: string;
  let originLabel: string | null = null;
  if (body.origin?.sa2_code) {
    const code = body.origin.sa2_code;
    if (!/^[0-9]{6,7}$/.test(code)) {
      return Response.json({ error: "invalid sa2_code" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("commute_origin_points")
      .select("sa2_code, lng, lat")
      .eq("sa2_code", code)
      .maybeSingle();
    if (error || !data) {
      return Response.json({ error: `unknown SA2 ${code}` }, { status: 404 });
    }
    from = [data.lng, data.lat];
    originKey = `sa2:${code}`;
    originLabel = code;
  } else if (
    typeof body.origin?.lng === "number" &&
    typeof body.origin?.lat === "number" &&
    inAuckland(body.origin.lng, body.origin.lat)
  ) {
    from = [body.origin.lng, body.origin.lat];
    originKey = ptKey(body.origin.lng, body.origin.lat);
  } else {
    return Response.json(
      { error: "origin must be {sa2_code} or {lng,lat} within Auckland" },
      { status: 400 },
    );
  }

  const to: [number, number] = [dest.lng, dest.lat];
  const destKey = ptKey(dest.lng, dest.lat);
  const source = {
    name: "openrouteservice routing (OpenStreetMap)",
    licence: "ODbL 1.0",
    attribution: ATTRIBUTION,
  };

  // 1. Cache — a hit never makes an external call.
  const { data: cached } = await supabase.rpc("commute_cache_get", {
    p_origin: originKey,
    p_dest: destKey,
    p_mode: mode,
  });
  const hit = Array.isArray(cached) ? cached[0] : cached;
  if (hit) {
    return Response.json({
      mode,
      origin: originLabel ? { sa2_code: originLabel } : { lng: from[0], lat: from[1] },
      duration_s: Number(hit.duration_s),
      distance_m: Number(hit.distance_m),
      fallback: false,
      cached: true,
      caveat: CAVEAT,
      source,
      retrieved_at: hit.retrieved_at,
    });
  }

  // 2. Live ORS call; 3. labelled straight-line fallback.
  try {
    const leg = await orsDirections(mode, from, to);
    const { error: putError } = await supabase.rpc("commute_cache_put", {
      p_origin: originKey,
      p_dest: destKey,
      p_mode: mode,
      p_duration_s: leg.duration_s,
      p_distance_m: leg.distance_m,
    });
    if (putError) console.error("[commute] cache put failed:", putError.message);
    return Response.json({
      mode,
      origin: originLabel ? { sa2_code: originLabel } : { lng: from[0], lat: from[1] },
      duration_s: leg.duration_s,
      distance_m: leg.distance_m,
      fallback: false,
      cached: false,
      caveat: CAVEAT,
      source,
      retrieved_at: new Date().toISOString(),
    });
  } catch (err) {
    const reason = err instanceof OrsUnavailableError ? err.message : "routing error";
    console.warn(`[commute] fallback (${reason})`);
    return Response.json({
      mode,
      origin: originLabel ? { sa2_code: originLabel } : { lng: from[0], lat: from[1] },
      duration_s: null,
      distance_m: haversineMeters(from, to),
      fallback: true,
      fallback_reason: reason,
      cached: false,
      caveat: `Straight-line distance only — routing is temporarily unavailable (${reason}). ${CAVEAT}`,
      source,
      retrieved_at: new Date().toISOString(),
    });
  }
}
