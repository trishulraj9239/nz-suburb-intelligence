import { dotPlotLabel } from "@/lib/viz/aria";
import { isEmpty, isOutlined, type Status } from "@/lib/viz/status";
import { CAT_COLOR } from "@/lib/viz/palettes";
import { EmptyTrack } from "./empty-track";

export type Mode = "drive" | "cycle" | "walk";
const MODE_LABEL: Record<Mode, string> = { drive: "drive", cycle: "cycle", walk: "walk" };

/** Distinct shapes per mode so colour is never the only cue. */
function ModeGlyph({ mode, cx, cy, outlined }: { mode: Mode; cx: string; cy: number; outlined: boolean }) {
  const color = CAT_COLOR[mode];
  // Ink ring on every glyph so the edge keeps 3:1 whatever the hue; an estimate is a tinted glyph, not a solid one.
  const fill = outlined ? `color-mix(in srgb, ${color} 35%, transparent)` : color;
  const common = { "data-mark": outlined ? "outlined" : "filled", "data-glyph": mode, fill, stroke: "var(--ink)", strokeWidth: 1 } as const;
  if (mode === "drive") return <circle {...common} cx={cx} cy={cy} r={5} />;
  if (mode === "cycle") return <rect {...common} x={cx} y={cy - 4.5} width={9} height={9} rx={1.5} transform="translate(-4.5 0)" />;
  return <polygon {...common} points={`0,-5.5 5.5,4 -5.5,4`} style={{ transform: `translate(${cx}, ${cy}px)` }} />;
}

/**
 * Travel time (TRI-147): one row per destination, one dot per mode on a
 * shared 0–120 min axis, so the gap between modes reads at a glance.
 * Over `maxMin` there is no dot — a pinned-to-the-end dot would misread — the
 * row says "not walkable" / "cycle/walk > 90 min" in text. The Auckland
 * median tick appears only where the caller supplies one (shared
 * destinations, never personal anchors).
 */
export function DotPlot({
  rows,
  maxMin = 120,
  cap = 90,
  className = "",
}: {
  rows: {
    label: string;
    sublabel?: string;
    tag?: string;
    status?: Status;
    reason?: string;
    dots: { mode: Mode; min: number | null; status: Status; medianMin?: number }[];
  }[];
  maxMin?: number;
  cap?: number;
  className?: string;
}) {
  const x = (m: number) => `${Math.min(98, 2 + (m / maxMin) * 96).toFixed(2)}%`;
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between font-mono text-micro text-ink/45" aria-hidden>
        <span>0 min</span>
        <span>{maxMin} min</span>
      </div>
      {rows.map((r) => {
        const empty = r.status && isEmpty(r.status);
        const shown = r.dots.filter((d) => d.min != null && d.min <= cap && !isEmpty(d.status));
        const over = r.dots.filter((d) => d.min != null && d.min > cap);
        const overText = over.length === 0 ? null : over.every((d) => d.mode === "walk") ? "not walkable" : `${over.map((d) => MODE_LABEL[d.mode]).join("/")} > ${cap} min`;
        const aria = dotPlotLabel({
          label: r.label,
          dots: r.dots.map((d) => ({ mode: MODE_LABEL[d.mode], text: d.min == null ? "unavailable" : d.min > cap ? `over ${cap} minutes` : `${Math.round(d.min)} minutes`, status: d.status })),
        });
        return (
          <div key={r.label} className="grid grid-cols-1 gap-1 lg:grid-cols-[9rem_minmax(0,1fr)] lg:items-center lg:gap-3">
            <span className="min-w-0">
              <span className="block truncate text-label text-ink/85">{r.label}</span>
              {(r.sublabel || r.tag) && (
                <span className="block truncate font-mono text-micro text-ink/50">
                  {r.sublabel}
                  {r.tag && <span className="ml-1 rounded-chip border border-hairline px-1">{r.tag}</span>}
                </span>
              )}
            </span>
            {empty ? (
              <EmptyTrack status={r.status!} reason={r.reason} label={r.label} />
            ) : (
              <div className="flex items-center gap-2">
                <svg role="img" aria-label={aria} width="100%" height={16} className="block min-w-0 flex-1 overflow-visible">
                  <line x1="2%" x2="98%" y1={8} y2={8} stroke="var(--hairline)" strokeWidth={1} />
                  {r.dots
                    .filter((d) => d.medianMin != null)
                    .map((d) => (
                      <line key={`m-${d.mode}`} x1={x(d.medianMin!)} x2={x(d.medianMin!)} y1={2} y2={14} stroke={CAT_COLOR[d.mode]} strokeWidth={1.5} opacity={0.5} />
                    ))}
                  {shown.map((d) => (
                    <ModeGlyph key={d.mode} mode={d.mode} cx={x(d.min!)} cy={8} outlined={isOutlined(d.status)} />
                  ))}
                </svg>
                {overText && <span className="shrink-0 font-mono text-micro text-ink/55">{overText}</span>}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 font-mono text-micro text-ink/55" aria-hidden>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CAT_COLOR.drive }} /> drive</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: CAT_COLOR.cycle }} /> cycle</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-0 w-0 border-x-[5px] border-b-[9px] border-x-transparent" style={{ borderBottomColor: CAT_COLOR.walk }} /> walk</span>
      </div>
    </div>
  );
}
