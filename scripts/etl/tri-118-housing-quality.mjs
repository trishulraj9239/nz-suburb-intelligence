/**
 * TRI-118 — Census 2023 housing-quality metrics per SA2 (damp, mould,
 * heating, bedrooms, dwelling density).
 *
 * Source: Stats NZ "2023 Census totals by topic for dwellings by SA2" and
 * "2023 Census change in occupied and unoccupied private dwellings by SA2",
 * read from Stats NZ Geospatial's ArcGIS Online feature services (keyless,
 * CC BY 4.0, the same tables datafinder publishes as layers 120853 / 119481 —
 * our STATS_NZ_API_KEY is an ADE key without datafinder WFS scope). Column
 * codes (VAR_n_m) are documented in the layers' lookup-table attachments;
 * the mapping below was transcribed from those files on 2026-09-27
 * (docs/spikes/tri-118-census-housing-quality.md).
 *
 * Rules:
 *   - Suppressed cells are published as -999 (or null) → skipped, never zero.
 *   - Counts are random-rounded to base 3; percentage metrics are only emitted
 *     when the "Total stated" denominator is ≥ MIN_STATED so rounding noise
 *     can't produce a wild share for a 6-dwelling industrial SA2.
 *   - Shares use "Total stated" (excludes "Not elsewhere included") — the same
 *     denominator Stats NZ uses in its own percentage tables.
 *   - Heating is a multi-response question; only single-category shares are
 *     emitted (heat pump, no heating), never a "composition" that would render
 *     as a stacked bar summing past 100%.
 *   - Density divides the published total-dwellings count by Stats NZ's own
 *     LAND_AREA_SQ_KM for the SA2 (land only, same vintage), not by our
 *     simplified map polygon.
 *
 * Output: data/census/tri118-housing-quality.json — [{ g, m, c, v, d, cf }]
 *   as_of: 2013-03-05 / 2018-03-06 / 2023-03-07 (census days, TRI-17).
 * Loaded via scripts/etl/tri-118-housing-quality.sql (http_get pattern).
 *
 * Run: node scripts/etl/tri-118-housing-quality.mjs   (no key needed)
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const SVC = "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services";
const DWELLINGS = `${SVC}/2023_Census_totals_by_topic_for_dwellings_by_SA2/FeatureServer/0/query`;
const CHANGE = `${SVC}/2023_Census_change_in_occupied_and_unoccupied_private_dwellings_by_SA2/FeatureServer/0/query`;
const OUT = "data/census/tri118-housing-quality.json";
const CENSUS_DAY = { 2013: "2013-03-05", 2018: "2018-03-06", 2023: "2023-03-07" };
const MIN_STATED = 30;

// VAR codes per the lookup tables (year → code). Dwellings service.
const V = {
  damp: { 2018: { always: "VAR_3_23", sometimes: "VAR_3_24", stated: "VAR_3_28" }, 2023: { always: "VAR_3_29", sometimes: "VAR_3_30", stated: "VAR_3_34" } },
  mould: { 2018: { always: "VAR_3_35", sometimes: "VAR_3_36", stated: "VAR_3_40" }, 2023: { always: "VAR_3_41", sometimes: "VAR_3_42", stated: "VAR_3_46" } },
  heating: { 2018: { none: "VAR_3_123", heatPump: "VAR_3_124", stated: "VAR_3_134" }, 2023: { none: "VAR_3_135", heatPump: "VAR_3_136", stated: "VAR_3_146" } },
  avgBedrooms: { 2013: "VAR_3_155", 2018: "VAR_3_164", 2023: "VAR_3_173" },
  bedrooms: {
    2013: { "One bedroom": "VAR_3_147", "Two bedrooms": "VAR_3_148", "Three bedrooms": "VAR_3_149", "Four bedrooms": "VAR_3_150", "Five or more bedrooms": "VAR_3_151", "Total stated": "VAR_3_154" },
    2018: { "One bedroom": "VAR_3_156", "Two bedrooms": "VAR_3_157", "Three bedrooms": "VAR_3_158", "Four bedrooms": "VAR_3_159", "Five or more bedrooms": "VAR_3_160", "Total stated": "VAR_3_163" },
    2023: { "One bedroom": "VAR_3_165", "Two bedrooms": "VAR_3_166", "Three bedrooms": "VAR_3_167", "Four bedrooms": "VAR_3_168", "Five or more bedrooms": "VAR_3_169", "Total stated": "VAR_3_172" },
  },
};
// Change service: total dwellings (occupied + unoccupied) per census.
const TOTAL_DWELLINGS = { 2013: "VAR_1_3", 2018: "VAR_1_6", 2023: "VAR_1_9" };

const ours = new Set(
  JSON.parse(readFileSync("public/geo/auckland-sa2.geojson", "utf8")).features.map((f) => String(f.properties.SA22023_V1_00)),
);

async function fetchAll(url, outFields) {
  const rows = [];
  for (let offset = 0; ; offset += 2000) {
    const r = await fetch(
      `${url}?where=1%3D1&outFields=${outFields.join(",")}&returnGeometry=false&resultRecordCount=2000&resultOffset=${offset}&f=json`,
    );
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    const page = await r.json();
    if (page.error) throw new Error(`ArcGIS error: ${JSON.stringify(page.error)}`);
    rows.push(...page.features.map((f) => f.attributes));
    if (!page.exceededTransferLimit && page.features.length < 2000) break;
  }
  return rows;
}

const dwFields = ["SA22023_V1_00", "SA22023_V1_00_NAME"];
for (const y of [2018, 2023]) dwFields.push(...Object.values(V.damp[y]), ...Object.values(V.mould[y]), ...Object.values(V.heating[y]));
for (const y of [2013, 2018, 2023]) dwFields.push(V.avgBedrooms[y], ...Object.values(V.bedrooms[y]));
const dw = (await fetchAll(DWELLINGS, dwFields)).filter((a) => ours.has(String(a.SA22023_V1_00)));
const ch = (await fetchAll(CHANGE, ["SA22023_V1_00", "LAND_AREA_SQ_KM", ...Object.values(TOTAL_DWELLINGS)])).filter((a) => ours.has(String(a.SA22023_V1_00)));
console.log(`dwellings rows (Auckland): ${dw.length} / ${ours.size} · change rows: ${ch.length}`);
if (dw.length < 600) throw new Error("implausibly few Auckland rows");

// -999 = confidentialised (Stats NZ convention); null = not published.
const num = (v) => (v === null || v === undefined || v < 0 ? null : Number(v));
const pct = (n, d) => +((100 * n) / d).toFixed(1);

const rows = [];
const stats = { suppressed: 0, belowMin: 0 };
const push = (g, m, c, v, y, cf = "high") => rows.push({ g, m, c, v, d: CENSUS_DAY[y], cf });

for (const a of dw) {
  const g = String(a.SA22023_V1_00);
  for (const y of [2018, 2023]) {
    for (const [metric, spec] of [["dwelling_damp_pct", V.damp[y]], ["dwelling_mould_pct", V.mould[y]]]) {
      const always = num(a[spec.always]), sometimes = num(a[spec.sometimes]), stated = num(a[spec.stated]);
      if (always === null || sometimes === null || stated === null) { stats.suppressed++; continue; }
      if (stated < MIN_STATED) { stats.belowMin++; continue; }
      push(g, metric, null, pct(always + sometimes, stated), y);
    }
    const h = V.heating[y];
    const stated = num(a[h.stated]);
    if (stated !== null && stated >= MIN_STATED) {
      const hp = num(a[h.heatPump]), none = num(a[h.none]);
      if (hp !== null) push(g, "heat_pump_pct", null, pct(hp, stated), y); else stats.suppressed++;
      if (none !== null) push(g, "no_heating_pct", null, pct(none, stated), y); else stats.suppressed++;
    } else if (stated === null) stats.suppressed++; else stats.belowMin++;
  }
  for (const y of [2013, 2018, 2023]) {
    const avg = num(a[V.avgBedrooms[y]]);
    if (avg !== null) push(g, "avg_bedrooms", null, avg, y); else stats.suppressed++;
    const b = V.bedrooms[y];
    const stated = num(a[b["Total stated"]]);
    if (stated === null || stated < MIN_STATED) { if (stated === null) stats.suppressed++; else stats.belowMin++; continue; }
    for (const [cat, code] of Object.entries(b)) {
      const v = num(a[code]);
      if (v === null) { stats.suppressed++; continue; }
      push(g, "bedrooms", cat, v, y);
    }
  }
}

for (const a of ch) {
  const g = String(a.SA22023_V1_00);
  const land = Number(a.LAND_AREA_SQ_KM);
  if (!(land > 0.01)) continue;
  for (const y of [2013, 2018, 2023]) {
    const total = num(a[TOTAL_DWELLINGS[y]]);
    if (total === null) { stats.suppressed++; continue; }
    push(g, "dwelling_density_per_km2", null, +(total / land).toFixed(1), y);
  }
}

// --- report + spot checks ----------------------------------------------------
const byMetric = {};
for (const r of rows) byMetric[r.m] = (byMetric[r.m] ?? 0) + 1;
console.log("rows per metric:", JSON.stringify(byMetric));
console.log(`skipped: ${stats.suppressed} suppressed cells, ${stats.belowMin} denominators < ${MIN_STATED}`);
const spot = (g, m, y, c = null) => rows.find((r) => r.g === g && r.m === m && r.d === CENSUS_DAY[y] && r.c === c)?.v;
console.log(`SPOT Ponsonby West 2023: damp ${spot("130400", "dwelling_damp_pct", 2023)}% · mould ${spot("130400", "dwelling_mould_pct", 2023)}% · heat pump ${spot("130400", "heat_pump_pct", 2023)}% · avg bedrooms ${spot("130400", "avg_bedrooms", 2023)} · density ${spot("130400", "dwelling_density_per_km2", 2023)}/km²`);
console.log(`SPOT Takanini Industrial (161700) rows: ${rows.filter((r) => r.g === "161700").length} (expect few/none — suppressed)`);

mkdirSync("data/census", { recursive: true });
writeFileSync(OUT, JSON.stringify(rows));
console.log(`wrote ${OUT} (${rows.length} rows)`);
