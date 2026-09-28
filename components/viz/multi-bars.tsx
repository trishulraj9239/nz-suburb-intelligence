import { compositionLabel } from "@/lib/viz/aria";
import { isEmpty, type Status } from "@/lib/viz/status";
import { EmptyTrack } from "./empty-track";

/**
 * Multi-response composition (TRI-147) — ethnicity, where people tick more
 * than one box so the shares do not sum to 100%. Separate horizontal bars,
 * never a stack; a small tick per bar marks the Auckland share.
 */
export function MultiBars({
  label,
  rows,
  max = 100,
  status,
  reason,
  className = "",
}: {
  label: string;
  rows: { label: string; pct: number; refPct?: number }[];
  max?: number;
  status: Status;
  reason?: string;
  className?: string;
}) {
  if (isEmpty(status) || !rows.length) return <EmptyTrack status={isEmpty(status) ? status : "unavailable"} reason={reason} label={label} className={className} />;
  const w = (p: number) => `${Math.min(100, (p / max) * 100).toFixed(1)}%`;
  return (
    <div role="img" aria-label={compositionLabel({ label, parts: rows, status, reason })} data-status={status} className={`flex flex-col gap-1 ${className}`}>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_3rem] items-center gap-2">
          <span className="truncate text-label text-ink/80">{r.label}</span>
          <span className="relative block h-2 w-full rounded-sm bg-hairline">
            <span className="absolute inset-y-0 left-0 rounded-sm" style={{ width: w(r.pct), background: "color-mix(in srgb, var(--harbour) 70%, transparent)" }} />
            {r.refPct != null && <span className="absolute -top-0.5 h-3 w-px bg-ink/45" style={{ left: w(r.refPct) }} title={`Auckland ${Math.round(r.refPct)}%`} />}
          </span>
          <span className="text-right font-mono text-micro text-ink/85">{Math.round(r.pct)}%</span>
        </div>
      ))}
    </div>
  );
}
