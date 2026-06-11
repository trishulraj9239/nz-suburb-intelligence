/**
 * TRI-17 — ETL: Census 2023 housing + demographics → metric_values.
 *
 * Pulls from the Stats NZ Aotearoa Data Explorer (SDMX 2.1 REST; see
 * docs/spikes/tri-15-ade-census-2023.md) for every Auckland SA2 already in
 * `geographies`, across the 2013/2018/2023 censuses:
 *
 *   CEN23_TBT_008 (individuals): rc → population · asMed → median_age ·
 *     eg1..eg6,egTS → ethnicity breakdown
 *   CEN23_TBT_007 (households):  wrmed → median_rent_weekly · himed →
 *     median_household_income · th001,th002,th003,thTS → tenure breakdown
 *   CEN23_HOU_017 (dwellings):   private dwelling type (rooms=Total),
 *     aggregated to Separate house / Joined dwelling / Other → dwelling_type
 *
 * Output: data/census/tri17-metric-values.json — array of
 *   { g: sa2_code, m: metric_key, c: category|null, v: number, d: as_of_date }
 * Confidence is uniformly 'high' (exact census values); suppressed cells
 * (Stats NZ confidentiality) are skipped and counted in the run report.
 *
 * The file is committed and loaded server-side via the Postgres `http`
 * extension (insert..select from http_get of the raw.githubusercontent URL) —
 * see the TRI-17 notes in Linear.
 *
 * Run: node scripts/etl/tri-17-census-metrics.mjs   (needs STATS_NZ_API_KEY in .env.local)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const BASE = "https://api.data.stats.govt.nz/rest/data";
const KEY = readFileSync(".env.local", "utf8").match(/^STATS_NZ_API_KEY=(.+)$/m)?.[1]?.trim();
if (!KEY) throw new Error("STATS_NZ_API_KEY missing from .env.local");

// Census day per year — the as_of_date on every row.
const CENSUS_DAY = { 2013: "2013-03-05", 2018: "2018-03-06", 2023: "2023-03-07" };

// The Auckland SA2 universe = what TRI-16 loaded (sourced from the same file).
const sa2Set = new Set(
  JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8")).features.map(
    (f) => f.properties.SA22023_V1_00,
  ),
);
console.log(`Auckland SA2 universe: ${sa2Set.size}`);

// All HTTP goes through curl: the ADE gateway rejects Node's TLS handshake
// (every undici/fetch request 500s; identical curl requests succeed).
function curlJson(url, accept) {
  const out = execFileSync(
    "curl",
    ["-sf", "--max-time", "120", "-H", `Ocp-Apim-Subscription-Key: ${KEY}`, "-H", `Accept: ${accept}`, url],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  return JSON.parse(out.toString("utf8"));
}

async function sdmx(flow, sdmxKey) {
  // The trailing /all (provider ref) mirrors the verified spike query shape.
  const url = `${BASE}/STATSNZ,${flow},1.0/${sdmxKey}/all?dimensionAtObservation=AllDimensions`;
  return curlJson(url, "application/vnd.sdmx.data+json;version=1.0");
}

let suppressed = 0;

/** Iterate observations as { dims: {dimId: codeId}, value } objects. */
function* observations(payload) {
  const dims = payload.data.structure.dimensions.observation;
  for (const [k, v] of Object.entries(payload.data.dataSets[0].observations)) {
    const value = v[0];
    if (value === null || value === undefined) {
      suppressed++;
      continue;
    }
    const idx = k.split(":").map(Number);
    const rec = {};
    idx.forEach((i, n) => (rec[dims[n].id] = dims[n].values[i].id));
    yield { dims: rec, value };
  }
}

const rows = [];
const add = (g, m, c, v, year) =>
  rows.push({ g, m, c, v, d: CENSUS_DAY[year] });

// The API 500s on national slices — constrain GEO instead. Our 633 SA2s are
// chunked into '+'-joined groups; topics can then ride together in one call.
// Chunk of 40 keeps the URL under the gateway's path-length limit (80 → 400).
const GEO_CHUNKS = [];
{
  const all = [...sa2Set];
  for (let i = 0; i < all.length; i += 40) GEO_CHUNKS.push(all.slice(i, i + 40).join("+"));
}
console.log(`geo chunks: ${GEO_CHUNKS.length}`);

// --- 1. Individuals: population, median age, ethnicity ---------------------
{
  const ETH = {
    eg1: "European", eg2: "Māori", eg3: "Pacific Peoples", eg4: "Asian",
    eg5: "Middle Eastern/Latin American/African", eg6: "Other ethnicity",
    egTS: "Total stated",
  };
  const topics = ["rc", "asMed", ...Object.keys(ETH)].join("+");
  for (const [i, geos] of GEO_CHUNKS.entries()) {
    const data = await sdmx("CEN23_TBT_008", `${topics}.${geos}.`); // TOPIC.GEO.YEAR
    for (const { dims, value } of observations(data)) {
      const geo = dims.CEN23_TBT_GEO_006;
      const year = Number(dims.CEN23_YEAR_001);
      const topic = dims.CEN23_TBT_IND_003;
      if (topic === "rc") add(geo, "population", null, value, year);
      else if (topic === "asMed") add(geo, "median_age", null, value, year);
      else add(geo, "ethnicity", ETH[topic], value, year);
    }
    console.log(`  individuals chunk ${i + 1}/${GEO_CHUNKS.length}: total ${rows.length} rows`);
  }
}

// --- 2. Households: median rent, household income, tenure ------------------
{
  const TENURE = {
    th001: "Owned or partly owned",
    th002: "Not owned (rented or other)",
    th003: "Held in a family trust",
    thTS: "Total stated",
  };
  const topics = ["wrmed", "himed", ...Object.keys(TENURE)].join("+");
  for (const [i, geos] of GEO_CHUNKS.entries()) {
    const data = await sdmx("CEN23_TBT_007", `${topics}.${geos}.`);
    for (const { dims, value } of observations(data)) {
      const geo = dims.CEN23_TBT_GEO_007;
      const year = Number(dims.CEN23_YEAR_001);
      const topic = dims.CEN23_TBT_HOH_003;
      if (topic === "wrmed") add(geo, "median_rent_weekly", null, value, year);
      else if (topic === "himed") add(geo, "median_household_income", null, value, year);
      else add(geo, "tenure", TENURE[topic], value, year);
    }
    console.log(`  households chunk ${i + 1}/${GEO_CHUNKS.length}: total ${rows.length} rows`);
  }
}

// --- 3. Dwellings: private dwelling type (rooms = Total) -------------------
{
  // Dims: YEAR.GEO.NRD(rooms).DTD(type). Rooms total code discovered upfront.
  const struct = curlJson(
    "https://api.data.stats.govt.nz/rest/dataflow/STATSNZ/CEN23_HOU_017/1.0?references=all",
    "application/vnd.sdmx.structure+json;version=1.0",
  );
  const nrd = struct.data.codelists.find((c) => c.id === "CL_CEN23_NRD_003");
  const nrdTotal = nrd.codes.find((c) => /^total/i.test(c.name || "")).id;

  // Group the 15 detailed type codes into 3 presentation categories.
  const groupOf = (code) =>
    code.startsWith("11") ? "Separate house"
    : code.startsWith("12") ? "Joined dwelling (townhouse/apartment)"
    : code === "99999" ? "Total"
    : "Other private dwelling";

  // Same geo-chunk pattern. Dims: YEAR.GEO.NRD.DTD (all years, all types).
  const agg = new Map(); // geo|year|group -> sum
  for (const [i, geos] of GEO_CHUNKS.entries()) {
    const data = await sdmx("CEN23_HOU_017", `.${geos}.${nrdTotal}.`);
    for (const { dims, value } of observations(data)) {
      const geo = dims.CEN23_GEO_012;
      const year = Number(dims.CEN23_YEAR_001);
      const grp = groupOf(dims.CEN23_DTD_005);
      const k = `${geo}|${year}|${grp}`;
      agg.set(k, (agg.get(k) ?? 0) + value);
    }
    console.log(`  dwellings chunk ${i + 1}/${GEO_CHUNKS.length}`);
  }
  for (const [k, v] of agg) {
    const [geo, year, grp] = k.split("|");
    add(geo, "dwelling_type", grp, v, Number(year));
  }
  console.log(`after dwellings: ${rows.length} rows`);
}

// --- Report + spot checks ---------------------------------------------------
const byMetric = {};
for (const r of rows) byMetric[r.m] = (byMetric[r.m] ?? 0) + 1;
console.log("rows by metric:", byMetric);
console.log("suppressed cells skipped:", suppressed);

const spot = rows.find((r) => r.g === "130400" && r.m === "population" && r.d === "2023-03-07");
console.log(`SPOT CHECK Ponsonby West population 2023 = ${spot?.v} (expect 2154)`);
if (spot?.v !== 2154) throw new Error("Spot check failed — aborting write");

mkdirSync("data/census", { recursive: true });
writeFileSync("data/census/tri17-metric-values.json", JSON.stringify(rows));
console.log(`wrote data/census/tri17-metric-values.json (${rows.length} rows)`);
