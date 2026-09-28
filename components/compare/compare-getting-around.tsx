"use client";

import type { SuburbProfile } from "@/lib/suburb-data";
import { useAnchors } from "@/lib/preferences";
import { useAnchorCommutesMulti } from "@/lib/use-anchor-commute";
import { DOT_IDS, bestSet, sharedProvenance, entriesFor, type Entry } from "@/lib/compare";
import { CompareRow } from "./compare-row";

const TRAVEL_KEYS = ["commute_cbd_drive_min", "commute_cbd_cycle_min", "commute_cbd_walk_min", "commute_airport_drive_min"];
const DOMAIN: [number, number] = [0, 120];
const fmtMin = (v: number) => `${Math.round(v)} min`;

/**
 * TRI-149 — Getting around flipped for Compare: rows are destinations
 * (× mode), dots are suburbs, all on one 0–120 min domain so a reader sees
 * the gap between suburbs for the same trip. Saved places join as rows
 * (drive only, one ORS call per suburb×place, cached). Lower is better, so
 * the registry direction gives a "best" ring; places are computed client-side
 * and stay unjudged.
 */
export function CompareGettingAround({ profiles, onlyDiff, differs }: { profiles: SuburbProfile[]; onlyDiff: boolean; differs: (key: string) => boolean }) {
  const anchors = useAnchors();
  const codes = profiles.map((p) => p.suburb.sa2_code);
  const results = useAnchorCommutesMulti(codes, anchors.slice(0, 3));
  const defs = profiles.flatMap((p) => p.scalars).map((s) => s.def);
  const rows = TRAVEL_KEYS.filter((k) => defs.some((d) => d.metric_key === k) && (!onlyDiff || differs(k)));
  return (
    <>
      {rows.map((k) => {
        const def = defs.find((d) => d.metric_key === k)!;
        const entries = entriesFor(profiles, k);
        return <CompareRow key={k} testId={`cmp-${k}`} label={def.label} entries={entries} domain={DOMAIN} format={fmtMin} best={bestSet(def, entries)} judged={def.higher_is_better !== null} shared={sharedProvenance(entries)} />;
      })}
      {anchors.slice(0, 3).map((a) => {
        const entries: Entry[] = profiles.map((p, i) => {
          const r = results.get(`${p.suburb.sa2_code}|${a.id}`);
          const min = r && !r.fallback && r.duration_s != null ? r.duration_s / 60 : null;
          return { id: DOT_IDS[i], code: p.suburb.sa2_code, name: p.suburb.name, value: min, confidence: r ? "medium" : null, source: r?.source.name ?? null, asOf: r?.retrieved_at.slice(0, 10) ?? null };
        });
        const pending = profiles.some((p) => results.get(`${p.suburb.sa2_code}|${a.id}`) === undefined);
        if (onlyDiff && !entries.some((e) => e.value == null) && Math.max(...entries.map((e) => e.value!)) - Math.min(...entries.map((e) => e.value!)) < 10) return null;
        return (
          <CompareRow
            key={a.id}
            testId={`cmp-anchor-${a.id}`}
            label={
              <>
                Drive to {a.label.toLowerCase()}
                <span className="block truncate font-mono text-micro text-ink/50" title={a.address}>
                  {a.address} · your place
                </span>
              </>
            }
            entries={entries}
            domain={DOMAIN}
            format={fmtMin}
            best={new Set()}
            judged={false}
            shared={sharedProvenance(entries)}
            reason={pending ? "routing…" : "routing unavailable"}
          />
        );
      })}
    </>
  );
}
