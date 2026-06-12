import { createClient } from "@/lib/supabase/client";

/**
 * Client-side data access for the profile/compare views. Everything reads
 * through the anon key + RLS public-read policies; values arrive as strings
 * from PostgREST numerics and are parsed here once.
 */

export interface Suburb {
  id: number;
  sa2_code: string;
  name: string;
  land_area_km2: number | null;
  is_active: boolean;
}

export interface MetricDef {
  metric_key: string;
  label: string;
  dimension: string;
  unit: string | null;
  value_type: string;
  higher_is_better: boolean | null;
  display_order: number;
}

export interface ScalarValue {
  def: MetricDef;
  value: number;
  asOf: string;
  source: string;
  confidence: string;
  /** Census time series, oldest first (1-3 points). */
  history: { asOf: string; value: number }[];
}

export interface BreakdownValue {
  def: MetricDef;
  asOf: string;
  source: string;
  confidence: string;
  totalStated: number | null;
  categories: { label: string; count: number; pct: number | null }[];
}

export interface School {
  name: string;
  school_type: string | null;
  authority: string | null;
  roll: number | null;
}

export interface NearbySchool extends School {
  distance_km: number;
}

export interface SuburbProfile {
  suburb: Suburb;
  scalars: ScalarValue[];
  breakdowns: BreakdownValue[];
  /** Schools located within the SA2 (compare counts use this). */
  schools: School[];
  /** Closest schools by geodesic distance from the centroid (TRI-36). */
  nearbySchools: NearbySchool[];
  /** Straight-line km, suburb centroid → Auckland CBD. */
  cbdKm: number | null;
}

export interface RegionalStat {
  metric_key: string;
  as_of_date: string;
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
}

/** Piecewise-linear percentile of v against the regional quartile fence. */
export function percentileOf(v: number, s: RegionalStat): number {
  const seg = [
    [s.min, 0],
    [s.p25, 25],
    [s.median, 50],
    [s.p75, 75],
    [s.max, 100],
  ] as const;
  if (v <= s.min) return 0;
  if (v >= s.max) return 100;
  for (let i = 1; i < seg.length; i++) {
    const [hi, hp] = seg[i];
    const [lo, lp] = seg[i - 1];
    if (v <= hi) return hi === lo ? hp : lp + ((v - lo) / (hi - lo)) * (hp - lp);
  }
  return 100;
}

let defsCache: MetricDef[] | null = null;
/** Active scalar metric definitions — drives the map shade picker. */
export async function fetchMetricDefs(): Promise<MetricDef[]> {
  if (defsCache) return defsCache;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("metric_definitions")
    .select("metric_key,label,dimension,unit,value_type,higher_is_better,display_order")
    .eq("is_active", true)
    .eq("value_type", "scalar")
    .order("display_order");
  if (error) throw error;
  defsCache = (data ?? []) as MetricDef[];
  return defsCache;
}

const shadeCache = new Map<string, { sa2: string; value: number }[]>();
/** Latest value of one metric for every active suburb (for choropleths). */
export async function fetchMetricShade(
  metricKey: string,
): Promise<{ sa2: string; value: number }[]> {
  const cached = shadeCache.get(metricKey);
  if (cached) return cached;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("metric_values")
    .select(
      "value_num, as_of_date, geographies!inner(sa2_code, is_active), metric_definitions!inner(metric_key)",
    )
    .eq("metric_definitions.metric_key", metricKey)
    .eq("geographies.is_active", true)
    .is("category", null)
    .not("value_num", "is", null);
  if (error) throw error;
  const latest = new Map<string, { value: number; asOf: string }>();
  for (const r of data ?? []) {
    const sa2 = (r.geographies as unknown as { sa2_code: string }).sa2_code;
    const prev = latest.get(sa2);
    if (!prev || r.as_of_date > prev.asOf) {
      latest.set(sa2, { value: Number(r.value_num), asOf: r.as_of_date });
    }
  }
  const rows = [...latest.entries()].map(([sa2, v]) => ({ sa2, value: v.value }));
  shadeCache.set(metricKey, rows);
  return rows;
}

let suburbsCache: Suburb[] | null = null;
export async function fetchSuburbs(): Promise<Suburb[]> {
  if (suburbsCache) return suburbsCache;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("geographies")
    .select("id, sa2_code, name, land_area_km2, is_active")
    .eq("geo_type", "SA2")
    .eq("is_active", true)
    .order("name");
  if (error) throw error;
  suburbsCache = (data ?? []).map((g) => ({
    ...g,
    land_area_km2: g.land_area_km2 === null ? null : Number(g.land_area_km2),
  }));
  return suburbsCache;
}

let statsCache: RegionalStat[] | null = null;
export async function fetchRegionalStats(): Promise<RegionalStat[]> {
  if (statsCache) return statsCache;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("regional_metric_stats")
    .select("metric_key, as_of_date, min, p25, median, p75, max")
    .eq("region_code", "02");
  if (error) throw error;
  statsCache = (data ?? []).map((r) => ({
    metric_key: r.metric_key,
    as_of_date: r.as_of_date,
    min: Number(r.min),
    p25: Number(r.p25),
    median: Number(r.median),
    p75: Number(r.p75),
    max: Number(r.max),
  }));
  return statsCache;
}

interface MetricRow {
  category: string | null;
  value_num: string | null;
  as_of_date: string;
  confidence: string;
  metric_definitions: MetricDef | null;
  sources: { name: string } | null;
}

export async function fetchProfile(sa2: string): Promise<SuburbProfile | null> {
  const suburbs = await fetchSuburbs();
  const suburb = suburbs.find((s) => s.sa2_code === sa2) ?? null;
  if (!suburb) return null;

  const supabase = createClient();
  const [
    { data: rows, error: e1 },
    { data: schoolRows, error: e2 },
    { data: nearbyRows },
    { data: cbdKmRaw },
  ] = await Promise.all([
    supabase
      .from("metric_values")
      .select(
        "category, value_num, as_of_date, confidence, metric_definitions(metric_key,label,dimension,unit,value_type,higher_is_better,display_order), sources(name)",
      )
      .eq("geo_id", suburb.id),
    supabase
      .from("schools")
      .select("name, school_type, authority, roll")
      .eq("geo_id", suburb.id)
      .order("roll", { ascending: false, nullsFirst: false }),
    supabase.rpc("nearby_schools", { p_sa2_code: sa2, p_count: 8 }),
    supabase.rpc("cbd_distance_km", { p_sa2_code: sa2 }),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;

  // Keep only the latest as_of_date per metric (the time series stays in the
  // DB for later milestones; the card shows current state).
  const byMetric = new Map<string, MetricRow[]>();
  for (const raw of (rows ?? []) as unknown as MetricRow[]) {
    if (!raw.metric_definitions || raw.value_num === null) continue;
    const k = raw.metric_definitions.metric_key;
    const list = byMetric.get(k) ?? [];
    list.push(raw);
    byMetric.set(k, list);
  }

  const scalars: ScalarValue[] = [];
  const breakdowns: BreakdownValue[] = [];
  for (const [, list] of byMetric) {
    const latest = list.reduce((a, b) => (a.as_of_date >= b.as_of_date ? a : b)).as_of_date;
    const current = list.filter((r) => r.as_of_date === latest);
    const def = current[0].metric_definitions!;
    const source = current[0].sources?.name ?? "—";
    const confidence = current.reduce(
      (worst, r) =>
        ["low", "medium", "high"].indexOf(r.confidence) <
        ["low", "medium", "high"].indexOf(worst)
          ? r.confidence
          : worst,
      "high",
    );

    if (def.value_type === "breakdown") {
      const totalRow = current.find((r) => r.category === "Total stated" || r.category === "Total");
      const total = totalRow ? Number(totalRow.value_num) : null;
      const categories = current
        .filter((r) => r.category && r !== totalRow)
        .map((r) => ({
          label: r.category!,
          count: Number(r.value_num),
          pct: total ? (Number(r.value_num) / total) * 100 : null,
        }))
        .sort((a, b) => b.count - a.count);
      breakdowns.push({ def, asOf: latest, source, confidence, totalStated: total, categories });
    } else {
      const row = current.find((r) => r.category === null) ?? current[0];
      const history = list
        .filter((r) => r.category === null && r.value_num !== null)
        .map((r) => ({ asOf: r.as_of_date, value: Number(r.value_num) }))
        .sort((a, b) => a.asOf.localeCompare(b.asOf));
      scalars.push({
        def,
        value: Number(row.value_num),
        asOf: latest,
        source,
        confidence,
        history,
      });
    }
  }

  scalars.sort((a, b) => a.def.display_order - b.def.display_order);
  breakdowns.sort((a, b) => a.def.display_order - b.def.display_order);

  return {
    suburb,
    scalars,
    breakdowns,
    schools: (schoolRows ?? []) as School[],
    nearbySchools: (nearbyRows ?? []) as NearbySchool[],
    cbdKm: cbdKmRaw === null || cbdKmRaw === undefined ? null : Number(cbdKmRaw),
  };
}

export function formatValue(def: MetricDef, v: number): string {
  if (def.unit === "$/week") return `$${Math.round(v).toLocaleString()}/wk`;
  if (def.unit === "$/year") return `$${Math.round(v).toLocaleString()}`;
  if (def.unit === "years") return v.toFixed(1);
  if (def.unit === "decile") return `${v} / 10`;
  if (def.unit === "score") return `${Math.round(v)}`;
  return Math.round(v).toLocaleString();
}
