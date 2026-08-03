/**
 * TRI-76 — ORS matrix: suburb origins × candidate schools → road distances.
 *
 * For each active SA2 the ~12 nearest schools by geodesic distance are the
 * candidate set (road rank can't overtake from outside it — acceptable at
 * suburb grain); one ORS driving-car matrix call covers a batch of suburbs ×
 * the union of their candidates, capped at ROUTE_CAP routes per request.
 * Origins are commute_origin_points (ST_PointOnSurface, TRI-43), schools come
 * from the school_points view (migration 0008). TRI-46 quota posture: ~33
 * req/min throttle, stop at the quota floor, bisect failing batches so one
 * bad origin can't sink the rest; unroutable pairs land as explicit failure
 * rows (the nearby_schools() RPC falls back to labelled straight-line).
 *
 * Output: data/commute/tri76-school-distances.json
 *   [{ g: sa2_code, sid: school_id, m: distance_m, s: duration_s,
 *      status: "ok"|"failed" }]
 * Loaded into school_road_distances via scripts/etl/tri-76-school-distances.sql
 * (http-extension pattern) — upsert on (sa2_code, school_id), so re-running
 * the pair is the refresh mechanism.
 *
 * Run: node scripts/etl/tri-76-school-distances.mjs   (needs ORS_API_KEY in .env.local)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const ORS_KEY = get("ORS_API_KEY");
const SB_URL = get("NEXT_PUBLIC_SUPABASE_URL");
const SB_ANON = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!ORS_KEY || !SB_URL || !SB_ANON) throw new Error("ORS_API_KEY / Supabase vars missing from .env.local");

const CANDIDATES = 12;
const ROUTE_CAP = 2500;        // routes (origins × destinations) per matrix call, under the 3500 cap
const MIN_INTERVAL_MS = 1800;  // ~33 req/min, under the ~40/min window
const QUOTA_FLOOR = 40;

// --- Inputs from the database ----------------------------------------------
async function rest(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, authorization: `Bearer ${SB_ANON}` },
  });
  if (!r.ok) throw new Error(`PostgREST ${path} → ${r.status}`);
  return r.json();
}

const origins = await rest("commute_origin_points?is_active=eq.true&select=sa2_code,lng,lat&order=sa2_code");
const schools = await rest("school_points?select=school_id,lng,lat&limit=1000");
if (!origins.length || !schools.length) throw new Error("no origins or schools — run migrations 0006/0008 first");
console.log(`${origins.length} origins, ${schools.length} schools, top ${CANDIDATES} candidates each`);

// --- Candidate sets: nearest schools by haversine ----------------------------
const R = 6371;
function havKm(a, b) {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
for (const o of origins) {
  o.candidates = schools
    .map((s) => ({ s, d: havKm(o, s) }))
    .sort((x, y) => x.d - y.d)
    .slice(0, CANDIDATES)
    .map((x) => x.s);
}

// --- Batches: consecutive suburbs (sa2 order ≈ geographic) under ROUTE_CAP ---
const batches = [];
let cur = [];
let union = new Set();
for (const o of origins) {
  const next = new Set(union);
  for (const c of o.candidates) next.add(c.school_id);
  if (cur.length && (cur.length + 1) * next.size > ROUTE_CAP) {
    batches.push(cur);
    cur = [];
    union = new Set();
    for (const c of o.candidates) union.add(c.school_id);
  } else {
    union = next;
  }
  cur.push(o);
}
if (cur.length) batches.push(cur);
console.log(`${batches.length} matrix calls planned`);

// --- Throttled ORS matrix call (TRI-46 pattern) ------------------------------
let lastCall = 0;
let quotaRemaining = Infinity;

async function matrix(batch) {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  lastCall = Date.now();

  const ids = [...new Set(batch.flatMap((o) => o.candidates.map((c) => c.school_id)))];
  const byId = new Map(schools.map((s) => [s.school_id, s]));
  const dest = ids.map((id) => byId.get(id));
  const body = {
    locations: [...batch.map((o) => [o.lng, o.lat]), ...dest.map((s) => [s.lng, s.lat])],
    sources: batch.map((_, i) => i),
    destinations: dest.map((_, i) => batch.length + i),
    metrics: ["duration", "distance"],
  };
  const r = await fetch("https://api.openrouteservice.org/v2/matrix/driving-car", {
    method: "POST",
    headers: { authorization: ORS_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  quotaRemaining = Number(r.headers.get("x-ratelimit-remaining") ?? quotaRemaining);
  if (r.status === 429) {
    console.warn("  429 — backing off 65 s");
    await new Promise((res) => setTimeout(res, 65_000));
    return matrix(batch);
  }
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 200);
    throw Object.assign(new Error(`ORS ${r.status}: ${detail}`), { status: r.status });
  }
  const res = await r.json();
  return { res, ids };
}

// --- Batch runner with bisection on failure ----------------------------------
const rows = [];

async function run(batch) {
  if (quotaRemaining < QUOTA_FLOOR) throw new Error(`quota floor hit (${quotaRemaining} remaining) — rerun tomorrow, upsert resumes`);
  try {
    const { res, ids } = await matrix(batch);
    const col = new Map(ids.map((id, i) => [id, i]));
    batch.forEach((o, oi) => {
      for (const c of o.candidates) {
        const ci = col.get(c.school_id);
        const s = res.durations[oi][ci];
        if (s === null || s === undefined) {
          rows.push({ g: o.sa2_code, sid: c.school_id, m: null, s: null, status: "failed" });
        } else {
          rows.push({ g: o.sa2_code, sid: c.school_id, m: Math.round(res.distances[oi][ci]), s: Math.round(s), status: "ok" });
        }
      }
    });
  } catch (err) {
    if (err.message.startsWith("quota floor")) throw err;
    if (batch.length === 1) {
      const o = batch[0];
      console.warn(`  ${o.sa2_code} failed: ${err.message}`);
      for (const c of o.candidates) rows.push({ g: o.sa2_code, sid: c.school_id, m: null, s: null, status: "failed" });
      return;
    }
    const mid = Math.ceil(batch.length / 2);
    await run(batch.slice(0, mid));
    await run(batch.slice(mid));
  }
}

for (let i = 0; i < batches.length; i++) {
  await run(batches[i]);
  console.log(`  batch ${i + 1}/${batches.length} (${rows.length} rows, quota left: ${quotaRemaining})`);
}

// --- Artifact + summary ------------------------------------------------------
mkdirSync("data/commute", { recursive: true });
writeFileSync("data/commute/tri76-school-distances.json", JSON.stringify(rows));

const ok = rows.filter((r) => r.status === "ok");
const ratio = ok.map((r) => r.m); // road metres for sanity vs candidates' geodesic
console.log(`\n${rows.length} rows (${ok.length} ok, ${rows.length - ok.length} failed) → data/commute/tri76-school-distances.json`);
console.log(`  road distance p50 ${(ratio.sort((a, b) => a - b)[Math.floor(ratio.length / 2)] / 1000).toFixed(1)} km`);
