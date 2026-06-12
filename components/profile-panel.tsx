"use client";

import { useEffect, useState } from "react";
import {
  fetchProfile,
  fetchRegionalStats,
  formatValue,
  percentileOf,
  type RegionalStat,
  type ScalarValue,
  type SuburbProfile,
} from "@/lib/suburb-data";
import { COMPARE_LIMIT, useWorkspace } from "@/lib/workspace";

const DIMENSION_ORDER = ["people", "housing", "deprivation"] as const;
const DIMENSION_LABEL: Record<string, string> = {
  people: "People",
  housing: "Housing",
  deprivation: "Deprivation",
};

function SourceChip({ source, asOf, confidence }: { source: string; asOf: string; confidence: string }) {
  return (
    <span className="font-mono text-[10px] text-ink/45">
      {source} · {asOf.slice(0, 4)}
      {confidence !== "high" && (
        <span title={`Confidence: ${confidence}`}> · {confidence}</span>
      )}
    </span>
  );
}

/**
 * Percentile-vs-region bar. For metrics with higher_is_better NULL
 * (deprivation etc.) the marker stays neutral ink — position is information,
 * never verdict (UI spec §7).
 */
function PercentileBar({ pct, judged }: { pct: number; judged: boolean }) {
  return (
    <div
      className="relative h-1 w-full rounded-full bg-hairline"
      title={`${Math.round(pct)}th percentile of Auckland suburbs`}
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

/** 2013→2023 census sparkline + delta vs the previous census (TRI-36). */
function Trend({ s }: { s: ScalarValue }) {
  const h = s.history;
  if (h.length < 2) return null;
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
  const prev = h[h.length - 2].value;
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

function ScalarRow({ s, stat }: { s: ScalarValue; stat?: RegionalStat }) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-ink/80">{s.def.label}</span>
        <span className="flex items-center gap-2">
          <Trend s={s} />
          <span className="font-mono text-sm font-medium text-ink">
            {formatValue(s.def, s.value)}
          </span>
        </span>
      </div>
      {stat && (
        <div className="mt-1.5">
          <PercentileBar
            pct={percentileOf(s.value, stat)}
            judged={s.def.higher_is_better !== null}
          />
        </div>
      )}
      <div className="mt-1 flex justify-end">
        <SourceChip source={s.source} asOf={s.asOf} confidence={s.confidence} />
      </div>
    </div>
  );
}

export function ProfilePanel({ sa2 }: { sa2: string }) {
  const { compare, toggleCompare } = useWorkspace();
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
    return <p className="py-8 text-center text-sm text-ink/50">Loading…</p>;
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
            className="mt-1 font-mono text-[11px] text-ink/60"
            title="Straight-line distance from the suburb centroid to the Auckland CBD (Sky Tower). Drive time is a rough off-peak estimate — no live traffic data."
          >
            CBD {profile.cbdKm.toFixed(1)} km (straight line) · ≈
            {Math.max(5, Math.round(((profile.cbdKm * 1.3) / 30) * 60 / 5) * 5)} min drive
            (off-peak est.)
          </p>
        )}
      </div>

      {/* Scalar dimensions */}
      {DIMENSION_ORDER.map((dim) => {
        const rows = scalars.filter((s) => s.def.dimension === dim);
        if (!rows.length) return null;
        return (
          <section key={dim}>
            <h3 className="border-b border-hairline pb-1 font-display text-xs font-semibold uppercase tracking-wider text-ink/60">
              {DIMENSION_LABEL[dim]}
            </h3>
            <div className="divide-y divide-hairline/60">
              {rows.map((s) => (
                <ScalarRow key={s.def.metric_key} s={s} stat={statFor(s.def.metric_key, s.asOf)} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Breakdowns — composition, no better/worse framing */}
      {breakdowns.map((b) => (
        <section key={b.def.metric_key}>
          <h3 className="border-b border-hairline pb-1 font-display text-xs font-semibold uppercase tracking-wider text-ink/60">
            {b.def.label}
          </h3>
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
            <SourceChip source={b.source} asOf={b.asOf} confidence={b.confidence} />
          </div>
        </section>
      ))}

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
        <div className="mt-1 flex justify-end">
          <span className="font-mono text-[10px] text-ink/45">
            Schools Directory · 2026 · distances straight-line
          </span>
        </div>
      </section>
    </div>
  );
}
