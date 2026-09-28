"use client";

import type { AddressPin } from "@/lib/workspace";
import { fmtDistance, usePointLookup, type NearbyPlace, type NearbyResponse } from "@/lib/property/fetch";
import { SourceChip } from "@/components/source-chip";
import { GroupHeading, Note, StateLine } from "./primitives";

/**
 * TRI-131 / TRI-150 — "Nearby, as the crow flies": nearest park, rapid-transit
 * stop and schools by level, straight-line from the address point. Never a
 * walk or a drive, and the heading says so.
 */
export function Nearby({ pin }: { pin: AddressPin }) {
  const nearby = usePointLookup<NearbyResponse>(pin, "/api/nearby");
  const rows: { label: string; place: NearbyPlace | null; missing: string }[] =
    nearby && nearby !== "error"
      ? [
          { label: "Nearest park or reserve", place: nearby.park, missing: nearby.unavailable.includes("parks") ? "council service unavailable — not checked" : "none within 2 km" },
          { label: "Nearest rapid-transit stop", place: nearby.station, missing: nearby.unavailable.includes("rapid transit stops") ? "council service unavailable — not checked" : "none found" },
          { label: "Nearest primary school", place: nearby.schools.primary, missing: nearby.unavailable.includes("schools") ? "schools lookup unavailable — not checked" : "none found" },
          { label: "Nearest intermediate (Years 7–8)", place: nearby.schools.intermediate, missing: nearby.unavailable.includes("schools") ? "schools lookup unavailable — not checked" : "none found" },
          { label: "Nearest secondary school", place: nearby.schools.secondary, missing: nearby.unavailable.includes("schools") ? "schools lookup unavailable — not checked" : "none found" },
        ]
      : [];
  return (
    <>
      <GroupHeading testId="epistemic-nearby" note="straight-line from the address point · not a walk or a drive">
        Nearby, as the crow flies
      </GroupHeading>
      {nearby === null && <StateLine muted>Measuring to the nearest park, stop and schools…</StateLine>}
      {nearby === "error" && <StateLine>The nearby lookup could not be reached — nothing was measured.</StateLine>}
      {rows.length > 0 && (
        <div data-testid="nearby">
          <ul className="divide-y divide-hairline/60">
            {rows.map((r) => (
              <li key={r.label} className="py-1.5" data-testid="nearby-row">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="text-body text-ink/80">{r.label}</span>
                  <span className={`shrink-0 font-mono ${r.place ? "text-body font-medium text-ink" : "text-micro text-ink/50"}`}>{r.place ? fmtDistance(r.place.distance_m) : r.missing}</span>
                </div>
                {r.place && (
                  <p className="mt-0.5 text-label leading-snug text-ink/65">
                    {r.place.name}
                    {r.place.detail ? <span className="text-ink/50"> · {r.place.detail}</span> : null}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Note>{nearby !== "error" && nearby ? nearby.note : ""}</Note>
          <div className="mt-1 flex justify-end">
            <SourceChip source="Council parks + RTN stops · MOE schools" asOf={nearby && nearby !== "error" ? nearby.retrieved_at.slice(0, 10) : ""} quality="computed" geometry="address point" />
          </div>
        </div>
      )}
    </>
  );
}
