"use client";

import { useEffect, useState } from "react";
import {
  fetchProfile,
  fetchRegionalStats,
  formatValue,
  percentileOf,
  PRIMARY_RENT_METRIC,
  type RegionalStat,
  type SuburbProfile,
} from "@/lib/suburb-data";
import { useWorkspace } from "@/lib/workspace";
import { usePersona } from "@/lib/preferences";
import { orderBySection, personaConfig } from "@/lib/persona";
import { HAZARD_CAVEAT } from "@/lib/hazard";
import { BudgetChip } from "./budget-chip";
import { ConfidenceChip, ConfidenceLegend, Provenance, SourceChip } from "./provenance";

/**
 * TRI-112 — "best of your set" chip. Rendered ONLY for metrics whose registry
 * row declares a direction (higher_is_better true/false); deprivation,
 * consents and hazard are NULL there and stay unjudged — a "best" marker on a
 * verdict-free metric would contradict the whole framing. Harbour tint, never
 * amber: amber is the citation live-wire.
 */
function BestChip() {
  return (
    <span
      title="Best of your compared set on this metric, per the registry's higher/lower-is-better direction"
      className="inline-flex items-center rounded-full border border-harbour/40 bg-harbour/10 px-1.5 font-mono text-[9px] leading-[14px] text-harbour"
    >
      best
    </span>
  );
}

function UnjudgedMark({ long = false }: { long?: boolean }) {
  return (
    <span
      title="This metric carries no better/worse direction — deprivation, consents and hazard are information, not verdicts, so no best is marked."
      className="font-mono text-[9px] text-ink/40"
    >
      {long ? "unjudged — no best" : "unjudged"}
    </span>
  );
}

/**
 * TRI-112 — range across YOUR set (distinct from the percentile-vs-region
 * bar): where each compared suburb sits between the set's own min and max.
 * This column's suburb is the solid marker; the others are muted. Position
 * only — direction/verdict stays with the best chip and the registry.
 */
function RangeStrip({
  entries,
  self,
  format,
}: {
  entries: { code: string; name: string; v: number }[];
  self: string;
  format: (v: number) => string;
}) {
  if (entries.length < 2) return null;
  const vals = entries.map((e) => e.v);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (min === max) return null;
  return (
    <div
      className="relative mt-1 h-1 w-full rounded-full bg-hairline/70"
      title={`Across your set: ${format(min)} – ${format(max)}`}
    >
      {entries.map((e) => (
        <div
          key={e.code}
          title={`${e.name}: ${format(e.v)}`}
          className={`absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded ${
            e.code === self ? "bg-ink/80" : "bg-ink/30"
          }`}
          style={{ left: `calc(${((e.v - min) / (max - min)) * 100}% - 1px)` }}
        />
      ))}
    </div>
  );
}

/**
 * Compare 2-3 suburbs (TRI-24 base, TRI-37 v2, TRI-32 provenance). Desktop:
 * full profile columns side by side — values, percentile-vs-region bars,
 * budget chips, composition highlights. Mobile: the compact metric table.
 * Cells stay mono, deprivation stays unjudged, and every metric carries its
 * own source + confidence (confidence can differ per suburb — e.g. NZDep
 * mapped across 2018→2023 boundary changes).
 */

function pctOf(
  p: SuburbProfile,
  key: string,
  label: string,
): { pct: number; source: string; asOf: string; confidence: string } | null {
  const b = p.breakdowns.find((x) => x.def.metric_key === key);
  const c = b?.categories.find((x) => x.label === label);
  if (!b || c?.pct == null) return null;
  return { pct: c.pct, source: b.source, asOf: b.asOf, confidence: b.confidence };
}

function CompareColumn({
  p,
  all,
  bestSets,
  stats,
  sectionOrder,
  onOpen,
  onRemove,
}: {
  p: SuburbProfile;
  all: SuburbProfile[];
  bestSets: Map<string, Set<string>>;
  stats: RegionalStat[];
  sectionOrder: string[];
  onOpen: () => void;
  onRemove: () => void;
}) {
  const owned = pctOf(p, "tenure", "Owned or partly owned");
  const houses = pctOf(p, "dwelling_type", "Separate house");
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-hairline bg-canvas/50 p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="text-left font-display text-sm font-semibold leading-tight text-ink hover:text-harbour"
          title="Open profile"
        >
          {p.suburb.name}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${p.suburb.name} from comparison`}
          className="font-mono text-[10px] text-ink/40 hover:text-ink"
        >
          ✕
        </button>
      </div>
      {p.cbdKm != null && (
        <p
          className="mt-0.5 flex items-center gap-1.5 font-mono text-[10px] text-ink/50"
          title={
            p.cbdMethod === "road"
              ? "Driving distance to the CBD via openrouteservice/OSM — typical route"
              : "Straight-line to the CBD — road routing unavailable for this suburb"
          }
        >
          CBD {p.cbdKm.toFixed(1)} km{p.cbdMethod === "road" ? " by road" : ""}{" "}
          <ConfidenceChip confidence="derived" />
        </p>
      )}

      <div className="mt-2 flex flex-col divide-y divide-hairline/60">
        {orderBySection(p.scalars, (s) => s.def.dimension, sectionOrder).map((s) => {
          const stat = stats.find(
            (x) => x.metric_key === s.def.metric_key && x.as_of_date === s.asOf,
          );
          const k = s.def.metric_key;
          const setEntries = all
            .map((pr) => ({
              code: pr.suburb.sa2_code,
              name: pr.suburb.name,
              v: pr.scalars.find((x) => x.def.metric_key === k)?.value,
            }))
            .filter((e): e is { code: string; name: string; v: number } => e.v !== undefined);
          return (
            <div key={k} className="py-1.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className="flex min-w-0 items-baseline gap-1.5">
                  <span className="truncate text-[11px] text-ink/65">{s.def.label}</span>
                  {s.def.higher_is_better === null && <UnjudgedMark />}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {bestSets.get(k)?.has(p.suburb.sa2_code) && <BestChip />}
                  {k === PRIMARY_RENT_METRIC && <BudgetChip rent={s.value} />}
                  <span className="font-mono text-xs font-medium text-ink">
                    {formatValue(s.def, s.value)}
                  </span>
                </span>
              </div>
              {stat && (
                <div
                  className="relative mt-1 h-0.5 w-full rounded-full bg-hairline"
                  title={`${Math.round(percentileOf(s.value, stat))}th percentile of Auckland suburbs — derived from the sourced values`}
                >
                  <div
                    className={`absolute top-1/2 h-2 w-0.5 -translate-y-1/2 rounded ${s.def.higher_is_better !== null ? "bg-harbour" : "bg-ink/60"}`}
                    style={{ left: `calc(${percentileOf(s.value, stat)}% - 1px)` }}
                  />
                </div>
              )}
              <RangeStrip
                entries={setEntries}
                self={p.suburb.sa2_code}
                format={(v) => formatValue(s.def, v)}
              />
              <div className="mt-1 flex justify-end">
                <Provenance source={s.source} asOf={s.asOf} confidence={s.confidence} />
              </div>
            </div>
          );
        })}
        <div className="py-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-ink/65">Own their home</span>
            <span className="font-mono text-xs text-ink">{owned != null ? `${owned.pct.toFixed(0)}%` : "—"}</span>
          </div>
          {owned && (
            <div className="mt-1 flex justify-end">
              <Provenance source={owned.source} asOf={owned.asOf} confidence={owned.confidence} />
            </div>
          )}
        </div>
        <div className="py-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-ink/65">Separate houses</span>
            <span className="font-mono text-xs text-ink">{houses != null ? `${houses.pct.toFixed(0)}%` : "—"}</span>
          </div>
          {houses && (
            <div className="mt-1 flex justify-end">
              <Provenance source={houses.source} asOf={houses.asOf} confidence={houses.confidence} />
            </div>
          )}
        </div>
        <div className="py-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] text-ink/65">Schools in area</span>
            <span className="font-mono text-xs text-ink">{p.schools.length}</span>
          </div>
          <div className="mt-1 flex justify-end">
            <SourceChip source="MOE Schools Directory" asOf="2026" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function ComparePanel() {
  const { compare, toggleCompare, select } = useWorkspace();
  const [onlyDiff, setOnlyDiff] = useState(false);
  const persona = usePersona();
  const sectionOrder = personaConfig(persona).sectionOrder;
  const key = compare.join("|");
  const [data, setData] = useState<{
    key: string;
    profiles: SuburbProfile[];
    stats: RegionalStat[];
  } | null>(null);

  useEffect(() => {
    let stale = false;
    Promise.all([Promise.all(compare.map((c) => fetchProfile(c))), fetchRegionalStats()]).then(
      ([ps, stats]) => {
        if (!stale)
          setData({
            key: compare.join("|"),
            profiles: ps.filter((p): p is SuburbProfile => p !== null),
            stats,
          });
      },
    );
    return () => {
      stale = true;
    };
  }, [compare]);

  if (data?.key !== key) {
    return (
      <div className="flex animate-pulse gap-3 py-2">
        {compare.map((c) => (
          <div key={c} className="h-64 flex-1 rounded-xl bg-hairline/50" />
        ))}
      </div>
    );
  }
  const { profiles, stats } = data;
  if (profiles.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-ink/50">
        Pin at least two suburbs with “+ Compare” to see them side by side.
      </p>
    );
  }

  // Union of scalar metrics for the mobile table, in persona section order.
  const metricKeys: string[] = [];
  for (const p of profiles) {
    for (const s of p.scalars) {
      if (!metricKeys.includes(s.def.metric_key)) metricKeys.push(s.def.metric_key);
    }
  }
  const defFor = (k: string) =>
    profiles.flatMap((p) => p.scalars).find((s) => s.def.metric_key === k)!.def;
  const orderedKeys = orderBySection(metricKeys, (k) => defFor(k).dimension, sectionOrder);

  // TRI-106 — "only differences". A three-way comparison runs to dozens of rows,
  // most of which agree; hiding those makes the real contrasts findable. Rows
  // where a suburb is MISSING a value are always kept: an absent figure is a
  // difference, and dropping it would hide a gap in coverage as if it were a
  // similarity.
  const differing = (k: string) => {
    const vals = profiles.map((pr) => pr.scalars.find((x) => x.def.metric_key === k)?.value);
    if (vals.some((v) => v === undefined)) return true;
    return new Set(vals).size > 1;
  };
  const shownKeys = onlyDiff ? orderedKeys.filter(differing) : orderedKeys;
  const hiddenCount = orderedKeys.length - shownKeys.length;

  // TRI-112 — best of the compared set, only where the registry declares a
  // direction. All-tied sets mark nobody: "best" among equals is noise.
  const bestSets = new Map<string, Set<string>>();
  for (const k of orderedKeys) {
    const def = defFor(k);
    if (def.higher_is_better === null) continue;
    const entries = profiles
      .map((p) => ({
        code: p.suburb.sa2_code,
        v: p.scalars.find((x) => x.def.metric_key === k)?.value,
      }))
      .filter((e): e is { code: string; v: number } => e.v !== undefined);
    if (entries.length < 2) continue;
    const bestVal = def.higher_is_better
      ? Math.max(...entries.map((e) => e.v))
      : Math.min(...entries.map((e) => e.v));
    const winners = entries.filter((e) => e.v === bestVal);
    if (winners.length < entries.length) bestSets.set(k, new Set(winners.map((e) => e.code)));
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-xs text-ink/70">
        <input
          type="checkbox"
          checked={onlyDiff}
          onChange={(e) => setOnlyDiff(e.target.checked)}
          className="h-3.5 w-3.5 accent-[var(--harbour)]"
        />
        Only differences
        {onlyDiff && hiddenCount > 0 && (
          <span className="font-mono text-[10px] text-ink/45">
            {hiddenCount} identical {hiddenCount === 1 ? "row" : "rows"} hidden
          </span>
        )}
      </label>

      {/* Desktop: full profiles side by side */}
      <div
        className="hidden gap-3 lg:grid"
        style={{ gridTemplateColumns: `repeat(${profiles.length}, minmax(0, 1fr))` }}
      >
        {profiles.map((p) => (
          <CompareColumn
            key={p.suburb.sa2_code}
            p={p}
            all={profiles}
            bestSets={bestSets}
            stats={stats}
            sectionOrder={sectionOrder}
            onOpen={() => select(p.suburb.sa2_code)}
            onRemove={() => toggleCompare(p.suburb.sa2_code)}
          />
        ))}
      </div>

      {/* Mobile: compact table */}
      <table className="w-full border-collapse text-sm lg:hidden">
        <thead>
          <tr>
            <th className="w-1/3" />
            {profiles.map((p) => (
              <th key={p.suburb.sa2_code} className="px-1 pb-2 align-bottom">
                <button
                  type="button"
                  onClick={() => select(p.suburb.sa2_code)}
                  className="w-full text-left font-display text-xs font-semibold leading-tight text-ink hover:text-harbour"
                >
                  {p.suburb.name}
                </button>
                <button
                  type="button"
                  onClick={() => toggleCompare(p.suburb.sa2_code)}
                  className="mt-0.5 font-mono text-[10px] text-ink/40 hover:text-ink"
                >
                  remove ✕
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline/60">
          {shownKeys.map((k) => {
            const def = defFor(k);
            // Source + vintage are shared per metric; confidence differs per suburb.
            const any = profiles
              .map((p) => p.scalars.find((x) => x.def.metric_key === k))
              .find((s) => s != null);
            return (
              <tr key={k}>
                <td className="py-2 pr-2 text-xs text-ink/70">
                  {def.label}
                  {def.higher_is_better === null && (
                    <div className="mt-0.5">
                      <UnjudgedMark long />
                    </div>
                  )}
                  {any && (
                    <div className="mt-0.5">
                      <SourceChip source={any.source} asOf={any.asOf} />
                    </div>
                  )}
                </td>
                {profiles.map((p) => {
                  const s = p.scalars.find((x) => x.def.metric_key === k);
                  return (
                    <td key={p.suburb.sa2_code} className="px-1 py-2 font-mono text-xs text-ink">
                      {s ? formatValue(def, s.value) : "—"}
                      {s && bestSets.get(k)?.has(p.suburb.sa2_code) && (
                        <div className="mt-0.5">
                          <BestChip />
                        </div>
                      )}
                      {s && k === PRIMARY_RENT_METRIC && (
                        <div className="mt-0.5">
                          <BudgetChip rent={s.value} />
                        </div>
                      )}
                      {s && (
                        <div className="mt-0.5">
                          <ConfidenceChip confidence={s.confidence} />
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr>
            <td className="py-2 pr-2 text-xs text-ink/70" title="Driving distance to the CBD via openrouteservice/OSM (straight-line where routing is unavailable)">
              CBD distance
              <div className="mt-0.5">
                <ConfidenceChip confidence="derived" />
              </div>
            </td>
            {profiles.map((p) => (
              <td key={p.suburb.sa2_code} className="px-1 py-2 font-mono text-xs text-ink">
                {p.cbdKm != null ? `${p.cbdKm.toFixed(1)} km` : "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 pr-2 text-xs text-ink/70">
              Schools located here
              <div className="mt-0.5">
                <SourceChip source="MOE Schools Directory" asOf="2026" />
              </div>
            </td>
            {profiles.map((p) => (
              <td key={p.suburb.sa2_code} className="px-1 py-2 font-mono text-xs text-ink">
                {p.schools.length}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* Verbatim hazard caveat (TRI-70) — shown whenever any compared suburb
          carries a hazard-dimension row, on both layouts. */}
      {profiles.some((p) => p.scalars.some((s) => s.def.dimension === "hazard")) && (
        <p className="text-[10px] leading-snug text-ink/50">
          Hazard rows: {HAZARD_CAVEAT}
        </p>
      )}

      {/* TRI-112 — what the confidence chips mean, spelled out once. */}
      <ConfidenceLegend />
    </div>
  );
}
