"use client";

import { useEffect, useState } from "react";
import {
  fetchProfile,
  fetchRegionalStats,
  formatValue,
  MIN_TREND_POINTS,
  percentileOf,
  PRIMARY_RENT_METRIC,
  SECONDARY_METRICS,
  type RegionalStat,
  type ScalarValue,
  type SuburbProfile,
} from "@/lib/suburb-data";
import { COMPARE_LIMIT, useWorkspace } from "@/lib/workspace";
import { usePersona, useWorkplace } from "@/lib/preferences";
import { personaConfig, SECTION_EXPLAINERS, SECTION_LABELS } from "@/lib/persona";
import { BudgetChip } from "./budget-chip";
import { InfoTip } from "./info-tip";
import { ConfidenceChip, Provenance, SourceChip } from "./provenance";

/**
 * Percentile-vs-region bar. For metrics with higher_is_better NULL
 * (deprivation etc.) the marker stays neutral ink — position is information,
 * never verdict (UI spec §7).
 */
function PercentileBar({ pct, judged }: { pct: number; judged: boolean }) {
  return (
    <div
      className="relative h-1 w-full rounded-full bg-hairline"
      title={`${Math.round(pct)}th percentile of Auckland suburbs — derived from the sourced values above`}
    >
      <div
        className={`absolute top-1/2 h-2.5 w-0.5 -translate-y-1/2 rounded ${judged ? "bg-harbour" : "bg-ink/60"}`}
        style={{ left: `calc(${pct}% - 1px)` }}
      />
      <div
        className="absolute top-1/2 h-1.5 w-px -translate-y-1/2 bg-ink/25"
        style={{ left: "50%" }}
        title="Auckland median"
      />
    </div>
  );
}

/** History sparkline + delta vs the previous point (TRI-36; TRI-65 extends it
 * to the 25-quarter rent series, gated by the per-metric minimum-history rule). */
function Trend({ s }: { s: ScalarValue }) {
  const h = s.history;
  if (h.length < Math.max(MIN_TREND_POINTS[s.def.metric_key] ?? 2, 2)) return null;
  const W = 52;
  const H = 14;
  const vals = h.map((p) => p.value);
  const min = Math.min(...vals);
  const span = Math.max(...vals) - min || 1;
  const pts = h
    .map(
      (p, i) =>
        `${((i / (h.length - 1)) * (W - 2) + 1).toFixed(1)},${(H - 1.5 - ((p.value - min) / span) * (H - 3)).toFixed(1)}`,
    )
    .join(" ");
  // Quarterly series (those with a min-history rule) compare year-over-year —
  // four quarters back — so the arrow agrees with the 12-month trend metric;
  // census series keep comparing to the previous census.
  const back = s.def.metric_key in MIN_TREND_POINTS ? 5 : 2;
  const prev = h[Math.max(h.length - back, 0)].value;
  const last = h[h.length - 1].value;
  const pct = prev === 0 ? 0 : ((last - prev) / Math.abs(prev)) * 100;
  const arrow = pct > 0.5 ? "↑" : pct < -0.5 ? "↓" : "→";
  return (
    <span
      className="flex items-center gap-1"
      title={h.map((p) => `${p.asOf.slice(0, 4)}: ${p.value.toLocaleString()}`).join(" · ")}
    >
      <svg width={W} height={H} aria-hidden className="opacity-70">
        <polyline points={pts} fill="none" stroke="var(--harbour)" strokeWidth="1.5" />
      </svg>
      <span className="font-mono text-[10px] text-ink/55">
        {arrow}
        {Math.abs(pct) >= 0.5 ? `${Math.abs(pct).toFixed(0)}%` : ""}
      </span>
    </span>
  );
}

interface CommuteResponse {
  duration_s: number | null;
  distance_m: number;
  fallback: boolean;
  caveat: string;
  source: { name: string };
  retrieved_at: string;
}

/**
 * TRI-54 — commute to the saved workplace, shown under "Getting around" when
 * the preference is set. User-specific, so it's a live /api/commute call
 * (server-cached indefinitely) rather than a registry metric.
 */
function WorkplaceCommuteRow({ sa2 }: { sa2: string }) {
  const workplace = useWorkplace();
  const key = workplace ? `${sa2}|${workplace.lng},${workplace.lat}` : null;
  const [state, setState] = useState<{ key: string; r: CommuteResponse | null } | null>(null);

  useEffect(() => {
    if (!workplace || !key) return;
    let stale = false;
    fetch("/api/commute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        origin: { sa2_code: sa2 },
        destination: { lng: workplace.lng, lat: workplace.lat },
        mode: "driving-car",
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((r: CommuteResponse | null) => {
        if (!stale) setState({ key, r });
      })
      .catch(() => {
        if (!stale) setState({ key, r: null });
      });
    return () => {
      stale = true;
    };
  }, [sa2, key, workplace]);

  if (!workplace) return null;
  const loaded = state?.key === key ? state.r : undefined;

  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 text-sm text-ink/80">
          Drive to work{" "}
          <span className="block truncate font-mono text-[10px] text-ink/45" title={workplace.address}>
            → {workplace.address}
          </span>
        </span>
        <span className="shrink-0 font-mono text-sm font-medium text-ink">
          {loaded === undefined
            ? "…"
            : loaded === null
              ? "—"
              : loaded.fallback || loaded.duration_s === null
                ? `≈${(loaded.distance_m / 1000).toFixed(1)} km (straight line)`
                : `${Math.round(loaded.duration_s / 60)} min`}
        </span>
      </div>
      {loaded != null && (
        <div className="mt-1 flex justify-end">
          <Provenance
            source={loaded.source.name}
            asOf={loaded.retrieved_at.slice(0, 10)}
            confidence={loaded.fallback ? "derived" : "medium"}
          />
        </div>
      )}
    </div>
  );
}

function ScalarRow({ s, stat }: { s: ScalarValue; stat?: RegionalStat }) {
  // Secondary rows (census rent, bond quartiles) render compact under the
  // headline: smaller, indented, no percentile bar — provenance stays.
  const secondary = SECONDARY_METRICS.has(s.def.metric_key);
  return (
    <div className={secondary ? "py-1 pl-3" : "py-2"}>
      <div className="flex items-baseline justify-between gap-2">
        <span className={secondary ? "text-xs text-ink/60" : "text-sm text-ink/80"}>
          {s.def.label}
        </span>
        <span className="flex items-center gap-2">
          {s.def.metric_key === PRIMARY_RENT_METRIC && <BudgetChip rent={s.value} />}
          <Trend s={s} />
          <span
            className={`font-mono font-medium ${secondary ? "text-xs text-ink/75" : "text-sm text-ink"}`}
          >
            {formatValue(s.def, s.value)}
          </span>
        </span>
      </div>
      {stat && !secondary && (
        <div className="mt-1.5">
          <PercentileBar
            pct={percentileOf(s.value, stat)}
            judged={s.def.higher_is_better !== null}
          />
        </div>
      )}
      <div className="mt-1 flex justify-end">
        <Provenance source={s.source} asOf={s.asOf} confidence={s.confidence} />
      </div>
    </div>
  );
}

export function ProfilePanel({ sa2 }: { sa2: string }) {
  const { compare, toggleCompare } = useWorkspace();
  // Persona drives section order. The null server snapshot means SSR and the
  // hydration render use DEFAULT_PERSONA; the stored persona applies in a
  // post-mount re-render (same mechanism as the budget/workplace prefs).
  const persona = usePersona();
  // Loading is derived: data is stale until its key matches the requested sa2.
  const [data, setData] = useState<{
    key: string;
    profile: SuburbProfile | null;
    stats: RegionalStat[];
  } | null>(null);

  useEffect(() => {
    let stale = false;
    Promise.all([fetchProfile(sa2), fetchRegionalStats()]).then(([p, s]) => {
      if (!stale) setData({ key: sa2, profile: p, stats: s });
    });
    return () => {
      stale = true;
    };
  }, [sa2]);

  if (data?.key !== sa2) {
    return (
      <div className="flex animate-pulse flex-col gap-3 py-2">
        <div className="h-7 w-2/3 rounded bg-hairline/60" />
        <div className="h-3 w-1/2 rounded bg-hairline/50" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="mt-2 flex flex-col gap-2">
            <div className="h-3 w-24 rounded bg-hairline/50" />
            <div className="h-10 rounded bg-hairline/40" />
            <div className="h-10 rounded bg-hairline/40" />
          </div>
        ))}
      </div>
    );
  }
  const { profile, stats } = data;
  if (!profile) {
    return (
      <p className="py-8 text-center text-sm text-ink/50">
        No data for this area — it may be non-residential.
      </p>
    );
  }

  const { suburb, scalars, breakdowns, schools } = profile;
  const statFor = (key: string, asOf: string) =>
    stats.find((s) => s.metric_key === key && s.as_of_date === asOf);
  const inCompare = compare.includes(sa2);

  // Persona section order, then any dimensions it doesn't list (in registry
  // order) — personas reorder sections, they never hide data.
  const dims = [...personaConfig(persona).sectionOrder];
  for (const s of scalars) if (!dims.includes(s.def.dimension)) dims.push(s.def.dimension);
  for (const b of breakdowns) if (!dims.includes(b.def.dimension)) dims.push(b.def.dimension);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl font-semibold leading-tight text-ink">
            {suburb.name}
          </h2>
          <button
            type="button"
            onClick={() => toggleCompare(sa2)}
            disabled={!inCompare && compare.length >= COMPARE_LIMIT}
            className={`shrink-0 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
              inCompare
                ? "border-harbour bg-harbour text-surface"
                : "border-hairline bg-surface text-ink hover:border-harbour"
            }`}
          >
            {inCompare ? "✓ Comparing" : "+ Compare"}
          </button>
        </div>
        <p className="mt-0.5 font-mono text-[11px] text-ink/45">
          SA2 {suburb.sa2_code}
          {suburb.land_area_km2 != null && <> · {suburb.land_area_km2.toFixed(1)} km²</>}
        </p>
        {profile.cbdKm != null && (
          <p
            className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-ink/60"
            title="Straight-line distance from the suburb centroid to the Auckland CBD (Sky Tower). Routed drive/cycle/walk times are in Getting around below."
          >
            <span>CBD {profile.cbdKm.toFixed(1)} km (straight line)</span>
            <ConfidenceChip confidence="derived" />
          </p>
        )}
      </div>

      {/* Metric sections — persona-ordered; each dimension's breakdowns render
          inside its section (composition, no better/worse framing). */}
      {dims.map((dim) => {
        const rows = scalars.filter((s) => s.def.dimension === dim);
        const comps = breakdowns.filter((b) => b.def.dimension === dim);
        if (!rows.length && !comps.length) return null;
        const label = SECTION_LABELS[dim] ?? dim;
        return (
          <section key={dim}>
            <h3 className="border-b border-hairline pb-1 font-display text-xs font-semibold uppercase tracking-wider text-ink/60">
              {label}
              {SECTION_EXPLAINERS[dim] != null && (
                <InfoTip label={label.toLowerCase()} text={SECTION_EXPLAINERS[dim]} />
              )}
              {dim === "commute" && (
                <span className="ml-1.5 font-mono text-[10px] font-normal normal-case tracking-normal text-ink/40">
                  typical · no live traffic
                </span>
              )}
            </h3>
            {(rows.length > 0 || dim === "commute") && (
              <div className="divide-y divide-hairline/60">
                {rows.map((s) => (
                  <ScalarRow key={s.def.metric_key} s={s} stat={statFor(s.def.metric_key, s.asOf)} />
                ))}
                {dim === "commute" && <WorkplaceCommuteRow sa2={sa2} />}
              </div>
            )}
            {comps.map((b) => (
              <div key={b.def.metric_key} className="mt-3">
                <h4 className="text-[11px] font-medium uppercase tracking-wider text-ink/45">
                  {b.def.label}
                </h4>
                <div className="mt-2 flex flex-col gap-1.5">
                  {b.categories.slice(0, 6).map((c) => (
                    <div key={c.label} className="flex items-center gap-2">
                      <span className="w-40 truncate text-xs text-ink/75" title={c.label}>
                        {c.label}
                      </span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-hairline">
                        {c.pct != null && (
                          <div className="h-full rounded-full bg-harbour/70" style={{ width: `${Math.min(c.pct, 100)}%` }} />
                        )}
                      </div>
                      <span className="w-10 text-right font-mono text-[11px] text-ink">
                        {c.pct != null ? `${c.pct.toFixed(0)}%` : "—"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex justify-end">
                  <Provenance source={b.source} asOf={b.asOf} confidence={b.confidence} />
                </div>
              </div>
            ))}
          </section>
        );
      })}

      {/* Schools — nearest by distance from the centroid (TRI-36), so zoned
          schools just over the boundary appear too. */}
      <section>
        <h3 className="border-b border-hairline pb-1 font-display text-xs font-semibold uppercase tracking-wider text-ink/60">
          Schools nearby{" "}
          <span className="font-mono text-[10px] normal-case text-ink/40">
            ({schools.length} within the area)
          </span>
        </h3>
        {profile.nearbySchools.length === 0 ? (
          <p className="mt-2 text-xs text-ink/50">No located schools found nearby.</p>
        ) : (
          <ul className="mt-1 divide-y divide-hairline/60">
            {profile.nearbySchools.map((sc) => (
              <li key={sc.name} className="flex items-baseline justify-between gap-2 py-1.5">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink/85">{sc.name}</p>
                  <p className="text-[11px] text-ink/45">
                    {sc.school_type}
                    {sc.authority ? ` · ${sc.authority}` : ""}
                    {sc.roll != null ? ` · roll ${sc.roll.toLocaleString()}` : ""}
                  </p>
                </div>
                <span
                  className="shrink-0 font-mono text-xs text-ink/70"
                  title="Straight-line distance from the suburb centroid"
                >
                  {sc.distance_km.toFixed(1)} km
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-1 flex items-center justify-end gap-1.5">
          <SourceChip source="MOE Schools Directory" asOf="2026" />
          <span
            className="font-mono text-[10px] text-ink/45"
            title="Distances are straight-line from the suburb centroid, computed here"
          >
            · distances
          </span>
          <ConfidenceChip confidence="derived" />
        </div>
      </section>
    </div>
  );
}
