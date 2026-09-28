import { createClient } from "@/lib/supabase/server";
import { percentileOf, type RegionalStat } from "@/lib/suburb-data";
import type { UrlState } from "@/lib/url-state";

/**
 * TRI-153 — the data behind a share card (the OG image for a pasted link).
 * Server-only, reads the same public rows the profile does, carries the same
 * honesty: three headline figures on the Auckland axis with their source,
 * vintage and quality; a suppressed figure is drawn as a hatched track and
 * says so. Never persona, budget or saved places — a card is the VIEW, not
 * the reader (TRI-97 rule).
 */

export interface CardBullet {
  label: string;
  value: string | null;
  /** 0–100 on the Auckland axis, null when suppressed */
  pct: number | null;
  /** interquartile band + median as 0–100 positions */
  p25: number | null;
  median: number | null;
  p75: number | null;
  medianText: string | null;
  source: string;
  asOf: string;
  quality: "exact" | "est." | "approx" | "computed";
  reason?: string;
}

export interface ShareCard {
  kind: "suburb" | "compare" | "question" | "home";
  title: string;
  subtitle: string;
  bullets: CardBullet[];
  /** compare: one row per suburb with its rent on the shared axis */
  dots: { letter: string; name: string; value: string | null; pct: number | null }[];
}

const HEADLINE = ["rent_median_weekly", "commute_cbd_drive_min", "median_household_income"];
const SOURCE_SHORT: Record<string, string> = { "Tenancy bond data (quarterly, SA2)": "MBIE Tenancy bonds" };
const QUALITY: Record<string, CardBullet["quality"]> = { high: "exact", medium: "est.", low: "approx", derived: "computed" };
const SUPPRESSED_REASON: Record<string, string> = { rent_median_weekly: "fewer than 5 bonds in the quarter" };

function fmt(unit: string | null, v: number): string {
  if (unit === "$/week") return `$${Math.round(v).toLocaleString()}/wk`;
  if (unit === "$/year") return `$${Math.round(v).toLocaleString()}`;
  if (unit === "min") return `${Math.round(v)} min`;
  if (unit === "%") return `${v.toFixed(1)}%`;
  return Math.round(v).toLocaleString();
}
const asOfText = (d: string) => {
  const m = d.match(/^(\d{4})-(01|04|07|10)-01$/);
  return m ? `${m[1]} Q${{ "01": 1, "04": 2, "07": 3, "10": 4 }[m[2]]}` : d.slice(0, 4);
};

interface Row {
  value_num: string | null;
  as_of_date: string;
  confidence: string;
  category: string | null;
  geographies: { sa2_code: string; name: string } | null;
  metric_definitions: { metric_key: string; label: string; unit: string | null } | null;
  sources: { name: string } | null;
}

export async function shareCard(state: UrlState): Promise<ShareCard> {
  const supabase = await createClient();
  // A comparison keeps the compare order (A/B/C match the app); otherwise the open suburb.
  const codes = state.compare.length >= 2 ? [...new Set(state.compare)] : state.sa2 ? [state.sa2] : [];
  const names = new Map<string, string>();
  if (codes.length) {
    const { data } = await supabase.from("geographies").select("sa2_code,name").in("sa2_code", codes).eq("geo_type", "SA2");
    for (const g of data ?? []) names.set(g.sa2_code, g.name);
  }

  if (state.q && !state.sa2 && !state.compare.length) {
    return { kind: "question", title: state.q, subtitle: "Asked of New Zealand open government data — every figure cited to its source", bullets: [], dots: [] };
  }
  if (!codes.length) {
    return { kind: "home", title: "NZ Suburb Intelligence", subtitle: "Natural-language suburb comparison over New Zealand open government data", bullets: [], dots: [] };
  }

  const { data: rows } = await supabase
    .from("metric_values")
    .select("value_num, as_of_date, confidence, category, geographies!inner(sa2_code, name), metric_definitions!inner(metric_key, label, unit), sources(name)")
    .in("geographies.sa2_code", codes)
    .in("metric_definitions.metric_key", HEADLINE)
    .is("category", null)
    .not("value_num", "is", null);
  const { data: statRows } = await supabase.from("regional_metric_stats").select("metric_key, as_of_date, min, p25, median, p75, max").eq("region_code", "02").in("metric_key", HEADLINE);
  const stats: RegionalStat[] = (statRows ?? []).map((r) => ({ metric_key: r.metric_key, as_of_date: r.as_of_date, min: Number(r.min), p25: Number(r.p25), median: Number(r.median), p75: Number(r.p75), max: Number(r.max) }));
  const statFor = (k: string, asOf: string) => stats.find((s) => s.metric_key === k && s.as_of_date === asOf);

  // Latest row per suburb × metric.
  const latest = new Map<string, Row>();
  for (const r of (rows ?? []) as unknown as Row[]) {
    const k = `${r.geographies?.sa2_code}|${r.metric_definitions?.metric_key}`;
    const prev = latest.get(k);
    if (!prev || r.as_of_date > prev.as_of_date) latest.set(k, r);
  }
  const bulletFor = (sa2: string, key: string): CardBullet => {
    const r = latest.get(`${sa2}|${key}`);
    const label = r?.metric_definitions?.label ?? { rent_median_weekly: "Median rent (new tenancies)", commute_cbd_drive_min: "Drive to CBD", median_household_income: "Median household income" }[key] ?? key;
    if (!r || r.value_num === null) {
      return { label, value: null, pct: null, p25: null, median: null, p75: null, medianText: null, source: key === "rent_median_weekly" ? "MBIE Tenancy bonds" : "—", asOf: "", quality: "est.", reason: SUPPRESSED_REASON[key] ?? "not published for this area" };
    }
    const v = Number(r.value_num);
    const st = statFor(key, r.as_of_date);
    const unit = r.metric_definitions?.unit ?? null;
    const pos = (x: number) => (st ? percentileOf(x, st) : null);
    return {
      label,
      value: fmt(unit, v),
      pct: st ? percentileOf(v, st) : null,
      p25: st ? pos(st.p25) : null,
      median: st ? 50 : null,
      p75: st ? pos(st.p75) : null,
      medianText: st ? fmt(unit, st.median) : null,
      source: SOURCE_SHORT[r.sources?.name ?? ""] ?? r.sources?.name ?? "—",
      asOf: asOfText(r.as_of_date),
      quality: QUALITY[r.confidence] ?? "est.",
    };
  };

  if (codes.length >= 2) {
    const dots = codes.map((c, i) => {
      const b = bulletFor(c, "rent_median_weekly");
      return { letter: "ABC"[i] ?? "?", name: names.get(c) ?? c, value: b.value, pct: b.pct };
    });
    return {
      kind: "compare",
      title: codes.map((c) => names.get(c) ?? c).join(" vs "),
      subtitle: state.q ? state.q : "Median rent (new tenancies) on the Auckland axis · MBIE Tenancy bonds",
      bullets: [bulletFor(codes[0], "rent_median_weekly")],
      dots,
    };
  }
  const sa2 = codes[0];
  return {
    kind: "suburb",
    title: names.get(sa2) ?? sa2,
    subtitle: state.q ? state.q : "Three headline figures on the Auckland axis · every figure sourced",
    bullets: HEADLINE.map((k) => bulletFor(sa2, k)),
    dots: [],
  };
}
