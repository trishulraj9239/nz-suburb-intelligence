"use client";

import { formatValue, type BreakdownValue, type RegionalBreakdown, type ScalarValue } from "@/lib/suburb-data";
import { hoistChip, type StatFor } from "@/lib/sections";
import { HAZARD_CAVEAT } from "@/lib/hazard";
import { SECTION_EXPLAINERS } from "@/lib/persona";
import { statusFromConfidence } from "@/lib/viz/status";
import { SectionCard } from "@/components/section-card";
import { SourceChip } from "@/components/source-chip";
import { InfoTip } from "@/components/info-tip";
import { LayerBullets } from "@/components/viz/layer-bullets";
import { CardIcon } from "./icons";
import { BreakdownBlock } from "./rows";

/**
 * TRI-112 / TRI-148 — the hazard screen. The ONLY permitted summary is the
 * countable fact "N of M layers above the Auckland median": each comparison
 * is one layer against its own regional median, and the sentence says so —
 * no band, no ordering, no severity colour (the bullets sit on the neutral
 * ramp). Every row states the Auckland median outright, the verbatim caveat
 * sits under the badge, and the liquefaction classes draw as a single-hue
 * composition in class order.
 */
export function HazardsCard({ scalars, breakdowns, statFor, refs }: { scalars: ScalarValue[]; breakdowns: BreakdownValue[]; statFor: StatFor; refs: Map<string, RegionalBreakdown | null> }) {
  const hoisted = hoistChip([...scalars, ...breakdowns]);
  const layers = scalars.map((s) => ({
    label: s.def.label,
    value: s.value,
    stat: statFor(s.def.metric_key, s.asOf),
    format: (v: number) => formatValue(s.def, v),
    status: statusFromConfidence(s.confidence),
    vintage: s.asOf.slice(0, 4),
  }));
  return (
    <SectionCard
      id="hazards"
      title="Hazard screen"
      icon={<CardIcon card="hazards" />}
      accent="hazards"
      explainer={<InfoTip label="hazard screen" text={SECTION_EXPLAINERS.hazard} />}
      chip={hoisted ? <SourceChip source={hoisted.source} asOf={hoisted.asOf} asOfText={hoisted.asOfText} /> : undefined}
      srTable={{
        head: ["Layer", "Share of land", "Auckland median"],
        rows: layers.map((l) => [l.label, l.format(l.value), l.stat ? l.format(l.stat.median) : "—"]),
      }}
    >
      <div className="py-2">
        <LayerBullets layers={layers} />
        <p className="mt-2 text-micro leading-snug text-ink/55">{HAZARD_CAVEAT}</p>
        {!hoisted && scalars.length > 0 && (
          <div className="mt-1 flex flex-col items-end gap-0.5">
            {[...new Map(scalars.map((s) => [`${s.source}|${s.asOf}`, s])).values()].map((s) => (
              <SourceChip key={`${s.source}|${s.asOf}`} source={s.source} asOf={s.asOf} quality={statusFromConfidence(s.confidence)} />
            ))}
          </div>
        )}
      </div>
      {breakdowns.map((b) => (
        <BreakdownBlock key={b.def.metric_key} b={b} reference={refs.get(b.def.metric_key)} chip={!hoisted} />
      ))}
    </SectionCard>
  );
}
