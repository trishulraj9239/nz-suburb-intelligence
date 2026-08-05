"use client";

import { formatValue, type RegionalStat, type ScalarValue } from "@/lib/suburb-data";
import { BudgetChip } from "./budget-chip";

/**
 * TRI-106 — the headline numbers for the active persona, above the profile.
 *
 * Which five appear is persona config (`kpiTiles`), not component logic, so a
 * third persona picks its own without touching this file. A metric with no
 * value for this suburb is skipped rather than rendered empty.
 *
 * Each tile carries an **Auckland median** reference line, because a number
 * like "$710/wk" or "decile 4" means nothing to someone who doesn't already
 * know the range. The comparison is stated as a plain fact — "Auckland median
 * $650" — and never as a verdict: metrics with `higher_is_better = null`
 * (deprivation, consents) get the same neutral treatment as any other.
 */

function medianNote(s: ScalarValue, stat?: RegionalStat) {
  if (!stat) return null;
  return `Auckland median ${formatValue(s.def, stat.median)}`;
}

export function KpiTiles({
  keys,
  scalars,
  statFor,
}: {
  keys: string[];
  scalars: ScalarValue[];
  statFor: (key: string, asOf: string) => RegionalStat | undefined;
}) {
  const byKey = new Map(scalars.map((s) => [s.def.metric_key, s]));
  const tiles = keys.map((k) => byKey.get(k)).filter((s): s is ScalarValue => !!s);
  if (tiles.length < 2) return null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tiles.map((s) => {
        const stat = statFor(s.def.metric_key, s.asOf);
        const note = medianNote(s, stat);
        return (
          <div
            key={s.def.metric_key}
            className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-hairline bg-canvas px-2.5 py-2"
          >
            <span className="truncate font-display text-[10px] font-semibold uppercase tracking-wider text-ink/45">
              {s.def.label}
            </span>
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-lg leading-tight text-ink">
                {formatValue(s.def, s.value)}
              </span>
              {s.def.unit === "$/week" && <BudgetChip rent={s.value} />}
            </span>
            {note && <span className="truncate font-mono text-[10px] text-ink/45">{note}</span>}
          </div>
        );
      })}
    </div>
  );
}
