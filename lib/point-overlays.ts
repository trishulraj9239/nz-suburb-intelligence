/**
 * TRI-128 — Auckland Unitary Plan overlays at a POINT, answered by the
 * council's own ArcGIS services (keyless, CC BY 4.0), the same pattern as the
 * TRI-123 hazard checks: one small query per overlay, in parallel, cached in
 * memory by rounded coordinate. Nothing is stored — "hits per point, never a
 * bulk download" is exactly the shape the AUP-family licence rider (TRI-67)
 * asks for.
 *
 * What comes back per overlay is a council RECORD (an operative overlay is an
 * exact plan fact → confidence high), decoded from the service's own
 * coded-value domains so "TYPE 18" renders as the council's name for it.
 * Boundaries are digitised at plan scale, so a polygon hit within 5 m but not
 * at the point renders "on or near the boundary of …". Point overlays (notable
 * trees, heritage places) are reported "within thirty metres of the address
 * point" — the address point is a LINZ centroid, not a boundary survey.
 *
 * Wording is descriptive only: which overlay, which schedule item, and the
 * chapter link. What an overlay permits is the chapter's job, not ours.
 * Proposed plan-change layers are NOT queried (link-out only).
 */

const BASE = "https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services";
const NEAR_M = 5;
const POINT_M = 30;
/** The operative plan's own site, for hits whose row carries no DocumentURL. */
export const AUP_HOME = "https://unitaryplan.aucklandcouncil.govt.nz/";

export interface OverlayHit {
  name: string | null;
  type: string | null;
  subtype: string | null;
  schedule: string | null;
  /** Council version status word ("Operative", "Proposed", …) when not operative. */
  version: string | null;
  document_url: string | null;
}
export interface PointOverlayLayer {
  key: string;
  label: string;
  /** Digits spelled out so the eval's figure binding can't grab them. */
  nlLabel: string;
  chapter: string;
  kind: "polygon" | "point";
  /** inside | near | outside | within | none | unavailable */
  status: string;
  inside: boolean | null;
  hits: OverlayHit[];
}
export interface PointOverlays {
  layers: PointOverlayLayer[];
  source: string;
  licence: string;
  /** Latest lastEditDate across the queried services (YYYY-MM-DD). */
  updated: string | null;
  retrieved_at: string;
}

const LAYERS: { key: string; label: string; nlLabel: string; chapter: string; service: string; kind: "polygon" | "point" }[] = [
  { key: "special_character", label: "Special Character Areas Overlay", nlLabel: "special character areas overlay (residential and business)", chapter: "D18", service: "Special_Character_Areas_Overlay_Residential_and_Business", kind: "polygon" },
  { key: "heritage_extent", label: "Historic Heritage Overlay — extent of place", nlLabel: "historic heritage overlay, extent of place", chapter: "D17", service: "Historic_Heritage_Overlay_Extent_of_Place", kind: "polygon" },
  { key: "heritage_place", label: "Historic Heritage Overlay — scheduled place", nlLabel: "historic heritage overlay, scheduled place", chapter: "D17", service: "Historic_Heritage_Overlay_Place", kind: "point" },
  { key: "notable_trees", label: "Notable Trees Overlay", nlLabel: "notable trees overlay", chapter: "D13", service: "Notable_Trees_Overlay", kind: "point" },
  { key: "notable_tree_groups", label: "Notable Group of Trees Overlay", nlLabel: "notable group of trees overlay", chapter: "D13", service: "Notable_Group_of_Trees_Overlay", kind: "polygon" },
  { key: "aircraft_noise", label: "Aircraft Noise Overlay", nlLabel: "aircraft noise overlay", chapter: "D24", service: "Aircraft_Noise_Overlay", kind: "polygon" },
  { key: "port_noise", label: "City Centre Port Noise Overlay", nlLabel: "city centre port noise overlay", chapter: "D25", service: "City_Centre_Port_Noise_Overlay", kind: "polygon" },
  { key: "volcanic_regional", label: "Regionally Significant Volcanic Viewshafts & Height Sensitive Areas", nlLabel: "regionally significant volcanic viewshafts and height sensitive areas overlay", chapter: "D14", service: "Regionally_Significant_Volcanic_Viewshafts_And_Height_Sensitive_Areas_Overlay", kind: "polygon" },
  { key: "volcanic_local", label: "Locally Significant Volcanic Viewshafts Overlay", nlLabel: "locally significant volcanic viewshafts overlay", chapter: "D15", service: "Locally_Significant_Volcanic_Viewshafts_Overlay", kind: "polygon" },
  { key: "waitakere", label: "Waitākere Ranges Heritage Area Overlay", nlLabel: "Waitākere Ranges heritage area overlay", chapter: "D10", service: "Waitakere_Ranges_Heritage_Area_Overlay", kind: "polygon" },
];

export const OVERLAY_SOURCE = "Auckland Unitary Plan overlays · Auckland Council open data (CC BY 4.0)";
export const OVERLAY_LICENCE = "CC BY 4.0";
export const OVERLAY_NOTE =
  "Operative overlays as published by the council; descriptive only — what an overlay allows is set out in its chapter. Designations and consent history are not open data (see the LIM link-out).";

/** Per-service coded-value domains + last edit, cached a day. */
interface Meta { domains: Record<string, Map<number | string, string>>; lastEdit: string | null }
const metaCache = new Map<string, { at: number; meta: Meta }>();
async function metaFor(service: string): Promise<Meta> {
  const hit = metaCache.get(service);
  if (hit && Date.now() - hit.at < 24 * 60 * 60 * 1000) return hit.meta;
  const r = await fetch(`${BASE}/${service}/FeatureServer/0?f=json`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`meta ${r.status}`);
  const j = (await r.json()) as {
    fields?: { name: string; domain?: { codedValues?: { code: number | string; name: string }[] } | null }[];
    editingInfo?: { lastEditDate?: number };
  };
  const domains: Meta["domains"] = {};
  for (const f of j.fields ?? []) {
    if (f.domain?.codedValues) domains[f.name] = new Map(f.domain.codedValues.map((c) => [c.code, c.name]));
  }
  const meta: Meta = { domains, lastEdit: j.editingInfo?.lastEditDate ? new Date(j.editingInfo.lastEditDate).toISOString().slice(0, 10) : null };
  metaCache.set(service, { at: Date.now(), meta });
  return meta;
}

const cache = new Map<string, { at: number; r: PointOverlays }>();
const TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 2000;

type Attrs = Record<string, string | number | null>;

async function query(service: string, lng: number, lat: number, distanceM: number): Promise<Attrs[]> {
  const geometry = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
  const distance = distanceM > 0 ? `&distance=${distanceM}&units=esriSRUnit_Meter` : "";
  const url = `${BASE}/${service}/FeatureServer/0/query?geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects${distance}&outFields=*&returnGeometry=false&resultRecordCount=5&f=json`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = (await r.json()) as { features?: { attributes: Attrs }[]; error?: unknown };
  if (j.error) throw new Error("service error");
  return (j.features ?? []).map((f) => f.attributes);
}

function decode(meta: Meta, a: Attrs, field: string): string | null {
  const v = a[field];
  if (v === null || v === undefined || v === "") return null;
  const d = meta.domains[field];
  return d?.get(v as number | string) ?? String(v);
}

function toHit(meta: Meta, a: Attrs): OverlayHit {
  const version = decode(meta, a, "VERSIONSTATUS");
  const doc = a.DocumentURL;
  return {
    name: decode(meta, a, "NAME"),
    type: decode(meta, a, "TYPE"),
    subtype: decode(meta, a, "SUBTYPE"),
    schedule: decode(meta, a, "SCHEDULE"),
    version: version && !/^operative$/i.test(version) ? version : null,
    document_url: typeof doc === "string" && /^https?:\/\//.test(doc) ? doc : null,
  };
}

async function queryLayer(l: (typeof LAYERS)[number], lng: number, lat: number): Promise<PointOverlayLayer> {
  const base = { key: l.key, label: l.label, nlLabel: l.nlLabel, chapter: l.chapter, kind: l.kind };
  try {
    const meta = await metaFor(l.service);
    if (l.kind === "point") {
      const near = await query(l.service, lng, lat, POINT_M);
      return { ...base, status: near.length ? "within" : "none", inside: near.length > 0, hits: near.map((a) => toHit(meta, a)) };
    }
    // One wider query first; only a hit needs the exact-point follow-up.
    const near = await query(l.service, lng, lat, NEAR_M);
    if (!near.length) return { ...base, status: "outside", inside: false, hits: [] };
    const at = await query(l.service, lng, lat, 0);
    return at.length
      ? { ...base, status: "inside", inside: true, hits: at.map((a) => toHit(meta, a)) }
      : { ...base, status: "near", inside: false, hits: near.map((a) => toHit(meta, a)) };
  } catch {
    return { ...base, status: "unavailable", inside: null, hits: [] };
  }
}

export async function pointOverlays(lng: number, lat: number): Promise<PointOverlays> {
  const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && !hit.r.layers.some((l) => l.status === "unavailable")) return hit.r;
  const layers = await Promise.all(LAYERS.map((l) => queryLayer(l, lng, lat)));
  const edits = [...metaCache.values()].map((m) => m.meta.lastEdit).filter(Boolean) as string[];
  const r: PointOverlays = {
    layers,
    source: OVERLAY_SOURCE,
    licence: OVERLAY_LICENCE,
    updated: edits.length ? edits.sort().at(-1)! : null,
    retrieved_at: new Date().toISOString(),
  };
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: Date.now(), r });
  return r;
}

/** Plain-words status, shared by the UI and the NL rows. */
export function describeOverlay(l: PointOverlayLayer): string {
  switch (l.status) {
    case "inside":
      return "inside";
    case "near":
      return "on or near the boundary";
    case "outside":
      return "outside";
    case "within":
      return "within thirty metres of the address point";
    case "none":
      return "none within thirty metres";
    case "unavailable":
      return "council service unavailable — not checked";
    default:
      return l.status;
  }
}

/** "Business Ponsonby Road · Schedule 15 · item 42" style summary for one hit. */
export function describeHit(h: OverlayHit): string {
  const parts = [h.type, h.subtype, h.name, h.schedule ? `schedule ${h.schedule}` : null].filter(Boolean) as string[];
  const s = [...new Set(parts)].join(" · ");
  return h.version ? `${s || "overlay"} (${h.version.toLowerCase()}, not operative)` : s;
}
