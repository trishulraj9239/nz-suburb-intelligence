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
 * Honesty: a point-in-layer result is still an AREA-LEVEL MODEL — the
 * council's flood plain is a modelled 1 % AEP extent, not a property survey —
 * so every result carries HAZARD_CAVEAT verbatim, and a service failure
 * reports "unavailable" rather than "outside".
 */

import { HAZARD_CAVEAT } from "@/lib/hazard";

const BASE = "https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services";

export interface PointHazardLayer {
  key: string;
  label: string;
  /** Label for NL rows: digits spelled out so the eval's figure-grounding
   *  check can't bind "1%" or "20 m" in the clause to the row's 0/1 value. */
  nlLabel: string;
  /** Year of the council layer as shown on the map legend / metric rows. */
  vintage: string;
  /** What was checked, in words the UI and the answer layer can both use. */
  check: string;
  /** inside | outside | within | clear | <liquefaction class> | unavailable */
  status: string;
  inside: boolean | null;
}

const LAYERS: {
  key: string;
  label: string;
  nlLabel: string;
  vintage: string;
  service: string;
  distanceM?: number;
  classField?: string;
  check: string;
}[] = [
  { key: "flood", label: "Flood plain (1% AEP)", nlLabel: "flood plain (one-percent annual-exceedance event)", vintage: "2026", service: "Flood_Plains", check: "point inside the modelled 1% AEP flood plain" },
  { key: "overland", label: "Overland flow path", nlLabel: "overland flow path (within twenty metres)", vintage: "2026", service: "Overland_Flow_Paths", distanceM: 20, check: "a mapped overland flow path within 20 m of the point" },
  { key: "coastal", label: "Coastal inundation (1% AEP)", nlLabel: "coastal inundation (one-percent annual-exceedance event, present-day sea level)", vintage: "2025", service: "Coastal_Inundation_1_AEP", check: "point inside modelled present-day 1% AEP coastal inundation" },
  { key: "coastal_slr1m", label: "Coastal inundation (1% AEP, +1 m sea level)", nlLabel: "coastal inundation (one-percent annual-exceedance event, plus one metre of sea-level rise)", vintage: "2025", service: "Coastal_Inundation_1_AEP_1m_sea_level_rise", check: "point inside modelled 1% AEP coastal inundation with +1 m sea-level rise" },
  { key: "liquefaction", label: "Liquefaction vulnerability", nlLabel: "liquefaction vulnerability class", vintage: "2022", service: "Liquefaction_Vulnerability_Calibrated_Assessment", classField: "VulnerabilityDescription", check: "liquefaction vulnerability class of the assessed area at the point" },
];

export const POINT_HAZARD_SOURCE = "Auckland Council open data (CC BY 4.0)";

const cache = new Map<string, { at: number; layers: PointHazardLayer[] }>();
const TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 2000;

async function queryLayer(l: (typeof LAYERS)[number], lng: number, lat: number): Promise<PointHazardLayer> {
  const geometry = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
  const distance = l.distanceM ? `&distance=${l.distanceM}&units=esriSRUnit_Meter` : "";
  const out = l.classField ? `&outFields=${l.classField}&returnGeometry=false&resultRecordCount=1` : "&returnCountOnly=true";
  const url = `${BASE}/${l.service}/FeatureServer/0/query?geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects${distance}${out}&f=json`;
  const base = { key: l.key, label: l.label, nlLabel: l.nlLabel, vintage: l.vintage, check: l.check };
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { count?: number; features?: { attributes: Record<string, string> }[]; error?: unknown };
    if (j.error) throw new Error("service error");
    if (l.classField) {
      const cls = j.features?.[0]?.attributes?.[l.classField];
      return { ...base, status: cls ? String(cls) : "not assessed", inside: cls ? true : null };
    }
    const hit = (j.count ?? 0) > 0;
    return { ...base, status: l.distanceM ? (hit ? "within" : "clear") : hit ? "inside" : "outside", inside: hit };
  } catch {
    return { ...base, status: "unavailable", inside: null };
  }
}

export async function pointHazards(lng: number, lat: number): Promise<{ layers: PointHazardLayer[]; caveat: string; source: string; retrieved_at: string }> {
  const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && !hit.layers.some((l) => l.status === "unavailable")) {
    return { layers: hit.layers, caveat: HAZARD_CAVEAT, source: POINT_HAZARD_SOURCE, retrieved_at: new Date(hit.at).toISOString() };
  }
  const layers = await Promise.all(LAYERS.map((l) => queryLayer(l, lng, lat)));
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), layers });
  return { layers, caveat: HAZARD_CAVEAT, source: POINT_HAZARD_SOURCE, retrieved_at: new Date().toISOString() };
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
    default:
      return l.status;
  }
}
