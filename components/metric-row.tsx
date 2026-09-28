import type { ReactNode } from "react";

/**
 * The one row shape every metric uses (TRI-147): label | value (+ badge) |
 * primitive | chip. On phones the primitive drops under the label/value line
 * at full width and the chip sits right-aligned beneath it; from `lg` the
 * three columns sit side by side so a card of rows lines up on one axis.
 * `secondary` rows indent and drop the primitive (a detail under a headline
 * figure).
 */
export function MetricRow({
  label,
  value,
  badge,
  viz,
  chip,
  note,
  secondary = false,
  testId,
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  badge?: ReactNode;
  viz?: ReactNode;
  chip?: ReactNode;
  note?: ReactNode;
  secondary?: boolean;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 py-1.5 lg:grid-cols-[9.5rem_minmax(0,1fr)_auto] lg:items-center ${secondary ? "pl-3" : ""} ${className}`}
    >
      <span className={`col-start-1 row-start-1 min-w-0 leading-snug ${secondary ? "text-label text-ink/70" : "text-body text-ink/85"}`}>{label}</span>
      {viz && !secondary ? <div className="col-span-2 row-start-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1">{viz}</div> : null}
      <span className="col-start-2 row-start-1 flex shrink-0 items-baseline justify-end gap-1.5 lg:col-start-3">
        {badge}
        <span className={`font-mono font-medium text-ink ${secondary ? "text-label" : "text-value"}`}>{value}</span>
      </span>
      {(chip || note) && (
        <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-0.5 lg:col-span-3">
          <span className="min-w-0 text-micro leading-snug text-ink/55">{note}</span>
          <span className="ml-auto min-w-0 max-w-full">{chip}</span>
        </div>
      )}
    </div>
  );
}
