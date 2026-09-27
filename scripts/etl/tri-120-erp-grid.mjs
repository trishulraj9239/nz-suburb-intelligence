/**
 * TRI-120 — Stats NZ 250 m Estimated Resident Population grid → annual
 * post-census population estimates per SA2 (30 June 2022–2025).
 *
 * Source: "New Zealand Estimated Resident Population Grid 250 metre"
 * (datafinder layer 119709, published 2026-06-25), read from Stats NZ
 * Geospatial's ArcGIS Online mirror `NZGrid_250m_ERP` (keyless, CC BY 4.0;
 * our STATS_NZ_API_KEY has no datafinder WFS scope). 201,693 cells nationally,
 * fields PopEst2022..PopEst2025 (30 June each year; 2022/2023 final, 2024/2025
 * provisional — Stats NZ says the grids are a customised dataset, NOT official
 * statistics). Cells are 250 m squares derived from SA1 estimates.
 *
 * Method — AREA-WEIGHTED apportionment: every cell polygon intersecting the
 * Auckland envelope (~34k) is intersected with the SA2 polygons it overlaps
 * (public/geo/auckland-sa2.geojson); each SA2 receives the cell's population
 * × (intersection area ÷ cell area), assuming uniform density within a cell.
 * A whole-cell-by-centroid rule was tried first and over-assigned small SA2s
 * by up to 2× (a 250 m cell is a large share of a 0.5 km² suburb), so it
 * was dropped. Population in the part of a cell outside every SA2 (coast,
 * region edge) is not counted.
 *
 * Metrics (dimension people, confidence 'medium' — estimated, apportioned,
 * and provisional for the last two years):
 *   population_estimate        count, as_of 2022-06-30 … 2025-06-30
 *   population_growth_2y_pct   % change 2023 → 2025, as_of 2025-06-30
 * Sanity: the 2023 ERP sums are compared with Census 2023 counts (TRI-17
 * artifact); ERP normally sits a few % above census (undercount correction,
 * residents temporarily overseas). Large per-SA2 drift is printed.
 *
 * Output: data/census/tri120-erp-grid.json — [{ g, m, c:null, v, d, cf }]
 * Loaded via scripts/etl/tri-120-erp-grid.sql (http_get pattern).
 *
 * Run: node scripts/etl/tri-120-erp-grid.mjs   (no key needed; ~2 min)
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as turf from "@turf/turf";
import { loadSa2Index } from "./lib/sa2-point.mjs";

// Fast path: if all four corners of a cell fall in the same SA2 the cell is
// (for a generalised polygon, near enough) wholly inside it — no polygon
// intersection needed. Only boundary cells pay for turf.intersect.
const sa2For = loadSa2Index();

const SERVICE = "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services/NZGrid_250m_ERP/FeatureServer/1/query";
const YEARS = [2022, 2023, 2024, 2025];
const AS_OF = (y) => `${y}-06-30`;
const OUT = "data/census/tri120-erp-grid.json";
const PAGE = 2000;
const ENVELOPE = { xmin: 173.9, ymin: -37.36, xmax: 175.65, ymax: -35.95, spatialReference: { wkid: 4326 } }; // TRI-44 box

// --- SA2 polygons with bboxes -----------------------------------------------
const sa2 = JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8")).features.map((f) => ({
  code: String(f.properties.SA22023_V1_00),
  f,
  bbox: turf.bbox(f),
}));
const overlaps = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

// --- pull cells with geometry ----------------------------------------------
const sums = new Map(); // sa2 -> { year: n }
let cells = 0, whole = 0, split = 0, none = 0, geomErr = 0, popOutside = 0;
const add = (g, f, w) => {
  const s = sums.get(g) ?? Object.fromEntries(YEARS.map((y) => [y, 0]));
  for (const y of YEARS) s[y] += Number(f.attributes[`PopEst${y}`] ?? 0) * w;
  sums.set(g, s);
};

// Cells are cached as JSONL in gitignored tmp/ (the fetch is ~10 minutes and
// the service drops connections now and then); delete the file to refetch.
const CACHE = "tmp/erp-grid/cells-250m.jsonl";
mkdirSync("tmp/erp-grid", { recursive: true });
async function* cellPages() {
  if (existsSync(`${CACHE}.done`)) {
    console.log(`reading cached cells from ${CACHE}`);
    const feats = readFileSync(CACHE, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    for (let i = 0; i < feats.length; i += PAGE) yield { features: feats.slice(i, i + PAGE) };
    return;
  }
  writeFileSync(CACHE, "");
  for (let offset = 0; ; offset += PAGE) {
    const url =
      `${SERVICE}?where=1%3D1&geometry=${encodeURIComponent(JSON.stringify(ENVELOPE))}` +
      `&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects` +
      `&outFields=GridID,${YEARS.map((y) => `PopEst${y}`).join(",")}&returnGeometry=true&outSR=4326` +
      `&resultRecordCount=${PAGE}&resultOffset=${offset}&f=json`;
    let page;
    for (let attempt = 0; ; attempt++) {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`ERP grid HTTP ${r.status}`);
        page = await r.json();
        break;
      } catch (e) {
        if (attempt >= 4) throw e;
        console.warn(`  page ${offset}: ${e.message ?? e} — retry in ${10 * (attempt + 1)} s`);
        await new Promise((res) => setTimeout(res, 10_000 * (attempt + 1)));
      }
    }
    if (page.error) throw new Error(`ArcGIS error: ${JSON.stringify(page.error)}`);
    if (page.features.length) appendFileSync(CACHE, page.features.map((f) => JSON.stringify(f)).join("\n") + "\n");
    yield page;
    if (!page.exceededTransferLimit && page.features.length < PAGE) break;
  }
  writeFileSync(`${CACHE}.done`, new Date().toISOString());
}

for await (const page of cellPages()) {
  for (const f of page.features) {
    cells++;
    const rings = f.geometry?.rings;
    if (!rings?.length) { geomErr++; continue; }
    const cell = turf.polygon(rings);
    const cb = turf.bbox(cell);
    const corners = [[cb[0], cb[1]], [cb[2], cb[1]], [cb[2], cb[3]], [cb[0], cb[3]], [(cb[0] + cb[2]) / 2, (cb[1] + cb[3]) / 2]].map(([x, y]) => sa2For(x, y));
    if (corners[0] && corners.every((c) => c === corners[0])) { whole++; add(corners[0], f, 1); continue; }
    if (corners.every((c) => c === null)) { none++; popOutside += Number(f.attributes.PopEst2025 ?? 0); continue; }
    const cands = sa2.filter((s) => overlaps(cb, s.bbox));
    if (!cands.length) { none++; popOutside += Number(f.attributes.PopEst2025 ?? 0); continue; }
    const cellArea = turf.area(cell);
    let assigned = 0;
    const parts = [];
    for (const s of cands) {
      let inter = null;
      try { inter = turf.intersect(turf.featureCollection([cell, s.f])); } catch { geomErr++; continue; }
      if (!inter) continue;
      const a = turf.area(inter);
      if (a <= 0) continue;
      parts.push([s.code, a / cellArea]);
      assigned += a / cellArea;
    }
    if (!parts.length) { none++; popOutside += Number(f.attributes.PopEst2025 ?? 0); continue; }
    if (parts.length === 1 && assigned > 0.999) { whole++; add(parts[0][0], f, 1); continue; }
    split++;
    for (const [g, w] of parts) add(g, f, Math.min(w, 1));
    if (assigned < 1) popOutside += Number(f.attributes.PopEst2025 ?? 0) * (1 - Math.min(assigned, 1));
  }
  console.log(`  cells ${cells}`);
}
console.log(`cells ${cells}: whole-in-one-SA2 ${whole}, split ${split}, outside ${none}, geometry errors ${geomErr}; 2025 population left outside the SA2 set ≈ ${Math.round(popOutside)}`);
if (cells < 20000) throw new Error("implausibly few cells — service changed?");

// --- confidence: compare the 2023 estimate with the Census 2023 count ------
// The grid is uniform-density within a 250 m cell, so a sparse SA2 next to a
// dense one (an industrial block beside apartments) inherits population it
// doesn't have. Region-wide ERP sits ~6 % above census by design; where a
// single SA2's 2023 estimate is more than 35 % away from its census count the
// apportionment is clearly the cause, and every row for that SA2 is marked
// confidence 'low' (kept, never hidden — the chip carries the warning).
const census = JSON.parse(readFileSync("data/census/tri17-metric-values.json", "utf8"));
const cens23 = new Map(census.filter((r) => r.m === "population" && r.d === "2023-03-07").map((r) => [r.g, r.v]));
const LOW_BAND = [0.65, 1.4];
const lowConf = new Set();
let erpTot = 0, cenTot = 0, n = 0;
for (const [g, s] of sums) {
  const c = cens23.get(g);
  if (!c) continue;
  n++; erpTot += s[2023]; cenTot += c;
  const ratio = c > 0 ? s[2023] / c : null;
  if (ratio !== null && (ratio < LOW_BAND[0] || ratio > LOW_BAND[1])) lowConf.add(g);
}
console.log(`sanity 2023: ERP ${Math.round(erpTot)} vs Census ${cenTot} over ${n} SA2s (ratio ${(erpTot / cenTot).toFixed(3)}); ${lowConf.size} SA2s outside ×${LOW_BAND[0]}–×${LOW_BAND[1]} of census → confidence low`);

// --- rows ---------------------------------------------------------------------
const rows = [];
for (const [g, s] of sums) {
  const cf = lowConf.has(g) ? "low" : "medium";
  for (const y of YEARS) rows.push({ g, m: "population_estimate", c: null, v: Math.round(s[y]), d: AS_OF(y), cf });
  if (s[2023] >= 100) {
    rows.push({ g, m: "population_growth_2y_pct", c: null, v: +(((s[2025] - s[2023]) / s[2023]) * 100).toFixed(1), d: AS_OF(2025), cf });
  }
}
const pw = sums.get("130400");
console.log(`SPOT Ponsonby West: ${YEARS.map((y) => `${y} ${Math.round(pw?.[y] ?? 0)}`).join(" · ")} (census 2023: ${cens23.get("130400")})`);
const growth = rows.filter((r) => r.m === "population_growth_2y_pct").sort((a, b) => b.v - a.v);
console.log(`fastest 2023→2025: ${growth.slice(0, 3).map((r) => `${r.g} ${r.v}%`).join(", ")} · slowest: ${growth.slice(-3).map((r) => `${r.g} ${r.v}%`).join(", ")}`);

mkdirSync("data/census", { recursive: true });
writeFileSync(OUT, JSON.stringify(rows));
console.log(`wrote ${OUT} (${rows.length} rows)`);
