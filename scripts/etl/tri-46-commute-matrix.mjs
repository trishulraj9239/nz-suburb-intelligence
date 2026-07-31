/**
 * TRI-46 — ORS matrix batch: SA2 origins × anchors × modes → commute staging.
 *
 * Origins come from commute_origin_points (ST_PointOnSurface per SA2, TRI-43)
 * and anchors from the anchors table (TRI-42) — both fetched over PostgREST
 * with the anon key, so adding an anchor is a DB insert, zero code changes.
 * Times are "typical, no live traffic" (ORS routes OSM without conditions).
 *
 * Quota shape (observed 2026-07-31, docs/sources.md): matrix = 500 req/day,
 * ~40/min sliding window. Full run = ceil(627/55) chunks × 3 modes ≈ 36 calls.
 * Chunks that fail are bisected down to the single failing origin so one bad
 * point can't sink 54 good ones; unroutable pairs (islands) land as explicit
 * failure rows, never silent gaps.
 *
 * Output: data/commute/tri46-staging.json
 *   [{ g: sa2_code, a: anchor_key, mode, s: duration_s, m: distance_m,
 *      status: "ok"|"failed", detail? }]
 * Loaded into commute_staging via the http-extension pattern (TRI-17 notes) —
 * upsert on (sa2_code, anchor_key, mode), which makes re-runs the refresh
 * mechanism.
 *
 * Run: node scripts/etl/tri-46-commute-matrix.mjs   (needs ORS_API_KEY in .env.local)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.+)$`, "m"))?.[1]?.trim();
const ORS_KEY = get("ORS_API_KEY");
const SB_URL = get("NEXT_PUBLIC_SUPABASE_URL");
const SB_ANON = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (!ORS_KEY || !SB_URL || !SB_ANON) throw new Error("ORS_API_KEY / Supabase vars missing from .env.local");

const MODES = ["driving-car", "cycling-regular", "foot-walking"];
const CHUNK = 55;              // 55 origins + anchors ≤ 60 locations/call — far under caps
const MIN_INTERVAL_MS = 1800;  // ~33 req/min, under the ~40/min window
const QUOTA_FLOOR = 40;        // stop a mode if x-ratelimit-remaining drops below

// --- Inputs from the database ----------------------------------------------
async function rest(path) {
  const r = await fetch(`${SB_URL}/rest/v1/${path}`, {
    headers: { apikey: SB_ANON, authorization: `Bearer ${SB_ANON}` },
  });
  if (!r.ok) throw new Error(`PostgREST ${path} → ${r.status}`);
  return r.json();
}

const anchors = await rest("anchors?is_active=eq.true&select=anchor_key,lng,lat&order=display_order");
const origins = await rest("commute_origin_points?is_active=eq.true&select=sa2_code,lng,lat&order=sa2_code");
if (!anchors.length || !origins.length) throw new Error("no anchors or origins — run migration 0006 first");
console.log(`${origins.length} origins × ${anchors.length} anchors × ${MODES.length} modes`);

// --- Throttled ORS matrix call ---------------------------------------------
let lastCall = 0;
let quotaRemaining = Infinity;

async function matrix(mode, chunk) {
  const wait = lastCall + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((res) => setTimeout(res, wait));
  lastCall = Date.now();

  const body = {
    locations: [...chunk.map((o) => [o.lng, o.lat]), ...anchors.map((a) => [a.lng, a.lat])],
    sources: chunk.map((_, i) => i),
    destinations: anchors.map((_, i) => chunk.length + i),
    metrics: ["duration", "distance"],
  };
  const r = await fetch(`https://api.openrouteservice.org/v2/matrix/${mode}`, {
    method: "POST",
    headers: { authorization: ORS_KEY, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  quotaRemaining = Number(r.headers.get("x-ratelimit-remaining") ?? quotaRemaining);
  if (r.status === 429) {
    console.warn("  429 — backing off 65 s");
    await new Promise((res) => setTimeout(res, 65_000));
    return matrix(mode, chunk);
  }
  if (!r.ok) {
    const detail = (await r.text()).slice(0, 200);
    throw Object.assign(new Error(`ORS ${r.status}: ${detail}`), { status: r.status });
  }
  return r.json();
}

// --- Chunk runner with bisection on failure --------------------------------
const rows = [];

function record(o, mode, durations, distances) {
  anchors.forEach((a, ai) => {
    const s = durations?.[ai];
    if (s === null || s === undefined) {
      rows.push({ g: o.sa2_code, a: a.anchor_key, mode, s: null, m: null, status: "failed", detail: "unroutable" });
    } else {
      rows.push({ g: o.sa2_code, a: a.anchor_key, mode, s: Math.round(s), m: Math.round(distances[ai]), status: "ok" });
    }
  });
}

async function run(mode, chunk) {
  if (quotaRemaining < QUOTA_FLOOR) throw new Error(`quota floor hit (${quotaRemaining} remaining) — rerun tomorrow, upsert resumes`);
  try {
    const res = await matrix(mode, chunk);
    chunk.forEach((o, i) => record(o, mode, res.durations[i], res.distances[i]));
  } catch (err) {
    if (err.message.startsWith("quota floor")) throw err;
    if (chunk.length === 1) {
      const o = chunk[0];
      console.warn(`  ${o.sa2_code} failed: ${err.message}`);
      anchors.forEach((a) =>
        rows.push({ g: o.sa2_code, a: a.anchor_key, mode, s: null, m: null, status: "failed", detail: err.message.slice(0, 120) }));
      return;
    }
    const mid = Math.ceil(chunk.length / 2);           // bisect to isolate the bad origin
    await run(mode, chunk.slice(0, mid));
    await run(mode, chunk.slice(mid));
  }
}

for (const mode of MODES) {
  console.log(`\n— ${mode}`);
  for (let i = 0; i < origins.length; i += CHUNK) {
    await run(mode, origins.slice(i, i + CHUNK));
    process.stdout.write(`  ${Math.min(i + CHUNK, origins.length)}/${origins.length} (quota left: ${quotaRemaining})\r`);
  }
  console.log();
}

// --- Artifact + summary -----------------------------------------------------
mkdirSync("data/commute", { recursive: true });
writeFileSync("data/commute/tri46-staging.json", JSON.stringify(rows));

const ok = rows.filter((r) => r.status === "ok").length;
const failed = rows.length - ok;
console.log(`\n${rows.length} rows (${ok} ok, ${failed} failed) → data/commute/tri46-staging.json`);
for (const mode of MODES) {
  const m = rows.filter((r) => r.mode === mode && r.status === "ok" && r.a === "cbd").map((r) => r.s / 60);
  m.sort((x, y) => x - y);
  console.log(`  ${mode} → CBD median ${m[Math.floor(m.length / 2)]?.toFixed(0)} min (n=${m.length})`);
}
