/**
 * TRI-44 — LINZ NZ Addresses (layer 105689) → Auckland clip → addresses table.
 *
 * Downloads the layer via LDS WFS paging over an Auckland bounding box, then
 * assigns each address an SA2 by point-in-polygon against the same polygons
 * the map bundles (public/geo/auckland-sa2.geojson). Addresses that land in
 * none of our 633 SA2s (bbox spill into Waikato/Northland) are DROPPED — the
 * SA2 join IS the Auckland clip. Decision locked 2026-07-31: full Auckland,
 * not a residential-mesh clip (workplaces are commute destinations).
 *
 * NOTE: needs a LINZ Data Service key (data.linz.govt.nz — separate from the
 * Basemaps key) as LINZ_LDS_API_KEY in .env.local. The NEXT_PUBLIC_LINZ_API_KEY
 * basemaps key has no LDS layer scope (verified 2026-07-31).
 *
 * Output: data/addresses/tri44-addresses-NN.json parts (≤75k rows each) of
 *   [{ i: linz address_id, a: full_address, s: suburb_locality, t: town_city,
 *      x: lng, y: lat, g: sa2_code }]
 * Loaded via the http-extension pattern (TRI-17 notes), upsert on linz_id.
 *
 * Run: node scripts/etl/tri-44-linz-addresses.mjs
 */

import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const KEY = env.match(/^LINZ_LDS_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("LINZ_LDS_API_KEY missing from .env.local — create a free key at data.linz.govt.nz (My account → API keys, 'Full access to LINZ Data Service data' scope)");

const LAYER = "layer-123113"; // NZ Addresses (105689 is a deprecated older id)
const BBOX = "173.9,-37.36,175.65,-35.95,EPSG:4326"; // generous Auckland box; SA2 join does the real clip
const PAGE = 20000;
const PART = 75000;

// --- SA2 polygons → bbox-indexed ray-cast ----------------------------------
const geo = JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8"));
const polys = geo.features.map((f) => {
  const rings =
    f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of rings)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
  return { code: f.properties.SA22023_V1_00, rings, minX, minY, maxX, maxY };
});

function inRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Polygon = outer ring minus holes; MultiPolygon = any part.
function sa2For(x, y) {
  for (const p of polys) {
    if (x < p.minX || x > p.maxX || y < p.minY || y > p.maxY) continue;
    for (const poly of p.rings) {
      if (!inRing(x, y, poly[0])) continue;
      if (poly.slice(1).some((hole) => inRing(x, y, hole))) continue;
      return p.code;
    }
  }
  return null;
}

// --- WFS paged download -----------------------------------------------------
async function page(startIndex, attempt = 0) {
  const url =
    `https://data.linz.govt.nz/services;key=${KEY}/wfs?service=WFS&version=2.0.0` +
    `&request=GetFeature&typeNames=${LAYER}&outputFormat=application/json` +
    `&srsName=EPSG:4326&bbox=${BBOX}&count=${PAGE}&startIndex=${startIndex}`;
  const r = await fetch(url);
  if (!r.ok) {
    if (attempt < 3) {
      console.warn(`  page ${startIndex}: ${r.status} — retrying in 15 s`);
      await new Promise((res) => setTimeout(res, 15_000));
      return page(startIndex, attempt + 1);
    }
    throw new Error(`WFS page ${startIndex} failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
  return r.json();
}

// Checkpointed download: each page appends its kept rows as JSONL and records
// the next startIndex, so a killed run resumes instead of starting over.
const CKPT = "data/addresses/.tri44-checkpoint.jsonl";
mkdirSync("data/addresses", { recursive: true });

const rows = [];
let kept = 0, dropped = 0, start = 0;
if (existsSync(CKPT)) {
  for (const line of readFileSync(CKPT, "utf8").split("\n")) {
    if (!line) continue;
    const o = JSON.parse(line);
    if (o._next !== undefined) { start = o._next; dropped = o._dropped; }
    else rows.push(o);
  }
  kept = rows.length;
  console.log(`resuming from checkpoint: ${kept} rows, startIndex ${start}`);
}

for (;;) {
  const fc = await page(start);
  const feats = fc.features ?? [];
  if (!feats.length) break;
  const pageLines = [];
  for (const f of feats) {
    const [x, y] = f.geometry.coordinates;
    const g = sa2For(x, y);
    if (!g) { dropped++; continue; }
    const p = f.properties;
    const row = {
      i: p.address_id,
      a: p.full_address,
      s: p.suburb_locality ?? null,
      t: p.town_city ?? null,
      x: +x.toFixed(6),
      y: +y.toFixed(6),
      g,
    };
    rows.push(row);
    pageLines.push(JSON.stringify(row));
    kept++;
  }
  start += feats.length;
  pageLines.push(JSON.stringify({ _next: start, _dropped: dropped }));
  appendFileSync(CKPT, pageLines.join("\n") + "\n");
  console.log(`  fetched ${start} — kept ${kept}, outside SA2s ${dropped}`);
  if (feats.length < PAGE) break;
}

// --- Chunked artifacts ------------------------------------------------------
const parts = Math.ceil(rows.length / PART);
for (let n = 0; n < parts; n++) {
  const name = `data/addresses/tri44-addresses-${String(n + 1).padStart(2, "0")}.json`;
  writeFileSync(name, JSON.stringify(rows.slice(n * PART, (n + 1) * PART)));
  console.log(`wrote ${name}`);
}
rmSync(CKPT, { force: true });
console.log(`${kept} Auckland addresses in ${parts} parts (${dropped} outside the SA2 set)`);
