/**
 * TRI-138 — LINZ NZ Addresses incremental refresh via LDS WFS changesets.
 *
 * The full Auckland load (TRI-44, 2026-07-31, 725,981 rows) is refreshed by
 * pulling only what changed: the LDS `layer-123113-changeset` feature type
 * returns the NET difference between two instants (one row per address_id,
 * `__change__` = INSERT | UPDATE | DELETE) for `viewparams=from:<iso>;to:<iso>`.
 * Verified 2026-09-27: 21,291 changes in the Auckland box since the July load
 * (777 D / 3,343 I / 17,171 U), all is_land, lifecycle Current bar 6 Proposed.
 *
 * Rules (mirror TRI-44 exactly so the table stays one consistent clip):
 *   - INSERT/UPDATE → point-in-SA2 over public/geo/auckland-sa2.geojson; a
 *     point outside our 633 SA2s is NOT an Auckland address for us → emitted
 *     as a delete (the row may exist from an earlier position; harmless if not).
 *   - DELETE → delete by address_id.
 *   - No lifecycle / is_land filtering (TRI-44 kept everything in the clip).
 *   - Ids must be unique in one changeset (net diff); the script fails loudly
 *     if the service ever returns duplicates rather than guessing an order.
 *
 * State: data/addresses/tri138-state.json { from } — the `to` of the last
 * applied changeset. Committed with the artifact so the next run picks up
 * exactly where this one stopped. A small overlap is harmless (upserts are
 * idempotent), a gap is not — never hand-edit `from` forward.
 *
 * Output: data/addresses/tri138-changeset.json
 *   { from, to, fetched_at, deletes: [linz_id…],
 *     upserts: [{ i, a, s, t, x, y, g }…] }   (row shape = TRI-44 artifact)
 * Loaded via scripts/etl/tri-138-address-changeset.sql (http_get pattern).
 *
 * Run: node scripts/etl/tri-138-address-changeset.mjs   (LINZ_LDS_API_KEY in .env.local)
 *      --dry  fetch + classify + report, write nothing
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { loadSa2Index } from "./lib/sa2-point.mjs";

const env = readFileSync(".env.local", "utf8");
const KEY = env.match(/^LINZ_LDS_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("LINZ_LDS_API_KEY missing from .env.local");

const LAYER = "layer-123113"; // NZ Addresses
const BBOX = "173.9,-37.36,175.65,-35.95,EPSG:4326"; // same generous box as TRI-44
const PAGE = 10000;
const STATE = "data/addresses/tri138-state.json";
const OUT = "data/addresses/tri138-changeset.json";
const DRY = process.argv.includes("--dry");

const state = existsSync(STATE)
  ? JSON.parse(readFileSync(STATE, "utf8"))
  : { from: "2026-07-31T00:00:00Z", note: "TRI-44 full load date" };
const from = state.from;
// `to` is fixed before the first page so every page sees the same window.
const to = new Date().toISOString().slice(0, 19) + "Z";
console.log(`changeset window: from ${from} to ${to}`);

const sa2For = loadSa2Index();

async function page(startIndex, attempt = 0) {
  const url =
    `https://data.linz.govt.nz/services;key=${KEY}/wfs?service=WFS&version=2.0.0` +
    `&request=GetFeature&typeNames=${LAYER}-changeset&outputFormat=application/json` +
    `&srsName=EPSG:4326&viewparams=from:${from};to:${to}&bbox=${BBOX}` +
    `&count=${PAGE}&startIndex=${startIndex}`;
  const r = await fetch(url);
  if (!r.ok) {
    if (attempt < 3) {
      console.warn(`  page ${startIndex}: ${r.status} — retrying in 15 s`);
      await new Promise((res) => setTimeout(res, 15_000));
      return page(startIndex, attempt + 1);
    }
    throw new Error(`changeset page ${startIndex} failed: ${r.status} ${(await r.text()).slice(0, 300)}`);
  }
  return r.json();
}

const deletes = new Set();
const upserts = new Map();
const seen = new Set();
const tally = { INSERT: 0, UPDATE: 0, DELETE: 0, outside: 0, other: 0 };
let start = 0;
for (;;) {
  const fc = await page(start);
  const feats = fc.features ?? [];
  if (!feats.length) break;
  for (const f of feats) {
    const p = f.properties;
    const id = p.address_id;
    if (seen.has(id)) throw new Error(`address_id ${id} appears twice in one changeset — expected a net diff`);
    seen.add(id);
    const change = String(p.__change__ ?? "").toUpperCase();
    if (change === "DELETE") {
      tally.DELETE++;
      deletes.add(id);
      continue;
    }
    if (change !== "INSERT" && change !== "UPDATE") {
      tally.other++;
      throw new Error(`unknown __change__ value ${p.__change__} for ${id}`);
    }
    tally[change]++;
    const coords = f.geometry?.coordinates;
    if (!coords) throw new Error(`no geometry on ${change} row ${id}`);
    const [x, y] = coords;
    const g = sa2For(x, y);
    if (!g) {
      tally.outside++;
      deletes.add(id); // moved/lives outside the Auckland SA2 set → not ours
      continue;
    }
    upserts.set(id, {
      i: id,
      a: p.full_address,
      s: p.suburb_locality ?? null,
      t: p.town_city ?? null,
      x: +x.toFixed(6),
      y: +y.toFixed(6),
      g,
    });
  }
  start += feats.length;
  console.log(`  fetched ${start}`);
  if (feats.length < PAGE) break;
}

console.log(
  `changes: ${seen.size} (INSERT ${tally.INSERT}, UPDATE ${tally.UPDATE}, DELETE ${tally.DELETE}; ` +
    `${tally.outside} insert/update rows fall outside the SA2 set → treated as deletes)`,
);
console.log(`→ ${upserts.size} upserts, ${deletes.size} deletes`);

// Spot rows for the ticket comment / post-load geocode check.
const sample = [...upserts.values()].filter((r) => /Road|Street|Avenue/.test(r.a)).slice(0, 3);
for (const r of sample) console.log(`  sample upsert: ${r.a} → SA2 ${r.g}`);

if (DRY) {
  console.log("--dry: nothing written");
  process.exit(0);
}

mkdirSync("data/addresses", { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify({ from, to, fetched_at: new Date().toISOString(), deletes: [...deletes], upserts: [...upserts.values()] }),
);
writeFileSync(STATE, JSON.stringify({ from: to, previous_from: from, applied_by: "tri-138-address-changeset.sql", updated_at: new Date().toISOString() }, null, 2) + "\n");
console.log(`wrote ${OUT} and advanced ${STATE} to from=${to}`);
