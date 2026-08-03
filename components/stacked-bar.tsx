"use client";

import type { BreakdownValue } from "@/lib/suburb-data";

/**
 * Single-hue stacked composition bar (TRI-70) — built for zoning_share but
 * takes the plain BreakdownValue contract. Segments are opacity steps of the
 * harbour token (mirrors the map's quintile ramp language): largest share is
 * most opaque. Composition only — no better/worse framing, no colour coding
 * of "good" zones.
 */

const STEP_ALPHAS = [0.86, 0.68, 0.5, 0.36, 0.24, 0.14];

export function StackedBar({ b }: { b: BreakdownValue }) {
  const cats = b.categories.filter((c) => c.pct != null && c.pct > 0);
  if (!cats.length) return null;
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-sm"
        role="img"
        aria-label={`${b.def.label}: ${cats.map((c) => `${c.label} ${c.pct!.toFixed(0)}%`).join(", ")}`}
      >
        {cats.map((c, i) => (
          <span
            key={c.label}
            title={`${c.label} — ${c.pct!.toFixed(1)}%`}
            style={{
              width: `${c.pct}%`,
              background: `color-mix(in srgb, var(--harbour) ${Math.round(STEP_ALPHAS[Math.min(i, STEP_ALPHAS.length - 1)] * 100)}%, transparent)`,
            }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
        {cats.map((c, i) => (
          <span key={c.label} className="flex items-center gap-1 text-[10px] text-ink/60">
            <span
              aria-hidden
              className="inline-block h-2 w-2 rounded-[2px]"
              style={{
                background: `color-mix(in srgb, var(--harbour) ${Math.round(STEP_ALPHAS[Math.min(i, STEP_ALPHAS.length - 1)] * 100)}%, transparent)`,
              }}
            />
            {c.label}
            <span className="font-mono text-ink/80">{c.pct!.toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}
