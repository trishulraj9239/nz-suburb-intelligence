import { percentileOf, type MetricDef, type RegionalStat, type SuburbProfile } from "@/lib/suburb-data";
import type { DotId } from "@/components/viz/dot-strip";

/**
 * TRI-149 — Compare helpers. Pure functions over 2–3 profiles so the panel is
 * composition and the rules are testable in words:
 *  - a suburb keeps the same letter (A / B / C) and Okabe-Ito hue everywhere;
 *  - "best" exists only where the registry declares a direction, and never
 *    among ties;
 *  - "Only differences" hides rows the reader would call the same — closer
 *    than ten percentile points of Auckland (or ten minutes' drive, fifteen
 *    by bike or on foot) — and always keeps a row where a suburb has no value,
 *    because a gap in coverage is a difference, not a similarity.
 */
export const DOT_IDS: DotId[] = ["a", "b", "c"];
export const LETTER: Record<DotId, string> = { a: "A", b: "B", c: "C" };

export interface Entry {
  id: DotId;
  code: string;
  name: string;
  value: number | null;
  confidence: string | null;
  source: string | null;
  asOf: string | null;
}

export function entriesFor(profiles: SuburbProfile[], key: string): Entry[] {
  return profiles.map((p, i) => {
    const s = p.scalars.find((x) => x.def.metric_key === key);
    return { id: DOT_IDS[i], code: p.suburb.sa2_code, name: p.suburb.name, value: s?.value ?? null, confidence: s?.confidence ?? null, source: s?.source ?? null, asOf: s?.asOf ?? null };
  });
}

/** Codes that are best on this metric — empty when the registry has no direction or the set is tied. */
export function bestSet(def: MetricDef, entries: Entry[]): Set<string> {
  if (def.higher_is_better === null) return new Set();
  const live = entries.filter((e): e is Entry & { value: number } => e.value != null);
  if (live.length < 2) return new Set();
  const target = def.higher_is_better ? Math.max(...live.map((e) => e.value)) : Math.min(...live.map((e) => e.value));
  const winners = live.filter((e) => e.value === target);
  return winners.length < live.length ? new Set(winners.map((e) => e.code)) : new Set();
}

const PCT_GAP = 10;
const DRIVE_GAP_MIN = 10;
const ACTIVE_GAP_MIN = 15;

export function differs(def: MetricDef, entries: Entry[], stat?: RegionalStat): boolean {
  const vals = entries.map((e) => e.value);
  if (vals.some((v) => v == null)) return true;
  const nums = vals as number[];
  if (def.unit === "min") {
    const gap = Math.max(...nums) - Math.min(...nums);
    return gap >= (/(cycle|walk)/.test(def.metric_key) ? ACTIVE_GAP_MIN : DRIVE_GAP_MIN);
  }
  if (stat) {
    const pcts = nums.map((v) => percentileOf(v, stat));
    return Math.max(...pcts) - Math.min(...pcts) >= PCT_GAP;
  }
  return new Set(nums).size > 1;
}

/** One chip for the row when every suburb shares source + vintage + confidence; otherwise the row shows per-suburb quality marks. */
export function sharedProvenance(entries: Entry[]): { source: string; asOf: string; confidence: string | null } | null {
  const live = entries.filter((e) => e.source);
  if (!live.length) return null;
  const sources = new Set(live.map((e) => `${e.source}|${e.asOf}`));
  if (sources.size !== 1) return null;
  const confs = new Set(live.map((e) => e.confidence));
  return { source: live[0].source!, asOf: live[0].asOf!, confidence: confs.size === 1 ? live[0].confidence : null };
}
