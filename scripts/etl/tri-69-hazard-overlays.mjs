/**
 * TRI-69 — simplified hazard overlays → public/geo/hazards/*.geojson.
 *
 * Re-streams the audited polygon layers from the council ArcGIS REST with
 * aggressive SERVER-side generalization (maxAllowableOffset ≈ 10-20 m — these
 * are map overlays, not analysis inputs; TRI-68 metrics used the full-detail
 * geometry), then simplifies locally (turf, topology-per-feature) up a
 * tolerance ladder until the layer fits the ≤1 MB target. HARD FAIL above
 * 2 MB. Micro-polygons below MIN_AREA_M2 are dropped — invisible at region
 * zoom and the main size cost.
 *
 * TRI-68 rules still apply: curl not fetch (undici drops connections on this
 * host), f=json + @terraformer/arcgis (f=geojson silently fills interior
 * rings on this org — NEVER use it for polygons).
 *
 * Liquefaction: overlay carries ONLY the elevated class ("Liquefaction
 * Damage is Possible", server-side WHERE). The full 5-class breakdown stays
 * in the profile metric; shading 70% of the region "very low" would bury the
 * signal. Overland flow paths (1.18M polylines) have no overlay — density
 * metric only (TRI-67 decision).
 *
 * Raw generalized pages are cached in data/hazards/overlay-raw-<layer>.json
 * (gitignored) so tolerance iteration never refetches; delete the cache to
 * force a refresh. Run per layer, no arg = all:
 *   node scripts/etl/tri-69-hazard-overlays.mjs [flood|coastal|coastal_slr1m|liquefaction|heritage]
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import * as turf from "@turf/turf";
import pkg from "@terraformer/arcgis";
const { arcgisToGeoJSON } = pkg;

const BASE = "https://services1.arcgis.com/n4yPwebTjJCmXB6W/arcgis/rest/services";
const TARGET_BYTES = 1_000_000;
const FAIL_BYTES = 2_000_000;

// Ladder rungs escalate BOTH simplify tolerance (degrees) and the minimum
// area of an individual polygon PART (m²). Part-level filtering is the real
// size lever on the water layers: their features are MultiPolygons with
// thousands of tiny cells, so vertex tolerance alone plateaus (measured:
// flood stuck at ~14.5 MB across the whole tolerance range before this).
const LAYERS = {
  flood: {
    service: "Flood_Plains",
    offsetDeg: 0.0002, // ≈18 m server-side
    page: 500,
    ladder: [
      { tol: 0.0005, minPart: 5000 },
      { tol: 0.001, minPart: 10000 },
      { tol: 0.002, minPart: 20000 },
      { tol: 0.003, minPart: 40000 },
    ],
  },
  // Coastal layers include the OPEN-SEA storm-tide surface (one ~6,400 km²
  // marine polygon whose holes are the islands — the TRI-68 ring-saga
  // geometry). Fine for land-clipped metrics, but as an overlay it paints
  // the whole gulf. clipToLand intersects every part with the SA2 polygons
  // (TRI-68 bbox-grid technique) so only on-land inundation ships.
  coastal: {
    service: "Coastal_Inundation_1_AEP",
    offsetDeg: 0.0002,
    page: 100,
    clipToLand: true,
    ladder: [
      { tol: 0.0005, minPart: 5000 },
      { tol: 0.001, minPart: 10000 },
      { tol: 0.002, minPart: 20000 },
      { tol: 0.003, minPart: 40000 },
    ],
  },
  coastal_slr1m: {
    service: "Coastal_Inundation_1_AEP_1m_sea_level_rise",
    offsetDeg: 0.0002,
    page: 100,
    clipToLand: true,
    ladder: [
      { tol: 0.0005, minPart: 5000 },
      { tol: 0.001, minPart: 10000 },
      { tol: 0.002, minPart: 20000 },
      { tol: 0.003, minPart: 40000 },
    ],
  },
  liquefaction: {
    service: "Liquefaction_Vulnerability_Calibrated_Assessment",
    where: "VulnerabilityDescription='Liquefaction Damage is Possible'",
    offsetDeg: 0.0002,
    page: 500,
    ladder: [
      { tol: 0, minPart: 5000 },
      { tol: 0.0005, minPart: 10000 },
      { tol: 0.001, minPart: 20000 },
    ],
  },
  heritage: {
    service: "Historic_Heritage_Overlay_Extent_of_Place",
    offsetDeg: 0.00005, // ≈5 m — small precise polygons, keep shape
    page: 2000,
    ladder: [
      { tol: 0, minPart: 500 },
      { tol: 0.0001, minPart: 500 },
      { tol: 0.0002, minPart: 1000 },
    ],
  },
};

const arg = process.argv[2];
const keys = arg ? [arg] : Object.keys(LAYERS);
if (arg && !(arg in LAYERS)) {
  console.error(`usage: node tri-69-hazard-overlays.mjs [${Object.keys(LAYERS).join("|")}]`);
  process.exit(1);
}

function curlJson(url, attempt = 0) {
  try {
    return JSON.parse(
      execFileSync("curl", ["-sf", "--max-time", "300", url], { maxBuffer: 1024 * 1024 * 1024 }).toString("utf8"),
    );
  } catch (e) {
    if (attempt < 4) {
      execFileSync(process.platform === "win32" ? "ping" : "sleep",
        process.platform === "win32" ? ["-n", String(3 * (attempt + 1) + 1), "127.0.0.1"] : [String(3 * (attempt + 1))],
        { stdio: "ignore" });
      return curlJson(url, attempt + 1);
    }
    throw e;
  }
}

mkdirSync("data/hazards", { recursive: true });
mkdirSync("public/geo/hazards", { recursive: true });

// --- SA2 land mask for clipToLand layers (TRI-68 bbox-grid technique) --------
const CELL = 0.02;
let sa2s = null;
let grid = null;
function loadLandMask() {
  if (sa2s) return;
  const geo = JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8"));
  // Water-classified SA2s (Oceanic …, Inlet …) are NOT land — some are even
  // is_active in the DB (Inlet Waitemata Harbour). Leaving them in the mask
  // puts the whole gulf surface back into the "clipped" output.
  const land = geo.features.filter(
    (f) => !/^(Oceanic|Inlets?)\b/i.test(String(f.properties.SA22023_V1_00_NAME ?? "")),
  );
  // Simplify the mask itself (~80 m): clipped pieces trace the mask boundary,
  // so full-detail SA2 coastlines re-inflate every piece (measured: ~3 MB
  // plateau on coastal without this). Overlay furniture tolerates it.
  sa2s = land.map((raw) => {
    let f = raw;
    try {
      f = turf.simplify(raw, { tolerance: 0.0008, highQuality: false, mutate: false });
    } catch {
      /* keep full detail for degenerate polygons */
    }
    return { feature: f, bbox: turf.bbox(f) };
  });
  grid = new Map();
  const keyOf = (x, y) => `${x}|${y}`;
  for (let i = 0; i < sa2s.length; i++) {
    const [xmin, ymin, xmax, ymax] = sa2s[i].bbox;
    for (let x = Math.floor(xmin / CELL); x <= Math.floor(xmax / CELL); x++)
      for (let y = Math.floor(ymin / CELL); y <= Math.floor(ymax / CELL); y++) {
        const k = keyOf(x, y);
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(i);
      }
  }
}
function landCandidates(bbox) {
  const [xmin, ymin, xmax, ymax] = bbox;
  const set = new Set();
  for (let x = Math.floor(xmin / CELL); x <= Math.floor(xmax / CELL); x++)
    for (let y = Math.floor(ymin / CELL); y <= Math.floor(ymax / CELL); y++)
      for (const i of grid.get(`${x}|${y}`) ?? []) set.add(i);
  return [...set].filter((i) => {
    const b = sa2s[i].bbox;
    return xmin <= b[2] && xmax >= b[0] && ymin <= b[3] && ymax >= b[1];
  });
}
// Clip one Feature to suburb land; returns an array of Polygon-part features.
function clipFeatureToLand(feature) {
  const parts = [];
  for (const i of landCandidates(turf.bbox(feature))) {
    try {
      const clipped = turf.intersect(turf.featureCollection([sa2s[i].feature, feature]));
      if (!clipped) continue;
      const polys =
        clipped.geometry.type === "MultiPolygon" ? clipped.geometry.coordinates : [clipped.geometry.coordinates];
      for (const rings of polys) parts.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rings } });
    } catch {
      /* degenerate intersection — skip this suburb's sliver */
    }
  }
  return parts;
}

for (const key of keys) {
  const layer = LAYERS[key];
  const rawPath = `data/hazards/overlay-raw-${key}.json`;

  // --- fetch (server-generalized), cached + resumable ------------------------
  let feats;
  if (existsSync(rawPath)) {
    feats = JSON.parse(readFileSync(rawPath, "utf8"));
    console.log(`${key}: raw cache hit (${feats.length} features)`);
  } else {
    feats = [];
    let offset = 0;
    for (;;) {
      const url =
        `${BASE}/${layer.service}/FeatureServer/0/query?where=${encodeURIComponent(layer.where ?? "1=1")}` +
        `&outFields=&returnGeometry=true&outSR=4326&geometryPrecision=5` +
        `&maxAllowableOffset=${layer.offsetDeg}&resultOffset=${offset}&resultRecordCount=${layer.page}&f=json`;
      const page = curlJson(url);
      const raw = page.features ?? [];
      if (!raw.length) break;
      for (const f of raw) {
        if (!f.geometry) continue;
        const g = arcgisToGeoJSON(f.geometry);
        if (g && (g.type === "Polygon" || g.type === "MultiPolygon")) feats.push(g);
      }
      offset += raw.length;
      process.stdout.write(`  ${key}: fetched ${offset}\r`);
      if (!(page.exceededTransferLimit || raw.length === layer.page)) break;
    }
    console.log(`\n${key}: ${feats.length} polygon features fetched`);
    writeFileSync(rawPath, JSON.stringify(feats));
  }

  // --- simplify up the {tolerance, minPart} ladder until ≤ target ------------
  const q4 = (n) => Math.round(n * 1e4) / 1e4; // ≈11 m grid — overlay-adequate
  const quantizeRing = (ring) => {
    const out = [];
    for (const [x, y] of ring) {
      const p = [q4(x), q4(y)];
      const last = out[out.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
    }
    // re-close the ring if rounding collapsed the closing vertex
    if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1]))
      out.push([out[0][0], out[0][1]]);
    return out.length >= 4 ? out : null;
  };

  let out = null;
  let usedRung = null;
  for (const rung of layer.ladder) {
    const parts = []; // every polygon part that survives, as its own Feature
    for (const g of feats) {
      let geom = g;
      if (rung.tol > 0) {
        try {
          geom = turf.simplify({ type: "Feature", properties: {}, geometry: g }, {
            tolerance: rung.tol,
            highQuality: false,
            mutate: false,
          }).geometry;
        } catch {
          geom = g; // keep original when simplify degenerates
        }
      }
      let pieces;
      if (layer.clipToLand) {
        loadLandMask();
        pieces = clipFeatureToLand({ type: "Feature", properties: {}, geometry: geom }).map(
          (f) => f.geometry.coordinates,
        );
      } else {
        pieces = geom.type === "MultiPolygon" ? geom.coordinates : [geom.coordinates];
      }
      for (const rings of pieces) {
        const qRings = rings.map(quantizeRing).filter(Boolean);
        if (!qRings.length) continue;
        const feature = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: qRings } };
        try {
          if (turf.area(feature) < rung.minPart) continue;
        } catch {
          continue;
        }
        parts.push(feature);
      }
    }
    const fc = JSON.stringify({ type: "FeatureCollection", features: parts });
    console.log(`  ${key}: tol ${rung.tol} minPart ${rung.minPart} → ${parts.length} parts, ${(fc.length / 1024).toFixed(0)} KB`);
    out = fc;
    usedRung = rung;
    if (fc.length <= TARGET_BYTES) break;
  }
  if (out.length > FAIL_BYTES) {
    throw new Error(`${key}: ${(out.length / 1024).toFixed(0)} KB still > 2 MB after max tolerance — raise ladder/minArea`);
  }
  if (out.length > TARGET_BYTES) {
    console.warn(`  ${key}: over the 1 MB target (${(out.length / 1024).toFixed(0)} KB) but under the 2 MB gate — shipping`);
  }
  const outPath = `public/geo/hazards/${key}.geojson`;
  writeFileSync(outPath, out);
  console.log(
    `  ${key}: wrote ${outPath} (${(statSync(outPath).size / 1024).toFixed(0)} KB, tol ${usedRung.tol}, minPart ${usedRung.minPart} m²)`,
  );
}
