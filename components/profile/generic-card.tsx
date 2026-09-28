"use client";

import { formatValue, type BreakdownValue, type RegionalBreakdown, type ScalarValue } from "@/lib/suburb-data";
import { hoistChip, type StatFor } from "@/lib/sections";
import { SECTION_EXPLAINERS, SECTION_LABELS } from "@/lib/persona";
import { SectionCard } from "@/components/section-card";
import { SourceChip } from "@/components/source-chip";
import { InfoTip } from "@/components/info-tip";
import { BreakdownBlock, ScalarRow } from "./rows";

/**
 * TRI-148 — a dimension no card claims (a future ETL) still renders, as a
 * plain card of registry rows after the six. Personas reorder; nothing hides.
 */
export function GenericCard({ dim, scalars, breakdowns, statFor, refs }: { dim: string; scalars: ScalarValue[]; breakdowns: BreakdownValue[]; statFor: StatFor; refs: Map<string, RegionalBreakdown | null> }) {
  const hoisted = hoistChip([...scalars, ...breakdowns]);
  const label = SECTION_LABELS[dim] ?? dim;
  return (
    <SectionCard
      id={dim}
      title={label}
      icon={<span className="inline-block h-2.5 w-2.5 rounded-full bg-current" />}
      accent="people"
      explainer={SECTION_EXPLAINERS[dim] ? <InfoTip label={label.toLowerCase()} text={SECTION_EXPLAINERS[dim]} /> : undefined}
      chip={hoisted ? <SourceChip source={hoisted.source} asOf={hoisted.asOf} asOfText={hoisted.asOfText} /> : undefined}
      srTable={{
        head: ["Metric", "Value", "Auckland median"],
        rows: scalars.map((s) => {
          const st = statFor(s.def.metric_key, s.asOf);
          return [s.def.label, formatValue(s.def, s.value), st ? formatValue(s.def, st.median) : "—"];
        }),
      }}
    >
      {scalars.map((s) => (
        <ScalarRow key={s.def.metric_key} s={s} stat={statFor(s.def.metric_key, s.asOf)} chip={!hoisted} />
      ))}
      {breakdowns.map((b) => (
        <BreakdownBlock key={b.def.metric_key} b={b} reference={refs.get(b.def.metric_key)} chip={!hoisted} />
      ))}
    </SectionCard>
  );
}
