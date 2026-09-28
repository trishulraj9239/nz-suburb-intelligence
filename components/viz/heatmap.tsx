/**
 * Percentile overview for Compare (TRI-147): metrics down, suburbs across,
 * each cell the suburb's Auckland percentile on an ink-alpha ramp with the
 * number inside. Higher-is-better metrics only — hazards and deprivation are
 * never ranked here.
 */
export function Heatmap({
  rows,
  columns,
  className = "",
}: {
  rows: { label: string; cells: { id: string; pct: number | null }[] }[];
  columns: { id: string; name: string; initial: string }[];
  className?: string;
}) {
  return (
    <table className={`w-full border-collapse text-label ${className}`} data-testid="compare-heatmap">
      <caption className="sr-only-table">Percentile of Auckland by metric and suburb, higher-is-better metrics only</caption>
      <thead>
        <tr>
          <th scope="col" className="w-2/5 pb-1 text-left font-medium text-ink/55">Percentile of Auckland</th>
          {columns.map((c) => (
            <th key={c.id} scope="col" className="pb-1 text-center font-mono text-micro font-medium text-ink/70" title={c.name}>
              {c.initial}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row" className="py-0.5 pr-2 text-left font-normal text-ink/80">{r.label}</th>
            {r.cells.map((c) => (
              <td key={c.id} className="p-0.5">
                {c.pct == null ? (
                  <span className="nzsi-hatch block h-6 rounded-[3px] border border-hairline/60" title="not published" />
                ) : (
                  <span
                    className="flex h-6 items-center justify-center rounded-[3px] font-mono text-micro"
                    style={{
                      // Two ramps that step at the Auckland median: below it ink text on a light ink tint
                      // (5–32 %), above it surface text on a strong tint (62–87 %). Both keep ≥ 4.5:1 in
                      // either theme, and the step itself says "above / below median" at a glance.
                      background: `color-mix(in srgb, var(--ink) ${c.pct > 50 ? Math.round(62 + ((c.pct - 50) / 50) * 25) : Math.round(5 + (c.pct / 50) * 27)}%, transparent)`,
                      color: c.pct > 50 ? "var(--surface)" : "var(--ink)",
                    }}
                  >
                    {Math.round(c.pct)}
                  </span>
                )}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
