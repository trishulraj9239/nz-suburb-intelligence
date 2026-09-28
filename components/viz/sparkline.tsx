import { seriesLabel } from "@/lib/viz/aria";
import { deltaText, yearOf } from "@/lib/viz/format";
import { isEmpty, isOutlined, type Status } from "@/lib/viz/status";
import { EmptyTrack } from "./empty-track";

/**
 * Trend with many points (TRI-147): quarterly rent, monthly consents. A
 * polyline, an end dot, and the delta in mono. The dot's colour says only
 * whether the metric is judged; direction is stated in the delta, not by hue.
 */
export function Sparkline({
  label,
  points,
  format,
  unit,
  deltaBack = 1,
  deltaAsPct = false,
  judged = false,
  status,
  reason,
  width = 72,
  height = 20,
  className = "",
}: {
  label: string;
  points: { asOf: string; value: number }[];
  format: (v: number) => string;
  unit?: string | null;
  deltaBack?: number;
  deltaAsPct?: boolean;
  judged?: boolean;
  status: Status;
  reason?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (isEmpty(status) || points.length < 2) return <EmptyTrack status={isEmpty(status) ? status : "unavailable"} reason={reason ?? (points.length < 2 ? "not enough history" : undefined)} label={label} className={className} />;
  const vals = points.map((p) => p.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const pad = 3;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (width - pad * 2));
  const ys = vals.map((v) => height - pad - ((v - min) / span) * (height - pad * 2));
  const last = points[points.length - 1];
  const back = points[Math.max(0, points.length - 1 - deltaBack)];
  const delta = deltaText(back.value, last.value, unit, deltaAsPct);
  const color = judged ? "var(--harbour)" : "color-mix(in srgb, var(--ink) 75%, transparent)";
  const aria = seriesLabel({ label, first: format(points[0].value), last: format(last.value), firstAsOf: yearOf(points[0].asOf), lastAsOf: yearOf(last.asOf), delta, status, reason });
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg role="img" aria-label={aria} data-status={status} width={width} height={height} className="block overflow-visible">
        <polyline points={xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
        <circle data-mark={isOutlined(status) ? "outlined" : "filled"} cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} fill={isOutlined(status) ? "var(--surface)" : color} stroke={color} strokeWidth={1.5} />
      </svg>
      {delta && (
        <span className="font-mono text-micro text-ink/70" aria-hidden>
          {delta}
        </span>
      )}
    </span>
  );
}
