import { NextRequest } from "next/server";
import { pointHazards, type PointHazardGeometry, type PointHazardMode } from "@/lib/point-hazards";
import { allowRequest, clientIp, RATE_LIMIT_MESSAGE } from "@/lib/commute/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // TRI-129 — the slow shallow-landslide phase

/**
 * TRI-123 — GET /api/point-hazards?lng=&lat=
 *
 * Point-in-layer checks against Auckland Council's own hazard services for
 * the address pin (TRI-122). Returns one line per layer with the verbatim
 * area-level caveat. No address text is accepted or logged — only a point,
 * and only inside the Auckland box.
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
  // TRI-129 — ?mode=fast answers the quick layers (slow ones `pending`),
  // ?mode=slow answers the ~20 s shallow-landslide layer; default: all.
  const m = req.nextUrl.searchParams.get("mode");
  const mode: PointHazardMode = m === "fast" || m === "slow" ? m : "all";
  // TRI-156 — ?geometry=unit tests the whole LINZ rating unit at the point instead of the point.
  const geometry: PointHazardGeometry = req.nextUrl.searchParams.get("geometry") === "unit" ? "unit" : "point";
  return Response.json(await pointHazards(lng, lat, mode, geometry));
}
