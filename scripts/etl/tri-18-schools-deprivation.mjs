/**
 * TRI-18 — ETL: schools + deprivation.
 *
 * Schools: MOE Schools Directory (data.govt.nz CKAN resource, updated nightly,
 * keyless CSV). Filter Regional_Council = Auckland Region. The directory
 * carries Statistical_Area_2_Code directly → geo mapping is a join, plus
 * lat/long for the per-query distance maths. No decile (deprecated) — the
 * directory's EQi_Index exists but is out of scope here.
 *
 * Deprivation: NZDep2018 at SA2 (Otago's weighted-average dataset, mirrored on
 * the Massey ArcGIS service that powers the official webmap; keyless).
 * Vintage note: NZDep2018 uses SA2-2018 codes; our spine is SA2-2023. Exact
 * code match → confidence 'medium' (boundary vintage differs). For 2023 split
 * areas (code XXXX01/02… from parent XXXX00) the parent's value is inherited →
 * confidence 'low'. No match at all → skipped, never faked.
 *
 * Outputs:
 *   data/census/tri18-schools.json      [{moe,name,type,auth,roll,lat,lng,sa2,asof}]
 *   data/census/tri18-deprivation.json  [{g,m,v,d,q}]  (metric rows)
 *
 * Run: node scripts/etl/tri-18-schools-deprivation.mjs
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const curl = (url) =>
  execFileSync("curl", ["-sfL", "--max-time", "120", url], {
    maxBuffer: 256 * 1024 * 1024,
  }).toString("utf8");

// --- 1. Schools --------------------------------------------------------------
const CKAN =
  "https://catalogue.data.govt.nz/api/3/action/resource_show?id=4b292323-9fcc-41f8-814b-3c7b19cf14b3";
const csvUrl = JSON.parse(curl(CKAN)).result.url;
console.log("schools csv:", csvUrl);
const csv = curl(csvUrl).replace(/^﻿/, "");

// Minimal RFC-4180 parser (quoted fields contain commas/newlines).
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const [header, ...records] = parseCsv(csv);
const col = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
const need = ["School_Id","Org_Name","Org_Type","Authority","Regional_Council","Statistical_Area_2_Code","Latitude","Longitude","Total","Roll_Date"];
for (const n of need) if (!(n in col)) throw new Error(`missing column ${n}`);

const schools = records
  .filter((r) => r[col.Regional_Council] === "Auckland Region")
  .map((r) => ({
    moe: r[col.School_Id],
    name: r[col.Org_Name],
    type: r[col.Org_Type] || null,
    auth: r[col.Authority] || null,
    roll: r[col.Total] ? Number(r[col.Total]) : null,
    lat: r[col.Latitude] ? Number(r[col.Latitude]) : null,
    lng: r[col.Longitude] ? Number(r[col.Longitude]) : null,
    sa2: r[col.Statistical_Area_2_Code] || null,
    asof: (r[col.Roll_Date] || "").slice(0, 10) || null,
  }));
console.log(`Auckland schools: ${schools.length}`);
if (schools.length < 400) throw new Error("implausibly few Auckland schools");

// --- 2. NZDep2018 at SA2 ------------------------------------------------------
const MASSEY =
  "https://services6.arcgis.com/ZVM1rEuVZjtC1Wwk/arcgis/rest/services/NZDep2018_WFL1/FeatureServer/2/query";
const dep = new Map(); // SA22018 code -> {decile, score}
for (let offset = 0; ; offset += 2000) {
  const page = JSON.parse(
    curl(`${MASSEY}?where=1%3D1&outFields=SA22018_code,SA2_average_NZDep2018,SA2_average_NZDep2018_score&returnGeometry=false&resultRecordCount=2000&resultOffset=${offset}&f=json`),
  );
  for (const f of page.features) {
    dep.set(f.attributes.SA22018_code, {
      decile: f.attributes.SA2_average_NZDep2018,
      score: f.attributes.SA2_average_NZDep2018_score,
    });
  }
  if (!page.exceededTransferLimit && page.features.length < 2000) break;
}
console.log(`NZDep2018 SA2-2018 rows: ${dep.size}`);

// Our SA2-2023 universe (same source file as TRI-16/17).
const sa2023 = JSON.parse(
  (await import("node:fs")).readFileSync("public/geo/auckland-sa2.geojson", "utf8"),
).features.map((f) => f.properties.SA22023_V1_00);

const depRows = [];
let exact = 0, inherited = 0, missed = 0;
for (const code of sa2023) {
  let hit = dep.get(code), q = "medium";
  if (!hit && !code.endsWith("00")) {
    hit = dep.get(code.slice(0, 4) + "00"); // 2023 split → 2018 parent
    if (hit) q = "low";
  }
  if (!hit || hit.decile == null) { missed++; continue; }
  q === "medium" ? exact++ : inherited++;
  depRows.push({ g: code, m: "nzdep_decile", v: hit.decile, d: "2018-03-06", q });
  if (hit.score != null)
    depRows.push({ g: code, m: "nzdep_score", v: hit.score, d: "2018-03-06", q });
}
console.log(`deprivation: ${exact} exact, ${inherited} parent-inherited, ${missed} unmatched (skipped)`);

// --- Spot checks -------------------------------------------------------------
const ponsonby = depRows.find((r) => r.g === "130400" && r.m === "nzdep_decile");
console.log(`SPOT Ponsonby West decile = ${ponsonby?.v} (expect low, 1-3)`);
const grammarZone = schools.find((s) => /auckland grammar/i.test(s.name));
console.log(`SPOT Auckland Grammar present: ${!!grammarZone} (roll ${grammarZone?.roll})`);

mkdirSync("data/census", { recursive: true });
writeFileSync("data/census/tri18-schools.json", JSON.stringify(schools));
writeFileSync("data/census/tri18-deprivation.json", JSON.stringify(depRows));
console.log(`wrote tri18-schools.json (${schools.length}) + tri18-deprivation.json (${depRows.length})`);
