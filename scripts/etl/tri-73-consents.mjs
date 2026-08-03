/**
 * TRI-73 — Stats NZ building consents → planning metrics.
 *
 * Downloads the monthly "Building consents issued" SA2 supplementary zip
 * (TRI-72 spike: docs/spikes/tri-72-stats-consents.md), extracts the
 * 2023-SA2-vintage CSV with tar (bsdtar — the zip's compression defeats
 * PowerShell Expand-Archive), and computes per active-Auckland SA2:
 *
 *   consents_new_dwellings_12m   — rolling 12-month sum of new dwelling
 *     units consented, one row per month for the last 24 month-ends
 *     (M13 rent-history posture → sparkline via the existing mechanism).
 *     confidence 'high': exact administrative counts, direct SA2-2023 join.
 *   consents_per_1000_dwellings  — latest 12-month sum ÷ census-2023
 *     dwelling count × 1000, latest month only. confidence 'medium':
 *     mixes vintages (live consents / 2023 census denominator).
 *
 * Zeros are real zeros (explicit rows in the source, no suppression).
 * Deferred scope (splits, deeper history, 2026 vintage) tracked in TRI-77.
 *
 * Refresh = point RELEASE at the newest month and re-run (URL is
 * month-stamped); loader upserts on the natural key.
 *
 * Run: node scripts/etl/tri-73-consents.mjs
 *   → data/consents/tri73-consents.json  ({g,m,c,v,d,cf} rows)
 */

import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";

const RELEASE = "may-2026"; // bump on refresh — release URLs are month-stamped
const MONTHS_KEPT = 24;     // rolling-12m rows loaded (TRI-72 decision 4)

const ZIP_URL =
  `https://www.stats.govt.nz/assets/Uploads/Building-consents-issued/` +
  `Building-consents-issued-${RELEASE.replace(/^([a-z])/, (c) => c.toUpperCase()).replace(/-(\d)/, "-$1")}/` +
  `Download-data/new-dwellings-consented-by-statistical-area-2-${RELEASE}.zip`;

const TMP = "tmp/consents";
const CSV_2023 = `${TMP}/New dwellings consented by 2023 statistical area 2 (Monthly).csv`;

// --- fetch + extract (cached in gitignored tmp/) -----------------------------
mkdirSync(TMP, { recursive: true });
if (!existsSync(CSV_2023)) {
  const zip = `${TMP}/sa2-${RELEASE}.zip`;
  if (!existsSync(zip)) {
    console.log(`downloading ${ZIP_URL}`);
    execFileSync("curl", ["-sf", "--max-time", "300", "-o", zip, ZIP_URL]);
  }
  execFileSync("tar", ["-xf", zip, "-C", TMP]); // bsdtar handles the odd zip method
}

// --- inputs ------------------------------------------------------------------
const geo = JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8"));
const ourCodes = new Set(geo.features.map((f) => String(f.properties.SA22023_V1_00)));

// Census-2023 dwelling denominator from the repo's own artifact (same facts
// the UI shows): dwelling_type "Total" per suburb.
const census = JSON.parse(readFileSync("data/census/tri17-metric-values.json", "utf8"));
const dwellingsBySuburb = new Map();
for (const r of census) {
  if (r.d === "2023-03-07" && r.m === "dwelling_type" && (r.c === "Total stated" || r.c === "Total")) {
    dwellingsBySuburb.set(r.g, r.v);
  }
}
console.log(`census dwelling denominators: ${dwellingsBySuburb.size} suburbs`);

// --- stream-parse the national CSV, keep our SA2s ----------------------------
const monthly = new Map(); // sa2 -> Map(month -> units)
let latest = "";
const rl = createInterface({ input: createReadStream(CSV_2023) });
let header = true;
for await (const line of rl) {
  if (header) {
    header = false;
    continue;
  }
  const c = line.split(",");
  const [month, sa2] = c;
  if (!ourCodes.has(sa2)) continue;
  if (month > latest) latest = month;
  (monthly.get(sa2) ?? monthly.set(sa2, new Map()).get(sa2)).set(month, Number(c[4]));
}
console.log(`parsed: ${monthly.size} Auckland SA2s, latest month ${latest}`);

// --- rolling 12-month sums for the last MONTHS_KEPT month-ends ---------------
function monthShift(iso, delta) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + delta);
  return d.toISOString().slice(0, 10);
}
const monthEnds = Array.from({ length: MONTHS_KEPT }, (_, i) => monthShift(latest, -i)).reverse();

const rows = [];
for (const [sa2, byMonth] of monthly) {
  for (const end of monthEnds) {
    let sum = 0;
    for (let k = 0; k < 12; k++) sum += byMonth.get(monthShift(end, -k)) ?? 0;
    rows.push({ g: sa2, m: "consents_new_dwellings_12m", c: null, v: sum, d: end, cf: "high" });
  }
  const dwellings = dwellingsBySuburb.get(sa2);
  if (dwellings > 0) {
    let sum = 0;
    for (let k = 0; k < 12; k++) sum += byMonth.get(monthShift(latest, -k)) ?? 0;
    rows.push({
      g: sa2,
      m: "consents_per_1000_dwellings",
      c: null,
      v: +((1000 * sum) / dwellings).toFixed(1),
      d: latest,
      cf: "medium",
    });
  }
}

// --- sanity + artifact -------------------------------------------------------
const latest12 = rows.filter((r) => r.m === "consents_new_dwellings_12m" && r.d === latest);
const regionSum = latest12.reduce((s, r) => s + r.v, 0);
console.log(`rows: ${rows.length} (${latest12.length} suburbs at latest month; regional 12m sum ${regionSum})`);
const spot = (name) => {
  const code = geo.features.find((f) => f.properties.SA22023_V1_00_NAME === name)?.properties.SA22023_V1_00;
  const r = rows.find((x) => x.g === String(code) && x.m === "consents_new_dwellings_12m" && x.d === latest);
  const rate = rows.find((x) => x.g === String(code) && x.m === "consents_per_1000_dwellings");
  console.log(`  ${name}: 12m ${r?.v}, per-1000 ${rate?.v}`);
};
spot("Takapuna Central");
spot("Ponsonby West");
spot("Hobsonville Point Catalina Bay");

mkdirSync("data/consents", { recursive: true });
writeFileSync("data/consents/tri73-consents.json", JSON.stringify(rows));
console.log(`wrote data/consents/tri73-consents.json (${rows.length} rows, release ${RELEASE})`);
