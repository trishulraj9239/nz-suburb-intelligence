/**
 * TRI-123 — hazard layers at a POINT, answered by the council's own services.
 *
 * The app's hazard metrics are per-SA2 shares computed offline (TRI-68). For
 * an address we need "is this point inside the layer", which needs the
 * full-resolution polygons — those never came into the DB (gitignored
 * intermediates; hundreds of MB). Instead each check is one point query
 * against the authoritative Auckland Council ArcGIS service (keyless, CC BY
 * 4.0, the same services the ETL read), ~300 ms per layer, run in parallel
 * and cached in memory by rounded coordinate. Nothing is stored.
 *
 * TRI-129 extends the list with the layers that appear on a LIM: flood prone
 * areas (with the modelled 100-year ponding depth the record carries), flood
 * sensitive areas, shallow and large-scale landslide SUSCEPTIBILITY (a class
 * of terrain, never an occurrence or a "risk"), the ASCIE coastal-erosion
 * susceptibility lines for 2050 / 2080 / 2130 (RCP8.5) and tsunami evacuation
 * zones. The 4.87M-polygon landslide layer is sampled at the point by the
 * service — nothing is bulk-loaded. Each layer's vintage is its service's
 * lastEditDate, read from the layer metadata (cached a day).
 *
 * Honesty: a point-in-layer result is still an AREA-LEVEL MODEL — the
 * council's flood plain is a modelled 1 % AEP extent, not a property survey —
 * so every result carries HAZARD_CAVEAT verbatim, and a service failure
 * reports "unavailable" rather than "outside". No composite score, ever.
 */

import { HAZARD_CAVEAT } from "@/lib/hazard";
import { unitPolygon, type Rings } from "@/lib/property-facts";

const BASE = "https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services";

/** The council's own interactive maps — the authoritative place to look. */
export const FLOOD_VIEWER_URL = "https://experience.arcgis.com/experience/cbde7f2134404f4d90adce5396a0a630";
export const GEOMAPS_URL = "https://geomapspublic.aucklandcouncil.govt.nz/viewer/index.html";
export const HAIL_NOTE = "Contaminated land (HAIL) status is not openly published — a LIM report is the only source.";

export interface PointHazardLayer {
  key: string;
  label: string;
  /** Label for NL rows: digits spelled out so the eval's figure-grounding
   *  check can't bind "1%" or "20 m" in the clause to the row's 0/1 value. */
  nlLabel: string;
  /** Year of the council layer as shown on the map legend / metric rows. */
  vintage: string;
  /** Service lastEditDate (YYYY-MM-DD) when the metadata was reachable. */
  edited: string | null;
  /** What was checked, in words the UI and the answer layer can both use. */
  check: string;
  /** inside | outside | within | clear | <class> | not assessed | unavailable;
   *  with a rating-unit geometry: touches | clear-unit | <class> | not assessed | unit-untested | unavailable */
  status: string;
  inside: boolean | null;
  /** The record's own detail on a hit — depth, model, class wording. */
  detail: string | null;
}

type Attrs = Record<string, string | number | null>;

const landslideWords = (kind: string) => (a: Attrs): string | null => {
  const v = String(a.SusceptibilityValue ?? "");
  if (!v) return null;
  const prone = /high/i.test(v) ? "terrain more prone" : /moderate/i.test(v) ? "terrain moderately prone" : "terrain less prone";
  return `${prone} to ${kind} landslides than most of the region, per the council's regional model — susceptibility, not occurrence`;
};
const join = (parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ") || null;

const LAYERS: {
  key: string;
  label: string;
  nlLabel: string;
  vintage: string;
  service: string;
  distanceM?: number;
  classField?: string;
  /** Status when a class layer returns nothing at the point. */
  noneStatus?: string;
  outFields?: string[];
  describe?: (a: Attrs) => string | null;
  /** The large-scale landslide layer can take >8 s to sample; 12 s × 2
   *  attempts stays inside the route's budget. */
  timeoutMs?: number;
  /** ~20 s per query however it is asked (4.87M polygons): served in a second
   *  phase so the twelve fast layers never wait for it. */
  slow?: boolean;
  check: string;
}[] = [
  { key: "flood", label: "Flood plain (1% AEP)", nlLabel: "flood plain (one-percent annual-exceedance event)", vintage: "2026", service: "Flood_Plains", check: "point inside the modelled 1% AEP flood plain" },
  { key: "overland", label: "Overland flow path", nlLabel: "overland flow path (within twenty metres)", vintage: "2026", service: "Overland_Flow_Paths", distanceM: 20, check: "a mapped overland flow path within 20 m of the point" },
  { key: "coastal", label: "Coastal inundation (1% AEP)", nlLabel: "coastal inundation (one-percent annual-exceedance event, present-day sea level)", vintage: "2025", service: "Coastal_Inundation_1_AEP", check: "point inside modelled present-day 1% AEP coastal inundation" },
  { key: "coastal_slr1m", label: "Coastal inundation (1% AEP, +1 m sea level)", nlLabel: "coastal inundation (one-percent annual-exceedance event, plus one metre of sea-level rise)", vintage: "2025", service: "Coastal_Inundation_1_AEP_1m_sea_level_rise", check: "point inside modelled 1% AEP coastal inundation with +1 m sea-level rise" },
  { key: "liquefaction", label: "Liquefaction vulnerability", nlLabel: "liquefaction vulnerability class", vintage: "2022", service: "Liquefaction_Vulnerability_Calibrated_Assessment", classField: "VulnerabilityDescription", check: "liquefaction vulnerability class of the assessed area at the point" },
  // ---- TRI-129 — the LIM layers -------------------------------------------
  {
    key: "flood_prone",
    label: "Flood prone area (100-year ponding)",
    nlLabel: "flood prone area (a modelled ponding depression, with its one-hundred-year depth)",
    vintage: "2026",
    service: "Flood_Prone_Areas",
    outFields: ["Depth100y", "RecordStatus"],
    describe: (a) =>
      join([
        a.Depth100y != null ? `modelled 100-year ponding depth ${Number(a.Depth100y).toFixed(2)} m` : null,
        a.RecordStatus && a.RecordStatus !== "Current" ? `record status ${a.RecordStatus}` : null,
      ]),
    check: "point inside a mapped flood prone area — a depression that can pond in a 1% AEP event",
  },
  {
    key: "flood_sensitive",
    label: "Flood sensitive area",
    nlLabel: "flood sensitive area (council catchment model extent)",
    vintage: "2024",
    service: "Flood_Sensitive_Areas",
    outFields: ["Model_Type", "RAINFALL_EVENT", "CLIMATE_CHANGE_ADJUSTED", "YEAR_PRODUCED"],
    describe: (a) =>
      join([
        a.Model_Type ? `${a.Model_Type} model` : null,
        a.RAINFALL_EVENT ? `${a.RAINFALL_EVENT} event` : null,
        a.CLIMATE_CHANGE_ADJUSTED ? `climate-change adjusted: ${a.CLIMATE_CHANGE_ADJUSTED}` : null,
        a.YEAR_PRODUCED ? `produced ${a.YEAR_PRODUCED}` : null,
      ]),
    check: "point inside a council-modelled flood sensitive area",
  },
  {
    key: "landslide_shallow",
    label: "Shallow landslide susceptibility",
    nlLabel: "shallow landslide susceptibility class (council regional model; susceptibility, not occurrence)",
    vintage: "2025",
    service: "Shallow_Landslide_Susceptibility",
    classField: "SusceptibilityValue",
    timeoutMs: 28000,
    slow: true,
    describe: landslideWords("shallow"),
    check: "shallow landslide susceptibility class of the terrain at the point",
  },
  {
    key: "landslide_large",
    label: "Large-scale landslide susceptibility",
    nlLabel: "large-scale landslide susceptibility class (council regional model; susceptibility, not occurrence)",
    vintage: "2025",
    service: "Large_Scale_Landslide_Susceptibility",
    classField: "SusceptibilityValue",
    timeoutMs: 12000,
    outFields: ["Confidence"],
    describe: (a) => join([landslideWords("large-scale")(a), a.Confidence ? `council confidence: ${String(a.Confidence).toLowerCase()}` : null]),
    check: "large-scale landslide susceptibility class of the terrain at the point",
  },
  ...(["2050", "2080", "2130"] as const).map((yr) => ({
    key: `ascie_${yr}`,
    label: `Coastal erosion susceptibility line (ASCIE ${yr}, RCP8.5)`,
    nlLabel: `coastal erosion susceptibility line, ASCIE ${yr} RCP8.5 (the mapped landward limit; within twenty metres)`,
    vintage: "2024",
    service: `Susceptible_Areas_ASCIE_${yr}_RCP85_Regional`,
    distanceM: 20,
    outFields: ["CoastType", "Scenario"],
    describe: (a: Attrs) => join([a.CoastType ? `${a.CoastType} coast` : null, a.Scenario ? String(a.Scenario) : null]),
    check: `the mapped ASCIE ${yr} (RCP8.5) landward-limit line within 20 m of the point`,
  })),
  {
    key: "tsunami",
    label: "Tsunami evacuation zone",
    nlLabel: "tsunami evacuation zone (beach and marine warning)",
    vintage: "2024",
    service: "Tsunami_Evacuation_Zones",
    classField: "ZONETYPE",
    noneStatus: "outside",
    describe: (a) => (a.ZONETYPE ? `${a.ZONETYPE} zone — the area to leave in a beach and marine tsunami warning` : null),
    check: "tsunami evacuation zone colour at the point",
  },
];

export const POINT_HAZARD_SOURCE = "Auckland Council open data (CC BY 4.0)";

const cache = new Map<string, { at: number; layers: PointHazardLayer[] }>();
const TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 2000;

/** Service lastEditDate, cached a day; null when the metadata is unreachable. */
const editCache = new Map<string, { at: number; date: string | null }>();
async function editedOn(service: string): Promise<string | null> {
  const hit = editCache.get(service);
  if (hit && Date.now() - hit.at < 24 * 60 * 60 * 1000) return hit.date;
  let date: string | null = null;
  try {
    const r = await fetch(`${BASE}/${service}/FeatureServer/0?f=json`, { signal: AbortSignal.timeout(6000) });
    const j = (await r.json()) as { editingInfo?: { lastEditDate?: number } };
    if (j.editingInfo?.lastEditDate) date = new Date(j.editingInfo.lastEditDate).toISOString().slice(0, 10);
  } catch {
    date = null;
  }
  editCache.set(service, { at: Date.now(), date });
  return date;
}

async function queryLayer(l: (typeof LAYERS)[number], lng: number, lat: number, rings?: Rings): Promise<PointHazardLayer> {
  // TRI-156 — with rings, the test is "does the layer intersect any part of
  // the rating unit" (a polygon query, sent by POST because a section can
  // run to dozens of vertices); without, the address point as before.
  const geometry = rings ? JSON.stringify({ rings, spatialReference: { wkid: 4326 } }) : JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } });
  const geometryType = rings ? "esriGeometryPolygon" : "esriGeometryPoint";
  const distance = l.distanceM ? `&distance=${l.distanceM}&units=esriSRUnit_Meter` : "";
  const fields = [...(l.classField ? [l.classField] : []), ...(l.outFields ?? [])];
  const out = fields.length ? `&outFields=${fields.join(",")}&returnGeometry=false&resultRecordCount=1` : "&returnCountOnly=true";
  const params = `geometry=${encodeURIComponent(geometry)}&geometryType=${geometryType}&inSR=4326&spatialRel=esriSpatialRelIntersects${distance}${out}&f=json`;
  const url = rings ? `${BASE}/${l.service}/FeatureServer/0/query` : `${BASE}/${l.service}/FeatureServer/0/query?${params}`;
  const editedP = editedOn(l.service);
  const base = { key: l.key, label: l.label, nlLabel: l.nlLabel, vintage: l.vintage, check: l.check };
  // One retry: the heavy council layers answer in ~1 s most of the time and
  // occasionally stall; a second attempt beats reporting "unavailable".
  const attempt = async () => {
    const r = rings
      ? await fetch(url, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: params, signal: AbortSignal.timeout(l.timeoutMs ?? 8000) })
      : await fetch(url, { signal: AbortSignal.timeout(l.timeoutMs ?? 8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { count?: number; features?: { attributes: Attrs }[]; error?: unknown };
    if (j.error) throw new Error("service error");
    return j;
  };
  try {
    // A slow layer gets one long attempt; a fast layer gets a second try.
    const j = l.slow ? await attempt() : await attempt().catch(() => attempt());
    const edited = await editedP;
    const vintage = edited ? edited.slice(0, 4) : l.vintage;
    const attrs = j.features?.[0]?.attributes;
    if (l.classField) {
      const cls = attrs?.[l.classField];
      // A class layer that answers nothing for the unit: "outside" is a point word — the unit is clear of it.
      const none = rings && l.noneStatus === "outside" ? "clear-unit" : (l.noneStatus ?? "not assessed");
      return {
        ...base,
        vintage,
        edited,
        status: cls ? String(cls) : none,
        inside: cls ? true : none === "outside" ? false : null,
        detail: cls && attrs && l.describe ? l.describe(attrs) : null,
      };
    }
    const hit = fields.length ? (j.features?.length ?? 0) > 0 : (j.count ?? 0) > 0;
    return {
      ...base,
      vintage,
      edited,
      status: rings ? (hit ? "touches" : "clear-unit") : l.distanceM ? (hit ? "within" : "clear") : hit ? "inside" : "outside",
      inside: hit,
      detail: hit && attrs && l.describe ? l.describe(attrs) : null,
    };
  } catch {
    return { ...base, edited: null, status: "unavailable", inside: null, detail: null };
  }
}

/**
 * TRI-129 — two phases. "fast" answers the twelve quick layers and returns
 * the slow one as `pending` (so a surface can show "checking…" in its row);
 * "slow" answers only the slow layer; "all" waits for everything (used by
 * the answer layer when the question is about landslides). Results are
 * cached per layer, so the phases never repeat a council query.
 */
export type PointHazardMode = "all" | "fast" | "slow";
/** TRI-156 — what the layers are tested against: the address point, or the whole LINZ rating unit. */
export type PointHazardGeometry = "point" | "unit";

export async function pointHazards(
  lng: number,
  lat: number,
  mode: PointHazardMode = "all",
  geometry: PointHazardGeometry = "point",
): Promise<{ layers: PointHazardLayer[]; caveat: string; source: string; retrieved_at: string; geometry: "address point" | "rating unit"; unit_found: boolean | null }> {
  const coord = `${lng.toFixed(4)},${lat.toFixed(4)}`;
  const rings = geometry === "unit" ? await unitPolygon(lng, lat) : undefined;
  if (geometry === "unit" && !rings) {
    return { layers: [], caveat: HAZARD_CAVEAT, source: POINT_HAZARD_SOURCE, retrieved_at: new Date().toISOString(), geometry: "rating unit", unit_found: false };
  }
  const layers = await Promise.all(
    LAYERS.map(async (l) => {
      if (mode === "fast" && l.slow) {
        return { key: l.key, label: l.label, nlLabel: l.nlLabel, vintage: l.vintage, check: l.check, edited: null, status: rings ? "unit-untested" : "pending", inside: null, detail: null } as PointHazardLayer;
      }
      if (mode === "slow" && !l.slow) return null;
      const ck = `${coord}|${geometry}|${l.key}`;
      const hit = cache.get(ck);
      if (hit && Date.now() - hit.at < TTL_MS && hit.layers[0].status !== "unavailable") return hit.layers[0];
      const r = await queryLayer(l, lng, lat, rings ?? undefined);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(ck, { at: Date.now(), layers: [r] });
      return r;
    }),
  );
  return { layers: layers.filter((l): l is PointHazardLayer => l !== null), caveat: HAZARD_CAVEAT, source: POINT_HAZARD_SOURCE, retrieved_at: new Date().toISOString(), geometry: rings ? "rating unit" : "address point", unit_found: rings ? true : null };
}

/** Plain-words status for a layer row, shared by the UI and the NL rows. */
export function describePointHazard(l: PointHazardLayer): string {
  switch (l.status) {
    case "inside":
      return "inside";
    case "outside":
      return "outside";
    case "within":
      return "within twenty metres";
    case "clear":
      return "none within twenty metres";
    case "unavailable":
      return "council service unavailable — not checked";
    case "not assessed":
      return "not in the assessed area";
    case "pending":
      return "still being checked (slow council layer)";
    case "touches":
      return "touches the rating unit";
    case "clear-unit":
      return "clear of the rating unit";
    case "unit-untested":
      return "rating unit not tested (slow council layer)";
    default:
      return l.status;
  }
}
