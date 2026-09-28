"use client";

import { formatValue, percentileOf, type BreakdownValue, type RegionalBreakdown, type ScalarValue } from "@/lib/suburb-data";
import { hoistChip, type StatFor } from "@/lib/sections";
import { SECTION_EXPLAINERS } from "@/lib/persona";
import { percentileLabel } from "@/lib/viz/format";
import { SectionCard } from "@/components/section-card";
import { SourceChip } from "@/components/source-chip";
import { InfoTip } from "@/components/info-tip";
import { CardIcon } from "./icons";
import { BreakdownBlock, ScalarRow } from "./rows";

/**
 * TRI-148 — Planning: zoning mix as a Stacked100 against Auckland, then the
 * scalar rows (intensification capacity, consents with their rolling
 * sparkline, heritage, built form) as bullets. Headline = the consenting
 * rate's percentile when present, else intensification capacity.
 */
export function PlanningCard({ scalars, breakdowns, statFor, refs }: { scalars: ScalarValue[]; breakdowns: BreakdownValue[]; statFor: StatFor; refs: Map<string, RegionalBreakdown | null> }) {
  const byKey = new Map(scalars.map((s) => [s.def.metric_key, s]));
  const rate = byKey.get("consents_per_1000_dwellings");
  const cap = byKey.get("intensification_capacity_indicator");
  const rateStat = rate ? statFor(rate.def.metric_key, rate.asOf) : undefined;
  const headline = rate && rateStat ? `Consenting rate ${percentileLabel(percentileOf(rate.value, rateStat))}` : cap ? `Intensification capacity ${formatValue(cap.def, cap.value)} of residential land` : undefined;
  const hoisted = hoistChip([...scalars, ...breakdowns]);
  return (
    <SectionCard
      id="planning"
      title="Planning"
      icon={<CardIcon card="planning" />}
      accent="planning"
      headline={headline}
      explainer={<InfoTip label="planning" text={SECTION_EXPLAINERS.planning} />}
      chip={hoisted ? <SourceChip source={hoisted.source} asOf={hoisted.asOf} asOfText={hoisted.asOfText} /> : undefined}
      srTable={{
        head: ["Metric", "Value", "Auckland median"],
        rows: scalars.map((s) => {
          const st = statFor(s.def.metric_key, s.asOf);
          return [s.def.label, formatValue(s.def, s.value), st ? formatValue(s.def, st.median) : "—"];
        }),
      }}
    >
      {breakdowns.map((b) => (
        <BreakdownBlock key={b.def.metric_key} b={b} reference={refs.get(b.def.metric_key)} chip={!hoisted} />
      ))}
      {scalars.map((s) => (
        <ScalarRow key={s.def.metric_key} s={s} stat={statFor(s.def.metric_key, s.asOf)} chip={!hoisted} />
      ))}
    </SectionCard>
  );
}
