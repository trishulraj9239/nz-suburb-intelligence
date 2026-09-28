/**
 * TRI-126 — public land-record facts for a POINT, read live from LINZ.
 *
 * Two open layers on the LINZ Data Service (CC BY 4.0, weekly-refreshed):
 *   NZ Property Boundaries (122657) — rating units / titles / parcels with
 *     LINZ's own area, legal description, title numbers and title type.
 *   NZ Property Titles (50804)      — the NO-OWNERSHIP title layer: title
 *     number, type (Freehold / Cross lease / Unit Title / Leasehold …),
 *     status, issue date, estate description.
 *
 * Why live, not loaded: Auckland alone is ~725k property polygons; loading
 * them would use most of the 500 MB Supabase tier for a lookup that happens
 * once per pinned address. Two WFS calls (~50–300 ms each) answer it exactly
 * and stay current with LINZ's weekly republish. Results are cached in memory
 * by rounded coordinate for an hour; nothing is stored, no address text is
 * sent to LINZ — only a point.
 *
 * Honesty: these are public records ABOUT THE LAND, not a valuation and not a
 * property inspection. Owner names are a restricted LINZ dataset and are never
 * requested; `number_owners` is deliberately not fetched. A point that lands
 * on several units (a cross lease, an apartment building) returns them all —
 * the app never picks a "winner".
 */

const WFS = "https://data.linz.govt.nz/services";
const KEY = process.env.LINZ_LDS_API_KEY;

export interface PropertyUnit {
  source_id: string;
  title_type: string | null;
  area_m2: number | null;
  legal_description: string | null;
  valuation_reference: string | null;
  title_nos: string[];
}
export interface PropertyTitle {
  title_no: string;
  type: string | null;
  status: string | null;
  issue_date: string | null;
  estate_description: string | null;
  guarantee_status: string | null;
}
export interface PropertyFacts {
  units: PropertyUnit[];
  titles: PropertyTitle[];
  source: string;
  licence: string;
  retrieved_at: string;
  /** Set when LINZ could not be reached; the UI says "not checked", never "no title". */
  unavailable?: string;
}

export const PROPERTY_SOURCE = "Toitū Te Whenua LINZ · NZ Property Boundaries + NZ Property Titles (no ownership)";
export const PROPERTY_LICENCE = "CC BY 4.0";

const cache = new Map<string, { at: number; facts: PropertyFacts }>();
const TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 2000;

async function wfsJson(typeNames: string, cql: string, propertyName: string): Promise<{ features?: { properties: Record<string, unknown> }[] }> {
  if (!KEY) throw new Error("LINZ_LDS_API_KEY not configured");
  const url =
    `${WFS};key=${KEY}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=${typeNames}` +
    `&outputFormat=json&srsName=EPSG:4326&count=10&cql_filter=${encodeURIComponent(cql)}&propertyName=${propertyName}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(`LINZ WFS ${r.status}`);
  return (await r.json()) as { features?: { properties: Record<string, unknown> }[] };
}

const str = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v));

export async function propertyFacts(lng: number, lat: number): Promise<PropertyFacts> {
  const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && !hit.facts.unavailable) return hit.facts;

  const retrieved_at = new Date().toISOString();
  try {
    const boundaries = await wfsJson(
      "layer-122657",
      `INTERSECTS(geom, SRID=4326;POINT(${lng} ${lat}))`,
      "source_id,title_no,title_type,area,legal_description,valuation_reference",
    );
    const units: PropertyUnit[] = (boundaries.features ?? []).map((f) => {
      const p = f.properties;
      return {
        source_id: String(p.source_id),
        title_type: str(p.title_type),
        area_m2: p.area === null || p.area === undefined ? null : Math.round(Number(p.area)),
        legal_description: str(p.legal_description),
        valuation_reference: str(p.valuation_reference),
        title_nos: String(p.title_no ?? "").split(",").map((s) => s.trim()).filter(Boolean),
      };
    });
    const titleNos = [...new Set(units.flatMap((u) => u.title_nos))].slice(0, 10);
    let titles: PropertyTitle[] = [];
    if (titleNos.length) {
      const t = await wfsJson(
        "layer-50804",
        `title_no IN (${titleNos.map((n) => `'${n.replace(/'/g, "''")}'`).join(",")})`,
        "title_no,type,status,issue_date,estate_description,guarantee_status",
      );
      titles = (t.features ?? []).map((f) => {
        const p = f.properties;
        return {
          title_no: String(p.title_no),
          type: str(p.type),
          status: str(p.status),
          issue_date: str(p.issue_date)?.slice(0, 10) ?? null,
          estate_description: str(p.estate_description),
          guarantee_status: str(p.guarantee_status),
        };
      });
    }
    const facts: PropertyFacts = { units, titles, source: PROPERTY_SOURCE, licence: PROPERTY_LICENCE, retrieved_at };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), facts });
    return facts;
  } catch (e) {
    return { units: [], titles: [], source: PROPERTY_SOURCE, licence: PROPERTY_LICENCE, retrieved_at, unavailable: (e as Error).message };
  }
}

/**
 * TRI-156 — the rating-unit polygon at a point (LINZ NZ Property Boundaries,
 * layer-122657), as ArcGIS-style rings in WGS84, for testing a whole section
 * against the council hazard layers rather than one address point. null when
 * no unit contains the point (roads, reserves, unformed land) or LINZ is
 * unreachable. Cached an hour like the facts.
 */
export type Rings = number[][][];
const unitCache = new Map<string, { at: number; rings: Rings | null }>();
export async function unitPolygon(lng: number, lat: number): Promise<Rings | null> {
  const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
  const hit = unitCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && hit.rings) return hit.rings;
  if (!KEY) return null;
  try {
    const url =
      `${WFS};key=${KEY}/wfs?service=WFS&version=2.0.0&request=GetFeature&typeNames=layer-122657` +
      `&outputFormat=json&srsName=EPSG:4326&count=1&cql_filter=${encodeURIComponent(`INTERSECTS(geom, SRID=4326;POINT(${lng} ${lat}))`)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error(`LINZ WFS ${r.status}`);
    const j = (await r.json()) as { features?: { geometry?: { type: string; coordinates: unknown } }[] };
    const g = j.features?.[0]?.geometry;
    let rings: Rings | null = null;
    if (g?.type === "Polygon") rings = g.coordinates as Rings;
    else if (g?.type === "MultiPolygon") rings = (g.coordinates as Rings[]).flat();
    // Round to ~1 m so the query stays small; the test is intersect-or-not.
    if (rings) rings = rings.map((ring) => ring.map(([x, y]) => [Number(x.toFixed(5)), Number(y.toFixed(5))]));
    if (unitCache.size >= CACHE_MAX) unitCache.delete(unitCache.keys().next().value as string);
    unitCache.set(key, { at: Date.now(), rings });
    return rings;
  } catch {
    return null;
  }
}

/** One-line neutral explainer per title type (never advice). */
export const TITLE_TYPE_NOTE: Record<string, string> = {
  Freehold: "Fee simple: the owner holds the land and buildings outright.",
  "Cross lease": "Owners jointly own the land and lease their own flat's footprint from each other; changes to the building can need the other lessees' consent.",
  "Unit Title": "Ownership of a unit within a body corporate development, with shared common property and body corporate rules and levies.",
  Leasehold: "The land is leased from a separate owner for a term; ground rent applies and the lease has an expiry.",
};
