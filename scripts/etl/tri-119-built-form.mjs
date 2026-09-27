/**
 * TRI-119 — built form per SA2 from LINZ Building Outlines + Property
 * Boundaries: footprint coverage, buildings per hectare, median property size.
 *
 * Sources (LINZ Data Service, CC BY 4.0, key LINZ_LDS_API_KEY):
 *   layer 101290 NZ Building Outlines   — roof outlines ≥ 10 m² from aerial
 *     imagery (capture_source_from/to = imagery dates); 768k in the Auckland box.
 *   layer 122657 NZ Property Boundaries — rating units / titles / parcels,
 *     with LINZ's own `area` (m²); 725k with territorial_authority = Auckland.
 * Land area per SA2: Stats NZ LAND_AREA_SQ_KM (the TRI-118 change layer on
 * Stats NZ Geospatial's ArcGIS mirror, keyless).
 *
 * Method: stream each layer through paged WFS (20k/page, checkpointed as
 * JSONL in gitignored tmp/built-form/ so a killed run resumes), assign every
 * feature to the SA2 containing its centre (buildings) / point-on-surface
 * (properties) via the TRI-44 point-in-SA2 rule, and aggregate:
 *   building_footprint_pct   Σ footprint area ÷ SA2 land area × 100   (medium)
 *   buildings_per_ha         building count ÷ SA2 land area in ha      (medium)
 *   median_property_m2       median LINZ `area` of rating units, all property
 *                            types (residential, commercial, reserves…)  (high:
 *                            exact published areas; the SA2 assignment is the
 *                            only approximation)
 * Footprint area is computed from the polygon (turf.area, EPSG:4326 →
 * geodesic). A building straddling an SA2 edge is counted wholly in the SA2
 * holding its centre — at building scale this is negligible.
 *
 * as_of: buildings 2026-05-18 (layer publish; imagery 2024–2025 for most of
 * Auckland), properties 2026-09-24 (layer publish; weekly-refreshed layer).
 *
 * Output: data/built-form/tri119-built-form.json — [{ g, m, c:null, v, d, cf }]
 * Loaded via scripts/etl/tri-119-built-form.sql (http_get pattern).
 *
 * Run: node scripts/etl/tri-119-built-form.mjs            (~1 h first time)
 *      node scripts/etl/tri-119-built-form.mjs --aggregate (skip downloads, reuse tmp)
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as turf from "@turf/turf";
import { loadSa2Index } from "./lib/sa2-point.mjs";

const env = readFileSync(".env.local", "utf8");
const KEY = env.match(/^LINZ_LDS_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("LINZ_LDS_API_KEY missing from .env.local");

const BBOX = "173.9,-37.36,175.65,-35.95,EPSG:4326"; // TRI-44 box; SA2 join does the real clip
const PAGE = 20000;
const TMP = "tmp/built-form";
const OUT = "data/built-form/tri119-built-form.json";
const AS_OF = { buildings: "2026-05-18", properties: "2026-09-24" };
const AGGREGATE_ONLY = process.argv.includes("--aggregate");

const sa2For = loadSa2Index();
mkdirSync(TMP, { recursive: true });

async function wfsPage(layer, startIndex, extra, attempt = 0) {
  const url =
    `https://data.linz.govt.nz/services;key=${KEY}/wfs?service=WFS&version=2.0.0&request=GetFeature` +
    `&typeNames=layer-${layer}&outputFormat=application/json&srsName=EPSG:4326&bbox=${BBOX}` +
    `&count=${PAGE}&startIndex=${startIndex}${extra}`;
  const r = await fetch(url);
  if (!r.ok) {
    if (attempt < 4) {
      console.warn(`  layer ${layer} page ${startIndex}: HTTP ${r.status} — retry in 20 s`);
      await new Promise((res) => setTimeout(res, 20_000));
      return wfsPage(layer, startIndex, extra, attempt + 1);
    }
    throw new Error(`WFS layer ${layer} page ${startIndex}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  }
  return r.json();
}

/** Stream a layer to a JSONL checkpoint of per-feature reduced rows. */
async function download(name, layer, extra, reduce) {
  const ckpt = `${TMP}/${name}.jsonl`;
  const done = `${TMP}/${name}.done`;
  if (existsSync(done)) { console.log(`${name}: complete checkpoint reused`); return; }
  let start = 0;
  if (existsSync(ckpt)) {
    for (const line of readFileSync(ckpt, "utf8").split("\n")) {
      if (line.startsWith('{"_next"')) start = JSON.parse(line)._next;
    }
    console.log(`${name}: resuming at startIndex ${start}`);
  }
  for (;;) {
    const fc = await wfsPage(layer, start, extra);
    const feats = fc.features ?? [];
    if (!feats.length) break;
    const lines = [];
    for (const f of feats) {
      const row = reduce(f);
      if (row) lines.push(JSON.stringify(row));
    }
    start += feats.length;
    lines.push(JSON.stringify({ _next: start }));
    appendFileSync(ckpt, lines.join("\n") + "\n");
    console.log(`  ${name}: ${start} fetched`);
    if (feats.length < PAGE) break;
  }
  writeFileSync(done, new Date().toISOString());
}

// Reduced rows: { g: sa2, a: area_m2 } — everything else is discarded at fetch time.
const reduceBuilding = (f) => {
  if (!f.geometry) return null;
  const c = turf.centroid(f).geometry.coordinates;
  const g = sa2For(c[0], c[1]);
  if (!g) return null;
  return { g, a: Math.round(turf.area(f)) };
};
const reduceProperty = (f) => {
  if (!f.geometry) return null;
  let p;
  try { p = turf.pointOnFeature(f).geometry.coordinates; } catch { return null; }
  const g = sa2For(p[0], p[1]);
  if (!g) return null;
  const a = Number(f.properties.area);
  return Number.isFinite(a) && a > 0 ? { g, a: Math.round(a) } : null;
};

if (!AGGREGATE_ONLY) {
  await download("buildings", 101290, "&propertyName=building_id,shape", reduceBuilding);
  await download("properties", 122657, "&propertyName=source_id,area,geom", reduceProperty);
}

// --- land area per SA2 (Stats NZ, via the TRI-118 change layer) ------------
const LAND_SVC = "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services/2023_Census_change_in_occupied_and_unoccupied_private_dwellings_by_SA2/FeatureServer/0/query";
const land = new Map();
for (let offset = 0; ; offset += 2000) {
  const r = await fetch(`${LAND_SVC}?where=1%3D1&outFields=SA22023_V1_00,LAND_AREA_SQ_KM&returnGeometry=false&resultRecordCount=2000&resultOffset=${offset}&f=json`);
  const page = await r.json();
  for (const f of page.features) land.set(String(f.attributes.SA22023_V1_00), Number(f.attributes.LAND_AREA_SQ_KM));
  if (!page.exceededTransferLimit && page.features.length < 2000) break;
}

// --- aggregate --------------------------------------------------------------
const readRows = (name) =>
  readFileSync(`${TMP}/${name}.jsonl`, "utf8").split("\n").filter((l) => l && !l.startsWith('{"_next"')).map((l) => JSON.parse(l));
const buildings = readRows("buildings");
const properties = readRows("properties");
console.log(`aggregating ${buildings.length} buildings, ${properties.length} properties`);

const bAgg = new Map();
for (const b of buildings) {
  const s = bAgg.get(b.g) ?? { n: 0, area: 0 };
  s.n++; s.area += b.a;
  bAgg.set(b.g, s);
}
const pAgg = new Map();
for (const p of properties) (pAgg.get(p.g) ?? pAgg.set(p.g, []).get(p.g)).push(p.a);

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const rows = [];
let skippedLand = 0;
for (const [g, s] of bAgg) {
  const km2 = land.get(g);
  if (!(km2 > 0.01)) { skippedLand++; continue; }
  rows.push({ g, m: "building_footprint_pct", c: null, v: +((s.area / (km2 * 1e6)) * 100).toFixed(1), d: AS_OF.buildings, cf: "medium" });
  rows.push({ g, m: "buildings_per_ha", c: null, v: +(s.n / (km2 * 100)).toFixed(2), d: AS_OF.buildings, cf: "medium" });
}
for (const [g, areas] of pAgg) {
  if (areas.length < 20) continue; // too few rating units for a meaningful median
  rows.push({ g, m: "median_property_m2", c: null, v: Math.round(median(areas)), d: AS_OF.properties, cf: "high" });
}

const spot = (g, m) => rows.find((r) => r.g === g && r.m === m)?.v;
console.log(`rows ${rows.length} (${skippedLand} SA2s without land area skipped)`);
for (const [g, n] of [["130400", "Ponsonby West"], ["130500", "Ponsonby East"], ["117003", "Milldale"]]) {
  console.log(`  SPOT ${n}: footprint ${spot(g, "building_footprint_pct")}% · ${spot(g, "buildings_per_ha")} buildings/ha · median property ${spot(g, "median_property_m2")} m²`);
}
mkdirSync("data/built-form", { recursive: true });
writeFileSync(OUT, JSON.stringify(rows));
console.log(`wrote ${OUT}`);
