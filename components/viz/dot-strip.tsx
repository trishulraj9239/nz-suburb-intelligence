import type { RegionalStat } from "@/lib/suburb-data";
import { axisPct, linear } from "@/lib/viz/scale";
import { dotStripLabel } from "@/lib/viz/aria";
import { isEmpty, isOutlined, type Status } from "@/lib/viz/status";
import { CAT_COLOR } from "@/lib/viz/palettes";
import { AxisTrack } from "./axis-track";
import { EmptyTrack } from "./empty-track";

export type DotId = "a" | "b" | "c";

/**
 * Multi-suburb compare (TRI-147): one track, one median tick, lettered dots
 * in Okabe-Ito orange / sky-blue / green with the suburb's initial inside —
 * colour is never the only cue. Every dot has an ink ring so its edge keeps
 * 3:1 whatever the hue; an estimate is a TINTED dot (35 % fill) rather than
 * a solid one. A thin outer ring marks "best" on the chart; the "best" /
 * "over budget" badges live beside the values, never here.
 */
export function DotStrip({
  label,
  stat,
  domain,
  dots,
  format,
  status = "exact",
  reason,
  height = 22,
  className = "",
}: {
  label: string;
  stat?: RegionalStat;
  domain?: [number, number];
  dots: { id: DotId; name: string; initial: string; value: number | null; status: Status; best?: boolean }[];
  format: (v: number) => string;
  status?: Status;
  reason?: string;
  height?: number;
  className?: string;
}) {
  if (isEmpty(status)) return <EmptyTrack status={status} reason={reason} label={label} className={className} />;
  const live = dots.filter((d) => d.value != null && !isEmpty(d.status));
  const dom: [number, number] = domain ?? (stat ? [stat.min, stat.max] : [Math.min(...live.map((d) => d.value!)), Math.max(...live.map((d) => d.value!))]);
  const x = stat ? (v: number) => `${axisPct(v, stat).toFixed(2)}%` : (v: number) => `${linear(dom, [4, 96])(v).toFixed(2)}%`;
  const aria = dotStripLabel({ label, dots: dots.map((d) => ({ name: d.name, value: d.value != null ? format(d.value) : "unavailable", status: d.status, best: d.best })), median: stat ? format(stat.median) : undefined });
  const mid = height / 2;
  return (
    <svg role="img" aria-label={aria} data-status={status} width="100%" height={height} className={`block overflow-visible ${className}`}>
      {stat ? <AxisTrack stat={stat} mid={mid} /> : <line x1="4%" x2="96%" y1={mid} y2={mid} stroke="var(--hairline)" strokeWidth={1} />}
      {live.map((d) => {
        const outlined = isOutlined(d.status);
        const hue = CAT_COLOR[d.id];
        return (
          <g key={d.id}>
            {d.best && <circle cx={x(d.value!)} cy={mid} r={11} fill="none" stroke="var(--ink)" strokeWidth={1} opacity={0.7} data-best />}
            <circle
              data-mark={outlined ? "outlined" : "filled"}
              data-dot={d.id}
              cx={x(d.value!)}
              cy={mid}
              r={8}
              fill={outlined ? `color-mix(in srgb, ${hue} 35%, transparent)` : hue}
              stroke="var(--ink)"
              strokeWidth={1}
            />
            <text data-letter={d.id} x={x(d.value!)} y={mid + 3.5} textAnchor="middle" fontFamily="var(--font-mono)" fontSize={10} fontWeight={700} fill={outlined ? "var(--ink)" : "var(--mark-ink)"} aria-hidden>
              {d.initial}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
