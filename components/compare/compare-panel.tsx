"use client";

import { useEffect, useState } from "react";
import { fetchProfile, fetchRegionalStats, formatValue, PRIMARY_RENT_METRIC, type MetricDef, type RegionalStat, type SuburbProfile } from "@/lib/suburb-data";
import { useWorkspace } from "@/lib/workspace";
import { usePersona } from "@/lib/preferences";
import { SECTION_EXPLAINERS } from "@/lib/persona";
import { HAZARD_CAVEAT } from "@/lib/hazard";
import { CARD_DIMENSIONS, CARD_TITLES, cardOrder, type CardKey } from "@/lib/sections";
import { bestSet, differs, entriesFor, sharedProvenance, DOT_IDS, type Entry } from "@/lib/compare";
import { SectionCard } from "@/components/section-card";
import { InfoTip } from "@/components/info-tip";
import { BudgetChip } from "@/components/budget-chip";
import { ConfidenceLegend, SourceChip } from "@/components/source-chip";
import { CardIcon } from "@/components/profile/icons";
import { CompareHeader } from "./compare-header";
import { CompareRow } from "./compare-row";
import { CompareGettingAround } from "./compare-getting-around";
import { CompareHeatmap } from "./compare-heatmap";
import { AddressFactsPager } from "./address-facts-pager";

const TRAVEL_KEYS = new Set(["commute_cbd_drive_min", "commute_cbd_cycle_min", "commute_cbd_walk_min", "commute_airport_drive_min"]);

/** A share pulled from a breakdown (tenure / dwelling type) as a compare row on a 0–100 % domain. */
function shareEntries(profiles: SuburbProfile[], key: string, label: string): Entry[] {
  return profiles.map((p, i) => {
    const b = p.breakdowns.find((x) => x.def.metric_key === key);
    const c = b?.categories.find((x) => x.label === label);
    return { id: DOT_IDS[i], code: p.suburb.sa2_code, name: p.suburb.name, value: c?.pct ?? null, confidence: b?.confidence ?? null, source: b?.source ?? null, asOf: b?.asOf ?? null };
  });
}

/**
 * Compare 2–3 suburbs (TRI-24 base, TRI-37 v2, TRI-32 provenance, TRI-149 on
 * the kit). One layout: a header legend (letter + hue per suburb), then one
 * row per metric with lettered dots on the shared Auckland axis, grouped into
 * the same persona-ordered cards as the Profile. "Only differences" hides
 * rows within ten percentile points; a suburb missing a value always keeps
 * its row. Deprivation stays unjudged, hazards carry the verbatim caveat,
 * and every row carries its provenance.
 */
export function ComparePanel() {
  const { compare, toggleCompare, select, pins } = useWorkspace();
  const pinsFor = (sa2: string) => pins.filter((x) => x.sa2_code === sa2);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const persona = usePersona();
  const key = compare.join("|");
  const [data, setData] = useState<{ key: string; profiles: SuburbProfile[]; stats: RegionalStat[] } | null>(null);

  useEffect(() => {
    let stale = false;
    Promise.all([Promise.all(compare.map((c) => fetchProfile(c))), fetchRegionalStats()]).then(([ps, stats]) => {
      if (!stale) setData({ key: compare.join("|"), profiles: ps.filter((p): p is SuburbProfile => p !== null), stats });
    });
    return () => {
      stale = true;
    };
  }, [compare]);

  if (data?.key !== key) {
    return (
      <div className="flex animate-pulse flex-col gap-3 py-2" aria-busy="true" aria-label="Loading comparison">
        <div className="flex gap-2">
          {compare.map((c) => (
            <div key={c} className="h-16 flex-1 rounded-card bg-hairline/50" />
          ))}
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-28 rounded-card bg-hairline/40" />
        ))}
      </div>
    );
  }
  const { profiles, stats } = data;
  if (profiles.length < 2) {
    return <p className="py-8 text-center text-body text-ink/55">Pin at least two suburbs with “+ Compare” to see them side by side.</p>;
  }

  const defs = new Map<string, MetricDef>();
  for (const p of profiles) for (const s of p.scalars) if (!defs.has(s.def.metric_key)) defs.set(s.def.metric_key, s.def);
  const statFor = (k: string) => {
    const s = profiles.flatMap((p) => p.scalars).find((x) => x.def.metric_key === k);
    return s ? stats.find((x) => x.metric_key === k && x.as_of_date === s.asOf) : undefined;
  };
  const differsKey = (k: string) => differs(defs.get(k)!, entriesFor(profiles, k), statFor(k));
  const allKeys = [...defs.keys()];
  const hiddenCount = onlyDiff ? allKeys.filter((k) => !differsKey(k)).length : 0;

  const rowsFor = (card: CardKey) =>
    [...defs.values()]
      .filter((d) => CARD_DIMENSIONS[card].includes(d.dimension) && !TRAVEL_KEYS.has(d.metric_key))
      .sort((a, b) => a.display_order - b.display_order)
      .filter((d) => !onlyDiff || differsKey(d.metric_key));

  const metricRow = (d: MetricDef) => {
    const entries = entriesFor(profiles, d.metric_key);
    return (
      <CompareRow
        key={d.metric_key}
        testId={`cmp-${d.metric_key}`}
        label={d.label}
        entries={entries}
        stat={statFor(d.metric_key)}
        format={(v) => formatValue(d, v)}
        best={bestSet(d, entries)}
        judged={d.higher_is_better !== null}
        badges={d.metric_key === PRIMARY_RENT_METRIC ? (e) => <BudgetChip rent={e.value!} /> : undefined}
        shared={sharedProvenance(entries)}
      />
    );
  };
  const srTable = (card: CardKey) => ({
    head: ["Metric", ...profiles.map((p, i) => `${DOT_IDS[i].toUpperCase()} ${p.suburb.name}`)],
    rows: rowsFor(card).map((d) => [d.label, ...profiles.map((p) => { const s = p.scalars.find((x) => x.def.metric_key === d.metric_key); return s ? formatValue(d, s.value) : "—"; })]),
  });
  const explainerFor: Partial<Record<CardKey, string>> = { housing: SECTION_EXPLAINERS.housing, planning: SECTION_EXPLAINERS.planning, hazards: SECTION_EXPLAINERS.hazard, commute: SECTION_EXPLAINERS.commute };

  const owned = shareEntries(profiles, "tenure", "Owned or partly owned");
  const houses = shareEntries(profiles, "dwelling_type", "Separate house");
  const pctFmt = (v: number) => `${v.toFixed(0)}%`;
  const showShare = (entries: Entry[]) => entries.some((e) => e.value != null) && (!onlyDiff || entries.some((e) => e.value == null) || Math.max(...entries.map((e) => e.value!)) - Math.min(...entries.map((e) => e.value!)) >= 10);

  const cards = cardOrder(persona).filter((c) => c !== "schools");
  const hasHazard = profiles.some((p) => p.scalars.some((s) => s.def.dimension === "hazard"));

  return (
    <div className="flex flex-col gap-3">
      <AddressFactsPager profiles={profiles} pinsFor={pinsFor} />
      <CompareHeader profiles={profiles} pinsFor={pinsFor} onOpen={(sa2) => select(sa2)} onRemove={(sa2) => toggleCompare(sa2)} />
      <label className="flex min-h-10 items-center gap-2 text-label text-ink/75">
        <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="h-4 w-4 accent-[var(--harbour)]" />
        Only differences
        <span className="font-mono text-micro text-ink/45">{onlyDiff ? (hiddenCount > 0 ? `${hiddenCount} similar ${hiddenCount === 1 ? "row" : "rows"} hidden` : "nothing hidden") : "hides rows within 10 percentile points"}</span>
      </label>

      {cards.map((card) => {
        const rows = rowsFor(card);
        const isCommute = card === "commute";
        const extra = card === "housing" ? [showShare(owned) && <CompareRow key="owned" testId="cmp-tenure_owned" label="Own their home" entries={owned} domain={[0, 100]} format={pctFmt} best={new Set()} judged={false} shared={sharedProvenance(owned)} />, showShare(houses) && <CompareRow key="houses" testId="cmp-dwelling_separate" label="Separate houses" entries={houses} domain={[0, 100]} format={pctFmt} best={new Set()} judged={false} shared={sharedProvenance(houses)} />].filter(Boolean) : [];
        if (!rows.length && !extra.length && !isCommute) return null;
        return (
          <SectionCard
            key={card}
            id={`compare-${card}`}
            title={CARD_TITLES[card]}
            icon={<CardIcon card={card} />}
            accent={card}
            explainer={explainerFor[card] ? <InfoTip label={CARD_TITLES[card].toLowerCase()} text={explainerFor[card]!} /> : undefined}
            headline={isCommute ? "Rows are trips, dots are suburbs · typical, no live traffic" : card === "hazards" ? `Hazard rows: ${HAZARD_CAVEAT}` : undefined}
            srTable={srTable(card)}
          >
            {isCommute && <CompareGettingAround profiles={profiles} onlyDiff={onlyDiff} differs={differsKey} />}
            {rows.map(metricRow)}
            {extra}
          </SectionCard>
        );
      })}

      <SectionCard id="compare-schools" title={CARD_TITLES.schools} icon={<CardIcon card="schools" />} accent="schools" srTable={{ head: ["", ...profiles.map((p) => p.suburb.name)], rows: [["Schools located in the area", ...profiles.map((p) => String(p.schools.length))]] }}>
        <CompareRow
          testId="cmp-schools_count"
          label="Schools located in the area"
          entries={profiles.map((p, i) => ({ id: DOT_IDS[i], code: p.suburb.sa2_code, name: p.suburb.name, value: p.schools.length, confidence: "high", source: "MOE Schools Directory", asOf: "2026-01-01" }))}
          format={(v) => `${Math.round(v)}`}
          best={new Set()}
          judged={false}
          shared={{ source: "MOE Schools Directory", asOf: "2026-01-01", confidence: "high" }}
        />
        <div className="flex justify-end py-1">
          <SourceChip source="MOE Schools Directory" asOf="2026" />
        </div>
      </SectionCard>

      <CompareHeatmap profiles={profiles} stats={stats} />

      {hasHazard && <p className="text-micro leading-snug text-ink/55">Hazard rows: {HAZARD_CAVEAT}</p>}
      <ConfidenceLegend />
    </div>
  );
}
