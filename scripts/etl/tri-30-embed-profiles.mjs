/**
 * TRI-30 — embed suburb profiles → suburb_embeddings.
 *
 * Profile text is composed from the repo's own ETL outputs (census metrics,
 * deprivation, schools) — the same facts the UI shows, so retrieval and
 * display can never disagree. Embedded once at ingestion with the LOCKED
 * model+dimension (gemini-embedding-001 @ 768, re-normalised — TRI-11); only
 * live queries embed at runtime, through the same lib/llm/gemini path.
 *
 * Output: data/embeddings/tri30-embeddings.json
 *   [{ g: sa2_code, content, e: "[0.01,...]" }]   (e = pgvector literal)
 * Loaded server-side via the http-extension pattern (see TRI-17 notes).
 *
 * Run: node scripts/etl/tri-30-embed-profiles.mjs   (needs GEMINI_API_KEY in .env.local)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const MODEL = "gemini-embedding-001";
const DIM = 768;
const KEY = readFileSync(".env.local", "utf8").match(/^GEMINI_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("GEMINI_API_KEY missing from .env.local");

// --- Load the repo's data artifacts ----------------------------------------
const geo = JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8"));
const metrics = JSON.parse(readFileSync("data/census/tri17-metric-values.json", "utf8"));
const deprivation = JSON.parse(readFileSync("data/census/tri18-deprivation.json", "utf8"));
const schools = JSON.parse(readFileSync("data/census/tri18-schools.json", "utf8"));
const commute = JSON.parse(readFileSync("data/commute/tri46-staging.json", "utf8"));
const rent = JSON.parse(readFileSync("data/rent/tri63-rent-metrics.json", "utf8"));
const hazards = JSON.parse(readFileSync("data/hazards/tri68-hazard-metrics.json", "utf8"));

// TRI-71: hazard + planning facts, neutral framing — shares of modelled
// layers with source + vintage, never good/bad language (retrieval and the
// answer layer both stay verdict-free; the caveat lives in lib/hazard.ts).
const hazardBySuburb = new Map();
for (const r of hazards) {
  const m = hazardBySuburb.get(r.g) ?? {};
  if (r.c === null || r.c === undefined) {
    m[r.m] = { v: r.v, y: r.d.slice(0, 4) };
  } else {
    (m[`${r.m}:cats`] ??= {})[r.c] = r.v;
    m[`${r.m}:y`] = r.d.slice(0, 4);
  }
  hazardBySuburb.set(r.g, m);
}

// TRI-66: latest-quarter MBIE bond rents (new tenancies) + 12-month trend.
let latestRentQ = "";
for (const r of rent) if (r.m === "rent_median_weekly" && r.d > latestRentQ) latestRentQ = r.d;
const rentQLabel = `${latestRentQ.slice(0, 4)} Q${Math.floor(Number(latestRentQ.slice(5, 7)) / 3) + 1}`;
const rentBySuburb = new Map();
for (const r of rent) {
  if (r.d !== latestRentQ) continue;
  const m = rentBySuburb.get(r.g) ?? {};
  if (r.m === "rent_median_weekly") m.med = r.v;
  else if (r.m === "rent_trend_12m_pct") m.trend = r.v;
  rentBySuburb.set(r.g, m);
}

// TRI-49: typical anchor commute times (openrouteservice/OSM, no live traffic).
const commuteBySuburb = new Map();
for (const r of commute) {
  if (r.status !== "ok") continue;
  const m = commuteBySuburb.get(r.g) ?? {};
  m[`${r.a}:${r.mode}`] = Math.round(r.s / 60);
  commuteBySuburb.set(r.g, m);
}

const names = new Map(geo.features.map((f) => [f.properties.SA22023_V1_00, f.properties.SA22023_V1_00_NAME]));

// Latest-census scalar + breakdown values per suburb.
const bySuburb = new Map();
for (const r of metrics) {
  if (r.d !== "2023-03-07") continue;
  const m = bySuburb.get(r.g) ?? {};
  if (r.c === null || r.c === undefined) m[r.m] = r.v;
  else (m[`${r.m}:cats`] ??= []).push([r.c, r.v]);
  bySuburb.set(r.g, m);
}
for (const r of deprivation) {
  if (r.m !== "nzdep_decile") continue;
  const m = bySuburb.get(r.g) ?? {};
  m.nzdep_decile = r.v;
  bySuburb.set(r.g, m);
}
const schoolsBySuburb = new Map();
for (const s of schools) {
  if (!s.sa2) continue;
  (schoolsBySuburb.get(s.sa2) ?? schoolsBySuburb.set(s.sa2, []).get(s.sa2)).push(s);
}

function pct(cats, label) {
  if (!cats) return null;
  const total = cats.find(([c]) => c === "Total stated" || c === "Total")?.[1];
  const v = cats.find(([c]) => c === label)?.[1];
  return total && v ? Math.round((v / total) * 100) : null;
}

function profileText(sa2) {
  const name = names.get(sa2);
  const m = bySuburb.get(sa2) ?? {};
  const sch = schoolsBySuburb.get(sa2) ?? [];
  const bits = [`${name}, a suburb (SA2 area) of Auckland, New Zealand.`];
  if (m.population) bits.push(`Population ${m.population} (2023 census).`);
  if (m.median_age) bits.push(`Median age ${m.median_age} years.`);
  if (m.median_household_income)
    bits.push(`Median household income $${m.median_household_income}.`);
  if (m.median_rent_weekly) bits.push(`Median weekly rent $${m.median_rent_weekly}.`);
  const rb = rentBySuburb.get(sa2);
  if (rb?.med != null) {
    const trend =
      rb.trend == null
        ? ""
        : `, ${rb.trend > 0.05 ? "up" : rb.trend < -0.05 ? "down" : "flat at"} ${Math.abs(rb.trend).toFixed(1)}% on a year earlier`;
    bits.push(
      `Current median rent for new tenancies $${rb.med}/week (MBIE tenancy bonds, ${rentQLabel}, all dwelling types${trend}).`,
    );
  }
  const owned = pct(m["tenure:cats"], "Owned or partly owned");
  if (owned !== null) bits.push(`${owned}% of households own or partly own their home.`);
  const sep = pct(m["dwelling_type:cats"], "Separate house");
  const joined = pct(m["dwelling_type:cats"], "Joined dwelling (townhouse/apartment)");
  if (sep !== null) bits.push(`Housing stock: ${sep}% separate houses, ${joined ?? 0}% townhouses/apartments.`);
  const eth = (m["ethnicity:cats"] ?? [])
    .filter(([c]) => !c.startsWith("Total"))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => c);
  if (eth.length) bits.push(`Largest ethnic groups: ${eth.join(", ")}.`);
  if (m.nzdep_decile)
    bits.push(`NZDep2018 deprivation decile ${m.nzdep_decile} of 10 (10 = most deprived; informational, not a verdict).`);
  bits.push(
    sch.length
      ? `${sch.length} school${sch.length > 1 ? "s" : ""} located in the area: ${sch.slice(0, 4).map((s) => s.name).join("; ")}.`
      : "No schools located within the area.",
  );
  const cm = commuteBySuburb.get(sa2);
  if (cm) {
    const parts = [];
    if (cm["cbd:driving-car"] != null) parts.push(`${cm["cbd:driving-car"]} min drive`);
    if (cm["cbd:cycling-regular"] != null) parts.push(`${cm["cbd:cycling-regular"]} min cycle`);
    if (parts.length) bits.push(`Typical commute to the Auckland CBD: ${parts.join(", ")} (no live traffic).`);
    if (cm["airport:driving-car"] != null) bits.push(`Drive to Auckland Airport: about ${cm["airport:driving-car"]} min.`);
  }
  // TRI-71 — hazard screen + planning (Auckland Council layers, area-level).
  const hz = hazardBySuburb.get(sa2);
  if (hz) {
    if (hz.flood_plain_pct)
      bits.push(
        `${hz.flood_plain_pct.v}% of the land area is within the modelled 1% AEP flood plain (Auckland Council, ${hz.flood_plain_pct.y}).`,
      );
    if (hz.coastal_inundation_pct && hz.coastal_inundation_pct.v > 0) {
      const slr = hz.coastal_inundation_slr1m_pct;
      bits.push(
        `${hz.coastal_inundation_pct.v}% is within modelled present-day coastal storm-tide inundation (1% AEP${slr ? `; ${slr.v}% with +1 m sea-level rise` : ""}; Auckland Council, ${hz.coastal_inundation_pct.y}).`,
      );
    }
    const liq = hz["liquefaction_share:cats"];
    if (liq?.Total > 0 && liq["Liquefaction Damage is Possible"] > 0) {
      const p = Math.round((100 * liq["Liquefaction Damage is Possible"]) / liq.Total);
      if (p >= 1)
        bits.push(`${p}% of assessed land is classed liquefaction damage possible (calibrated assessment, ${hz["liquefaction_share:y"]}).`);
    }
    if (hz.heritage_overlay_pct && hz.heritage_overlay_pct.v >= 0.5)
      bits.push(`${hz.heritage_overlay_pct.v}% of the land is inside the AUP Historic Heritage Overlay.`);
    const zon = hz["zoning_share:cats"];
    if (zon?.Total > 0) {
      const top = Object.entries(zon)
        .filter(([c]) => c !== "Total")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([c, v]) => `${c} ${Math.round((100 * v) / zon.Total)}%`);
      if (top.length) bits.push(`Zoning mix (AUP July 2026): ${top.join(", ")}.`);
    }
    if (hz.intensification_capacity_indicator)
      bits.push(
        `Intensification capacity: ${hz.intensification_capacity_indicator.v}% of residential-zoned land is Mixed Housing Urban or Terrace Housing & Apartments (capacity indicator, not a forecast).`,
      );
  }
  return bits.join(" ");
}

// --- Embed (batches of 100, normalised) -------------------------------------
const codes = [...names.keys()].filter((c) => bySuburb.has(c));
console.log(`profiles to embed: ${codes.length}`);
const texts = codes.map(profileText);

// --dry: print sample texts and exit WITHOUT spending the daily embed quota
// (free tier ~1000 req/day — one full 633 run is ~2/3 of it).
if (process.argv[2] === "--dry") {
  for (const want of ["Ponsonby West", "Parakai", "Takapuna Central"]) {
    const i = codes.findIndex((c) => names.get(c) === want);
    if (i >= 0) console.log(`\n--- ${want} ---\n${texts[i]}`);
  }
  console.log(`\navg length: ${Math.round(texts.reduce((n, t) => n + t.length, 0) / texts.length)} chars`);
  process.exit(0);
}

// Free tier: 100 embed requests/min (each batch item counts). Pace batches a
// minute apart and honour 429 retryDelay so the full 633 takes ~7 minutes.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function embedBatch(batch, attempt = 0) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:batchEmbedContents?key=${KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: batch.map((text) => ({
          model: `models/${MODEL}`,
          content: { parts: [{ text }] },
          outputDimensionality: DIM,
        })),
      }),
    },
  );
  if (res.status === 429 && attempt < 3) {
    const body = await res.text();
    const secs = Number(body.match(/retry in ([\d.]+)s/i)?.[1] ?? 60) + 5;
    console.log(`  429 — waiting ${Math.ceil(secs)}s (attempt ${attempt + 1})`);
    await sleep(secs * 1000);
    return embedBatch(batch, attempt + 1);
  }
  if (!res.ok) throw new Error(`embed batch failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// Batch 50, not 100: with the TRI-71 hazard/planning sentences the average
// profile is ~1,150 chars, and 100-text batches now trip the free tier's
// per-minute token quota (observed 2026-08-04: batch of 100 429s forever,
// single requests fine). 50 × ~300 tokens stays comfortably under it.
//
// Checkpoint/resume: rows land in the state file after every batch, keyed by
// (sa2, content) — a rerun re-embeds only suburbs whose text changed or which
// weren't finished, so a mid-run kill (10-min background cap) never wastes
// the daily request quota. Delete the state file for a forced full re-embed.
const BATCH = 50;
const STATE = "data/embeddings/tri30-state.json";
mkdirSync("data/embeddings", { recursive: true });
const prior = new Map(); // content-keyed rows from an interrupted run
try {
  for (const r of JSON.parse(readFileSync(STATE, "utf8"))) prior.set(`${r.g} ${r.content}`, r);
} catch {
  /* no state — fresh run */
}
const out = [];
const todo = []; // [index into codes/texts]
for (let i = 0; i < codes.length; i++) {
  const hit = prior.get(`${codes[i]} ${texts[i]}`);
  if (hit) out.push(hit);
  else todo.push(i);
}
if (out.length) console.log(`resume: ${out.length} rows already embedded, ${todo.length} to go`);

for (let b = 0; b < todo.length; b += BATCH) {
  if (b > 0 || out.length) await sleep(62_000); // stay under the per-minute quota
  const idxs = todo.slice(b, b + BATCH);
  const data = await embedBatch(idxs.map((i) => texts[i]));
  data.embeddings.forEach((e, j) => {
    const v = e.values;
    const len = Math.hypot(...v);
    const norm = v.map((x) => +(x / len).toFixed(6));
    out.push({ g: codes[idxs[j]], content: texts[idxs[j]], e: `[${norm.join(",")}]` });
  });
  writeFileSync(STATE, JSON.stringify(out));
  console.log(`embedded ${out.length}/${texts.length}`);
}

if (out.some((r) => JSON.parse(r.e).length !== DIM)) throw new Error("dimension mismatch");
mkdirSync("data/embeddings", { recursive: true });
writeFileSync("data/embeddings/tri30-embeddings.json", JSON.stringify(out));
console.log(`wrote data/embeddings/tri30-embeddings.json (${out.length} rows, model ${MODEL}@${DIM})`);
