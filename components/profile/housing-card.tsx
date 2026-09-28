"use client";

import { formatValue, PRIMARY_RENT_METRIC, percentileOf, type BreakdownValue, type RegionalBreakdown, type ScalarValue } from "@/lib/suburb-data";
import { FOLDED_ROWS, hoistChip, type StatFor } from "@/lib/sections";
import { SECTION_EXPLAINERS } from "@/lib/persona";
import { statusFromConfidence } from "@/lib/viz/status";
import { percentileLabel } from "@/lib/viz/format";
import { SectionCard } from "@/components/section-card";
import { MetricRow } from "@/components/metric-row";
import { SourceChip } from "@/components/source-chip";
import { InfoTip } from "@/components/info-tip";
import { RangeBar } from "@/components/viz/range-bar";
import { CardIcon } from "./icons";
import { BreakdownBlock, MissingRow, ScalarRow } from "./rows";

/**
 * TRI-148 — Housing: the MBIE bond median headlines (bullet + budget chip +
 * quarterly sparkline), the bond quartiles fold into ONE RangeBar on the same
 * axis, the census rent sits as a secondary row, and tenure / dwelling type /
 * bedrooms draw as Stacked100 against the Auckland composition.
 */
export function HousingCard({ scalars, breakdowns, statFor, refs }: { scalars: ScalarValue[]; breakdowns: BreakdownValue[]; statFor: StatFor; refs: Map<string, RegionalBreakdown | null> }) {
  const byKey = new Map(scalars.map((s) => [s.def.metric_key, s]));
  const rent = byKey.get(PRIMARY_RENT_METRIC);
  const lo = byKey.get("rent_lower_quartile_weekly");
  const hi = byKey.get("rent_upper_quartile_weekly");
  const rentStat = rent ? statFor(rent.def.metric_key, rent.asOf) : undefined;
  const headline = rent && rentStat ? `Rent ${percentileLabel(percentileOf(rent.value, rentStat))}` : rent ? `Median rent ${formatValue(rent.def, rent.value)}` : "Rent not published for this area";
  const hoisted = hoistChip([...scalars, ...breakdowns]);
  const rows = scalars.filter((s) => !FOLDED_ROWS.has(s.def.metric_key));
  const srRows = scalars.map((s) => {
    const st = statFor(s.def.metric_key, s.asOf);
    return [s.def.label, formatValue(s.def, s.value), st ? formatValue(s.def, st.median) : "—"];
  });
  return (
    <SectionCard
      id="housing"
      title="Housing"
      icon={<CardIcon card="housing" />}
      accent="housing"
      headline={headline}
      explainer={<InfoTip label="housing" text={SECTION_EXPLAINERS.housing} />}
      chip={hoisted ? <SourceChip source={hoisted.source} asOf={hoisted.asOf} asOfText={hoisted.asOfText} /> : undefined}
      srTable={{ head: ["Metric", "Value", "Auckland median"], rows: srRows }}
    >
      {!rent && <MissingRow metricKey={PRIMARY_RENT_METRIC} />}
      {rows.map((s) => {
        const st = statFor(s.def.metric_key, s.asOf);
        const el = <ScalarRow key={s.def.metric_key} s={s} stat={st} chip={!hoisted} secondary={s.def.metric_key === "median_rent_weekly"} />;
        if (s.def.metric_key !== PRIMARY_RENT_METRIC || !lo || !hi || !st) return el;
        const fmt = (v: number) => formatValue(s.def, v);
        return (
          <div key={s.def.metric_key} className="contents">
            {el}
            <MetricRow
              testId="row-rent_quartiles"
              label="Rent quartiles (new tenancies)"
              value={`${fmt(lo.value).replace("/wk", "")}–${fmt(hi.value)}`}
              viz={<RangeBar label="Rent quartiles" lo={lo.value} mid={s.value} hi={hi.value} stat={st} format={fmt} judged status={statusFromConfidence(lo.confidence)} />}
              note="lower quartile · median · upper quartile, on the same Auckland axis"
              chip={!hoisted ? <SourceChip source={lo.source} asOf={lo.asOf} quality={statusFromConfidence(lo.confidence)} /> : undefined}
            />
          </div>
        );
      })}
      {["dwelling_damp_pct", "dwelling_mould_pct"].filter((k) => !byKey.has(k)).map((k) => (
        <MissingRow key={k} metricKey={k} />
      ))}
      {breakdowns.map((b) => (
        <BreakdownBlock key={b.def.metric_key} b={b} reference={refs.get(b.def.metric_key)} chip={!hoisted} />
      ))}
    </SectionCard>
  );
}
