import { compositionLabel } from "@/lib/viz/aria";
import { isEmpty, type Status } from "@/lib/viz/status";
import { stepColor } from "@/lib/viz/palettes";
import { EmptyTrack } from "./empty-track";

/**
 * Composition that sums to 100% (TRI-147): tenure, dwelling types, zoning.
 * Fixed category order and colours (the caller orders via palettes.ts), plus a
 * thin Auckland reference bar in the same order beneath, so "more renters
 * than the region" reads from the two bars, not from a verdict colour.
 */
export function Stacked100({
  label,
  categories,
  reference,
  status,
  reason,
  className = "",
}: {
  label: string;
  categories: { label: string; pct: number }[];
  reference?: { label: string; pct: number }[];
  status: Status;
  reason?: string;
  className?: string;
}) {
  const cats = categories.filter((c) => c.pct > 0);
  if (isEmpty(status) || !cats.length) return <EmptyTrack status={isEmpty(status) ? status : "unavailable"} reason={reason} label={label} className={className} />;
  const colorOf = (l: string) => stepColor(categories.findIndex((c) => c.label === l));
  const ref = reference?.filter((c) => c.pct > 0) ?? [];
  return (
    <div className={className}>
      <div role="img" aria-label={compositionLabel({ label, parts: cats, status, reason })} data-status={status}>
        <div className="flex h-2.5 w-full overflow-hidden rounded-sm">
          {cats.map((c) => (
            <span key={c.label} style={{ width: `${c.pct}%`, background: colorOf(c.label) }} />
          ))}
        </div>
        {ref.length > 0 && (
          <div className="mt-0.5 flex h-1 w-full overflow-hidden rounded-sm opacity-70" title="Auckland">
            {ref.map((c) => (
              <span key={c.label} style={{ width: `${c.pct}%`, background: colorOf(c.label) }} />
            ))}
          </div>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {cats.map((c) => (
          <span key={c.label} className="flex items-center gap-1 text-micro text-ink/65">
            <span aria-hidden className="inline-block h-2 w-2 rounded-[2px]" style={{ background: colorOf(c.label) }} />
            {c.label}
            <span className="font-mono text-ink/85">{Math.round(c.pct)}%</span>
            {ref.length > 0 && <span className="font-mono text-ink/45">· AKL {Math.round(ref.find((r) => r.label === c.label)?.pct ?? 0)}%</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
