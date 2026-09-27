/**
 * TRI-121 — LINZ NZ Suburbs and Localities → suburb names, aliases and the
 * suburb ↔ SA2 overlap table, plus a tiny label layer for the map.
 *
 * Why: people say "Grey Lynn", the app's spine says "Grey Lynn West". LINZ
 * layer 113764 is the official suburb/locality polygon set (with `additional_name`
 * aliases — "Grey Lynn / Arch Hill", "Kingsland / Mt Albert"), so the planner
 * and the search box can resolve a real suburb name to the SA2s it covers.
 *
 * Source: LINZ Data Service layer 113764 (CC BY 4.0, weekly-ish updates, PK
 * `id`), WFS filtered to territorial_authority = 'Auckland' and type IN
 * ('Suburb','Locality') — Coastal Bay / Island / Lake features are place
 * names, not neighbourhoods (verified 2026-09-27: 794 Auckland features →
 * 210 suburbs + 66 localities).
 *
 * Overlap: for each suburb polygon and each of our 633 SA2 polygons
 * (public/geo/auckland-sa2.geojson, generalised) compute the intersection
 * area. Keep a pair when it covers ≥ SHARE_MIN of the SA2 *or* of the suburb,
 * so slivers from generalised boundaries don't attach. Both shares are
 * stored; nothing is aggregated — a multi-SA2 suburb resolves to its list.
 *
 * Outputs:
 *   data/suburbs/tri121-suburbs.json      [{ i, n, na, al[], t, mj, pop, x, y }]
 *   data/suburbs/tri121-suburb-sa2.json   [{ i, g, ss (share of SA2), sb (share of suburb) }]
 *   public/geo/auckland-suburb-labels.geojson   Point per suburb/locality (map labels)
 * Loaded via supabase/migrations/0010_suburbs.sql (DDL) + scripts/etl/tri-121-suburbs.sql (data).
 *
 * Run: node scripts/etl/tri-121-suburbs.mjs   (LINZ_LDS_API_KEY in .env.local)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import * as turf from "@turf/turf";

const env = readFileSync(".env.local", "utf8");
const KEY = env.match(/^LINZ_LDS_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("LINZ_LDS_API_KEY missing from .env.local");

const SHARE_MIN = 0.2;
const url =
  `https://data.linz.govt.nz/services;key=${KEY}/wfs?service=WFS&version=2.0.0&request=GetFeature` +
  `&typeNames=layer-113764&outputFormat=json&srsName=EPSG:4326` +
  `&cql_filter=${encodeURIComponent("territorial_authority='Auckland' AND type IN ('Suburb','Locality')")}`;
const res = await fetch(url);
if (!res.ok) throw new Error(`LDS WFS ${res.status}: ${(await res.text()).slice(0, 300)}`);
const fc = await res.json();
const places = fc.features;
console.log(`LINZ suburbs/localities (Auckland): ${places.length}`);
if (places.length < 250) throw new Error("implausibly few places — filter or service changed?");

const sa2 = JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8")).features.map((f) => ({
  code: String(f.properties.SA22023_V1_00),
  name: f.properties.SA22023_V1_00_NAME,
  f,
  bbox: turf.bbox(f),
  area: turf.area(f),
}));

const bboxOverlap = (a, b) => !(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]);

const suburbs = [], links = [], labels = [];
let pairsTried = 0, invalid = 0;
for (const f of places) {
  const p = f.properties;
  const aliases = (p.additional_name ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s.toLowerCase() !== p.name.toLowerCase());
  const centre = turf.centerOfMass(f).geometry.coordinates;
  const area = turf.area(f);
  suburbs.push({
    i: p.id, n: p.name, na: p.name_ascii ?? null, al: aliases, t: p.type, mj: p.major_name ?? null,
    pop: p.population_estimate ?? null, x: +centre[0].toFixed(6), y: +centre[1].toFixed(6),
  });
  labels.push(turf.point(centre, { id: p.id, name: p.name, type: p.type }));
  const pb = turf.bbox(f);
  for (const s of sa2) {
    if (!bboxOverlap(pb, s.bbox)) continue;
    pairsTried++;
    let inter = null;
    try {
      inter = turf.intersect(turf.featureCollection([f, s.f]));
    } catch {
      invalid++;
      continue;
    }
    if (!inter) continue;
    const a = turf.area(inter);
    const ss = a / s.area, sb = a / area;
    if (ss < SHARE_MIN && sb < SHARE_MIN) continue;
    links.push({ i: p.id, g: s.code, ss: +ss.toFixed(3), sb: +sb.toFixed(3) });
  }
}
console.log(`pairs tried ${pairsTried} (${invalid} geometry errors skipped) → ${links.length} suburb↔SA2 links`);

// --- report -----------------------------------------------------------------
const bySuburb = new Map();
for (const l of links) (bySuburb.get(l.i) ?? bySuburb.set(l.i, []).get(l.i)).push(l);
const noLink = suburbs.filter((s) => !bySuburb.has(s.i));
console.log(`suburbs with ≥1 SA2: ${bySuburb.size}/${suburbs.length}; without: ${noLink.length} (${noLink.slice(0, 8).map((s) => s.n).join(", ")}${noLink.length > 8 ? "…" : ""})`);
const sa2Names = new Map(sa2.map((s) => [s.code, s.name]));
for (const want of ["Grey Lynn", "Westmere", "Kingsland", "Flat Bush", "Ponsonby", "Takapuna"]) {
  const s = suburbs.find((x) => x.n === want);
  const ls = (bySuburb.get(s?.i) ?? []).sort((a, b) => b.sb - a.sb);
  console.log(`  ${want}${s?.al.length ? ` (aka ${s.al.join(", ")})` : ""} → ${ls.map((l) => `${sa2Names.get(l.g)} ${Math.round(l.sb * 100)}%`).join(" · ") || "no SA2"}`);
}

mkdirSync("data/suburbs", { recursive: true });
writeFileSync("data/suburbs/tri121-suburbs.json", JSON.stringify(suburbs));
writeFileSync("data/suburbs/tri121-suburb-sa2.json", JSON.stringify(links));
writeFileSync("public/geo/auckland-suburb-labels.geojson", JSON.stringify(turf.featureCollection(labels)));
console.log(`wrote ${suburbs.length} suburbs, ${links.length} links, ${labels.length} label points`);
