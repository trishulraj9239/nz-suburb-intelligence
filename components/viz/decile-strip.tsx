import { decileLabel } from "@/lib/viz/aria";
import { isEmpty, isOutlined, type Status } from "@/lib/viz/status";
import { EmptyTrack } from "./empty-track";

/**
 * Ordinal / decile (TRI-147): NZDep decile, a liquefaction class. Ten cells
 * with ONE filled, both ends labelled in the source's own words — it reads as
 * a position on a scale, not a score. Information, never a verdict.
 */
export function DecileStrip({
  label,
  value,
  cells = 10,
  lowLabel,
  highLabel,
  status,
  reason,
  className = "",
}: {
  label: string;
  value: number;
  cells?: number;
  lowLabel: string;
  highLabel: string;
  status: Status;
  reason?: string;
  className?: string;
}) {
  if (isEmpty(status)) return <EmptyTrack status={status} reason={reason} label={label} className={className} />;
  const idx = Math.min(cells, Math.max(1, Math.round(value))) - 1;
  const outlined = isOutlined(status);
  return (
    <div role="img" aria-label={decileLabel({ label, value, cells, low: lowLabel, high: highLabel, status, reason })} data-status={status} className={className}>
      <div className="flex w-full gap-0.5">
        {Array.from({ length: cells }, (_, i) => (
          <span
            key={i}
            data-mark={i === idx ? (outlined ? "outlined" : "filled") : undefined}
            className={`h-3 flex-1 rounded-[2px] ${i === idx ? (outlined ? "border-2 border-ink/80 bg-surface" : "bg-ink/80") : "bg-hairline"}`}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between font-mono text-micro text-ink/55">
        <span>1 · {lowLabel}</span>
        <span>{cells} · {highLabel}</span>
      </div>
    </div>
  );
}
