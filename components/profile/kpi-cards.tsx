"use client";

import { formatValue, percentileOf, type ScalarValue } from "@/lib/suburb-data";
import type { StatFor } from "@/lib/sections";
import { statusFromConfidence } from "@/lib/viz/status";
import { percentileLabel } from "@/lib/viz/format";
import { BulletBar } from "@/components/viz/bullet-bar";
import { BudgetChip } from "@/components/budget-chip";

/**
 * TRI-106 → TRI-148 — the headline numbers for the active persona, above the
 * cards. Which five appear is persona config (`kpiTiles`), not component
 * logic. Each card now carries a bullet bar on the regional axis plus the
 * "Auckland median X" fact, because "$710/wk" or "decile 4" means nothing
 * without the range. A metric with no value for this suburb is skipped.
 */
export function KpiCards({ keys, scalars, statFor }: { keys: string[]; scalars: ScalarValue[]; statFor: StatFor }) {
  const byKey = new Map(scalars.map((s) => [s.def.metric_key, s]));
  const tiles = keys.map((k) => byKey.get(k)).filter((s): s is ScalarValue => !!s);
  if (tiles.length < 2) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" data-testid="kpi-cards">
      {tiles.map((s) => {
        const stat = statFor(s.def.metric_key, s.asOf);
        const fmt = (v: number) => formatValue(s.def, v);
        const status = statusFromConfidence(s.confidence);
        return (
          <div key={s.def.metric_key} className="flex min-w-0 flex-col gap-1 rounded-card border border-hairline bg-canvas px-2.5 py-2" data-testid={`kpi-${s.def.metric_key}`}>
            <span className="truncate text-label text-ink/60">{s.def.label}</span>
            <span className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
              <span className="font-mono text-kpi font-medium leading-tight text-ink">{fmt(s.value)}</span>
              {s.def.unit === "$/week" && <BudgetChip rent={s.value} />}
            </span>
            {stat && (
              <>
                <BulletBar label={s.def.label} value={s.value} stat={stat} format={fmt} judged={s.def.higher_is_better !== null} status={status} height={12} />
                <span className="font-mono text-micro leading-tight text-ink/50" title={percentileLabel(percentileOf(s.value, stat))}>
                  Auckland median {fmt(stat.median)}
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
