"use client";

import type { ReactNode } from "react";
import { formatValue, MIN_TREND_POINTS, percentileOf, PRIMARY_RENT_METRIC, type BreakdownValue, type RegionalBreakdown, type RegionalStat, type ScalarValue } from "@/lib/suburb-data";
import { HAZARD_METRIC_KEYS } from "@/lib/hazard";
import { statusFromConfidence, type Status } from "@/lib/viz/status";
import { percentileLabel } from "@/lib/viz/format";
import { orderCategories } from "@/lib/viz/palettes";
import { MetricRow } from "@/components/metric-row";
import { SourceChip } from "@/components/source-chip";
import { BulletBar } from "@/components/viz/bullet-bar";
import { Sparkline } from "@/components/viz/sparkline";
import { SlopeChart } from "@/components/viz/slope-chart";
import { Stacked100 } from "@/components/viz/stacked-100";
import { MultiBars } from "@/components/viz/multi-bars";
import { EmptyTrack } from "@/components/viz/empty-track";
import { BudgetChip } from "@/components/budget-chip";
import { EXPECTED_ROWS, STACKED_BREAKDOWNS } from "@/lib/sections";

/**
 * TRI-148 — the generic registry row: label | value (+ budget badge) | bullet
 * bar on the regional axis | trend + percentile note | chip. Which trend
 * primitive draws is decided by the series shape: a quarterly/monthly series
 * past its minimum-history gate gets a Sparkline with a year-back delta; a
 * census series (2–3 vintages) gets a SlopeChart, never a smoothed line;
 * deprivation states its two vintages in words (a rank, not a quantity —
 * TRI-117). Hazard rows say "Auckland median X" outright (TRI-112).
 */
export function Trend({ s }: { s: ScalarValue }) {
  const h = s.history;
  const gate = Math.max(MIN_TREND_POINTS[s.def.metric_key] ?? 2, 2);
  if (h.length < gate) return null;
  const fmt = (v: number) => formatValue(s.def, v);
  if (s.def.metric_key.startsWith("nzdep")) {
    const prev = h[Math.max(h.length - 2, 0)];
    const last = h[h.length - 1];
    return (
      <span className="font-mono text-micro text-ink/55" title="Relative to all NZ areas — a rank, so the change is relative, not absolute">
        {prev.asOf.slice(0, 4)} {prev.value.toLocaleString()} → {last.asOf.slice(0, 4)} {last.value.toLocaleString()}
      </span>
    );
  }
  const status = statusFromConfidence(s.confidence);
  const judged = s.def.higher_is_better !== null;
  if (h.length <= 3) return <SlopeChart label={`${s.def.label}, census series`} points={h} format={fmt} unit={s.def.unit} judged={judged} status={status} width={112} height={30} />;
  // Quarterly rent compares year-over-year (four quarters back, so the arrow
  // agrees with the 12-month trend metric); monthly rolling series compare
  // twelve back; anything shorter compares to its first point.
  const back = s.def.metric_key in MIN_TREND_POINTS ? 4 : h.length >= 13 ? 12 : h.length - 1;
  return <Sparkline label={`${s.def.label}, ${h.length}-point series`} points={h} format={fmt} unit={s.def.unit} deltaBack={back} judged={judged} status={status} />;
}

export function ScalarRow({ s, stat, chip = true, secondary = false }: { s: ScalarValue; stat?: RegionalStat; chip?: boolean; secondary?: boolean }) {
  const status = statusFromConfidence(s.confidence);
  const judged = s.def.higher_is_better !== null;
  const fmt = (v: number) => formatValue(s.def, v);
  const hazard = HAZARD_METRIC_KEYS.has(s.def.metric_key);
  const pct = stat ? percentileOf(s.value, stat) : null;
  const trend = <Trend s={s} />;
  const noteText = stat ? (hazard ? `Auckland median ${fmt(stat.median)}` : percentileLabel(pct!)) : null;
  return (
    <MetricRow
      testId={`row-${s.def.metric_key}`}
      label={s.def.label}
      value={fmt(s.value)}
      secondary={secondary}
      badge={s.def.metric_key === PRIMARY_RENT_METRIC ? <BudgetChip rent={s.value} /> : undefined}
      viz={stat && !secondary ? <BulletBar label={s.def.label} value={s.value} stat={stat} format={fmt} judged={judged} status={status} /> : undefined}
      note={
        noteText || s.history.length > 1 ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            {trend}
            {noteText && <span>{noteText}</span>}
          </span>
        ) : undefined
      }
      chip={chip ? <SourceChip source={s.source} asOf={s.asOf} quality={status} /> : undefined}
    />
  );
}

/** A row the source suppressed for this suburb: hatched, full length, with the reason. */
export function MissingRow({ metricKey }: { metricKey: string }) {
  const e = EXPECTED_ROWS[metricKey];
  if (!e) return null;
  return <MetricRow testId={`row-${metricKey}`} label={e.label} value="—" viz={<EmptyTrack status="suppressed" reason={e.reason} label={e.label} />} />;
}

/**
 * Composition block: exclusive breakdowns (tenure, dwelling type, bedrooms,
 * zoning, liquefaction class) draw one Stacked100 in a fixed category order
 * with the Auckland reference bar beneath; multi-response breakdowns
 * (ethnicity) draw MultiBars with an Auckland tick, never a stack.
 */
export function BreakdownBlock({ b, reference, chip = true, explainer }: { b: BreakdownValue; reference?: RegionalBreakdown | null; chip?: boolean; explainer?: ReactNode }) {
  const status: Status = statusFromConfidence(b.confidence);
  const key = b.def.metric_key;
  const cats = orderCategories(
    key,
    b.categories.filter((c) => c.pct != null).map((c) => ({ label: c.label, pct: c.pct! })),
  );
  const ref = reference ? orderCategories(key, reference.categories) : undefined;
  const stacked = STACKED_BREAKDOWNS.has(key);
  return (
    <div className="py-2" data-testid={`row-${key}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-body text-ink/85">
          {b.def.label}
          {explainer}
        </span>
        {chip && <SourceChip source={b.source} asOf={b.asOf} quality={status} />}
      </div>
      <div className="mt-1.5">
        {!cats.length ? (
          <EmptyTrack status="suppressed" reason="not published for this area" label={b.def.label} />
        ) : stacked ? (
          <Stacked100 label={b.def.label} categories={cats} reference={ref} status={status} />
        ) : (
          <MultiBars label={b.def.label} rows={cats.slice(0, 6).map((c) => ({ ...c, refPct: ref?.find((r) => r.label === c.label)?.pct }))} status={status} />
        )}
      </div>
    </div>
  );
}
