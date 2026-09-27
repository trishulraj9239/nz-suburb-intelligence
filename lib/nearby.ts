/**
 * TRI-131 — "nearby from the address": the nearest council park, rapid-transit
 * stop and school by level, measured STRAIGHT-LINE from the pin.
 *
 *   Parks     — Auckland Council `Park_Extents` (CC BY 4.0), queried live
 *               within 2 km of the point; distance to the polygon EDGE via
 *               turf (0 when the pin is inside a park). Council-managed
 *               reserves only — whatever the layer holds.
 *   Stations  — the council hub's Rapid Transit Network stops (61 points,
 *               2022 vintage; train, busway and ferry), fetched once a day
 *               and held in memory; each station has a stop per direction,
 *               so the nearest is de-duplicated by name. To be swapped for
 *               GTFS stops when TRI-102 lands.
 *   Schools   — the MOE directory already in the DB, via the KNN function
 *               `nearest_schools_from_point` (migration 0011); nearest
 *               primary / intermediate / secondary picked by MOE school type.
 *
 * Honesty: every figure is "as the crow flies" (confidence `derived`);
 * walking or driving time stays on the commute engine and only when asked.
 * A nearest school is proximity only — "not necessarily zoned" (TRI-101).
 * Supermarkets, cafés, bus stops: deliberately absent (TRI-19 / TRI-102),
 * no third-party places API in the request path.
 */
import { booleanPointInPolygon, distance, lineString, point, pointToLineDistance, polygonToLine } from "@turf/turf";
import type { Feature, LineString, MultiLineString, MultiPolygon, Polygon } from "geojson";
import type { createClient } from "@/lib/supabase/server";

const COUNCIL = "https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services";
const PARK_RADIUS_M = 2000;

export const NEARBY_NOTE =
  "Straight-line distances from the address point, as the crow flies — not a walk or a drive. Nearest school is proximity only: not necessarily zoned (school zones are a separate check). Parks are council-managed reserves as mapped by Auckland Council.";
export const NEARBY_SOURCE = "Auckland Council Park Extents + Rapid Transit Network stops · MOE schools directory — straight-line from the address point";

export interface NearbyPlace {
  name: string;
  distance_m: number;
  detail: string | null;
  lng: number;
  lat: number;
}
export interface NearbySchoolPlace extends NearbyPlace {
  school_type: string | null;
  authority: string | null;
  roll: number | null;
}
export interface Nearby {
  park: NearbyPlace | null;
  station: NearbyPlace | null;
  schools: { primary: NearbySchoolPlace | null; intermediate: NearbySchoolPlace | null; secondary: NearbySchoolPlace | null };
  /** Which parts could not be checked (service down), by name. */
  unavailable: string[];
  note: string;
  source: string;
  licence: string;
  retrieved_at: string;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

const cache = new Map<string, { at: number; r: Nearby }>();
const TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 2000;

// ---- parks -------------------------------------------------------------------
async function nearestPark(lng: number, lat: number): Promise<NearbyPlace | null> {
  const geometry = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
  const url =
    `${COUNCIL}/Park_Extents/FeatureServer/0/query?geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects` +
    `&distance=${PARK_RADIUS_M}&units=esriSRUnit_Meter&outFields=SITEDESCRIPTION,DESCRIPTION,LOCALBOARD&returnGeometry=true&outSR=4326&maxAllowableOffset=0.00003&resultRecordCount=60&f=geojson`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`parks HTTP ${r.status}`);
  const j = (await r.json()) as { features?: Feature<Polygon | MultiPolygon, Record<string, string | null>>[]; error?: unknown };
  if (j.error) throw new Error("parks service error");
  const pt = point([lng, lat]);
  let best: NearbyPlace | null = null;
  for (const f of j.features ?? []) {
    if (!f.geometry) continue;
    let d: number;
    try {
      if (booleanPointInPolygon(pt, f.geometry)) d = 0;
      else {
        const line = polygonToLine(f.geometry) as Feature<LineString | MultiLineString> | { features: Feature<LineString | MultiLineString>[] };
        const feats = "features" in line ? line.features : [line];
        // A polygon with holes comes back as a MultiLineString; measure each ring.
        const rings: Feature<LineString>[] = [];
        for (const l of feats) {
          if (l.geometry.type === "LineString") rings.push(l as Feature<LineString>);
          else for (const c of l.geometry.coordinates) rings.push(lineString(c));
        }
        d = Math.min(...rings.map((l) => pointToLineDistance(pt, l, { units: "meters" })));
      }
    } catch {
      continue;
    }
    const name = f.properties?.SITEDESCRIPTION || f.properties?.DESCRIPTION || "Unnamed reserve";
    if (!best || d < best.distance_m) {
      const c = centroidOf(f.geometry);
      best = { name, distance_m: Math.round(d), detail: f.properties?.LOCALBOARD ? `${f.properties.LOCALBOARD} local board` : null, lng: c[0], lat: c[1] };
    }
  }
  return best;
}
function centroidOf(g: Polygon | MultiPolygon): [number, number] {
  const ring = g.type === "Polygon" ? g.coordinates[0] : g.coordinates[0][0];
  const n = ring.length || 1;
  return [ring.reduce((s, c) => s + c[0], 0) / n, ring.reduce((s, c) => s + c[1], 0) / n];
}

// ---- rapid transit stops -----------------------------------------------------
interface Stop { name: string; mode: string | null; frequency: string | null; lng: number; lat: number }
let stops: { at: number; list: Stop[] } | null = null;
async function allStops(): Promise<Stop[]> {
  if (stops && Date.now() - stops.at < 24 * 60 * 60 * 1000) return stops.list;
  const r = await fetch(
    `${COUNCIL}/RapidTransportNetworkStops_PROD_view/FeatureServer/0/query?where=1%3D1&outFields=Station,PT_Mode,F_PT_freque&returnGeometry=true&outSR=4326&resultRecordCount=500&f=json`,
    { signal: AbortSignal.timeout(12000) },
  );
  if (!r.ok) throw new Error(`stops HTTP ${r.status}`);
  const j = (await r.json()) as { features?: { attributes: Record<string, string | null>; geometry: { x: number; y: number } }[]; error?: unknown };
  if (j.error) throw new Error("stops service error");
  const list = (j.features ?? [])
    .filter((f) => f.geometry && f.attributes.Station)
    .map((f) => ({ name: String(f.attributes.Station), mode: f.attributes.PT_Mode ?? null, frequency: f.attributes.F_PT_freque ?? null, lng: f.geometry.x, lat: f.geometry.y }));
  stops = { at: Date.now(), list };
  return list;
}
async function nearestStation(lng: number, lat: number): Promise<NearbyPlace | null> {
  const list = await allStops();
  const pt = point([lng, lat]);
  let best: NearbyPlace | null = null;
  for (const s of list) {
    const d = distance(pt, point([s.lng, s.lat]), { units: "meters" });
    if (!best || d < best.distance_m) best = { name: s.name, distance_m: Math.round(d), detail: s.mode ? `${s.mode}${s.frequency ? ` · ${s.frequency}` : ""}` : null, lng: s.lng, lat: s.lat };
  }
  return best;
}

// ---- schools -----------------------------------------------------------------
const LEVELS: Record<"primary" | "intermediate" | "secondary", RegExp> = {
  primary: /^(Contributing|Full Primary|Composite)$/i,
  intermediate: /^(Intermediate|Full Primary|Composite|Restricted Composite|Secondary \(Year 7-)/i,
  secondary: /^(Secondary|Composite)/i,
};
async function nearestSchools(supabase: Supabase, lng: number, lat: number): Promise<Nearby["schools"]> {
  const { data, error } = await supabase.rpc("nearest_schools_from_point", { p_lng: lng, p_lat: lat, p_count: 30 });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { name: string; school_type: string | null; authority: string | null; year_levels: string | null; roll: number | null; distance_m: number; lng: number; lat: number }[];
  const pick = (re: RegExp): NearbySchoolPlace | null => {
    const s = rows.find((r) => re.test(r.school_type ?? ""));
    return s ? { name: s.name, distance_m: s.distance_m, detail: [s.school_type, s.year_levels, s.authority].filter(Boolean).join(" · ") || null, lng: s.lng, lat: s.lat, school_type: s.school_type, authority: s.authority, roll: s.roll } : null;
  };
  return { primary: pick(LEVELS.primary), intermediate: pick(LEVELS.intermediate), secondary: pick(LEVELS.secondary) };
}

export async function nearbyFrom(supabase: Supabase, lng: number, lat: number): Promise<Nearby> {
  const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && !hit.r.unavailable.length) return hit.r;
  const unavailable: string[] = [];
  const [park, station, schools] = await Promise.all([
    nearestPark(lng, lat).catch(() => {
      unavailable.push("parks");
      return null;
    }),
    nearestStation(lng, lat).catch(() => {
      unavailable.push("rapid transit stops");
      return null;
    }),
    nearestSchools(supabase, lng, lat).catch(() => {
      unavailable.push("schools");
      return { primary: null, intermediate: null, secondary: null };
    }),
  ]);
  const r: Nearby = { park, station, schools, unavailable, note: NEARBY_NOTE, source: NEARBY_SOURCE, licence: "CC BY 4.0", retrieved_at: new Date().toISOString() };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), r });
  return r;
}

/** "480 m" / "1.1 km" */
export function fmtDistance(m: number): string {
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}
