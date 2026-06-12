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
  return bits.join(" ");
}

// --- Embed (batches of 100, normalised) -------------------------------------
const codes = [...names.keys()].filter((c) => bySuburb.has(c));
console.log(`profiles to embed: ${codes.length}`);
const texts = codes.map(profileText);

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

const out = [];
for (let i = 0; i < texts.length; i += 100) {
  if (i > 0) await sleep(62_000); // stay under the per-minute quota
  const batch = texts.slice(i, i + 100);
  const data = await embedBatch(batch);
  data.embeddings.forEach((e, j) => {
    const v = e.values;
    const len = Math.hypot(...v);
    const norm = v.map((x) => +(x / len).toFixed(6));
    out.push({ g: codes[i + j], content: texts[i + j], e: `[${norm.join(",")}]` });
  });
  console.log(`embedded ${Math.min(i + 100, texts.length)}/${texts.length}`);
}

if (out.some((r) => JSON.parse(r.e).length !== DIM)) throw new Error("dimension mismatch");
mkdirSync("data/embeddings", { recursive: true });
writeFileSync("data/embeddings/tri30-embeddings.json", JSON.stringify(out));
console.log(`wrote data/embeddings/tri30-embeddings.json (${out.length} rows, model ${MODEL}@${DIM})`);
