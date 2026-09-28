import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { nearbyFrom } from "@/lib/nearby";
import { allowRequest, clientIp, RATE_LIMIT_MESSAGE } from "@/lib/commute/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * TRI-131 — GET /api/nearby?lng=&lat=
 *
 * Nearest council park, rapid-transit stop and schools by level, straight-line
 * from the pinned address. Point only — no address text accepted or logged;
 * Auckland box only; rate-limited on the free "point" bucket (TRI-142).
 */

const AKL = { minLng: 173.8, maxLng: 175.8, minLat: -37.4, maxLat: -35.9 };

export async function GET(req: NextRequest) {
  if (!allowRequest(clientIp(req), "point")) {
    return Response.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    return Response.json({ error: "lng and lat required" }, { status: 400 });
  }
  if (lng < AKL.minLng || lng > AKL.maxLng || lat < AKL.minLat || lat > AKL.maxLat) {
    return Response.json({ error: "point is outside the Auckland region" }, { status: 400 });
  }
  const supabase = await createClient();
  return Response.json(await nearbyFrom(supabase, lng, lat));
}
