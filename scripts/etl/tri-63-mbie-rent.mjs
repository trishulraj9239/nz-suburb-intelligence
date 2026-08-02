/**
 * TRI-63 — MBIE rental-bond quarterly CSV → data/rent/tri63-rent-metrics.json
 *
 * Downloads the detailed quarterly tenancy file (SA2-2019, keyless, CC-BY 3.0 NZ,
 * attribution: MBIE) and emits metric rows for the Auckland SA2-2023 universe.
 * Decisions locked at the TRI-62 checkpoint (docs/spikes/tri-62-mbie-rent-bonds.md):
 *   - quarterly cadence, trailing 25 quarters (whole 2020–2026 file)
 *   - Dwelling Type = ALL, Number Of Beds = ALL only
 *   - SA2-2019→2023 concordance: exact code (confidence medium — MBIE flags the
 *     data provisional, so medium is the cap) else parent XXXX00 rule with the
 *     parent's values applied to each split child (confidence low, TRI-18
 *     precedent); no match at all → no rows (oceanic/industrial SA2s)
 *   - rent_median_weekly gets full history; quartiles + rent_trend_12m_pct
 *     (vs same quarter prior year, both endpoints required) latest quarter only
 *
 * Output rows: { g: sa2_code(2023), m: metric_key, c: null, v, d: as_of, cf }
 * — tri-17 artifact shape plus per-row confidence. Committed and loaded
 * server-side via the Postgres http extension (scripts/etl/tri-63-rent-metrics.sql).
 *
 * Run: node scripts/etl/tri-63-mbie-rent.mjs   (no key needed)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const CSV_URL =
  "https://www.tenancy.govt.nz/assets/Uploads/Tenancy/Rental-bond-data/detailed-quarterly-tenancy-2020-to-2026.csv";

// curl mirrors the repo's ETL convention; -f makes a moved/renamed file (the
// year-ranged name will roll over eventually) fail loudly instead of parsing HTML.
const csv = execFileSync("curl", ["-sfL", "--max-time", "120", CSV_URL], {
  maxBuffer: 64 * 1024 * 1024,
}).toString("utf8");

const lines = csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
const header = lines[0].split(",");
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`column missing: ${name} — file format changed?`);
  return i;
};
const TIME = col("TimeFrame"), LOC = col("Location Id"), DWELL = col("Dwelling Type"),
  BEDS = col("Number Of Beds"), MED = col("Median Rent"),
  UQ = col("Upper Quartile Rent"), LQ = col("Lower Quartile Rent");

const isoQuarter = (tf) => {
  const [d, m, y] = tf.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`; // 1/01/2026 → 2026-01-01
};
const num = (s) => (s === "NULL" || s === "" ? null : Number(s));

// quarter → { sa2019 → {med, lq, uq} }, ALL/ALL rows only
const byQuarter = new Map();
for (const line of lines.slice(1)) {
  const r = line.split(",");
  if (r[DWELL] !== "ALL" || r[BEDS] !== "ALL" || !/^\d{6}$/.test(r[LOC])) continue;
  const q = isoQuarter(r[TIME]);
  if (!byQuarter.has(q)) byQuarter.set(q, new Map());
  const bucket = byQuarter.get(q);
  if (bucket.has(r[LOC])) throw new Error(`duplicate ALL/ALL row ${q} ${r[LOC]}`);
  bucket.set(r[LOC], { med: num(r[MED]), lq: num(r[LQ]), uq: num(r[UQ]) });
}
const quarters = [...byQuarter.keys()].sort();
const latest = quarters.at(-1);
const priorYear = `${Number(latest.slice(0, 4)) - 1}${latest.slice(4)}`;
console.log(`quarters: ${quarters.length} (${quarters[0]} … ${latest}); trend base ${priorYear}`);

// Our SA2-2023 universe → the SA2-2019 code that carries its data.
const csvCodes = new Set([...byQuarter.values()].flatMap((m) => [...m.keys()]));
const ourCodes = JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8"))
  .features.map((f) => String(f.properties.SA22023_V1_00));
const mapping = new Map(); // our 2023 code → { src: 2019 code, cf }
let direct = 0, parent = 0, unmapped = [];
for (const code of ourCodes) {
  const par = code.slice(0, 4) + "00";
  if (csvCodes.has(code)) { mapping.set(code, { src: code, cf: "medium" }); direct++; }
  else if (csvCodes.has(par)) { mapping.set(code, { src: par, cf: "low" }); parent++; }
  else unmapped.push(code);
}
console.log(`concordance: ${direct} direct, ${parent} via parent, ${unmapped.length} unmapped (expected 22: oceanic/industrial)`);

const rows = [];
const add = (g, m, v, d, cf) => rows.push({ g, m, c: null, v, d, cf });

for (const [code, { src, cf }] of mapping) {
  // full history: median only (suppressed cells are absent — never emit zero)
  for (const q of quarters) {
    const cell = byQuarter.get(q).get(src);
    if (cell?.med != null) add(code, "rent_median_weekly", cell.med, q, cf);
  }
  // latest quarter only: quartiles + YoY trend
  const now = byQuarter.get(latest).get(src);
  if (now?.lq != null) add(code, "rent_lower_quartile_weekly", now.lq, latest, cf);
  if (now?.uq != null) add(code, "rent_upper_quartile_weekly", now.uq, latest, cf);
  const base = byQuarter.get(priorYear)?.get(src);
  if (now?.med != null && base?.med != null)
    add(code, "rent_trend_12m_pct", Math.round(((now.med - base.med) / base.med) * 1000) / 10, latest, cf);
}

// --- Report + spot checks (values verified in the TRI-62 spike) -------------
const byMetric = {};
for (const r of rows) byMetric[r.m] = (byMetric[r.m] ?? 0) + 1;
console.log("rows by metric:", byMetric, "total:", rows.length);

const expect = { 110400: 530, 110700: 513, 110900: 650 };
for (const [g, v] of Object.entries(expect)) {
  const got = rows.find((r) => r.g === g && r.m === "rent_median_weekly" && r.d === latest)?.v;
  console.log(`SPOT CHECK ${g} median ${latest} = ${got} (expect ${v})`);
  if (got !== v) throw new Error("Spot check failed — aborting write");
}

mkdirSync("data/rent", { recursive: true });
writeFileSync("data/rent/tri63-rent-metrics.json", JSON.stringify(rows));
console.log(`wrote data/rent/tri63-rent-metrics.json (${rows.length} rows)`);
