import { percentileOf, type RegionalStat } from "@/lib/suburb-data";

/**
 * Tiny in-repo scale helpers (TRI-147) — the design decision was
 * dependency-free, and the primitives need nothing d3-scale offers beyond a
 * clamped linear map and a few ticks.
 */
export interface Scale {
  (v: number): number;
  invert(px: number): number;
  domain: [number, number];
  range: [number, number];
}

export function linear(domain: [number, number], range: [number, number], clamp = true): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const f = ((v: number) => {
    let t = (v - d0) / span;
    if (clamp) t = Math.min(1, Math.max(0, t));
    return r0 + t * (r1 - r0);
  }) as Scale;
  f.invert = (px: number) => d0 + ((px - r0) / (r1 - r0 || 1)) * span;
  f.domain = domain;
  f.range = range;
  return f;
}

/**
 * The regional axis every scalar row shares (user decision 2026-09-28):
 * the drawn track is the INTERQUARTILE band p25–p75, faint whiskers reach
 * min and max, the tick is the median. Never 0–max.
 */
export function regionalDomain(stat: RegionalStat): { track: [number, number]; whiskers: [number, number]; median: number } {
  return { track: [stat.p25, stat.p75], whiskers: [stat.min, stat.max], median: stat.median };
}

/** 0–100 position of a value on the regional axis (piecewise over the quartile fence). */
export function percentilePosition(v: number, stat: RegionalStat): number {
  return percentileOf(v, stat);
}

/**
 * Drawing domain: min..max fenced at Tukey limits (p25 − 1.5·IQR, p75 + 1.5·IQR),
 * so one far outlier (a $1,500/wk suburb) cannot squash the interquartile
 * track into a sliver. Values beyond the fence pin to the axis end.
 */
export function axisDomain(stat: RegionalStat): [number, number] {
  const iqr = stat.p75 - stat.p25;
  return [Math.max(stat.min, stat.p25 - 1.5 * iqr), Math.min(stat.max, stat.p75 + 1.5 * iqr)];
}

/** Percent-of-width position for drawing: the fenced domain mapped onto 2..98 so markers never clip. */
export function axisPct(v: number, stat: RegionalStat): number {
  return linear(axisDomain(stat), [2, 98])(v);
}

export function ticks(domain: [number, number], count = 4): number[] {
  const [a, b] = domain;
  const step = (b - a) / count;
  return Array.from({ length: count + 1 }, (_, i) => a + i * step);
}
