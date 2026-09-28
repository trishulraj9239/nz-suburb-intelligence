import type { RegionalStat } from "@/lib/suburb-data";
import { axisDomain, axisPct } from "@/lib/viz/scale";

/**
 * The regional axis drawn under every scalar (TRI-147): faint whiskers from
 * min to max, the interquartile band p25–p75 as the track, and the Auckland
 * median as a tick. Percent x-coordinates keep it responsive without a
 * viewBox (no distortion of markers).
 */
export function AxisTrack({ stat, mid = 7, trackColor = "var(--hairline)", tickColor = "color-mix(in srgb, var(--ink) 45%, transparent)" }: { stat: RegionalStat; mid?: number; trackColor?: string; tickColor?: string }) {
  const p = (v: number) => `${axisPct(v, stat).toFixed(2)}%`;
  const [lo, hi] = axisDomain(stat);
  return (
    <>
      <line x1={p(lo)} x2={p(hi)} y1={mid} y2={mid} stroke={trackColor} strokeWidth={1} opacity={0.8} />
      <rect data-track x={p(stat.p25)} y={mid - 3} width={`${Math.max(0.8, axisPct(stat.p75, stat) - axisPct(stat.p25, stat)).toFixed(2)}%`} height={6} rx={3} fill={trackColor} />
      <line data-tick x1={p(stat.median)} x2={p(stat.median)} y1={mid - 6} y2={mid + 6} stroke={tickColor} strokeWidth={1.5} />
    </>
  );
}
