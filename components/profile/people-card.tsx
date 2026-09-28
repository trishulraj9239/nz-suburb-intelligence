"use client";

import { formatValue, type BreakdownValue, type RegionalBreakdown, type ScalarValue } from "@/lib/suburb-data";
import { hoistChip, type StatFor } from "@/lib/sections";
import { SECTION_EXPLAINERS } from "@/lib/persona";
import { statusFromConfidence } from "@/lib/viz/status";
import { SectionCard } from "@/components/section-card";
import { MetricRow } from "@/components/metric-row";
import { SourceChip } from "@/components/source-chip";
import { InfoTip } from "@/components/info-tip";
import { DecileStrip } from "@/components/viz/decile-strip";
import { CardIcon } from "./icons";
import { BreakdownBlock, MissingRow, ScalarRow, Trend } from "./rows";

/**
 * TRI-148 — People: population and age (census slope charts), household
 * income (judged bullet), ethnicity as MultiBars (multi-response — never a
 * stack), and the NZDep decile as a ten-cell strip with both ends labelled
 * in the source's words and the vintage change stated in text (TRI-117).
 */
export function PeopleCard({ scalars, breakdowns, statFor, refs }: { scalars: ScalarValue[]; breakdowns: BreakdownValue[]; statFor: StatFor; refs: Map<string, RegionalBreakdown | null> }) {
  const byKey = new Map(scalars.map((s) => [s.def.metric_key, s]));
  const pop = byKey.get("population");
  const age = byKey.get("median_age");
  const decile = byKey.get("nzdep_decile");
  const headline = pop ? `Population ${formatValue(pop.def, pop.value)}${age ? `, median age ${formatValue(age.def, age.value)}` : ""}` : undefined;
  const hoisted = hoistChip([...scalars, ...breakdowns]);
  const rows = scalars.filter((s) => s.def.metric_key !== "nzdep_decile");
  return (
    <SectionCard
      id="people"
      title="People"
      icon={<CardIcon card="people" />}
      accent="people"
      headline={headline}
      chip={hoisted ? <SourceChip source={hoisted.source} asOf={hoisted.asOf} asOfText={hoisted.asOfText} /> : undefined}
      srTable={{
        head: ["Metric", "Value", "Auckland median"],
        rows: scalars.map((s) => {
          const st = statFor(s.def.metric_key, s.asOf);
          return [s.def.label, formatValue(s.def, s.value), st ? formatValue(s.def, st.median) : "—"];
        }),
      }}
    >
      {rows.map((s) => (
        <ScalarRow key={s.def.metric_key} s={s} stat={statFor(s.def.metric_key, s.asOf)} chip={!hoisted} />
      ))}
      {breakdowns.map((b) => (
        <BreakdownBlock key={b.def.metric_key} b={b} reference={refs.get(b.def.metric_key)} chip={!hoisted} />
      ))}
      {decile ? (
        <MetricRow
          testId="row-nzdep_decile"
          label={
            <>
              {decile.def.label}
              <InfoTip label="deprivation" text={SECTION_EXPLAINERS.deprivation} />
            </>
          }
          value={formatValue(decile.def, decile.value)}
          viz={<DecileStrip label={decile.def.label} value={decile.value} lowLabel="least deprived" highLabel="most deprived" status={statusFromConfidence(decile.confidence)} />}
          note={<Trend s={decile} />}
          chip={!hoisted ? <SourceChip source={decile.source} asOf={decile.asOf} quality={statusFromConfidence(decile.confidence)} /> : undefined}
        />
      ) : (
        <MissingRow metricKey="nzdep_decile" />
      )}
    </SectionCard>
  );
}
