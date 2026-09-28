"use client";

import type { SuburbProfile } from "@/lib/suburb-data";
import { COMPARE_LIMIT, useWorkspace } from "@/lib/workspace";
import { personaConfig } from "@/lib/persona";
import { ConfidenceChip } from "@/components/source-chip";
import { BudgetChip } from "@/components/budget-chip";

/**
 * TRI-148 — suburb name, the Compare toggle, SA2 · area, the CBD distance
 * line, and the persona / budget chips beside the name so the reader knows
 * whose view this is. Text and testids unchanged from the pre-kit header.
 */
export function ProfileHeader({ profile, persona, rent }: { profile: SuburbProfile; persona: string; rent: number | null }) {
  const { compare, toggleCompare } = useWorkspace();
  const { suburb } = profile;
  const sa2 = suburb.sa2_code;
  const inCompare = compare.includes(sa2);
  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-display text-h2 font-semibold leading-tight text-ink">{suburb.name}</h2>
        <button
          type="button"
          onClick={() => toggleCompare(sa2)}
          disabled={!inCompare && compare.length >= COMPARE_LIMIT}
          className={`h-10 shrink-0 rounded-control border px-3 text-label font-medium transition-colors disabled:opacity-40 ${
            inCompare ? "border-harbour bg-harbour text-surface" : "border-hairline bg-surface text-ink hover:border-harbour"
          }`}
        >
          {inCompare ? "✓ Comparing" : "+ Compare"}
        </button>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-mono text-label text-ink/45">
          SA2 {sa2}
          {suburb.land_area_km2 != null && <> · {suburb.land_area_km2.toFixed(1)} km²</>}
        </span>
        <span className="inline-flex items-center rounded-chip border border-hairline bg-canvas px-2 font-mono text-micro leading-5 text-ink/65" title="Section order and headline figures follow the persona chosen in the top bar">
          {personaConfig(persona).key} view
        </span>
        {rent != null && <BudgetChip rent={rent} />}
      </div>
      {profile.cbdKm != null && (
        <p
          className="mt-1 flex flex-wrap items-center gap-1.5 font-mono text-label text-ink/60"
          title={
            profile.cbdMethod === "road"
              ? "Driving distance to the Auckland CBD (Britomart) via openrouteservice/OSM — typical route, no live traffic. Drive/cycle/walk times are in Getting around below."
              : "Straight-line distance from the suburb centroid to the Auckland CBD — road routing unavailable for this suburb (e.g. islands)."
          }
        >
          <span>
            CBD {profile.cbdKm.toFixed(1)} km {profile.cbdMethod === "road" ? "by road" : "(straight line)"}
          </span>
          <ConfidenceChip confidence="derived" />
        </p>
      )}
    </div>
  );
}
