/**
 * TRI-127 — built form on the rating unit at a POINT, read live from LINZ.
 *
 * Two open LINZ layers (CC BY 4.0), one hour in-memory cache, nothing stored:
 *   NZ Property Boundaries (122657) — the rating-unit polygon and LINZ's area.
 *   NZ Building Outlines (101290)   — roof outlines digitised from aerial
 *     imagery (≥ 10 m²), with the imagery capture window per outline.
 *
 * Derivation (as specified on the ticket):
 *   buildings_on_property = outlines whose point-on-surface lies inside the unit
 *   footprint_m2          = Σ area(outline ∩ unit)   (every outline that overlaps)
 *   site_coverage_pct     = footprint_m2 / unit area
 *
 * Honesty: a roof outline is NOT a floor area and NOT a consent record; the
 * copy on every surface says so and carries the outline capture years, so a
 * 2024 photo is never mistaken for today. Confidence `medium` (imagery-
 * derived). No height (needs LiDAR; later spike). Live, not loaded, for the
 * same reason as TRI-126: ~250k Auckland outlines would eat the Supabase
 * budget for a lookup that happens once per pinned address.
 *
 * The aerial thumbnail in the panel is the LINZ basemap tile service (public
 * key, already attributed on the map); `imagery` names the aerial layer the
 * basemap serves at this point so its date can sit beside the picture.
 */
import { area, booleanPointInPolygon, featureCollection, intersect, pointOnFeature } from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";

const WFS = "https://data.linz.govt.nz/services";
const KEY = process.env.LINZ_LDS_API_KEY;
const PUBLIC_KEY = process.env.NEXT_PUBLIC_LINZ_API_KEY;

export interface OutlineOnProperty {
  building_id: string;
  use: string | null;
  name: string | null;
  /** Whole outline area, m² (may extend past the unit boundary). */
  area_m2: number;
  /** Part of the outline inside the unit, m². */
  on_unit_m2: number;
  capture_from: string | null;
  capture_to: string | null;
}
export interface BuiltFormPoint {
  /** No rating unit at the point — nothing to measure. */
  none?: boolean;
  unit_area_m2: number | null;
  building_count: number;
  footprint_m2: number | null;
  site_coverage_pct: number | null;
  outlines: OutlineOnProperty[];
  /** "2024–2025" style window across the counted outlines' imagery. */
  outlines_captured: string | null;
  /** The aerial layer the basemap serves at this point (for the thumbnail caption). */
  imagery: { title: string; from: string | null; to: string | null } | null;
  source: string;
  licence: string;
  retrieved_at: string;
  unavailable?: string;
}

export const BUILT_FORM_SOURCE = "Toitū Te Whenua LINZ · NZ Building Outlines on NZ Property Boundaries";
export const BUILT_FORM_LICENCE = "CC BY 4.0";
export const BUILT_FORM_NOTE = "Roof outlines from LINZ aerial imagery; not floor area, not a consent record.";

const cache = new Map<string, { at: number; r: BuiltFormPoint }>();
const TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 2000;

type Poly = Feature<Polygon | MultiPolygon>;

async function wfs(typeNames: string, cql: string, propertyName: string, count: number): Promise<{ features?: Poly[] }> {
  if (!KEY) throw new Error("LINZ_LDS_API_KEY not configured");
  const url =
    `${WFS};key=${KEY}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${typeNames}` +
    `&outputFormat=json&srsName=EPSG:4326&count=${count}&cql_filter=${encodeURIComponent(cql)}&propertyName=${propertyName}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!r.ok) throw new Error(`LINZ WFS ${r.status}`);
  return (await r.json()) as { features?: Poly[] };
}

/** WKT for a (Multi)Polygon, 7 dp — a rating unit is a handful of vertices. */
function wkt(g: Polygon | MultiPolygon): string {
  const ring = (r: number[][]) => `(${r.map(([x, y]) => `${x.toFixed(7)} ${y.toFixed(7)}`).join(",")})`;
  const poly = (p: number[][][]) => `(${p.map(ring).join(",")})`;
  return g.type === "Polygon" ? `POLYGON${poly(g.coordinates)}` : `MULTIPOLYGON(${g.coordinates.map(poly).join(",")})`;
}

const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));
const year = (d: string | null) => (d ? d.slice(0, 4) : null);

/** Which aerial layer the LINZ basemap serves here — from its attribution feed (cached a day). */
let attribution: { at: number; features: Feature[] } | null = null;
async function aerialImageryAt(lng: number, lat: number): Promise<BuiltFormPoint["imagery"]> {
  if (!PUBLIC_KEY) return null;
  try {
    if (!attribution || Date.now() - attribution.at > 24 * 60 * 60 * 1000) {
      const r = await fetch(`https://basemaps.linz.govt.nz/v1/attribution/aerial/WebMercatorQuad/summary.json?api=${PUBLIC_KEY}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) throw new Error(`attribution ${r.status}`);
      const j = (await r.json()) as { features: Feature[] };
      attribution = { at: Date.now(), features: j.features ?? [] };
    }
    const pt = { type: "Point" as const, coordinates: [lng, lat] };
    const hits = attribution.features.filter((f) => {
      const cat = String((f.properties as Record<string, unknown>)?.category ?? "");
      if (!/aerial photos/i.test(cat)) return false;
      try {
        return booleanPointInPolygon(pt, f.geometry as Polygon | MultiPolygon);
      } catch {
        return false;
      }
    });
    if (!hits.length) return null;
    // Urban over rural, then the most recent window.
    hits.sort((a, b) => {
      const pa = a.properties as Record<string, string>;
      const pb = b.properties as Record<string, string>;
      const ua = /urban/i.test(pa.category) ? 1 : 0;
      const ub = /urban/i.test(pb.category) ? 1 : 0;
      if (ua !== ub) return ub - ua;
      return String(pb.end_datetime ?? "").localeCompare(String(pa.end_datetime ?? ""));
    });
    const p = hits[0].properties as Record<string, string>;
    return { title: p.title, from: year(p.start_datetime ?? null), to: year(p.end_datetime ?? null) };
  } catch {
    return null;
  }
}

export async function builtFormAt(lng: number, lat: number): Promise<BuiltFormPoint> {
  const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && !hit.r.unavailable) return hit.r;

  const retrieved_at = new Date().toISOString();
  const base = { source: BUILT_FORM_SOURCE, licence: BUILT_FORM_LICENCE, retrieved_at };
  try {
    const [units, imagery] = await Promise.all([
      wfs("layer-122657", `INTERSECTS(geom, SRID=4326;POINT(${lng} ${lat}))`, "source_id,area,geom", 5),
      aerialImageryAt(lng, lat),
    ]);
    const unitFeatures = (units.features ?? []).filter((f) => f.geometry);
    if (!unitFeatures.length) {
      const r: BuiltFormPoint = { none: true, unit_area_m2: null, building_count: 0, footprint_m2: null, site_coverage_pct: null, outlines: [], outlines_captured: null, imagery, ...base };
      cache.set(key, { at: Date.now(), r });
      return r;
    }
    // A point normally sits in one unit; a cross lease can return the shared
    // lot as well. Measure against all of them together — never pick a winner.
    const unitArea = unitFeatures.reduce((s, f) => s + Number((f.properties as Record<string, unknown>).area ?? area(f)), 0);
    const seen = new Map<string, OutlineOnProperty>();
    let footprint = 0;
    for (const unit of unitFeatures) {
      const out = await wfs("layer-101290", `INTERSECTS(shape, SRID=4326;${wkt(unit.geometry)})`, "building_id,name,use,capture_source_from,capture_source_to,shape", 60);
      for (const b of out.features ?? []) {
        if (!b.geometry) continue;
        const p = b.properties as Record<string, unknown>;
        const id = String(p.building_id);
        if (seen.has(id)) continue;
        let onUnit = 0;
        try {
          const ix = intersect(featureCollection([b, unit]));
          onUnit = ix ? area(ix) : 0;
        } catch {
          onUnit = 0;
        }
        const inside = (() => {
          try {
            return booleanPointInPolygon(pointOnFeature(b), unit);
          } catch {
            return false;
          }
        })();
        footprint += onUnit;
        if (inside) {
          seen.set(id, {
            building_id: id,
            use: str(p.use),
            name: str(p.name),
            area_m2: Math.round(area(b)),
            on_unit_m2: Math.round(onUnit),
            capture_from: str(p.capture_source_from)?.slice(0, 10) ?? null,
            capture_to: str(p.capture_source_to)?.slice(0, 10) ?? null,
          });
        }
      }
    }
    const outlines = [...seen.values()].sort((a, b) => b.on_unit_m2 - a.on_unit_m2);
    const froms = outlines.map((o) => year(o.capture_from)).filter(Boolean) as string[];
    const tos = outlines.map((o) => year(o.capture_to)).filter(Boolean) as string[];
    const lo = froms.length ? froms.sort()[0] : null;
    const hi = tos.length ? tos.sort().at(-1)! : lo;
    const captured = lo ? (hi && hi !== lo ? `${lo}–${hi}` : lo) : null;
    const r: BuiltFormPoint = {
      unit_area_m2: Math.round(unitArea),
      building_count: outlines.length,
      footprint_m2: Math.round(footprint),
      site_coverage_pct: unitArea > 0 ? Math.round((footprint / unitArea) * 1000) / 10 : null,
      outlines,
      outlines_captured: captured,
      imagery,
      ...base,
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), r });
    return r;
  } catch (e) {
    return { unit_area_m2: null, building_count: 0, footprint_m2: null, site_coverage_pct: null, outlines: [], outlines_captured: null, imagery: null, ...base, unavailable: (e as Error).message };
  }
}
