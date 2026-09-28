import type { RegionalStat } from "@/lib/suburb-data";
import { axisPct, percentilePosition } from "@/lib/viz/scale";
import { bulletLabel } from "@/lib/viz/aria";
import { isEmpty, type Status } from "@/lib/viz/status";
import { AxisTrack } from "./axis-track";
import { Marker } from "./marker";
import { EmptyTrack } from "./empty-track";

/**
 * Single value vs region (TRI-147): the marker sits on the interquartile
 * track with the median tick, so "how unusual is this suburb" reads from
 * position alone. Axis is the regional distribution, never 0–max.
 */
export function BulletBar({
  label,
  value,
  stat,
  format,
  judged = false,
  status,
  reason,
  height = 14,
  className = "",
}: {
  label: string;
  value: number;
  stat: RegionalStat;
  format: (v: number) => string;
  judged?: boolean;
  status: Status;
  reason?: string;
  height?: number;
  className?: string;
}) {
  if (isEmpty(status)) return <EmptyTrack status={status} reason={reason} label={label} className={className} />;
  const pct = percentilePosition(value, stat);
  const aria = bulletLabel({ label, value: format(value), pct, median: format(stat.median), status, reason });
  const color = judged ? "var(--harbour)" : "color-mix(in srgb, var(--ink) 75%, transparent)";
  return (
    <svg role="img" aria-label={aria} data-status={status} width="100%" height={height} className={`block overflow-visible ${className}`}>
      <AxisTrack stat={stat} mid={height / 2} />
      <Marker x={`${axisPct(value, stat).toFixed(2)}%`} status={status} color={color} height={height - 2} />
    </svg>
  );
}
