"use client";

import type { AddressPin } from "@/lib/workspace";
import { usePointHazards } from "@/lib/property/fetch";
import { FLOOD_VIEWER_URL, GEOMAPS_URL, HAIL_NOTE, STATUS_WORDS } from "@/lib/property/copy";
import { HAZARD_CAVEAT } from "@/lib/hazard";
import { SourceChip, StatusPill, type PillStatus } from "@/components/source-chip";
import { ExtLink, GroupHeading, Note, StateLine, SubHeading } from "./primitives";

const PILL: Record<string, PillStatus> = { inside: "inside", outside: "outside", within: "within", clear: "clear", unavailable: "unavailable", "not assessed": "not assessed", pending: "pending" };

/**
 * TRI-123 / TRI-129 / TRI-150 — "Area-level models at this point": one live
 * point-in-layer query per council hazard layer, each reported in the layer's
 * own words on a StatusPill, with the verbatim area-level caveat at the top
 * and the foot. No count, no band, no verdict.
 */
export function PointHazards({ pin }: { pin: AddressPin }) {
  const hazards = usePointHazards(pin);
  return (
    <>
      <GroupHeading testId="epistemic-models">Area-level models at this point</GroupHeading>
      <Note className="mt-0.5">{HAZARD_CAVEAT}</Note>
      <SubHeading>Council hazard layers at this point</SubHeading>
      {hazards === null && <StateLine muted>Checking the council layers…</StateLine>}
      {hazards === "error" && <StateLine>The council hazard services could not be reached — nothing was checked.</StateLine>}
      {hazards && hazards !== "error" && (
        <>
          <ul className="divide-y divide-hairline/60">
            {hazards.layers.map((l) => (
              <li key={l.key} className="py-1.5" data-testid="point-hazard">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                  <span className="text-body text-ink/80">
                    {l.label}
                    <span className="ml-1 font-mono text-micro text-ink/50" title={l.edited ? `council layer last edited ${l.edited}` : undefined}>
                      {l.vintage} layer
                    </span>
                  </span>
                  <StatusPill status={PILL[l.status] ?? "info"} text={STATUS_WORDS[l.status] ?? l.status} />
                </div>
                {l.detail && (
                  <p className="mt-0.5 text-micro leading-snug text-ink/60" data-testid="point-hazard-detail">
                    {l.detail}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <Note className="mt-1.5">{hazards.caveat || HAZARD_CAVEAT}</Note>
          <Note testId="hazard-map-links">
            {HAIL_NOTE} <ExtLink href={FLOOD_VIEWER_URL}>Flood Viewer ↗</ExtLink>
            {" · "}
            <ExtLink href={GEOMAPS_URL}>GeoMaps ↗</ExtLink>
          </Note>
          <div className="mt-1 flex justify-end">
            <SourceChip source={hazards.source} asOf={hazards.retrieved_at.slice(0, 10)} quality="est." geometry="address point" />
          </div>
        </>
      )}
    </>
  );
}
