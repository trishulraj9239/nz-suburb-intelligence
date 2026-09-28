import { seriesLabel } from "@/lib/viz/aria";
import { deltaText, yearOf } from "@/lib/viz/format";
import { isEmpty, isOutlined, type Status } from "@/lib/viz/status";
import { EmptyTrack } from "./empty-track";

/**
 * Census trend (TRI-147): two or three dots joined by straight segments, with
 * the census years under them. Never a smooth line — a curve would imply data
 * between censuses that does not exist.
 */
export function SlopeChart({
  label,
  points,
  format,
  unit,
  judged = false,
  status,
  reason,
  width = 96,
  height = 30,
  className = "",
}: {
  label: string;
  points: { asOf: string; value: number }[];
  format: (v: number) => string;
  unit?: string | null;
  judged?: boolean;
  status: Status;
  reason?: string;
  width?: number;
  height?: number;
  className?: string;
}) {
  const pts = points.slice(-3);
  if (isEmpty(status) || pts.length < 2) return <EmptyTrack status={isEmpty(status) ? status : "unavailable"} reason={reason ?? (pts.length < 2 ? "one census only" : undefined)} label={label} className={className} />;
  const vals = pts.map((p) => p.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const padX = 10;
  const top = 4;
  const bottom = height - 14; // room for year labels
  const xs = pts.map((_, i) => padX + (i / (pts.length - 1)) * (width - padX * 2));
  const ys = vals.map((v) => bottom - ((v - min) / span) * (bottom - top));
  const color = judged ? "var(--harbour)" : "color-mix(in srgb, var(--ink) 75%, transparent)";
  const delta = deltaText(pts[0].value, pts[pts.length - 1].value, unit);
  const aria = seriesLabel({ label, first: format(pts[0].value), last: format(pts[pts.length - 1].value), firstAsOf: yearOf(pts[0].asOf), lastAsOf: yearOf(pts[pts.length - 1].asOf), delta, status, reason });
  return (
    <svg role="img" aria-label={aria} data-status={status} width={width} height={height} className={`block overflow-visible ${className}`}>
      {xs.slice(1).map((x, i) => (
        <line key={i} x1={xs[i]} y1={ys[i]} x2={x} y2={ys[i + 1]} stroke={color} strokeWidth={1.5} />
      ))}
      {xs.map((x, i) => (
        <circle key={pts[i].asOf} data-mark={isOutlined(status) ? "outlined" : "filled"} cx={x} cy={ys[i]} r={3.5} fill={isOutlined(status) ? "var(--surface)" : color} stroke={color} strokeWidth={1.5} />
      ))}
      {xs.map((x, i) => (
        <text key={`t-${pts[i].asOf}`} x={x} y={height - 1} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={12} fill="color-mix(in srgb, var(--ink) 55%, transparent)" aria-hidden>
          {yearOf(pts[i].asOf)}
        </text>
      ))}
    </svg>
  );
}
