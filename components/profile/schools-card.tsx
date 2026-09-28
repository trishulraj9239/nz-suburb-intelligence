"use client";

import type { NearbySchool, School } from "@/lib/suburb-data";
import { useIsLg } from "@/lib/use-is-lg";
import { SectionCard } from "@/components/section-card";
import { ConfidenceChip, SourceChip } from "@/components/source-chip";
import { CardIcon } from "./icons";

const ROAD_TITLE = "Driving distance from the suburb origin via openrouteservice/OSM — typical route, no live traffic";
const LINE_TITLE = "Straight-line distance from the suburb centroid — road routing unavailable";

function Distance({ sc }: { sc: NearbySchool }) {
  if (sc.method === "road") {
    return (
      <span className="font-mono text-label text-ink/80" title={ROAD_TITLE}>
        {sc.distance_km.toFixed(1)} km{sc.drive_min != null && <span className="text-ink/50"> · {sc.drive_min.toFixed(0)} min</span>}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-label text-ink/70" title={LINE_TITLE}>
      {sc.distance_km.toFixed(1)} km
      <span className="nzsi-hatch rounded-chip border border-hairline px-1.5 text-micro leading-4 text-ink/60">straight line</span>
    </span>
  );
}

/**
 * TRI-76 / TRI-148 — nearest schools by road distance (geodesic fallback,
 * labelled and hatched), so zoned schools just over the boundary appear too.
 * A real table from `lg` up; a list of rows on phones. Exactly one of the two
 * is mounted.
 */
export function SchoolsCard({ nearby, within }: { nearby: NearbySchool[]; within: School[] }) {
  const lg = useIsLg();
  const nearest = nearby[0];
  const headline = nearby.length ? `${nearby.length} nearest by road · ${within.length} within the area${nearest ? ` · nearest ${nearest.name}` : ""}` : `${within.length} within the area`;
  const sub = (sc: School) => [sc.school_type, sc.authority, sc.roll != null ? `roll ${sc.roll.toLocaleString()}` : null].filter(Boolean).join(" · ");
  return (
    <SectionCard
      id="schools"
      title="Schools nearby"
      icon={<CardIcon card="schools" />}
      accent="schools"
      headline={headline}
      chip={
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <SourceChip source="MOE Schools Directory" asOf="2026" />
          <span className="font-mono text-micro text-ink/45" title="Driving distances from the suburb origin via openrouteservice/OSM; straight-line (labelled) where routing is unavailable">
            · distances
          </span>
          <ConfidenceChip confidence="derived" />
        </span>
      }
    >
      {nearby.length === 0 ? (
        <p className="py-2 text-label text-ink/55">No located schools found nearby.</p>
      ) : lg ? (
        <table className="w-full border-collapse text-label" data-testid="schools-table">
          <thead>
            <tr className="text-left text-micro font-medium text-ink/55">
              <th scope="col" className="w-2/5 py-1 pr-2 font-medium">School</th>
              <th scope="col" className="py-1 pr-2 font-medium">Type</th>
              <th scope="col" className="py-1 text-right font-medium">Distance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline/60">
            {nearby.map((sc) => (
              <tr key={sc.name}>
                <th scope="row" className="py-1.5 pr-2 text-left font-normal leading-snug text-body text-ink/85">
                  {sc.name}
                </th>
                <td className="py-1.5 pr-2 text-micro leading-snug text-ink/60">{sub(sc)}</td>
                <td className="whitespace-nowrap py-1.5 text-right">
                  <Distance sc={sc} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul className="divide-y divide-hairline/60" data-testid="schools-list">
          {nearby.map((sc) => (
            <li key={sc.name} className="flex items-baseline justify-between gap-2 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-body text-ink/85">{sc.name}</p>
                <p className="text-micro text-ink/55">{sub(sc)}</p>
              </div>
              <Distance sc={sc} />
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
