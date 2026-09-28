"use client";

import { percentileOf, type RegionalStat, type SuburbProfile } from "@/lib/suburb-data";
import { HAZARD_METRIC_KEYS } from "@/lib/hazard";
import { DOT_IDS, LETTER } from "@/lib/compare";
import { Heatmap } from "@/components/viz/heatmap";

/**
 * TRI-149 — the percentile overview: one cell per suburb × metric, for
 * metrics the registry judges (higher_is_better true or false) — never
 * hazards, deprivation, consents or any other information-only metric.
 * Lower-is-better rows say so in the label; the cell is still the plain
 * Auckland percentile, never inverted.
 */
export function CompareHeatmap({ profiles, stats }: { profiles: SuburbProfile[]; stats: RegionalStat[] }) {
  const defs = new Map(profiles.flatMap((p) => p.scalars).map((s) => [s.def.metric_key, s.def]));
  const rows = [...defs.values()]
    .filter((d) => d.higher_is_better !== null && !HAZARD_METRIC_KEYS.has(d.metric_key) && d.dimension !== "deprivation")
    .sort((a, b) => a.display_order - b.display_order)
    .map((d) => ({
      label: d.higher_is_better ? d.label : `${d.label} (lower is better)`,
      cells: profiles.map((p, i) => {
        const s = p.scalars.find((x) => x.def.metric_key === d.metric_key);
        const st = s && stats.find((x) => x.metric_key === d.metric_key && x.as_of_date === s.asOf);
        return { id: DOT_IDS[i], pct: s && st ? percentileOf(s.value, st) : null };
      }),
    }));
  if (rows.length < 2) return null;
  return (
    <details className="rounded-card border border-hairline bg-surface p-3 shadow-card" data-testid="compare-heatmap-card">
      <summary className="cursor-pointer font-display text-h3 font-semibold text-ink">
        Percentile overview <span className="font-mono text-micro font-normal text-ink/50">judged metrics only · hazards and deprivation never ranked</span>
      </summary>
      <div className="mt-2 overflow-x-auto">
        <Heatmap rows={rows} columns={profiles.map((p, i) => ({ id: DOT_IDS[i], name: p.suburb.name, initial: LETTER[DOT_IDS[i]] }))} />
      </div>
    </details>
  );
}
