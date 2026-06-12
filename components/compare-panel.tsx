"use client";

import { useEffect, useState } from "react";
import {
  fetchProfile,
  formatValue,
  type SuburbProfile,
} from "@/lib/suburb-data";
import { useWorkspace } from "@/lib/workspace";

/**
 * Compare 2–3 suburbs: dimensions as rows, suburbs as columns (the scorecard
 * table the UI spec picked over a radar). Scalar metrics only in v1 — the
 * cells stay mono, sources stay visible, deprivation stays unjudged.
 */
export function ComparePanel() {
  const { compare, toggleCompare, select } = useWorkspace();
  // Loading is derived: data is stale until its key matches the compare set.
  const key = compare.join("|");
  const [data, setData] = useState<{ key: string; profiles: SuburbProfile[] } | null>(null);

  useEffect(() => {
    let stale = false;
    Promise.all(compare.map((c) => fetchProfile(c))).then((ps) => {
      if (!stale)
        setData({
          key: compare.join("|"),
          profiles: ps.filter((p): p is SuburbProfile => p !== null),
        });
    });
    return () => {
      stale = true;
    };
  }, [compare]);

  if (data?.key !== key) {
    return <p className="py-8 text-center text-sm text-ink/50">Loading comparison…</p>;
  }
  const { profiles } = data;
  if (profiles.length < 2) {
    return (
      <p className="py-8 text-center text-sm text-ink/50">
        Pin at least two suburbs with “+ Compare” to see them side by side.
      </p>
    );
  }

  // Union of scalar metrics across the compared suburbs, in display order.
  const metricKeys: string[] = [];
  for (const p of profiles) {
    for (const s of p.scalars) {
      if (!metricKeys.includes(s.def.metric_key)) metricKeys.push(s.def.metric_key);
    }
  }
  const defFor = (key: string) =>
    profiles.flatMap((p) => p.scalars).find((s) => s.def.metric_key === key)!.def;

  return (
    <div className="flex flex-col gap-3">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="w-1/3" />
            {profiles.map((p) => (
              <th key={p.suburb.sa2_code} className="px-1 pb-2 align-bottom">
                <button
                  type="button"
                  onClick={() => select(p.suburb.sa2_code)}
                  className="w-full text-left font-display text-xs font-semibold leading-tight text-ink hover:text-harbour"
                  title="Open profile"
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
          {metricKeys.map((key) => {
            const def = defFor(key);
            return (
              <tr key={key}>
                <td className="py-2 pr-2 text-xs text-ink/70">{def.label}</td>
                {profiles.map((p) => {
                  const s = p.scalars.find((x) => x.def.metric_key === key);
                  return (
                    <td key={p.suburb.sa2_code} className="px-1 py-2 font-mono text-xs text-ink">
                      {s ? formatValue(def, s.value) : "—"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr>
            <td className="py-2 pr-2 text-xs text-ink/70" title="Straight-line, centroid to Sky Tower">
              CBD distance
            </td>
            {profiles.map((p) => (
              <td key={p.suburb.sa2_code} className="px-1 py-2 font-mono text-xs text-ink">
                {p.cbdKm != null ? `${p.cbdKm.toFixed(1)} km` : "—"}
              </td>
            ))}
          </tr>
          <tr>
            <td className="py-2 pr-2 text-xs text-ink/70">Schools located here</td>
            {profiles.map((p) => (
              <td key={p.suburb.sa2_code} className="px-1 py-2 font-mono text-xs text-ink">
                {p.schools.length}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="text-right font-mono text-[10px] text-ink/45">
        Census 2023 · NZDep2018 · Schools Directory 2026
      </p>
    </div>
  );
}
