/**
 * TRI-117 — NZDep2023 at SA2 → deprivation metric rows (second vintage).
 *
 * Source: University of Otago HIRP, NZDep2023 Index of Socioeconomic
 * Deprivation (Atkinson, Salmond, Crampton, Viggers, Lacey; 31 Oct 2024),
 * SA2 weighted-average file (NZDep2023_WgtAvSA2), read from the same
 * Massey/EHINZ "Healthspace" ArcGIS feature service that powers the official
 * webmap and that TRI-18 used for NZDep2018 — keyless, public. Otago's own
 * download page sits behind a Cloudflare challenge that automated fetches
 * cannot (and must not) pass; the mirror carries the identical SA2 table.
 * Spike + licence record: docs/spikes/tri-117-nzdep2023.md.
 *
 * Geography: NZDep2023 is built on SA2-2023 codes — a DIRECT join to the
 * app's spine, so every matched row is confidence 'high' (exact published
 * value). No parent-code inheritance (the TRI-18 'low' rule) is needed or
 * used. SA2s with no NZDep2023 value (oceanic / no population) are skipped,
 * never faked; NZDep2018 rows are kept as the earlier vintage so the profile
 * renders a 2018→2023 delta and ranks use the latest vintage (TRI-64).
 *
 * Output: data/census/tri117-nzdep2023.json — [{ g, m, c:null, v, d, cf }]
 *   d = 2023-03-07 (Census 2023 day; the index is a census product).
 * Loaded server-side via scripts/etl/tri-117-nzdep2023.sql (http_get pattern).
 *
 * Run: node scripts/etl/tri-117-nzdep2023.mjs   (no key needed)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SERVICE =
  "https://services6.arcgis.com/ZVM1rEuVZjtC1Wwk/arcgis/rest/services/New_Zealand_Index_of_Deprivation_2023_WFL1/FeatureServer/1/query";
const AS_OF = "2023-03-07";
const OUT = "data/census/tri117-nzdep2023.json";

// --- 1. Pull the national SA2 table (2,292 rows, paged at 2000) -------------
const dep = new Map(); // SA22023 code -> { name, decile, score }
for (let offset = 0; ; offset += 2000) {
  const url =
    `${SERVICE}?where=1%3D1&outFields=SA22023_code,SA22023_name,SA2_average_NZDep2023,SA2_average_NZDep2023_score` +
    `&returnGeometry=false&resultRecordCount=2000&resultOffset=${offset}&f=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NZDep2023 service HTTP ${res.status}`);
  const page = await res.json();
  if (page.error) throw new Error(`NZDep2023 service error: ${JSON.stringify(page.error)}`);
  for (const f of page.features) {
    const a = f.attributes;
    dep.set(String(a.SA22023_code), {
      name: a.SA22023_name,
      decile: a.SA2_average_NZDep2023,
      score: a.SA2_average_NZDep2023_score,
    });
  }
  if (!page.exceededTransferLimit && page.features.length < 2000) break;
}
console.log(`NZDep2023 SA2-2023 rows: ${dep.size}`);
if (dep.size < 2200) throw new Error("implausibly few SA2 rows — service changed?");

// --- 2. Join to the Auckland SA2-2023 universe (same file as TRI-16/17/18) --
const sa2023 = JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8")).features.map(
  (f) => String(f.properties.SA22023_V1_00),
);

const rows = [];
let matched = 0;
const nullValue = [], missing = [];
for (const code of sa2023) {
  const hit = dep.get(code);
  if (!hit) { missing.push(code); continue; }
  if (hit.decile == null) { nullValue.push(`${code} ${hit.name}`); continue; }
  if (!(hit.decile >= 1 && hit.decile <= 10)) throw new Error(`decile out of range for ${code}: ${hit.decile}`);
  matched++;
  rows.push({ g: code, m: "nzdep_decile", c: null, v: hit.decile, d: AS_OF, cf: "high" });
  if (hit.score != null) rows.push({ g: code, m: "nzdep_score", c: null, v: hit.score, d: AS_OF, cf: "high" });
}
console.log(`Auckland SA2s: ${sa2023.length} · matched ${matched} · null value ${nullValue.length} · not in file ${missing.length}`);
if (nullValue.length) console.log("  null (no population / not indexed):", nullValue.join("; "));
if (missing.length) console.log("  not in NZDep2023 SA2 file:", missing.join(", "));
if (matched < 600) throw new Error("implausibly few Auckland matches");

// --- 3. Spot checks + 2018→2023 movement summary (for the spike doc) --------
const ponsonby = rows.find((r) => r.g === "130400" && r.m === "nzdep_decile");
console.log(`SPOT Ponsonby West (130400) NZDep2023 decile = ${ponsonby?.v} (expect low-ish, 1-4)`);

try {
  const prev = JSON.parse(readFileSync("data/census/tri18-deprivation.json", "utf8"));
  const prevDecile = new Map(prev.filter((r) => r.m === "nzdep_decile").map((r) => [r.g, r.v]));
  const moves = {};
  let compared = 0;
  for (const r of rows) {
    if (r.m !== "nzdep_decile" || !prevDecile.has(r.g)) continue;
    compared++;
    const delta = r.v - prevDecile.get(r.g);
    moves[delta] = (moves[delta] ?? 0) + 1;
  }
  console.log(`2018→2023 decile change over ${compared} suburbs (delta: count):`, JSON.stringify(moves));
} catch {
  console.log("(no tri18-deprivation.json to compare against)");
}

const dist = {};
for (const r of rows) if (r.m === "nzdep_decile") dist[r.v] = (dist[r.v] ?? 0) + 1;
console.log("NZDep2023 decile distribution (Auckland):", JSON.stringify(dist));

// --- 4. Write ----------------------------------------------------------------
mkdirSync("data/census", { recursive: true });
writeFileSync(OUT, JSON.stringify(rows));
console.log(`wrote ${OUT} (${rows.length} rows)`);
