/**
 * TRI-68 — hazard + zoning intersection engine (local turf.js, no PostGIS).
 *
 * Streams each audited layer ONCE in pages from the council's ArcGIS REST
 * (curl, not node-fetch: undici drops connections against this host — same
 * class of problem as the ADE gateway, see tri-17), assigns features to
 * candidate SA2s via a local bbox grid index, clips with turf, accumulates.
 *
 * CRITICAL: pages are fetched as native Esri JSON (f=json) and converted with
 * @terraformer/arcgis — this org's f=geojson endpoint FLATTENS interior rings
 * into filled polygon parts (verified: coastal OBJECTID 2359 has 3 outer
 * rings + 675 holes in f=json, but 678 hole-less parts in f=geojson), which
 * silently fills every hole and inflated island suburbs to 100% coastal
 * inundation. Never use f=geojson on services1.arcgis.com/n4yPwebTjJCmXB6W
 * for polygon layers.
 *
 * NOTE — refinement of TRI-67 decision 6: sign-off chose "per-SA2 envelope
 * fetches"; measured reality was ~22 s per SA2 (node-fetch instability +
 * 627 spatial queries × 7 layers ≈ days). Paged whole-layer streaming keeps
 * the decision's actual properties — no monolithic multi-GB blob in memory or
 * on disk, resumable, gitignored intermediates — with ~25-590 requests per
 * layer instead of 627. Recorded in the spike doc.
 *
 * Metrics (decisions locked at TRI-67 sign-off):
 *   flood_plain_pct, coastal_inundation_pct, coastal_inundation_slr1m_pct,
 *   heritage_overlay_pct         — % of SA2 polygon geodesic area
 *   liquefaction_share           — breakdown km² per vulnerability class + Total
 *   overland_flow_density        — clipped path km ÷ SA2 area km²
 *   zoning_share (+ intensification_capacity_indicator) — breakdown km² per
 *                                  zone bucket + Total; (MHU+THAB)/residential %
 *
 * Coastal layers only: maxAllowableOffset ≈ 1 m server-side generalization —
 * the raw coastline polygons are GB-scale; a 1 m tolerance changes suburb-level
 * area shares by ≪0.1% and is recorded here and in the spike doc.
 *
 * as_of = the service's live lastEditDate. confidence = 'medium' (derived).
 * Resume: data/hazards/state-<layer>.json stores the accumulator + next page.
 *
 * Run per layer, then assemble:
 *   node scripts/etl/tri-68-hazard-metrics.mjs heritage|liquefaction|coastal|
 *        coastal_slr1m|flood|zones|overland
 *   node scripts/etl/tri-68-hazard-metrics.mjs assemble
 *     → data/hazards/tri68-hazard-metrics.json  ({g,m,c,v,d,cf} rows)
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as turf from "@turf/turf";
import pkg from "@terraformer/arcgis";
const { arcgisToGeoJSON } = pkg;

const BASE = "https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services";

const LAYERS = {
  flood: { service: "Flood_Plains", kind: "poly", metric: "flood_plain_pct", page: 300 },
  coastal: {
    service: "Coastal_Inundation_1_AEP",
    kind: "poly",
    metric: "coastal_inundation_pct",
    page: 10,
    offsetDeg: 0.00001, // ≈1 m generalization — see header
  },
  coastal_slr1m: {
    service: "Coastal_Inundation_1_AEP_1m_sea_level_rise",
    kind: "poly",
    metric: "coastal_inundation_slr1m_pct",
    page: 10,
    offsetDeg: 0.00001,
  },
  heritage: { service: "Historic_Heritage_Overlay_Extent_of_Place", kind: "poly", metric: "heritage_overlay_pct", page: 2000 },
  liquefaction: {
    service: "Liquefaction_Vulnerability_Calibrated_Assessment",
    kind: "poly-class",
    metric: "liquefaction_share",
    classField: "VulnerabilityDescription",
    page: 200,
  },
  overland: { service: "Overland_Flow_Paths", kind: "line", metric: "overland_flow_density", page: 2000 },
  zones: { service: "Unitary_Plan_Base_Zone", kind: "poly-zone", metric: "zoning_share", zoneField: "ZONE", page: 2000 },
};

const arg = process.argv[2];
if (!arg || (!(arg in LAYERS) && arg !== "assemble")) {
  console.error(`usage: node tri-68-hazard-metrics.mjs <${Object.keys(LAYERS).join("|")}|assemble>`);
  process.exit(1);
}

// --- Active-SA2 universe (M3 is_active rule) via curl ------------------------
const env = readFileSync(".env.local", "utf8");
const SUPA = env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m)?.[1]?.trim();
const ANON = env.match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim();
if (!SUPA || !ANON) throw new Error("Supabase env missing from .env.local");

function curlJson(url, headers = [], attempt = 0) {
  try {
    const args = ["-sf", "--max-time", "300", url];
    for (const h of headers) args.push("-H", h);
    return JSON.parse(execFileSync("curl", args, { maxBuffer: 1024 * 1024 * 1024 }).toString("utf8"));
  } catch (e) {
    if (attempt < 4) {
      const wait = 3000 * (attempt + 1);
      execFileSync(process.platform === "win32" ? "ping" : "sleep", process.platform === "win32" ? ["-n", String(Math.ceil(wait / 1000) + 1), "127.0.0.1"] : [String(wait / 1000)], { stdio: "ignore" });
      return curlJson(url, headers, attempt + 1);
    }
    throw e;
  }
}

const active = curlJson(
  `${SUPA}/rest/v1/geographies?select=sa2_code&geo_type=eq.SA2&is_active=eq.true&limit=1000`,
  [`apikey: ${ANON}`, `Authorization: Bearer ${ANON}`],
);
const activeCodes = new Set(active.map((r) => r.sa2_code));

const geo = JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8"));
const sa2s = geo.features
  .filter((f) => activeCodes.has(String(f.properties.SA22023_V1_00)))
  .map((f) => ({
    code: String(f.properties.SA22023_V1_00),
    name: f.properties.SA22023_V1_00_NAME,
    feature: f,
    bbox: turf.bbox(f),
    areaKm2: turf.area(f) / 1e6,
  }));
console.log(`active SA2s: ${sa2s.length} (of ${geo.features.length} in geojson)`);

// --- bbox grid index over SA2s (cell ≈ 2 km) ---------------------------------
const CELL = 0.02;
const grid = new Map();
const cellKey = (x, y) => `${x}|${y}`;
for (let i = 0; i < sa2s.length; i++) {
  const [xmin, ymin, xmax, ymax] = sa2s[i].bbox;
  for (let x = Math.floor(xmin / CELL); x <= Math.floor(xmax / CELL); x++)
    for (let y = Math.floor(ymin / CELL); y <= Math.floor(ymax / CELL); y++) {
      const k = cellKey(x, y);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
}
function candidatesFor(bbox) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const set = new Set();
  for (let x = Math.floor(xmin / CELL); x <= Math.floor(xmax / CELL); x++)
    for (let y = Math.floor(ymin / CELL); y <= Math.floor(ymax / CELL); y++)
      for (const i of grid.get(cellKey(x, y)) ?? []) set.add(i);
  // exact bbox overlap filter
  return [...set].filter((i) => {
    const b = sa2s[i].bbox;
    return xmin <= b[2] && xmax >= b[0] && ymin <= b[3] && ymax >= b[1];
  });
}

// --- geometry helpers --------------------------------------------------------
function intersectAreaKm2(sa2Feature, feature, failures) {
  try {
    const clipped = turf.intersect(turf.featureCollection([sa2Feature, feature]));
    return clipped ? turf.area(clipped) / 1e6 : 0;
  } catch {
    try {
      const clipped = turf.intersect(turf.featureCollection([sa2Feature, turf.cleanCoords(feature)]));
      return clipped ? turf.area(clipped) / 1e6 : 0;
    } catch {
      failures.count++;
      return 0;
    }
  }
}

function clippedLineKm(sa2, line, failures) {
  try {
    // Fast path: line bbox fully inside the SA2 bbox and all three probe
    // points inside the polygon → take the whole length without splitting.
    const lb = turf.bbox(line);
    const inside = (pt) => turf.booleanPointInPolygon(pt, sa2.feature);
    const coords = turf.getCoords(line);
    const flat = line.geometry.type === "MultiLineString" ? coords.flat() : coords;
    if (
      lb[0] >= sa2.bbox[0] && lb[1] >= sa2.bbox[1] && lb[2] <= sa2.bbox[2] && lb[3] <= sa2.bbox[3] &&
      inside(flat[0]) && inside(flat[Math.floor(flat.length / 2)]) && inside(flat[flat.length - 1])
    ) {
      return turf.length(line, { units: "kilometers" });
    }
    let pieces;
    try {
      pieces = turf.lineSplit(line, sa2.feature).features;
    } catch {
      pieces = [];
    }
    if (!pieces.length) pieces = [line];
    let km = 0;
    for (const p of pieces) {
      const len = turf.length(p, { units: "kilometers" });
      const mid = turf.along(p, len / 2, { units: "kilometers" });
      if (turf.booleanPointInPolygon(mid, sa2.feature)) km += len;
    }
    return km;
  } catch {
    failures.count++;
    return 0;
  }
}

function bucketOfZoneName(name) {
  if (name === "Residential - Single House Zone") return "Single House";
  if (name === "Residential - Mixed Housing Suburban Zone") return "Mixed Housing Suburban";
  if (name === "Residential - Mixed Housing Urban Zone") return "Mixed Housing Urban";
  if (name === "Residential - Terrace Housing and Apartment Building Zone") return "Terrace Housing & Apartments";
  if (name.startsWith("Business")) return "Business";
  if (name.startsWith("Rural") || name.startsWith("Open Space")) return "Rural & Open Space";
  return "Other";
}
const INTENSIVE = new Set(["Mixed Housing Urban", "Terrace Housing & Apartments"]);

// --- assemble ----------------------------------------------------------------
mkdirSync("data/hazards", { recursive: true });
if (arg === "assemble") {
  const rows = [];
  for (const key of Object.keys(LAYERS)) {
    const path = `data/hazards/result-${key}.json`;
    if (!existsSync(path)) throw new Error(`missing result for layer '${key}' — run it first`);
    rows.push(...JSON.parse(readFileSync(path, "utf8")));
  }
  const byMetric = {};
  for (const r of rows) byMetric[r.m] = (byMetric[r.m] ?? 0) + 1;
  console.log("rows by metric:", byMetric, "total:", rows.length);
  writeFileSync("data/hazards/tri68-hazard-metrics.json", JSON.stringify(rows));
  console.log(`wrote data/hazards/tri68-hazard-metrics.json (${rows.length} rows)`);
  process.exit(0);
}

// --- per-layer streaming run -------------------------------------------------
const layer = LAYERS[arg];
const statePath = `data/hazards/state-${arg}.json`;
const state = existsSync(statePath)
  ? JSON.parse(readFileSync(statePath, "utf8"))
  : { offset: 0, acc: {}, failures: 0, features: 0 };

const info = curlJson(`${BASE}/${layer.service}/FeatureServer/0?f=json`);
const asOf = info.editingInfo?.lastEditDate
  ? new Date(info.editingInfo.lastEditDate).toISOString().slice(0, 10)
  : new Date().toISOString().slice(0, 10);
const zoneDomain =
  layer.kind === "poly-zone"
    ? new Map(info.fields.find((f) => f.name === layer.zoneField).domain.codedValues.map((cv) => [cv.code, cv.name]))
    : null;
console.log(`layer ${arg} (${layer.service}): as_of ${asOf}; resuming at offset ${state.offset}`);

const failures = { count: state.failures };
const accFor = (code) => (state.acc[code] ??= {});

for (;;) {
  const url =
    `${BASE}/${layer.service}/FeatureServer/0/query?where=1%3D1&outFields=*` +
    `&outSR=4326&geometryPrecision=6&resultOffset=${state.offset}&resultRecordCount=${layer.page}` +
    (layer.offsetDeg ? `&maxAllowableOffset=${layer.offsetDeg}` : "") +
    `&f=json`;
  const page = curlJson(url);
  const raw = page.features ?? [];
  if (!raw.length) break;
  // Esri JSON → GeoJSON with correct ring/hole assignment (see header).
  const feats = raw
    .filter((f) => f.geometry)
    .map((f) => ({ type: "Feature", properties: f.attributes ?? {}, geometry: arcgisToGeoJSON(f.geometry) }));

  for (const f of feats) {
    if (!f.geometry) continue;
    const fb = turf.bbox(f);
    for (const i of candidatesFor(fb)) {
      const sa2 = sa2s[i];
      const a = accFor(sa2.code);
      if (layer.kind === "poly") {
        a.inter = (a.inter ?? 0) + intersectAreaKm2(sa2.feature, f, failures);
      } else if (layer.kind === "poly-class") {
        const cls = f.properties?.[layer.classField] ?? "Unclassified";
        const km2 = intersectAreaKm2(sa2.feature, f, failures);
        if (km2 > 0) (a.byClass ??= {})[cls] = (a.byClass?.[cls] ?? 0) + km2;
      } else if (layer.kind === "line") {
        a.km = (a.km ?? 0) + clippedLineKm(sa2, f, failures);
      } else if (layer.kind === "poly-zone") {
        const zoneName = zoneDomain.get(f.properties?.[layer.zoneField]) ?? "Other";
        const km2 = intersectAreaKm2(sa2.feature, f, failures);
        if (km2 > 0) {
          const bucket = bucketOfZoneName(zoneName);
          (a.byBucket ??= {})[bucket] = (a.byBucket?.[bucket] ?? 0) + km2;
          if (zoneName.startsWith("Residential -")) {
            a.residential = (a.residential ?? 0) + km2;
            if (INTENSIVE.has(bucket)) a.intensive = (a.intensive ?? 0) + km2;
          }
        }
      }
    }
  }

  state.offset += raw.length;
  state.features += raw.length;
  state.failures = failures.count;
  writeFileSync(statePath, JSON.stringify(state));
  console.log(`  offset ${state.offset} (+${raw.length}); failures ${failures.count}`);
  if (!(page.exceededTransferLimit || raw.length === layer.page)) break;
}

// --- emit rows ---------------------------------------------------------------
const rows = [];
const push = (g, m, c, v) => rows.push({ g, m, c, v, d: asOf, cf: "medium" });
for (const sa2 of sa2s) {
  const a = state.acc[sa2.code];
  if (layer.kind === "poly") {
    push(sa2.code, layer.metric, null, Math.min(100, +((100 * (a?.inter ?? 0)) / sa2.areaKm2).toFixed(2)));
  } else if (layer.kind === "line") {
    push(sa2.code, layer.metric, null, +((a?.km ?? 0) / sa2.areaKm2).toFixed(2));
  } else if (layer.kind === "poly-class") {
    if (!a?.byClass) continue; // no assessed area in this SA2 → row absence
    let total = 0;
    for (const [cls, km2] of Object.entries(a.byClass)) {
      total += km2;
      push(sa2.code, layer.metric, cls, +km2.toFixed(4));
    }
    push(sa2.code, layer.metric, "Total", +total.toFixed(4));
  } else if (layer.kind === "poly-zone") {
    if (!a?.byBucket) continue;
    let total = 0;
    for (const [bucket, km2] of Object.entries(a.byBucket)) {
      total += km2;
      push(sa2.code, layer.metric, bucket, +km2.toFixed(4));
    }
    push(sa2.code, layer.metric, "Total", +total.toFixed(4));
    if (a.residential > 0)
      push(sa2.code, "intensification_capacity_indicator", null, +((100 * (a.intensive ?? 0)) / a.residential).toFixed(1));
  }
}
writeFileSync(`data/hazards/result-${arg}.json`, JSON.stringify(rows));
console.log(
  `layer ${arg} complete: ${state.features} features streamed, ${failures.count} intersect failures, ${rows.length} rows → data/hazards/result-${arg}.json`,
);
