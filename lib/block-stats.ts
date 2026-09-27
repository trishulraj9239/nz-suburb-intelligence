/**
 * TRI-130 — "your block, not just your suburb": Census 2023 + NZDep2023 for
 * the SA1 (a ~100–250-person block) containing a POINT, read live.
 *
 * Sources (both keyless, CC BY 4.0, the same mirrors the ETLs already use):
 *   Stats NZ AGOL mirror — 2023 Census totals by topic for individuals /
 *     households / dwellings by SA1, each joined to the SA1 polygon, so a
 *     point query returns the block's own row.
 *   Massey Healthspace mirror — NZDep2023 at SA1 (the index's native level;
 *     TRI-117 loads the SA2 average from the same service).
 * Four point queries in parallel, ~300 ms each, cached an hour. Nothing is
 * stored: no sa1_code on addresses, no SA1 rows in the registry.
 *
 * Honesty:
 *   • Census small-area cells are random-rounded to base 3 and SUPPRESSED
 *     when small (Stats NZ sentinels -999 / -997 / -998). A suppressed cell
 *     is null and named in `suppressed` so the UI says "not published for
 *     this block" — never zero, never the suburb figure in disguise.
 *   • Shares are computed against the topic's own "Total stated", so
 *     "not elsewhere included" never inflates or deflates them.
 *   • A block is still an area, not the property. NZDep is information,
 *     never a verdict.
 */

const STATS = "https://services2.arcgis.com/vKb0s8tBIA3bdocZ/arcgis/rest/services";
const NZDEP_SA1 = "https://services6.arcgis.com/ZVM1rEuVZjtC1Wwk/arcgis/rest/services/New_Zealand_Index_of_Deprivation_2023_WFL1/FeatureServer/0/query";

export const BLOCK_SOURCE = "Stats NZ 2023 Census, SA1 totals by topic (random-rounded) · CC BY 4.0";
export const BLOCK_NZDEP_SOURCE = "NZDep2023 at SA1 · University of Otago (via Massey Healthspace mirror) · CC BY 4.0";

export interface BlockStats {
  /** No SA1 at the point (water, or outside the census geography). */
  none?: boolean;
  sa1_code: string | null;
  sa2_code: string | null;
  /** Census usually resident population count, 2023. */
  population: number | null;
  median_age: number | null;
  /** Households: dwelling not owned and not in a family trust, % of stated. */
  renting_pct: number | null;
  owned_pct: number | null;
  trust_pct: number | null;
  one_person_household_pct: number | null;
  median_household_income: number | null;
  separate_house_pct: number | null;
  joined_dwelling_pct: number | null;
  avg_bedrooms: number | null;
  overseas_born_pct: number | null;
  /** Grouped total responses, % of stated — the four largest groups. */
  ethnicity: { label: string; pct: number | null }[];
  nzdep_decile: number | null;
  nzdep_score: number | null;
  /** Human labels of cells Stats NZ did not publish for this block. */
  suppressed: string[];
  source: string;
  nzdep_source: string;
  licence: string;
  retrieved_at: string;
  unavailable?: string;
}

// Field codes verified against the layers' aliases 2026-09-28.
const IND = {
  service: "2023_Census_totals_by_topic_for_individuals_by_SA1",
  population: "VAR_1_3",
  median_age: "VAR_1_69",
  eth_european: "VAR_1_158",
  eth_maori: "VAR_1_159",
  eth_pacific: "VAR_1_160",
  eth_asian: "VAR_1_161",
  eth_stated: "VAR_1_168",
  overseas_born: "VAR_1_96",
  birthplace_stated: "VAR_1_99",
};
const HH = {
  service: "2023_Census_totals_by_topic_for_households_by_SA1",
  owned: "VAR_4_184",
  not_owned: "VAR_4_185",
  trust: "VAR_4_186",
  tenure_stated: "VAR_4_189",
  one_person: "VAR_4_78",
  composition_stated: "VAR_4_81",
  median_income: "VAR_4_225",
};
const DW = {
  service: "2023_Census_totals_by_topic_for_dwellings_by_SA1",
  separate: "VAR_3_82",
  joined: "VAR_3_83",
  type_total: "VAR_3_89",
  avg_bedrooms: "VAR_3_173",
};

type Attrs = Record<string, number | string | null>;

const cache = new Map<string, { at: number; r: BlockStats }>();
const TTL_MS = 60 * 60 * 1000;
const CACHE_MAX = 2000;

// The 500-field SA1 layers answer in ~1–3 s warm but can stall cold: 14 s
// with one retry stays inside the route's 30 s budget.
async function pointQuery(url: string, lng: number, lat: number, outFields: string[]): Promise<Attrs | null> {
  const geometry = encodeURIComponent(JSON.stringify({ x: lng, y: lat, spatialReference: { wkid: 4326 } }));
  const attempt = async () => {
    const r = await fetch(
      `${url}?geometry=${geometry}&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects&outFields=${outFields.join(",")}&returnGeometry=false&resultRecordCount=1&f=json`,
      { signal: AbortSignal.timeout(14000) },
    );
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = (await r.json()) as { features?: { attributes: Attrs }[]; error?: { message?: string } };
    if (j.error) throw new Error(j.error.message ?? "service error");
    return j.features?.[0]?.attributes ?? null;
  };
  return attempt().catch(() => attempt());
}

/** A Stats NZ cell: negative sentinels mean suppressed / not applicable. */
function cell(a: Attrs | null, field: string, label: string, suppressed: string[]): number | null {
  const v = a?.[field];
  if (v === null || v === undefined || v === "") {
    suppressed.push(label);
    return null;
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    suppressed.push(label);
    return null;
  }
  return n;
}

/** Share of a stated total, one decimal; null when either side is unpublished or the total is 0. */
function share(num: number | null, den: number | null): number | null {
  if (num === null || den === null || den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

export async function blockStats(lng: number, lat: number): Promise<BlockStats> {
  const key = `${lng.toFixed(4)},${lat.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS && !hit.r.unavailable) return hit.r;

  const retrieved_at = new Date().toISOString();
  const base = { source: BLOCK_SOURCE, nzdep_source: BLOCK_NZDEP_SOURCE, licence: "CC BY 4.0", retrieved_at };
  const empty: BlockStats = {
    sa1_code: null,
    sa2_code: null,
    population: null,
    median_age: null,
    renting_pct: null,
    owned_pct: null,
    trust_pct: null,
    one_person_household_pct: null,
    median_household_income: null,
    separate_house_pct: null,
    joined_dwelling_pct: null,
    avg_bedrooms: null,
    overseas_born_pct: null,
    ethnicity: [],
    nzdep_decile: null,
    nzdep_score: null,
    suppressed: [],
    ...base,
  };
  try {
    const q = (s: { service: string }, fields: string[]) => pointQuery(`${STATS}/${s.service}/FeatureServer/0/query`, lng, lat, ["SA12023_V1_00", ...fields]);
    const [ind, hh, dw, dep] = await Promise.all([
      q(IND, Object.values(IND).filter((v) => /^VAR_/.test(v))),
      q(HH, Object.values(HH).filter((v) => /^VAR_/.test(v))),
      q(DW, Object.values(DW).filter((v) => /^VAR_/.test(v))),
      pointQuery(NZDEP_SA1, lng, lat, ["SA12023_code", "SA22023_code", "NZDep2023", "NZDep2023_Score", "URPopnSA1_2023"]).catch(() => null),
    ]);
    if (!ind && !hh && !dw) {
      const r: BlockStats = { ...empty, none: true };
      cache.set(key, { at: Date.now(), r });
      return r;
    }
    const suppressed: string[] = [];
    const population = cell(ind, IND.population, "people counted", suppressed);
    const median_age = cell(ind, IND.median_age, "median age", suppressed);
    const ethStated = cell(ind, IND.eth_stated, "ethnicity", suppressed);
    const ethnicity = (
      [
        ["European", IND.eth_european],
        ["Māori", IND.eth_maori],
        ["Pacific Peoples", IND.eth_pacific],
        ["Asian", IND.eth_asian],
      ] as const
    ).map(([label, f]) => ({ label, pct: share(cell(ind, f, `ethnicity (${label})`, suppressed), ethStated) }));
    const overseas_born_pct = share(cell(ind, IND.overseas_born, "overseas-born", suppressed), cell(ind, IND.birthplace_stated, "birthplace", suppressed));
    const tenureStated = cell(hh, HH.tenure_stated, "tenure", suppressed);
    const renting_pct = share(cell(hh, HH.not_owned, "households renting", suppressed), tenureStated);
    const owned_pct = share(cell(hh, HH.owned, "households owning", suppressed), tenureStated);
    const trust_pct = share(cell(hh, HH.trust, "households in a family trust", suppressed), tenureStated);
    const one_person_household_pct = share(cell(hh, HH.one_person, "one-person households", suppressed), cell(hh, HH.composition_stated, "household composition", suppressed));
    const median_household_income = cell(hh, HH.median_income, "median household income", suppressed);
    const typeTotal = cell(dw, DW.type_total, "dwelling type", suppressed);
    const separate_house_pct = share(cell(dw, DW.separate, "separate houses", suppressed), typeTotal);
    const joined_dwelling_pct = share(cell(dw, DW.joined, "joined dwellings", suppressed), typeTotal);
    const avg_bedrooms = cell(dw, DW.avg_bedrooms, "average bedrooms", suppressed);
    const nzdep_decile = dep?.NZDep2023 != null ? Number(dep.NZDep2023) : null;
    const nzdep_score = dep?.NZDep2023_Score != null ? Number(dep.NZDep2023_Score) : null;
    const r: BlockStats = {
      ...empty,
      sa1_code: String(ind?.SA12023_V1_00 ?? hh?.SA12023_V1_00 ?? dw?.SA12023_V1_00 ?? dep?.SA12023_code ?? ""),
      sa2_code: dep?.SA22023_code ? String(dep.SA22023_code) : null,
      population,
      median_age,
      renting_pct,
      owned_pct,
      trust_pct,
      one_person_household_pct,
      median_household_income,
      separate_house_pct,
      joined_dwelling_pct,
      avg_bedrooms,
      overseas_born_pct,
      ethnicity,
      nzdep_decile,
      nzdep_score,
      // De-duplicate and drop the denominators' own labels when their numerators were published.
      suppressed: [...new Set(suppressed)],
    };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), r });
    return r;
  } catch (e) {
    return { ...empty, unavailable: (e as Error).message };
  }
}
