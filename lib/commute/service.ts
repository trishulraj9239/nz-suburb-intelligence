import type { SupabaseClient } from "@supabase/supabase-js";
import {
  type Mode,
  OrsUnavailableError,
  haversineMeters,
  orsDirections,
} from "./ors";

/**
 * Shared cache→ORS→fallback flow (TRI-50), used by /api/commute and the
 * text-to-query commute tool (TRI-53). Only real routed results are cached;
 * fallbacks carry their reason and are never persisted.
 */

export interface CommuteResult {
  duration_s: number | null;
  distance_m: number;
  fallback: boolean;
  fallback_reason?: string;
  cached: boolean;
  retrieved_at: string;
}

export const ptKey = (lng: number, lat: number) => `pt:${lng.toFixed(5)},${lat.toFixed(5)}`;

export async function routedCommute(
  supabase: SupabaseClient,
  originKey: string,
  from: [number, number],
  to: [number, number],
  mode: Mode,
): Promise<CommuteResult> {
  const destKey = ptKey(to[0], to[1]);

  const { data: cached } = await supabase.rpc("commute_cache_get", {
    p_origin: originKey,
    p_dest: destKey,
    p_mode: mode,
  });
  const hit = Array.isArray(cached) ? cached[0] : cached;
  if (hit) {
    return {
      duration_s: Number(hit.duration_s),
      distance_m: Number(hit.distance_m),
      fallback: false,
      cached: true,
      retrieved_at: hit.retrieved_at,
    };
  }

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
    return {
      duration_s: leg.duration_s,
      distance_m: leg.distance_m,
      fallback: false,
      cached: false,
      retrieved_at: new Date().toISOString(),
    };
  } catch (err) {
    const reason = err instanceof OrsUnavailableError ? err.message : "routing error";
    console.warn(`[commute] fallback (${reason})`);
    return {
      duration_s: null,
      distance_m: haversineMeters(from, to),
      fallback: true,
      fallback_reason: reason,
      cached: false,
      retrieved_at: new Date().toISOString(),
    };
  }
}
