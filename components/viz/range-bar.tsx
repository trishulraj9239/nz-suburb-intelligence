import type { RegionalStat } from "@/lib/suburb-data";
import { axisPct } from "@/lib/viz/scale";
import { rangeLabel } from "@/lib/viz/aria";
import { isEmpty, type Status } from "@/lib/viz/status";
import { AxisTrack } from "./axis-track";
import { Marker } from "./marker";
import { EmptyTrack } from "./empty-track";

/**
 * Distribution / quartiles (TRI-147) — e.g. rent LQ–median–UQ — drawn on the
 * SAME regional axis as the median bullet so the rows line up: a translucent
 * band from lo to hi with the median as a marker.
 */
export function RangeBar({
  label,
  lo,
  mid,
  hi,
  stat,
  format,
  judged = false,
  status,
  reason,
  height = 14,
  className = "",
}: {
  label: string;
  lo: number;
  mid: number;
  hi: number;
  stat: RegionalStat;
  format: (v: number) => string;
  judged?: boolean;
  status: Status;
  reason?: string;
  height?: number;
  className?: string;
}) {
  if (isEmpty(status)) return <EmptyTrack status={status} reason={reason} label={label} className={className} />;
  const color = judged ? "var(--harbour)" : "color-mix(in srgb, var(--ink) 75%, transparent)";
  const x0 = axisPct(lo, stat);
  const x1 = axisPct(hi, stat);
  return (
    <svg role="img" aria-label={rangeLabel({ label, lo: format(lo), mid: format(mid), hi: format(hi), status, reason })} data-status={status} width="100%" height={height} className={`block overflow-visible ${className}`}>
      <AxisTrack stat={stat} mid={height / 2} />
      <rect x={`${x0.toFixed(2)}%`} y={height / 2 - 4} width={`${Math.max(0.8, x1 - x0).toFixed(2)}%`} height={8} rx={2} fill={color} opacity={0.3} />
      <Marker x={`${axisPct(mid, stat).toFixed(2)}%`} status={status} color={color} height={height - 2} />
    </svg>
  );
}
